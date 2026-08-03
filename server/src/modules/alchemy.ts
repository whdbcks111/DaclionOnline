import {
    AlchemyTrackingPattern,
    AlchemyTrackingSpeedProfile,
    type AlchemyTrackingConfig,
    type MiniGameStartData,
} from '../../../shared/minigames.js';
import type Inventory from '../models/Inventory.js';
import {
    ALCHEMIST_JOB_ID,
    AlchemyDelivery,
    AlchemyEffectType,
    createAlchemyInventoryRequirements,
    createAlchemyPotionSnapshot,
    getAlchemyReagent,
    recordAlchemyReagentExperiments,
    resolveAlchemyPotionUse,
    resolveAlchemyFormula,
    type AlchemyFormulaData,
    type AlchemyIngredientSelectionInput,
} from '../models/Alchemy.js';
import { Item, ItemMetadataKeys, getItemSnapshotDisplay, type ItemSnapshot } from '../models/Item.js';
import { getLocation } from '../models/Location.js';
import Monster from '../models/Monster.js';
import Player from '../models/Player.js';
import { StatType } from '../models/Stat.js';
import { StatusEffectType } from '../models/StatusEffect.js';
import { partyManager } from './party.js';
import { getOnlinePlayers, getPlayerByUserId } from './player.js';
import { sendBotMessageToUser, sendNotificationToUser } from './message.js';
import { hasActiveMiniGame, startMiniGame, type MiniGameValidationResult } from './minigame.js';
import logger from '../utils/logger.js';
import { GameTags, TagCollection } from '../../../shared/tags.js';

export interface StartAlchemyOptions {
    readonly bottleCount: number;
    readonly delivery: AlchemyDelivery;
    readonly ingredients: readonly AlchemyIngredientSelectionInput[];
}

export interface StartAlchemyResult {
    readonly success: boolean;
    readonly reason?: string;
    /** 내부 호출자와 통합 테스트가 ready/result를 이어갈 수 있는 서버 발급 세션 snapshot. */
    readonly miniGame?: MiniGameStartData;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
}

function normalizeIngredientSelections(
    ingredients: readonly AlchemyIngredientSelectionInput[],
): readonly AlchemyIngredientSelectionInput[] | undefined {
    const totals = new Map<string, number>();
    for (const ingredient of ingredients) {
        const itemDataId = ingredient.itemDataId.trim();
        if (!getAlchemyReagent(itemDataId) || !Number.isSafeInteger(ingredient.count)
            || ingredient.count <= 0 || ingredient.count > 99) return undefined;
        totals.set(itemDataId, (totals.get(itemDataId) ?? 0) + ingredient.count);
    }
    if (totals.size < 2 || totals.size > 5) return undefined;
    const normalized = [...totals]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([itemDataId, count]) => ({ itemDataId, count }));
    const totalCount = normalized.reduce((sum, ingredient) => sum + ingredient.count, 0);
    return totalCount <= 90 && normalized.every(ingredient => ingredient.count <= 99)
        ? normalized
        : undefined;
}

/** 같은 재료 배치는 서버·클라이언트 재현에 쓰는 동일한 양의 31-bit seed를 만든다. */
function stableAlchemyHash(value: string): number {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0) & 0x7fffffff || 1;
}

/** 조합식·재료 hash가 5개 경로, 변속, 반전 일정을 결정하도록 서버 config를 만든다. */
export function createAlchemyTrackingConfig(
    formula: Readonly<AlchemyFormulaData> | undefined,
    ingredients: readonly AlchemyIngredientSelectionInput[],
    bottleCount: number,
): AlchemyTrackingConfig {
    const canonical = ingredients
        .slice()
        .sort((left, right) => left.itemDataId.localeCompare(right.itemDataId))
        .map(ingredient => `${ingredient.itemDataId}:${ingredient.count}`)
        .join('|');
    const seed = stableAlchemyHash(`${formula?.id ?? 'unknown'}|${bottleCount}|${canonical}`);
    const difficulty = clamp(formula?.difficulty ?? 4 + ingredients.length, 1, 10);
    const patterns = AlchemyTrackingPattern.values();
    const speedProfiles = AlchemyTrackingSpeedProfile.values();
    const durationMs = Math.round(17_000 + difficulty * 650);
    const reversalCount = difficulty >= 7 ? 3 : difficulty >= 4 ? 2 : 1;
    const reverseAtMs = Array.from({ length: reversalCount }, (_, index) => {
        const baseRatio = (index + 1) / (reversalCount + 1);
        const byte = (seed >>> ((index * 7 + 5) % 24)) & 0xff;
        const jitterRatio = (byte / 255 - 0.5) * 0.08;
        return Math.round(durationMs * (baseRatio + jitterRatio));
    }).sort((left, right) => left - right);
    return {
        seed,
        durationMs,
        label: formula?.name ?? '미확인 조합',
        liquidRadius: 30,
        targetRadius: Math.round(clamp(6.15 - difficulty * 0.15, 4.5, 6) * 100) / 100,
        patternKey: patterns[seed % patterns.length].key,
        speedProfileKey: speedProfiles[(seed >>> 6) % speedProfiles.length].key,
        lapDurationMs: Math.round(clamp(6_600 - difficulty * 370, 2_500, 6_300)),
        reverseAtMs,
        initialGauge: 0.46,
        fillPerSecond: Math.round(clamp(0.098 - difficulty * 0.002, 0.075, 0.096) * 1_000) / 1_000,
        drainPerSecond: Math.round(clamp(0.028 + difficulty * 0.003, 0.031, 0.058) * 1_000) / 1_000,
    };
}

/** 성공한 유효 조합은 정상 약, 성공한 미확인 조합은 안전한 실패약, 미니게임 실패는 무산으로 확정한다. */
export function createAlchemyCompletionOutputs(options: {
    readonly result: Pick<MiniGameValidationResult, 'success' | 'score'>;
    readonly formula: Readonly<AlchemyFormulaData> | undefined;
    readonly delivery: AlchemyDelivery;
    readonly bottleCount: number;
    readonly sensibility: number;
}): readonly ItemSnapshot[] {
    if (!options.result.success) return [];
    return [createAlchemyPotionSnapshot({
        formula: options.formula,
        delivery: options.delivery,
        bottleCount: options.bottleCount,
        accuracy: clamp(options.result.score ?? 0, 0, 1),
        sensibility: options.sensibility,
    })];
}

/** `/연금술` 시작점. 첫 ready에서 재료를 한 번만 원자 소비하고 이후 성공 결과만 별도로 지급한다. */
export function startAlchemy(player: Player, options: StartAlchemyOptions): StartAlchemyResult {
    if (!player.career.hasJob(ALCHEMIST_JOB_ID)) {
        return { success: false, reason: '엘리트 직업 [ 연금술사 ]만 조제할 수 있습니다.' };
    }
    if (player.isDefeated) return { success: false, reason: '사망 상태에서는 연금술을 사용할 수 없습니다.' };
    if (hasActiveMiniGame(player.userId)) {
        return { success: false, reason: '이미 다른 미니게임을 진행하고 있습니다.' };
    }
    if (!Number.isSafeInteger(options.bottleCount) || options.bottleCount < 1 || options.bottleCount > 3
        || !AlchemyDelivery.values().includes(options.delivery)) {
        return { success: false, reason: '조제 병 수 또는 전달 방식이 올바르지 않습니다.' };
    }
    const ingredients = normalizeIngredientSelections(options.ingredients);
    if (!ingredients) {
        return { success: false, reason: '서로 다른 연금 재료를 2~5종, 올바른 수량으로 지정해야 합니다.' };
    }
    const requirements = createAlchemyInventoryRequirements(ingredients, options.bottleCount);
    if (!player.inventory.selectItems(requirements)) {
        return {
            success: false,
            reason: `지정한 재료와 정제수 물병 ${options.bottleCount}개가 모두 필요합니다.`,
        };
    }

    const formula = resolveAlchemyFormula(ingredients, options.bottleCount);
    const config = createAlchemyTrackingConfig(formula, ingredients, options.bottleCount);
    let materialsCommitted = false;
    let committedSensibility = 0;
    const started = startMiniGame({
        userId: player.userId,
        type: 'alchemy_tracking',
        config,
        // 첫 pointerdown에서 ready가 시작되며 공용 layer가 ready 이후 실행 제한시간을 다시 잡는다.
        expiresInMs: 30_000,
        onReady: () => {
            const sensibility = player.stat.get(StatType.SENSIBILITY);
            const selections = player.inventory.selectItems(requirements);
            if (!selections || !player.inventory.replaceSelectedItems(selections, [])) {
                return {
                    success: false,
                    message: '조제 시작 전에 재료나 정제수 물병이 변경되어 취소되었습니다.',
                };
            }
            recordAlchemyReagentExperiments(
                player.progress,
                ingredients.map(ingredient => ingredient.itemDataId),
            );
            committedSensibility = sensibility;
            materialsCommitted = true;
            return { success: true };
        },
        validate: request => ({
            success: request.alchemyTrackingProof?.success === true,
            score: request.score,
            message: request.alchemyTrackingProof?.success === true
                ? undefined
                : '가마솥 목표를 끝까지 추적하지 못했습니다.',
        }),
        onResolved: result => {
            if (!materialsCommitted) return;
            const outputs = createAlchemyCompletionOutputs({
                result,
                formula,
                delivery: options.delivery,
                bottleCount: options.bottleCount,
                sensibility: committedSensibility,
            });
            let outputDropped = false;
            for (const output of outputs) {
                if (player.inventory.addItemSnapshot(output)) continue;
                const location = getLocation(player.locationId);
                if (!location) {
                    const message = '조제 결과를 지급할 현재 위치를 확인하지 못했습니다. 관리자에게 문의해 주세요.';
                    sendBotMessageToUser(player.userId, message);
                    sendNotificationToUser(player.userId, { key: 'alchemy:grant-failed', message });
                    return;
                }
                location.addDroppedItem(output);
                outputDropped = true;
            }
            if (!result.success) {
                const message = '연금술에 실패해 투입한 재료와 정제수 물병이 모두 소진되었습니다.';
                sendBotMessageToUser(player.userId, message);
                sendNotificationToUser(player.userId, { key: 'alchemy:failed', message });
                return;
            }
            const output = outputs[0];
            const display = getItemSnapshotDisplay(output);
            const accuracy = Math.round(clamp(result.score ?? 0, 0, 1) * 100);
            const formulaText = formula ? '' : ' · 미확인 조합이라 약한 실패약으로 굳었습니다.';
            const dropText = outputDropped ? ' · 중량 초과로 현재 위치 바닥에 놓였습니다.' : '';
            const message = `[ 연금술 완료 ] ${display.name} x${output.count} · 추적 정확도 ${accuracy}%${formulaText}${dropText}`;
            sendBotMessageToUser(player.userId, message);
            sendNotificationToUser(player.userId, {
                key: 'alchemy:complete',
                message,
                length: 4_000,
            });
        },
    });
    return started
        ? { success: true, miniGame: started }
        : { success: false, reason: '이미 다른 미니게임을 진행하고 있습니다.' };
}

export interface AlchemyPotionTargetResult {
    readonly targets: readonly (Player | Monster)[];
    readonly reason?: string;
}

function beneficialPotionTargets(player: Player, targetCap: number): AlchemyPotionTargetResult {
    const current = player.currentTarget;
    let center = player;
    if (current?.isPlayer && current.playerUserId !== undefined && current !== player) {
        const currentPlayer = current as Player;
        if (currentPlayer.locationId !== player.locationId || currentPlayer.isDefeated
            || !partyManager.areInSameParty(player.userId, currentPlayer.userId)) {
            return { targets: [], reason: '회복·강화 투척약은 같은 장소의 파티원에게만 던질 수 있습니다.' };
        }
        center = currentPlayer;
    }
    const candidates = getOnlinePlayers()
        .filter(candidate => !candidate.isDefeated && candidate.locationId === player.locationId
            && (candidate.userId === player.userId
                || partyManager.areInSameParty(player.userId, candidate.userId)))
        .sort((left, right) => left.userId - right.userId);
    const ordered = [center, ...candidates.filter(candidate => candidate !== center)];
    return { targets: ordered.slice(0, targetCap) };
}

function harmfulPotionTargets(player: Player, targetCap: number): AlchemyPotionTargetResult {
    const location = getLocation(player.locationId);
    const center = player.currentTarget;
    if (!location || !(center instanceof Monster) || center.locationId !== player.locationId
        || center.isDefeated || !location.hasObject(center)) {
        return { targets: [], reason: '독성 투척약은 현재 장소의 살아 있는 몬스터를 먼저 대상으로 지정해야 합니다.' };
    }
    const attackable = location.getAttackableObjects(player)
        .filter((target): target is Monster => target instanceof Monster && !target.isDefeated);
    if (!attackable.includes(center)) {
        return { targets: [], reason: center.getAttackDeniedReason(player) ?? '현재 대상에게 투척약을 사용할 수 없습니다.' };
    }
    return {
        targets: [center, ...attackable.filter(target => target !== center)].slice(0, targetCap),
    };
}

/** 투척 방식과 효과 성향을 기준으로 서버가 같은 장소의 실제 대상만 확정한다. */
export function resolveAlchemyPotionTargets(
    player: Player,
    audience: 'beneficial' | 'harmful',
    targetCap: number,
): AlchemyPotionTargetResult {
    const cap = Math.max(1, Math.min(5, Math.floor(targetCap)));
    return audience === 'harmful'
        ? harmfulPotionTargets(player, cap)
        : beneficialPotionTargets(player, cap);
}

function applyBeneficialAlchemyEffect(
    source: Player,
    target: Player,
    effectType: AlchemyEffectType,
    power: number,
    duration: number,
    statusEffectId?: string,
): string {
    if (effectType === AlchemyEffectType.RESTORE_LIFE) {
        const result = target.heal(power, source);
        return `${target.name} 생명력 +${Math.round(result.healedAmount)}`;
    }
    if (effectType === AlchemyEffectType.RESTORE_MENTALITY) {
        const before = target.mentality;
        target.restoreMentality(power);
        return `${target.name} 정신력 +${Math.round(target.mentality - before)}`;
    }
    if (effectType === AlchemyEffectType.FAILED) {
        const result = target.heal(power, source);
        return `${target.name} 미약한 회복 +${Math.round(result.healedAmount)}`;
    }
    const status = statusEffectId ? StatusEffectType.fromKey(statusEffectId) : undefined;
    if (!status || duration <= 0) throw new Error('조제약의 강화 효과가 올바르지 않습니다.');
    const level = Math.max(1, Math.round(power));
    target.applyStatusEffect(status, duration, level, source);
    return `${target.name} ${status.label} Lv.${status.normalizeLevel(level)} (${Math.round(duration)}초)`;
}

function applyHarmfulAlchemyEffect(
    source: Player,
    target: Player | Monster,
    power: number,
    duration: number,
    statusEffectId?: string,
    damageType: 'physical' | 'magic' | 'absolute' = 'magic',
    useThrownAttack = false,
): string | undefined {
    const status = statusEffectId ? StatusEffectType.fromKey(statusEffectId) : undefined;
    const rawDamage = Math.max(1, power * 80);
    const damage = useThrownAttack
        ? source.attack(target, damageType, rawDamage, {
            criticalRate: 0,
            criticalDamage: 1,
            consumeMainHandDurability: false,
            triggerMainHandHitEffects: false,
            effectTags: [GameTags.PROPERTY_POISON],
            unavoidable: true,
        })
        : target.damage(rawDamage, damageType, {
            type: 'attack',
            causeEntity: source,
            critical: false,
            effectSource: new TagCollection({ definition: [GameTags.PROPERTY_POISON] }),
        });
    if (!damage) return undefined;
    if (status && duration > 0 && !target.isDefeated) {
        target.applyStatusEffect(status, duration, Math.max(1, Math.round(power)), source);
    }
    return `${target.name} 피해 ${Math.round(damage.finalDamage)}${status ? ` · ${status.label}` : ''}`;
}

/** `alchemy_potion` Item use handler. formula registry에서 효과를 재구성한 뒤 대상·장소·파티를 재검증한다. */
export function useAlchemyPotion(inventory: Inventory, item: Item, finish: () => void): void {
    try {
        const player = getPlayerByUserId(inventory.playerId);
        const resolved = resolveAlchemyPotionUse(
            item.itemDataId,
            item.getMetadata(ItemMetadataKeys.ALCHEMY),
        );
        if (!player || !resolved) {
            if (player) sendNotificationToUser(player.userId, {
                key: 'alchemy:potion-invalid',
                message: '조제약의 품질 정보가 올바르지 않습니다.',
            });
            return;
        }
        const { metadata, effectType } = resolved;
        if (player.isDefeated) {
            sendNotificationToUser(player.userId, {
                key: 'alchemy:potion-defeated',
                message: '사망 상태에서는 조제약을 사용할 수 없습니다.',
            });
            return;
        }
        if ((effectType === AlchemyEffectType.BENEFICIAL_STATUS
            || effectType === AlchemyEffectType.HARMFUL_STATUS)
            && (!metadata.effect.statusEffectId
                || !StatusEffectType.fromKey(metadata.effect.statusEffectId))) {
            sendNotificationToUser(player.userId, {
                key: 'alchemy:potion-effect-invalid',
                message: '조제약의 상태 효과 정보가 올바르지 않습니다.',
            });
            return;
        }

        const isThrow = metadata.delivery === AlchemyDelivery.THROW.key;
        const targetResult = isThrow
            ? resolveAlchemyPotionTargets(player, metadata.effect.audience, metadata.areaTargetCap)
            : { targets: [player] as const };
        if (targetResult.reason || targetResult.targets.length === 0) {
            sendNotificationToUser(player.userId, {
                key: 'alchemy:potion-target',
                message: targetResult.reason ?? '조제약을 적용할 대상이 없습니다.',
            });
            return;
        }
        if (isThrow && metadata.effect.audience === 'harmful'
            && !player.canAttack(targetResult.targets[0])) return;
        const consumedSnapshot = item.snapshot(1);
        if (!inventory.removeItemInstance(item, 1)) return;

        const results: string[] = [];
        for (const [index, target] of targetResult.targets.entries()) {
            if (metadata.effect.audience === 'harmful') {
                const applied = applyHarmfulAlchemyEffect(
                    player,
                    target,
                    metadata.effect.power,
                    metadata.effect.duration,
                    metadata.effect.statusEffectId,
                    metadata.effect.damageType,
                    isThrow && index === 0,
                );
                if (!applied && index === 0) {
                    inventory.restoreItemSnapshot(consumedSnapshot);
                    sendNotificationToUser(player.userId, {
                        key: 'alchemy:potion-attack-cancelled',
                        message: '현재 대상에게 독성 조제약을 적용하지 못해 소비하지 않았습니다.',
                    });
                    return;
                }
                if (applied) results.push(applied);
            } else if (target.isPlayer) {
                results.push(applyBeneficialAlchemyEffect(
                    player,
                    target as Player,
                    effectType,
                    metadata.effect.power,
                    metadata.effect.duration,
                    metadata.effect.statusEffectId,
                ));
            }
        }
        if (!isThrow) player.restoreThirst(5);
        const deliveryLabel = isThrow ? '투척' : '음용';
        const message = `[ ${item.name} ] ${deliveryLabel}: ${results.join(' · ')}`;
        sendBotMessageToUser(player.userId, message);
        sendNotificationToUser(player.userId, {
            key: `alchemy:potion-used:${metadata.formulaId}`,
            message,
            length: 3_500,
        });
    } catch (error) {
        logger.error('연금 조제약 사용 실패', error);
    } finally {
        finish();
    }
}
