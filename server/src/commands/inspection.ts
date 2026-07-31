import type Player from '../models/Player.js';
import Monster from '../models/Monster.js';
import type { Item, ItemDurabilityRepairResult, ItemInspectionSnapshot } from '../models/Item.js';
import { getItemData, MAX_STACKABLE_ITEM_COUNT } from '../models/Item.js';
import { getSkillData } from '../models/Skill.js';
import { EquipSlotType } from '../models/Equipment.js';
import { AttributeType, summarizeAttributeModifiers } from '../models/Attribute.js';
import { StatType } from '../models/Stat.js';
import StatusEffect, { StatusEffectType } from '../models/StatusEffect.js';
import { getTagEffectAffinitySnapshots } from '../models/TagEffect.js';
import { getLocation } from '../models/Location.js';
import { registerCommand } from '../modules/bot.js';
import { sendBotMessageToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';
import { chat } from '../utils/chatBuilder.js';
import { parseChatMessage } from '../utils/chatParser.js';
import { formatWeight } from '../utils/format.js';
import type { CompletionItem } from '../../../shared/types.js';
import { ItemAttackEffectType } from '../models/ItemAttackEffect.js';
import {
    MONSTER_COMBAT_ATTRIBUTES,
    MONSTER_COMBAT_SENSIBILITY,
    MONSTER_INFO_SENSIBILITY,
    MONSTER_REWARD_SENSIBILITY,
    getMonsterInspectionTier,
} from '../models/Inspection.js';
import { GameTags } from '../../../shared/tags.js';

export { getMonsterInspectionTier } from '../models/Inspection.js';

export const ITEM_APPRAISAL_SENSIBILITY = 50;
export const ITEM_PERFORMANCE_SENSIBILITY = 75;
export const ITEM_SPECIAL_EFFECT_SENSIBILITY = 100;
export const STATUS_EFFECT_INFO_SENSIBILITY = 50;

export interface ItemInspectionTarget {
    item: Item;
    sourceLabel: string;
    increaseDurability(amount: number): number | null | undefined;
    repairDurability(amount: number, maxDurabilityLossRate: number): ItemDurabilityRepairResult | null | undefined;
    destroy(): boolean;
}

function sensibilityOf(player: Player): number {
    return player.stat.get(StatType.SENSIBILITY);
}

export function getSensibilityRequirementReason(player: Player, required: number): string | undefined {
    const current = sensibilityOf(player);
    return current >= required
        ? undefined
        : `감각 스탯이 부족합니다. (필요: ${required}, 현재: ${current})`;
}

export function getItemInspectionTier(sensibility: number): 0 | 1 | 2 | 3 {
    if (sensibility < ITEM_APPRAISAL_SENSIBILITY) return 0;
    if (sensibility < ITEM_PERFORMANCE_SENSIBILITY) return 1;
    if (sensibility < ITEM_SPECIAL_EFFECT_SENSIBILITY) return 2;
    return 3;
}

function parseEquipmentInput(input: string): { slot: EquipSlotType; index?: number } | undefined {
    const direct = EquipSlotType.fromInput(input);
    if (direct) return { slot: direct };
    const match = input.match(/^(.*?)(\d+)$/);
    if (!match) return undefined;
    const slot = EquipSlotType.fromInput(match[1]);
    const index = Number(match[2]) - 1;
    if (!slot || !Number.isInteger(index) || index < 0 || index >= slot.max) return undefined;
    return { slot, index };
}

/** 인벤토리 번호 또는 장착칸 입력을 실제 아이템으로 해석하는 공개 명령 API. */
export function resolveItemInspectionTarget(player: Player, rawInput: string): ItemInspectionTarget | undefined {
    const input = rawInput.trim();
    if (/^\d+$/.test(input)) {
        const index = Number(input) - 1;
        const item = player.inventory.getItemByIndex(index);
        return item ? {
            item,
            sourceLabel: `인벤토리 ${index + 1}번`,
            increaseDurability: amount => player.inventory.increaseItemDurabilityByIndex(index, amount),
            repairDurability: (amount, lossRate) =>
                player.inventory.repairItemDurabilityByIndex(index, amount, lossRate),
            destroy: () => {
                if (!player.inventory.removeItemInstance(item, item.count)) return false;
                item.data?.onOwnerItemDestroyed?.({ owner: player, item });
                return true;
            },
        } : undefined;
    }

    const parsed = parseEquipmentInput(input);
    if (!parsed) return undefined;
    if (parsed.index !== undefined) {
        const item = player.equipment.getEquipped(parsed.slot.key, parsed.index);
        return item ? {
            item,
            sourceLabel: parsed.slot.max > 1 ? `${parsed.slot.label}${parsed.index + 1}` : parsed.slot.label,
            increaseDurability: amount => player.equipment.increaseItemDurability(parsed.slot.key, parsed.index!, amount),
            repairDurability: (amount, lossRate) =>
                player.equipment.repairItemDurability(parsed.slot.key, parsed.index!, amount, lossRate),
            destroy: () => {
                const destroyed = player.equipment.consumeEquippedItem(
                    parsed.slot.key,
                    parsed.index!,
                    player.attribute,
                    item.count,
                );
                if (!destroyed) return false;
                destroyed.data?.onOwnerItemDestroyed?.({ owner: player, item: destroyed });
                return true;
            },
        } : undefined;
    }

    for (let index = 0; index < parsed.slot.max; index++) {
        const item = player.equipment.getEquipped(parsed.slot.key, index);
        if (item) return {
            item,
            sourceLabel: parsed.slot.max > 1 ? `${parsed.slot.label}${index + 1}` : parsed.slot.label,
            increaseDurability: amount => player.equipment.increaseItemDurability(parsed.slot.key, index, amount),
            repairDurability: (amount, lossRate) =>
                player.equipment.repairItemDurability(parsed.slot.key, index, amount, lossRate),
            destroy: () => {
                const destroyed = player.equipment.consumeEquippedItem(
                    parsed.slot.key,
                    index,
                    player.attribute,
                    item.count,
                );
                if (!destroyed) return false;
                destroyed.data?.onOwnerItemDestroyed?.({ owner: player, item: destroyed });
                return true;
            },
        };
    }
    return undefined;
}

export function itemTargetCompletions(userId: number): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    if (!player) return [];
    const inventory = player.inventory.getIndexedItems().map(({ item, index }) => ({
        value: String(index + 1),
        description: `인벤토리 · ${item.name || '알 수 없는 아이템'}`,
    }));
    const equipment = player.equipment.getAllEquipped().map(({ slot, slotIndex, item }) => {
        const type = EquipSlotType.fromKey(slot)!;
        return {
            value: type.max > 1 ? `${type.label}${slotIndex + 1}` : type.label,
            description: `장착 · ${item.name || '알 수 없는 아이템'}`,
        };
    });
    return [...inventory, ...equipment];
}

function monsterTargetCompletions(userId: number): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    const location = player ? getLocation(player.locationId) : undefined;
    if (!location) return [];
    return location.getObjects().flatMap((object, index): CompletionItem[] => object instanceof Monster ? [{
        value: String(index + 1),
        description: `${object.hasTag(GameTags.ENTITY_BOSS) ? '♛ ' : ''}Lv.${object.level} ${object.name}${object.isDefeated ? ` (${object.defeatLabel})` : ''}`,
    }] : []);
}

function statusEffectCompletions(): CompletionItem[] {
    return StatusEffectType.values().map(type => ({
        value: type.label,
        description: '상태이상 효과 설명',
    }));
}

function resolveStatusEffectInformationInput(rawInput: string): {
    type: StatusEffectType;
    level: number;
} | undefined {
    const input = rawInput.trim();
    const direct = StatusEffectType.fromInput(input);
    if (direct) return { type: direct, level: 1 };
    const match = input.match(/^(.+?)\s+(\d+)$/);
    if (!match) return undefined;
    const type = StatusEffectType.fromInput(match[1]);
    const level = Number(match[2]);
    return type && Number.isSafeInteger(level) && level >= 1
        ? { type, level }
        : undefined;
}

function formatNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function appendSection(builder: ReturnType<typeof chat>, title: string): void {
    builder.divider(title);
}

interface ItemGameplayDetail {
    label: string;
    value: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 내부 metadata key를 사용자에게 노출하지 않고 알려진 게임 효과로만 변환한다. */
export function getItemGameplayDetails(snapshot: ItemInspectionSnapshot): ItemGameplayDetail[] {
    const data = getItemData(snapshot.itemDataId);
    const metadata = snapshot.metadata ?? {};
    const details: ItemGameplayDetail[] = [];
    const amount = metadata.amount;
    if (data?.onUse === 'heal_hp' && typeof amount === 'number') {
        details.push({ label: '사용 효과', value: `생명력 ${formatNumber(amount)} 회복` });
    } else if (data?.onUse === 'heal_mp' && typeof amount === 'number') {
        details.push({ label: '사용 효과', value: `정신력 ${formatNumber(amount)} 회복` });
    } else if (data?.onUse === 'learn_skill' && typeof metadata.skillDataId === 'string') {
        const skill = getSkillData(metadata.skillDataId);
        details.push({ label: '사용 효과', value: skill ? `스킬 [ ${skill.name} ] 획득` : '알 수 없는 스킬 획득' });
    } else if (data?.onUse) {
        details.push({ label: '사용 효과', value: '사용 시 고유 효과 발동' });
    }

    const projectileAttack = metadata.projectileAttack;
    if (isRecord(projectileAttack)) {
        const ammunitionId = projectileAttack.ammunitionItemId;
        if (typeof ammunitionId === 'string') {
            details.push({
                label: '기본 공격',
                value: `${getItemData(ammunitionId)?.name ?? '지정 탄약'} 1개를 소모하는 원거리 공격`,
            });
        } else if (isRecord(projectileAttack.projectile)) {
            details.push({ label: '기본 공격', value: '탄약을 소모하지 않는 원거리 공격' });
        }
    }
    if (isRecord(metadata.projectile)) {
        details.push({ label: '용도', value: '원거리 무기에 사용하는 투사체 탄약' });
    }
    if (data?.gameplayEffects?.length) {
        for (const value of data.gameplayEffects) details.push({ label: '고유 효과', value });
    } else if (data?.onBasicAttackHit || data?.onDamageTaken) {
        details.push({ label: '적중 효과', value: '설명에 명시된 고유 효과 발동' });
    }
    for (const effect of snapshot.attackEffects) {
        const type = ItemAttackEffectType.fromKey(effect.type);
        if (!type) continue;
        details.push({
            label: '마법 적중 효과',
            value: `${type.label} · ${type.describe(effect)}`,
        });
    }
    return details;
}

function appendLocked(builder: ReturnType<typeof chat>, required: number): void {
    builder.color('$text-tertiary', b => b.text(`감각 ${required} 이상에서 확인할 수 있습니다.\n`));
}

function appendAffinities(builder: ReturnType<typeof chat>, tags: readonly string[]): void {
    const affinities = getTagEffectAffinitySnapshots().filter(affinity => tags.includes(affinity.tag));
    if (affinities.length === 0) {
        builder.color('$text-tertiary', b => b.text('(없음)\n'));
        return;
    }
    affinities.forEach(affinity => builder.icon(affinity.icon).text(` ${affinity.label} `));
    builder.text('\n');
}

export function buildItemInspection(snapshot: ItemInspectionSnapshot, sourceLabel: string, sensibility: number) {
    const tier = getItemInspectionTier(sensibility);
    return chat()
        .text('[ 감정 결과 ] ')
        .icon(snapshot.image)
        .weight('bold', b => b.text(` ${snapshot.name}\n`))
        .hide('상세 보기', builder => {
            builder.text(`${snapshot.description || '설명이 없습니다.'}\n\n`);
            appendSection(builder, '기본 정보');
            builder.tab(120, b => b.text('확인 위치')).text(`${sourceLabel}\n`)
                .tab(120, b => b.text('분류')).text(`${snapshot.category || '기타'}\n`)
                .tab(120, b => b.text('수량')).text(`${snapshot.count}${snapshot.stackable
                    ? snapshot.maxStack >= MAX_STACKABLE_ITEM_COUNT
                        ? ' / 스택 제한 없음'
                        : ` / 스택당 ${snapshot.maxStack}`
                    : ''}\n`)
                .tab(120, b => b.text('무게')).text(`${formatWeight(snapshot.totalWeight)} (${formatWeight(snapshot.weight)} × ${snapshot.count})\n`);
            if (snapshot.equipSlot) {
                builder.tab(120, b => b.text('장착 부위')).text(`${EquipSlotType.fromInput(snapshot.equipSlot)?.label ?? snapshot.equipSlot}\n`);
            }
            if (snapshot.requirements) {
                const requirementParts = [`Lv.${snapshot.requirements.level}`];
                for (const stat of StatType.values()) {
                    const amount = snapshot.requirements.stats[stat.key];
                    if (amount) requirementParts.push(`${stat.label} ${amount}`);
                }
                const sourceLabel = snapshot.requirements.source === 'treasure'
                    ? '보물 완화'
                    : snapshot.requirements.source === 'forge' ? '단조품' : '상점품';
                builder.tab(120, b => b.text('필요 조건'))
                    .text(`${requirementParts.join(' · ')} `)
                    .color('$text-tertiary', b => b.text(`(${sourceLabel})`))
                    .text('\n');
            }
            appendSection(builder, '속성');
            appendAffinities(builder, snapshot.tags);

            appendSection(builder, '성능 분석');
            if (tier < 2) {
                appendLocked(builder, ITEM_PERFORMANCE_SENSIBILITY);
            } else {
                if (snapshot.durability !== null && snapshot.maxDurability !== null) {
                    const ratio = snapshot.maxDurability > 0 ? snapshot.durability / snapshot.maxDurability : 0;
                    builder.tab(120, b => b.text('내구도'))
                        .progress({ value: ratio, length: '7em', color: ratio > 0.5 ? 'green' : ratio > 0.2 ? 'orange' : 'red' })
                        .text(` ${snapshot.durability} / ${snapshot.maxDurability}\n`);
                } else {
                    builder.tab(120, b => b.text('내구도')).text('없음\n');
                }
                if (snapshot.modifiers.length === 0) builder.color('$text-tertiary', b => b.text('능력치 보정 없음\n'));
                for (const modifier of summarizeAttributeModifiers(snapshot.modifiers)) {
                    const type = AttributeType.fromKey(modifier.attribute);
                    const values: string[] = [];
                    if (modifier.additive !== 0 || modifier.multiplier === 1) {
                        values.push(
                            `${modifier.additive >= 0 ? '+' : ''}${type?.format(modifier.additive) ?? formatNumber(modifier.additive)}`,
                        );
                    }
                    if (modifier.multiplier !== 1) {
                        const percent = (modifier.multiplier - 1) * 100;
                        values.push(`${percent >= 0 ? '+' : ''}${formatNumber(percent)}%`);
                    }
                    if (type) builder.icon(type.icon).text(' ');
                    builder.tab(120, b => b.text(type?.label ?? modifier.attribute)).text(`${values.join(' ')}\n`);
                }
            }

            appendSection(builder, '특수 효과 분석');
            if (tier < 3) {
                appendLocked(builder, ITEM_SPECIAL_EFFECT_SENSIBILITY);
            } else {
                const details = getItemGameplayDetails(snapshot);
                if (details.length === 0) builder.color('$text-tertiary', b => b.text('추가로 확인된 특수 효과가 없습니다.\n'));
                for (const detail of details) {
                    builder.tab(120, b => b.text(detail.label)).text(`${detail.value}\n`);
                }
            }
            return builder;
        })
        .build();
}

export function buildMonsterInspection(monster: Monster, objectNumber: number, sensibility: number) {
    const snapshot = monster.getInspectionSnapshot();
    const tier = getMonsterInspectionTier(sensibility);
    const maxLife = snapshot.attributes.maxLife;
    const message = chat()
        .text('[ 몬스터 정보 ] ')
        .icon(snapshot.icon)
        .text(' ');
    if (monster.hasTag(GameTags.ENTITY_BOSS)) {
        message.color('gold', crown => crown.text('♛ '));
    }
    return message
        .weight('bold', b => b.text(`Lv.${snapshot.level} ${snapshot.name}\n`))
        .hide('상세 보기', builder => {
            builder.text(`${snapshot.description}\n\n`);
            appendSection(builder, '기본 정보');
            builder.tab(120, b => b.text('상태'));
            if (snapshot.defeated) {
                builder.color('$danger', b => b.text(`(${snapshot.defeatLabel})\n`));
            } else {
                builder.health({ life: snapshot.life, maxLife, shields: snapshot.shields, length: '7em', color: 'red' })
                    .text(` ${formatNumber(snapshot.life)} / ${formatNumber(maxLife)}\n`);
            }
            builder.tab(120, b => b.text('속성'));
            appendAffinities(builder, snapshot.tags);

            appendSection(builder, '전투 분석');
            if (tier < 2) {
                appendLocked(builder, MONSTER_COMBAT_SENSIBILITY);
            } else {
                for (const type of MONSTER_COMBAT_ATTRIBUTES) {
                    builder.icon(type.icon).text(' ').tab(112, b => b.text(type.label)).text(`${type.format(snapshot.attributes[type.key])}\n`);
                }
                const damageType = snapshot.attack?.damageType ?? 'physical';
                builder.tab(120, b => b.text('기본 공격')).text(`${damageType === 'magic' ? '마법 피해' : damageType === 'absolute' ? '고정 피해' : '물리 피해'}\n`);
                const effect = snapshot.attack?.effect;
                if (effect) {
                    const effectType = StatusEffectType.fromKey(effect.statusEffectId);
                    builder.tab(120, b => b.text('공격 효과'))
                        .text(`${effectType?.label ?? effect.statusEffectId} Lv.${effect.level} · ${formatNumber(effect.chance * 100)}% · ${formatNumber(effect.duration)}초\n`);
                }
            }

            appendSection(builder, '행동·보상 분석');
            if (tier < 3) {
                appendLocked(builder, MONSTER_REWARD_SENSIBILITY);
            } else {
                builder.tab(120, b => b.text('경험치')).text(`${snapshot.expReward}\n`);
                const gold = snapshot.goldReward;
                builder.tab(120, b => b.text('골드')).text(`${typeof gold === 'number' ? gold : `${gold.min} ~ ${gold.max}`}\n`);
                if (snapshot.drops.length === 0) builder.tab(120, b => b.text('드롭')).text('(없음)\n');
                for (const drop of snapshot.drops) {
                    const data = getItemData(drop.itemDataId);
                    builder.icon(data?.image ?? `items/${drop.itemDataId}`).text(' ')
                        .tab(120, b => b.text(data?.name ?? '알 수 없는 아이템'))
                        .text(`${formatNumber(drop.chance * 100)}% · ${drop.minCount}${drop.maxCount !== drop.minCount ? `~${drop.maxCount}` : ''}개\n`);
                }
                if (snapshot.skills.length > 0) {
                    builder.tab(120, b => b.text('보유 스킬')).text(snapshot.skills.map(skill => `${skill.name} Lv.${skill.level}`).join(', ')).text('\n');
                }
                if (snapshot.skillPattern) {
                    builder.tab(120, b => b.text('패턴 주기')).text(`${formatNumber(snapshot.skillPattern.interval.min)}~${formatNumber(snapshot.skillPattern.interval.max)}초\n`);
                }
                if (snapshot.equipments.length > 0) {
                    builder.tab(120, b => b.text('장비')).text(snapshot.equipments.map(equipment => equipment.name).join(', ')).text('\n');
                }
            }
            builder.text('\n').button(`/대상지정 ${objectNumber}`, b => b.text('대상 지정'));
            return builder;
        })
        .build();
}

export function initInspectionCommands(): void {
    registerCommand({
        name: '감정',
        aliases: ['appraise'],
        description: '감각에 따라 인벤토리 또는 장착 아이템의 상세 정보를 확인합니다.',
        information: true,
        args: [{
            name: '아이템 번호 또는 장착칸',
            description: '인벤토리 번호 또는 손, 다리, 장신구1 같은 장착칸 이름',
            required: true,
            completions: itemTargetCompletions,
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const denied = getSensibilityRequirementReason(player, ITEM_APPRAISAL_SENSIBILITY);
            if (denied) {
                sendBotMessageToUser(userId, denied);
                return;
            }
            const target = resolveItemInspectionTarget(player, args[0] ?? '');
            if (!target) {
                sendBotMessageToUser(userId, '유효한 인벤토리 번호 또는 장착 중인 장착칸을 입력해주세요.');
                return;
            }
            sendBotMessageToUser(userId, buildItemInspection(target.item.getInspectionSnapshot(), target.sourceLabel, sensibilityOf(player)));
        },
    });

    registerCommand({
        name: '몬스터정보',
        aliases: ['monsterinfo'],
        description: '감각에 따라 현재 장소 몬스터의 속성·능력치·행동·보상을 확인합니다.',
        information: true,
        args: [{
            name: '몬스터 번호',
            description: '현재 장소의 몬스터 번호',
            required: true,
            completions: monsterTargetCompletions,
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const denied = getSensibilityRequirementReason(player, MONSTER_INFO_SENSIBILITY);
            if (denied) {
                sendBotMessageToUser(userId, denied);
                return;
            }
            const number = Number(args[0]);
            const location = getLocation(player.locationId);
            const object = Number.isInteger(number) && number > 0 ? location?.getObject(number - 1) : undefined;
            if (!object) {
                sendBotMessageToUser(userId, '유효한 오브젝트 번호를 입력해주세요.');
                return;
            }
            if (!(object instanceof Monster)) {
                sendBotMessageToUser(userId, '해당 번호의 오브젝트는 몬스터가 아닙니다.');
                return;
            }
            sendBotMessageToUser(userId, buildMonsterInspection(object, number, sensibilityOf(player)));
        },
    });

    registerCommand({
        name: '상태이상정보',
        aliases: ['effectinfo', 'sei'],
        description: '감각 50 이상일 때 상태이상의 효과와 중첩 규칙을 확인합니다.',
        information: true,
        args: [{
            name: '상태이상 이름 [레벨]',
            description: '확인할 상태이상 이름과 선택 레벨 (생략 시 1레벨)',
            required: true,
            isText: true,
            completions: statusEffectCompletions(),
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const denied = getSensibilityRequirementReason(player, STATUS_EFFECT_INFO_SENSIBILITY);
            if (denied) {
                sendBotMessageToUser(userId, denied);
                return;
            }
            const resolved = resolveStatusEffectInformationInput(args[0] ?? '');
            if (!resolved) {
                sendBotMessageToUser(userId, '상태이상 이름과 1 이상의 레벨을 입력해주세요. (예: /상태이상정보 화염 5)');
                return;
            }

            const { type, level } = resolved;
            const effect = new StatusEffect(type, 1, level);
            const builder = chat()
                .text('[ 상태이상 정보 ] ')
                .icon(type.icon)
                .weight('bold', b => b.text(` ${type.label} Lv.${level}\n`))
                .hide('상세 보기', detail => detail
                    .divider(`${level}레벨 효과`)
                    .appendNodes(parseChatMessage(effect.formatDescription(player, { calculationTooltips: true })))
                    .text('\n')
                    .divider('재적용 규칙')
                    .text('더 높은 레벨은 기존 효과의 레벨과 지속시간을 교체합니다. 같은 레벨은 남은 시간보다 긴 지속시간만 반영되며, 더 낮은 레벨은 적용되지 않습니다.'));
            sendBotMessageToUser(userId, builder.build());
        },
    });
}
