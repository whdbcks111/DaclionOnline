import {
    AlchemyTrackingPattern,
    AlchemyTrackingSpeedProfile,
    type AlchemyTrackingConfig,
    type MiniGameStartData,
} from '../../../../shared/minigames.js';
import type Inventory from '../../models/economy/Inventory.js';
import {
    ALCHEMIST_JOB_ID,
    ALCHEMY_FEATURE_SKILL_ID,
    ALCHEMY_HARMFUL_DAMAGE_SCALE,
    ALCHEMY_MAX_DISTINCT_REAGENTS,
    ALCHEMY_MAX_TOTAL_REAGENT_COUNT,
    ALCHEMY_WATER_BOTTLE_ITEM_ID,
    AlchemyDelivery,
    AlchemyEffectType,
    AlchemyQuality,
    calculateAlchemyQualityScore,
    createAlchemyInventoryRequirements,
    createAlchemyPotionSnapshot,
    getAlchemyReagent,
    recordAlchemyReagentExperiments,
    resolveAlchemyPotionUse,
    resolveAlchemyFormula,
    type AlchemyFormulaData,
    type AlchemyIngredientSelectionInput,
} from '../../models/professions/Alchemy.js';
import { emitGameEvent, GameEventIds, subscribeGameEvent } from '../../models/core/GameEvent.js';
import { Item, ItemMetadataKeys, getItemSnapshotDisplay, type ItemSnapshot } from '../../models/economy/Item.js';
import { getLocation } from '../../models/world/Location.js';
import Monster from '../../models/actors/Monster.js';
import Player from '../../models/actors/Player.js';
import Entity from '../../models/core/Entity.js';
import { StatType } from '../../models/core/Stat.js';
import { StatusEffectType } from '../../models/combat/StatusEffect.js';
import { partyManager } from '../social/party.js';
import { getOnlinePlayers, getPlayerByUserId } from '../player/player.js';
import { sendBotMessageToUser, sendNotificationToUser } from '../communication/message.js';
import {
    hasActiveMiniGame,
    startMiniGame,
    subscribeMiniGameStarted,
    type MiniGameValidationResult,
} from './minigame.js';
import { cancelGameTask, scheduleGameTask } from '../infrastructure/scheduler.js';
import logger from '../../utils/logger.js';
import { GameTags, TagCollection } from '../../../../shared/tags.js';
import { randomHex } from '../../utils/random.js';

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

/** 직업 변경 뒤 남은 스킬이 권한이 되지 않도록 현재 연금술사 직업과 기능 패시브를 함께 검사한다. */
export function canUseAlchemy(player: Pick<Player, 'career' | 'skills'>): boolean {
    return player.career.hasJob(ALCHEMIST_JOB_ID)
        && player.skills.has(ALCHEMY_FEATURE_SKILL_ID);
}

export const ALCHEMY_DRAFT_TTL_MS = 10 * 60_000;
export { ALCHEMY_MAX_DISTINCT_REAGENTS, ALCHEMY_MAX_TOTAL_REAGENT_COUNT };

export interface AlchemyDraftIngredientSnapshot {
    readonly itemDataId: string;
    readonly count: number;
    readonly ownedCount: number;
}

/** 버튼 카드가 받는 깊게 불변인 사용자별 조제 준비 snapshot. */
export interface AlchemyDraftSnapshot {
    readonly id: string;
    /** 이전 카드 버튼의 재사용을 막는 단조 증가 상태 revision. */
    readonly revision: number;
    readonly userId: number;
    readonly bottleCount: number;
    readonly deliveryKey: 'drink' | 'throw';
    readonly deliveryLabel: string;
    readonly ingredients: readonly AlchemyDraftIngredientSnapshot[];
    readonly totalIngredientCount: number;
    readonly waterBottleCount: number;
    readonly locationId: string;
    readonly expiresAt: number;
}

export interface AlchemyDraftMutationResult {
    readonly success: boolean;
    readonly reason?: string;
    readonly draft?: AlchemyDraftSnapshot;
}

export type AlchemyDraftEvent =
    | { readonly type: 'updated'; readonly draft: AlchemyDraftSnapshot }
    | {
        readonly type: 'ended';
        readonly userId: number;
        readonly draftId: string;
        readonly reason: string;
    };

type AlchemyDraftEventHandler = (event: AlchemyDraftEvent) => void;

interface AlchemyDraftState {
    readonly id: string;
    revision: number;
    readonly userId: number;
    readonly locationId: string;
    bottleCount: number;
    delivery: AlchemyDelivery;
    readonly ingredients: Map<string, number>;
    expiresAt: number;
}

const alchemyDrafts = new Map<number, AlchemyDraftState>();
const alchemyDraftHandlers = new Set<AlchemyDraftEventHandler>();
let alchemyDraftLifecycleInitialized = false;

function alchemyDraftTaskKey(userId: number): string {
    return `alchemy-draft:${userId}`;
}

function emitAlchemyDraftEvent(event: AlchemyDraftEvent): void {
    for (const handler of [...alchemyDraftHandlers]) {
        try {
            handler(event);
        } catch (error) {
            logger.error('연금술 준비 event 처리 실패:', error);
        }
    }
}

function createAlchemyDraftSnapshot(player: Player, state: AlchemyDraftState): AlchemyDraftSnapshot {
    const ingredients = [...state.ingredients]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([itemDataId, count]) => Object.freeze({
            itemDataId,
            count,
            ownedCount: player.inventory.getCount(itemDataId),
        }));
    return Object.freeze({
        id: state.id,
        revision: state.revision,
        userId: state.userId,
        bottleCount: state.bottleCount,
        deliveryKey: state.delivery.key,
        deliveryLabel: state.delivery.label,
        ingredients: Object.freeze(ingredients),
        totalIngredientCount: ingredients.reduce((sum, ingredient) => sum + ingredient.count, 0),
        waterBottleCount: player.inventory.getCount(ALCHEMY_WATER_BOTTLE_ITEM_ID),
        locationId: state.locationId,
        expiresAt: state.expiresAt,
    });
}

function scheduleAlchemyDraftExpiry(state: AlchemyDraftState): void {
    scheduleGameTask(alchemyDraftTaskKey(state.userId), ALCHEMY_DRAFT_TTL_MS / 1_000, () => {
        if (alchemyDrafts.get(state.userId) === state) {
            clearAlchemyDraft(state.userId, '연금술 준비 시간이 만료되었습니다.');
        }
    });
}

function touchAlchemyDraft(state: AlchemyDraftState, now: number): void {
    state.expiresAt = now + ALCHEMY_DRAFT_TTL_MS;
    scheduleAlchemyDraftExpiry(state);
}

function failAlchemyDraft(reason: string): AlchemyDraftMutationResult {
    return { success: false, reason };
}

function getValidAlchemyDraftState(
    player: Player,
    draftId?: string,
    expectedRevision?: number,
    now = Date.now(),
): AlchemyDraftState | undefined {
    const state = alchemyDrafts.get(player.userId);
    if (!state) return undefined;
    if (now >= state.expiresAt) {
        clearAlchemyDraft(player.userId, '연금술 준비 시간이 만료되었습니다.');
        return undefined;
    }
    if (state.locationId !== player.locationId) {
        clearAlchemyDraft(player.userId, '장소를 이동해 연금술 준비가 취소되었습니다.');
        return undefined;
    }
    if (!canUseAlchemy(player)) {
        clearAlchemyDraft(player.userId, '가마솥 연성 스킬을 사용할 수 없어 준비가 취소되었습니다.');
        return undefined;
    }
    if (hasActiveMiniGame(player.userId)) {
        clearAlchemyDraft(player.userId, '다른 미니게임이 시작되어 연금술 준비가 취소되었습니다.');
        return undefined;
    }
    return (draftId === undefined || state.id === draftId)
        && (expectedRevision === undefined || state.revision === expectedRevision)
        ? state
        : undefined;
}

function updateAlchemyDraft(player: Player, state: AlchemyDraftState, now = Date.now()): AlchemyDraftMutationResult {
    state.revision++;
    touchAlchemyDraft(state, now);
    const draft = createAlchemyDraftSnapshot(player, state);
    emitAlchemyDraftEvent({ type: 'updated', draft });
    return { success: true, draft };
}

/** 카드 presenter는 갱신·정리 event만 구독하며 내부 Map을 직접 보지 않는다. */
export function subscribeAlchemyDraftEvents(handler: AlchemyDraftEventHandler): () => void {
    alchemyDraftHandlers.add(handler);
    return () => { alchemyDraftHandlers.delete(handler); };
}

/** 기존 준비를 새로 만들거나 만료 시간을 갱신해 불변 snapshot을 반환한다. */
export function openAlchemyDraft(player: Player, now = Date.now()): AlchemyDraftMutationResult {
    if (!canUseAlchemy(player)) {
        return failAlchemyDraft('현재 연금술사 직업과 패시브 스킬 [ 가마솥 연성 ]이 모두 필요합니다.');
    }
    if (player.isDefeated) return failAlchemyDraft('사망 상태에서는 연금술을 준비할 수 없습니다.');
    if (hasActiveMiniGame(player.userId)) {
        clearAlchemyDraft(player.userId, '다른 미니게임이 진행 중이라 연금술 준비가 취소되었습니다.');
        return failAlchemyDraft('다른 미니게임을 마친 뒤 연금술을 준비해주세요.');
    }
    let state = getValidAlchemyDraftState(player, undefined, undefined, now);
    if (!state) {
        state = {
            id: randomHex(12),
            revision: 0,
            userId: player.userId,
            locationId: player.locationId,
            bottleCount: 1,
            delivery: AlchemyDelivery.DRINK,
            ingredients: new Map(),
            expiresAt: now + ALCHEMY_DRAFT_TTL_MS,
        };
        alchemyDrafts.set(player.userId, state);
    }
    return updateAlchemyDraft(player, state, now);
}

/** 읽기는 세션 수명을 연장하지 않으며 inventory 현재 수량만 새 snapshot에 반영한다. */
export function getAlchemyDraftSnapshot(
    player: Player,
    draftId?: string,
    now = Date.now(),
): AlchemyDraftSnapshot | undefined {
    const state = getValidAlchemyDraftState(player, draftId, undefined, now);
    return state ? createAlchemyDraftSnapshot(player, state) : undefined;
}

export function setAlchemyDraftBottleCount(
    player: Player,
    draftId: string,
    revision: number,
    bottleCount: number,
): AlchemyDraftMutationResult {
    const state = getValidAlchemyDraftState(player, draftId, revision);
    if (!state) return failAlchemyDraft('현재 연금술 준비 카드가 만료되었거나 바뀌었습니다.');
    if (!Number.isSafeInteger(bottleCount) || bottleCount < 1 || bottleCount > 3) {
        return failAlchemyDraft('조제 병 수는 1~3 사이여야 합니다.');
    }
    state.bottleCount = bottleCount;
    return updateAlchemyDraft(player, state);
}

export function setAlchemyDraftDelivery(
    player: Player,
    draftId: string,
    revision: number,
    delivery: AlchemyDelivery,
): AlchemyDraftMutationResult {
    const state = getValidAlchemyDraftState(player, draftId, revision);
    if (!state) return failAlchemyDraft('현재 연금술 준비 카드가 만료되었거나 바뀌었습니다.');
    if (!AlchemyDelivery.values().includes(delivery)) return failAlchemyDraft('전달 방식이 올바르지 않습니다.');
    state.delivery = delivery;
    return updateAlchemyDraft(player, state);
}

export function adjustAlchemyDraftReagent(
    player: Player,
    draftId: string,
    revision: number,
    itemDataId: string,
    delta: 1 | -1,
): AlchemyDraftMutationResult {
    const state = getValidAlchemyDraftState(player, draftId, revision);
    if (!state) return failAlchemyDraft('현재 연금술 준비 카드가 만료되었거나 바뀌었습니다.');
    const normalizedItemDataId = itemDataId.trim();
    if (!getAlchemyReagent(normalizedItemDataId) || (delta !== 1 && delta !== -1)) {
        return failAlchemyDraft('등록된 연금 재료와 +1 또는 -1 조작만 사용할 수 있습니다.');
    }
    const current = state.ingredients.get(normalizedItemDataId) ?? 0;
    const next = current + delta;
    if (next < 0) return failAlchemyDraft('선택하지 않은 재료는 뺄 수 없습니다.');
    if (delta > 0 && current === 0 && state.ingredients.size >= ALCHEMY_MAX_DISTINCT_REAGENTS) {
        return failAlchemyDraft(`연금 재료는 최대 ${ALCHEMY_MAX_DISTINCT_REAGENTS}종까지 선택할 수 있습니다.`);
    }
    const total = [...state.ingredients.values()].reduce((sum, count) => sum + count, 0);
    if (delta > 0 && total >= ALCHEMY_MAX_TOTAL_REAGENT_COUNT) {
        return failAlchemyDraft(`한 번에 넣는 재료는 총 ${ALCHEMY_MAX_TOTAL_REAGENT_COUNT}개를 넘을 수 없습니다.`);
    }
    if (delta > 0 && next > player.inventory.getCount(normalizedItemDataId)) {
        return failAlchemyDraft('현재 인벤토리에 보유한 수량보다 많이 선택할 수 없습니다.');
    }
    if (next === 0) state.ingredients.delete(normalizedItemDataId);
    else state.ingredients.set(normalizedItemDataId, next);
    return updateAlchemyDraft(player, state);
}

/** 버튼 준비 snapshot을 기존 권위 startAlchemy에 넘기고 성공했을 때만 준비 상태를 끝낸다. */
export function startAlchemyDraft(player: Player, draftId: string, revision: number): StartAlchemyResult {
    const state = getValidAlchemyDraftState(player, draftId, revision);
    if (!state) return { success: false, reason: '현재 연금술 준비 카드가 만료되었거나 바뀌었습니다.' };
    if (state.ingredients.size < 1 || state.ingredients.size > ALCHEMY_MAX_DISTINCT_REAGENTS) {
        return { success: false, reason: '연금 재료를 1~5종 선택해주세요.' };
    }
    const ingredients = [...state.ingredients].map(([itemDataId, count]) => ({ itemDataId, count }));
    if (ingredients.some(ingredient => ingredient.count > player.inventory.getCount(ingredient.itemDataId))) {
        return { success: false, reason: '선택한 재료 수량이 현재 인벤토리 보유량보다 많습니다.' };
    }
    const result = startAlchemy(player, {
        bottleCount: state.bottleCount,
        delivery: state.delivery,
        ingredients,
    });
    if (result.success) clearAlchemyDraft(player.userId, '연금술 조제를 시작했습니다.');
    else if (hasActiveMiniGame(player.userId)) {
        clearAlchemyDraft(player.userId, '다른 미니게임과 충돌해 연금술 준비가 취소되었습니다.');
    }
    return result;
}

export function cancelAlchemyDraft(userId: number, draftId: string, revision: number): AlchemyDraftMutationResult {
    const state = alchemyDrafts.get(userId);
    if (!state || state.id !== draftId || state.revision !== revision) {
        return failAlchemyDraft('현재 연금술 준비 카드가 만료되었거나 바뀌었습니다.');
    }
    clearAlchemyDraft(userId, '연금술 준비를 취소했습니다.');
    return { success: true };
}

/** logout·이동·만료·미니게임 시작이 공유하는 단일 정리 API. */
export function clearAlchemyDraft(userId: number, reason = '연금술 준비가 취소되었습니다.'): boolean {
    const state = alchemyDrafts.get(userId);
    if (!state) return false;
    alchemyDrafts.delete(userId);
    cancelGameTask(alchemyDraftTaskKey(userId));
    emitAlchemyDraftEvent({ type: 'ended', userId, draftId: state.id, reason });
    return true;
}

/** command 초기화 때 이동·다른 미니게임 시작 정리를 한 번만 연결한다. */
export function initAlchemyDraftLifecycle(): void {
    if (alchemyDraftLifecycleInitialized) return;
    alchemyDraftLifecycleInitialized = true;
    subscribeGameEvent(GameEventIds.LOCATION_CHANGED, event => {
        const userId = event.actor?.attackOwner.playerUserId;
        if (userId !== undefined) clearAlchemyDraft(userId, '장소를 이동해 연금술 준비가 취소되었습니다.');
    });
    subscribeMiniGameStarted(event => {
        clearAlchemyDraft(event.userId, '미니게임이 시작되어 연금술 준비를 종료했습니다.');
    });
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
    if (totals.size < 1 || totals.size > ALCHEMY_MAX_DISTINCT_REAGENTS) return undefined;
    const normalized = [...totals]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([itemDataId, count]) => ({ itemDataId, count }));
    const totalCount = normalized.reduce((sum, ingredient) => sum + ingredient.count, 0);
    return totalCount <= ALCHEMY_MAX_TOTAL_REAGENT_COUNT
        && normalized.every(ingredient => ingredient.count <= 99)
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

/** 성공한 유효 조합은 정상 약, 미확인 조합은 투입 성질 기반 실패약, 미니게임 실패는 무산으로 확정한다. */
export function createAlchemyCompletionOutputs(options: {
    readonly result: Pick<MiniGameValidationResult, 'success' | 'score'>;
    readonly formula: Readonly<AlchemyFormulaData> | undefined;
    readonly ingredients: readonly AlchemyIngredientSelectionInput[];
    readonly delivery: AlchemyDelivery;
    readonly bottleCount: number;
    readonly sensibility: number;
}): readonly ItemSnapshot[] {
    if (!options.result.success) return [];
    return [createAlchemyPotionSnapshot({
        formula: options.formula,
        ingredients: options.ingredients,
        delivery: options.delivery,
        bottleCount: options.bottleCount,
        accuracy: clamp(options.result.score ?? 0, 0, 1),
        sensibility: options.sensibility,
    })];
}

/** 동레벨 일반 사냥의 80%를 기준으로 난도·품질·병 수를 반영하고 미확인 실험은 감액한다. */
export function calculateAlchemyExperience(
    playerLevel: number,
    difficulty: number,
    quality: AlchemyQuality,
    bottleCount: number,
    knownFormula: boolean,
): number {
    const count = Math.max(0, Math.floor(Number.isFinite(bottleCount) ? bottleCount : 0));
    if (count === 0) return 0;
    const normalizedDifficulty = clamp(Number.isFinite(difficulty) ? difficulty : 1, 1, 10);
    const difficultyMultiplier = 0.55 + normalizedDifficulty * 0.05;
    return Math.max(1, Math.round(
        Entity.getStandardMonsterExpOfLevel(playerLevel)
            * 0.8
            * difficultyMultiplier
            * quality.experienceMultiplier
            * count
            * (knownFormula ? 1 : 0.35),
    ));
}

/** `/연금술` 시작점. 첫 ready에서 재료를 한 번만 원자 소비하고 이후 성공 결과만 별도로 지급한다. */
export function startAlchemy(player: Player, options: StartAlchemyOptions): StartAlchemyResult {
    if (!canUseAlchemy(player)) {
        return { success: false, reason: '현재 연금술사 직업과 패시브 스킬 [ 가마솥 연성 ]이 모두 필요합니다.' };
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
        return { success: false, reason: '연금 재료를 1~5종, 올바른 수량으로 지정해야 합니다.' };
    }
    const totalIngredientCount = ingredients.reduce((sum, ingredient) => sum + ingredient.count, 0);
    if (totalIngredientCount < options.bottleCount) {
        return { success: false, reason: '조제약 한 병마다 연금 재료를 최소 1개 이상 넣어야 합니다.' };
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
                ingredients,
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
            const quality = AlchemyQuality.fromScore(calculateAlchemyQualityScore(
                clamp(result.score ?? 0, 0, 1),
                committedSensibility,
            ));
            const difficulty = clamp(formula?.difficulty ?? 4 + ingredients.length, 1, 10);
            const experience = calculateAlchemyExperience(
                player.level,
                difficulty,
                quality,
                options.bottleCount,
                Boolean(formula),
            );
            emitGameEvent(GameEventIds.ALCHEMY_BREWED, {
                actor: player,
                data: {
                    bottleCount: options.bottleCount,
                    formulaKnown: Boolean(formula),
                    quality: quality.key,
                },
            });
            const levelsGained = player.gainExp(experience);
            const formulaText = formula ? '' : ' · 미확인 조합이 재료 성질에 따른 실패약으로 굳었습니다.';
            const dropText = outputDropped ? ' · 중량 초과로 현재 위치 바닥에 놓였습니다.' : '';
            const experimentText = formula ? '' : ' (미확인 조합 35%)';
            const levelText = levelsGained.length ? ` · Lv.${levelsGained.at(-1)} 달성` : '';
            const message = `[ 연금술 완료 ] ${display.name} x${output.count} · ${quality.label} · 추적 정확도 ${accuracy}% · +${experience} EXP${experimentText}${levelText}${formulaText}${dropText}`;
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
        return { targets: [], reason: '유해 투척약은 현재 장소의 살아 있는 몬스터를 먼저 대상으로 지정해야 합니다.' };
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
    const effectTags = status?.hasTag(GameTags.PROPERTY_POISON) ? [GameTags.PROPERTY_POISON] : [];
    const rawDamage = Math.max(1, power * ALCHEMY_HARMFUL_DAMAGE_SCALE);
    const damage = useThrownAttack
        ? source.attack(target, damageType, rawDamage, {
            criticalRate: 0,
            criticalDamage: 1,
            consumeMainHandDurability: false,
            triggerMainHandHitEffects: false,
            effectTags,
            unavoidable: true,
        })
        : target.damage(rawDamage, damageType, {
            type: 'attack',
            causeEntity: source,
            critical: false,
            effectSource: new TagCollection({ definition: effectTags }),
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
                        message: '현재 대상에게 유해 조제약을 적용하지 못해 소비하지 않았습니다.',
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
