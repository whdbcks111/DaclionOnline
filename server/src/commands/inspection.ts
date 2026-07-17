import type Player from '../models/Player.js';
import Monster from '../models/Monster.js';
import type { Item, ItemInspectionSnapshot } from '../models/Item.js';
import { getItemData } from '../models/Item.js';
import { EquipSlotType } from '../models/Equipment.js';
import { AttributeType } from '../models/Attribute.js';
import { StatType } from '../models/Stat.js';
import { StatusEffectType } from '../models/StatusEffect.js';
import { getTagEffectAffinitySnapshots } from '../models/TagEffect.js';
import { getLocation } from '../models/Location.js';
import { registerCommand } from '../modules/bot.js';
import { sendBotMessageToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';
import { chat } from '../utils/chatBuilder.js';
import type { CompletionItem } from '../../../shared/types.js';

export const ITEM_APPRAISAL_SENSIBILITY = 50;
export const ITEM_PERFORMANCE_SENSIBILITY = 75;
export const ITEM_METADATA_SENSIBILITY = 100;
export const MONSTER_INFO_SENSIBILITY = 100;
export const MONSTER_COMBAT_SENSIBILITY = 125;
export const MONSTER_REWARD_SENSIBILITY = 150;

export interface ItemInspectionTarget {
    item: Item;
    sourceLabel: string;
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
    if (sensibility < ITEM_METADATA_SENSIBILITY) return 2;
    return 3;
}

export function getMonsterInspectionTier(sensibility: number): 0 | 1 | 2 | 3 {
    if (sensibility < MONSTER_INFO_SENSIBILITY) return 0;
    if (sensibility < MONSTER_COMBAT_SENSIBILITY) return 1;
    if (sensibility < MONSTER_REWARD_SENSIBILITY) return 2;
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
        return item ? { item, sourceLabel: `인벤토리 ${index + 1}번` } : undefined;
    }

    const parsed = parseEquipmentInput(input);
    if (!parsed) return undefined;
    if (parsed.index !== undefined) {
        const item = player.equipment.getEquipped(parsed.slot.key, parsed.index);
        return item ? {
            item,
            sourceLabel: parsed.slot.max > 1 ? `${parsed.slot.label}${parsed.index + 1}` : parsed.slot.label,
        } : undefined;
    }

    for (let index = 0; index < parsed.slot.max; index++) {
        const item = player.equipment.getEquipped(parsed.slot.key, index);
        if (item) return {
            item,
            sourceLabel: parsed.slot.max > 1 ? `${parsed.slot.label}${index + 1}` : parsed.slot.label,
        };
    }
    return undefined;
}

function itemTargetCompletions(userId: number): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    if (!player) return [];
    const inventory = player.inventory.getIndexedItems().map(({ item, index }) => ({
        value: String(index + 1),
        description: `인벤토리 · ${item.name || item.itemDataId}`,
    }));
    const equipment = player.equipment.getAllEquipped().map(({ slot, slotIndex, item }) => {
        const type = EquipSlotType.fromKey(slot)!;
        return {
            value: type.max > 1 ? `${type.label}${slotIndex + 1}` : type.label,
            description: `장착 · ${item.name || item.itemDataId}`,
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
        description: `Lv.${object.level} ${object.name}${object.isDefeated ? ` (${object.defeatLabel})` : ''}`,
    }] : []);
}

function formatNumber(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function formatMetadataValue(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value);
    try {
        return JSON.stringify(value);
    } catch {
        return '[표시할 수 없는 값]';
    }
}

function appendSection(builder: ReturnType<typeof chat>, title: string): void {
    builder.color('$text-tertiary', b => b.text(`─── ${title} ───\n`));
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

function buildItemInspection(snapshot: ItemInspectionSnapshot, sourceLabel: string, sensibility: number) {
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
                .tab(120, b => b.text('수량')).text(`${snapshot.count}${snapshot.stackable ? ` / 스택당 ${snapshot.maxStack}` : ''}\n`)
                .tab(120, b => b.text('무게')).text(`${formatNumber(snapshot.totalWeight)} (${formatNumber(snapshot.weight)} × ${snapshot.count})\n`);
            if (snapshot.equipSlot) {
                builder.tab(120, b => b.text('장착 부위')).text(`${EquipSlotType.fromInput(snapshot.equipSlot)?.label ?? snapshot.equipSlot}\n`);
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
                for (const modifier of snapshot.modifiers) {
                    const type = AttributeType.fromKey(modifier.attribute);
                    const value = modifier.op === 'multiply'
                        ? `${modifier.value >= 0 ? '+' : ''}${formatNumber(modifier.value * 100)}%`
                        : `${modifier.value >= 0 ? '+' : ''}${type?.format(modifier.value) ?? formatNumber(modifier.value)}`;
                    if (type) builder.icon(type.icon).text(' ');
                    builder.tab(120, b => b.text(type?.label ?? modifier.attribute)).text(`${value}\n`);
                }
            }

            appendSection(builder, '정밀 분석');
            if (tier < 3) {
                appendLocked(builder, ITEM_METADATA_SENSIBILITY);
            } else {
                builder.tab(120, b => b.text('아이템 ID')).text(`${snapshot.itemDataId}\n`)
                    .tab(120, b => b.text('식별 태그')).text(`${snapshot.tags.join(', ') || '(없음)'}\n`);
                const metadata = Object.entries(snapshot.metadata ?? {});
                const deltaKeys = new Set(Object.keys(snapshot.metadataDelta ?? {}));
                if (metadata.length === 0) builder.tab(120, b => b.text('메타데이터')).text('(없음)\n');
                for (const [key, value] of metadata) {
                    builder.tab(120, b => b.text(`${key}${deltaKeys.has(key) ? '*' : ''}`)).text(`${formatMetadataValue(value)}\n`);
                }
                if (deltaKeys.size > 0) builder.color('$text-tertiary', b => b.text('* 인스턴스에서 변경된 값\n'));
            }
            return builder;
        })
        .build();
}

const COMBAT_ATTRIBUTES = [
    AttributeType.MAX_LIFE,
    AttributeType.ATK,
    AttributeType.MAGIC_FORCE,
    AttributeType.DEF,
    AttributeType.MAGIC_DEF,
    AttributeType.ARMOR_PEN,
    AttributeType.MAGIC_PEN,
    AttributeType.SPEED,
    AttributeType.ATTACK_SPEED,
    AttributeType.CRIT_RATE,
    AttributeType.CRIT_DMG,
];

function buildMonsterInspection(monster: Monster, objectNumber: number, sensibility: number) {
    const snapshot = monster.getInspectionSnapshot();
    const tier = getMonsterInspectionTier(sensibility);
    const maxLife = snapshot.attributes.maxLife;
    return chat()
        .text('[ 몬스터 정보 ] ')
        .weight('bold', b => b.text(`Lv.${snapshot.level} ${snapshot.name}\n`))
        .hide('상세 보기', builder => {
            builder.text(`${snapshot.description}\n\n`);
            appendSection(builder, '기본 정보');
            builder.tab(120, b => b.text('상태'));
            if (snapshot.defeated) {
                builder.color('$danger', b => b.text(`(${snapshot.defeatLabel})\n`));
            } else {
                builder.progress({ value: maxLife > 0 ? snapshot.life / maxLife : 0, length: '7em', color: 'red' })
                    .text(` ${formatNumber(snapshot.life)} / ${formatNumber(maxLife)}\n`);
            }
            builder.tab(120, b => b.text('속성'));
            appendAffinities(builder, snapshot.tags);

            appendSection(builder, '전투 분석');
            if (tier < 2) {
                appendLocked(builder, MONSTER_COMBAT_SENSIBILITY);
            } else {
                for (const type of COMBAT_ATTRIBUTES) {
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
                        .tab(120, b => b.text(data?.name ?? drop.itemDataId))
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
                builder.tab(120, b => b.text('식별 태그')).text(`${snapshot.tags.join(', ') || '(없음)'}\n`);
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
}
