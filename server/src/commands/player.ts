import { registerCommand } from "../modules/bot.js";
import { sendBotMessageToUser, sendBotMessageToChannel, sendBotMessageFiltered, sendPrivateBotMessageToUser } from "../modules/message.js";
import { getUserChannel } from "../modules/channel.js";
import { chat } from "../utils/chatBuilder.js";
import { getOnlinePlayers, getPlayerByUserId } from "../modules/player.js";
import { findOnlinePlayerByIdentity } from '../modules/playerRegistry.js';
import { getLocation } from "../models/Location.js";
import { getItemData, Item } from "../models/Item.js";
import type { EquipSlot } from "../models/Equipment.js";
import { SLOT_MAX, EquipSlotType } from "../models/Equipment.js";
import type Entity from "../models/Entity.js";
import Monster from "../models/Monster.js";
import Resource from "../models/Resource.js";
import { StatType } from "../models/Stat.js";
import { AttributeType } from "../models/Attribute.js";
import { ActionType } from "../models/Action.js";
import prisma from "../config/prisma.js";
import logger from "../utils/logger.js";
import { CompletionItem } from "../../../shared/types.js";
import { parseChatMessage } from "../utils/chatParser.js";
import { formatWeight } from "../utils/format.js";
import { emitGameEvent, GameEventIds } from "../models/GameEvent.js";

function formatStatusDuration(seconds: number): string {
    const totalSeconds = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(totalSeconds / 60);
    const remainder = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function itemDurabilityColor(ratio: number): string {
    if (ratio <= 0.2) return 'red';
    if (ratio <= 0.5) return 'gold';
    return 'lime';
}

function itemLabel(b: ReturnType<typeof chat>, item: Item): ReturnType<typeof chat> {
    b.icon(item.image).text(item.name || item.itemDataId);
    const ratio = item.durabilityRatio;
    if (ratio !== null) {
        b.text(' ').tooltip(
            `내구도 ${item.durability} / ${item.baseDurability}`,
            inner => inner.progress({
                value: ratio,
                length: '3.5em',
                color: itemDurabilityColor(ratio),
                thickness: 5,
            }),
        );
    }
    return b;
}

function getObjectTargetCompletions(userId: number): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    if (!player) return [];
    const location = getLocation(player.locationId);
    if (!location) return [];
    return location.getObjects()
        .map((object, index) => ({ object, index }))
        .sort((a, b) => Number(a.object.isDefeated) - Number(b.object.isDefeated))
        .map(({ object, index }) => ({
            value: String(index + 1),
            description: `Lv.${object.level} ${object.name}${object.isDefeated ? ` (${object.defeatLabel})` : ''}`,
        }));
}

function getPvpTargets(userId: number) {
    const player = getPlayerByUserId(userId);
    if (!player) return [];
    return getOnlinePlayers()
        .filter(candidate => candidate.userId !== userId && candidate.locationId === player.locationId)
        .sort((left, right) => Number(left.isDefeated) - Number(right.isDefeated) || left.userId - right.userId);
}

function getPvpTargetCompletions(userId: number): CompletionItem[] {
    return getPvpTargets(userId).map((target, index) => ({
        value: `#${target.userId}`,
        description: `${index + 1}. Lv.${target.level} ${target.name}${target.isDefeated ? ' (사망)' : ''}`,
    }));
}

function resolvePvpTarget(userId: number, input: string | undefined) {
    if (!input?.trim()) return undefined;
    const indexed = Number(input);
    if (Number.isInteger(indexed) && indexed > 0) return getPvpTargets(userId)[indexed - 1];
    return findOnlinePlayerByIdentity(input);
}

export function initPlayerCommands(): void {
    registerCommand({
        name: '상태창',
        aliases: ['status', 's'],
        args: [
            { name: '공개/비공개', description: '공개 여부를 결정합니다.', completions: ['공개', '비공개'] },
        ],
        description: '플레이어 정보를 확인합니다.',
        information: true,
        async handler(userId, args) {
            try {
                const player = getPlayerByUserId(userId);
                if (!player) return;

                const user = await prisma.user.findUnique({
                    where: { id: userId },
                    select: { nickname: true, permission: true },
                });
                if (!user) return;

                const location = getLocation(player.locationId);
                const attr = player.attribute.computed;
                const stats = player.stat.points;

                const expRatio = Math.min(1, player.exp / player.maxExp);
                const mentalityRatio = Math.min(1, player.mentality / player.maxMentality);
                const thirstyRatio = Math.min(1, player.thirsty / player.maxThirsty);
                const hungryRatio = Math.min(1, player.hungry / player.maxHungry);
                const L = 80;
                const V = 50;

                const chatNode = chat()
                    .text('[ 상태창 ]  ')
                    .text(user.nickname)
                    .text('  Lv.')
                    .text(String(player.level))
                    .text('\n')
                    .divider('기본 정보')
                    .weight('bold', b => b.text('EXP'))
                    .text('  ')
                    .progress({ value: expRatio, length: 120, color: '#a855f7', thickness: 8 })
                    .text(`  ${player.exp} / ${player.maxExp}\n`)
                    .weight('bold', b => b.text('위치'))
                    .text(` ${location?.data.name ?? '???'}  `)
                    .color(player.moving ? 'gold' : 'gray', b => b.text(player.moving ? '이동 중' : '대기 중'))
                    .text('\n')
                    .weight('bold', b => b.text('골드'))
                    .text(` ${player.gold.toLocaleString()}G\n`)
                    .weight('bold', b => b.text('카르마'))
                    .text(` ${player.karma.toFixed(1)}  `)
                    .color(player.karmaTier.color, b => b.text(player.karmaTier.label))
                    .text(player.isKarmaMarked ? ' 🥀' : '')
                    .text('\n')
                    .weight('bold', b => b.text('메인 직업'))
                    .text(` ${player.career.effectiveMainJob?.name ?? '(미선택)'}`)
                    .text(player.career.eliteJob ? ` (${player.career.mainJob?.name} 계보)` : '')
                    .text('\n')
                    .weight('bold', b => b.text('서브 직업'))
                    .text(` ${player.career.subJob?.name ?? '(미선택)'}\n`)
                    .hide('상세 보기', b => {
                        b.divider('장착 정보');

                        for (const slotType of EquipSlotType.values()) {
                            for (let i = 0; i < slotType.max; i++) {
                                const equipped = player.equipment.getEquipped(slotType.key, i);
                                const slotLabel = slotType.max > 1 ? `${slotType.label}${i + 1}` : slotType.label;
                                b.tab(L, b2 => b2.weight('bold',b3 => b3.text(slotLabel)));
                                if (equipped) {
                                    itemLabel(b, equipped).text('\n');
                                } else {
                                    b.color('gray', b2 => b2.text('(없음)')).text('\n');
                                }
                            }
                        }

                        b
                        .divider('상태')
                        .icon(AttributeType.MAX_LIFE.icon).text(' ')
                        .weight('bold',b2 => b2.text('생명력'))
                        .text('  ')
                        .health({ life: player.life, maxLife: player.maxLife, shields: player.getShieldBarSegments(), length: 120, color: '$life', thickness: 8 })
                        .text(`  ${player.life.toFixed(1)} / ${player.maxLife.toFixed(1)}${player.getTotalShield() > 0 ? ` (+${player.getTotalShield().toFixed(1)})` : ''}\n`)
                        .icon(AttributeType.MAX_MENTALITY.icon).text(' ')
                        .weight('bold',b2 => b2.text('정신력'))
                        .text('  ')
                        .progress({ value: mentalityRatio, length: 120, color: '$magic', thickness: 8 })
                        .text(`  ${player.mentality.toFixed(1)} / ${player.maxMentality.toFixed(1)}\n`)
                        .icon(AttributeType.MAX_HUNGRY.icon).text(' ')
                        .weight('bold',b2 => b2.text('배고픔'))
                        .text('  ')
                        .progress({ value: hungryRatio, length: 120, color: '$hungry', thickness: 8 })
                        .text(`  ${player.hungry.toFixed(1)} / ${player.maxHungry.toFixed(1)}\n`)
                        .icon(AttributeType.MAX_THIRSTY.icon).text(' ')
                        .weight('bold',b2 => b2.text('목마름'))
                        .text('  ')
                        .progress({ value: thirstyRatio, length: 120, color: '$thirsty', thickness: 8 })
                        .text(`  ${player.thirsty.toFixed(1)} / ${player.maxThirsty.toFixed(1)}\n`)
                        .divider('능력치');

                        const stateMaximums = new Set([
                            AttributeType.MAX_LIFE,
                            AttributeType.MAX_MENTALITY,
                            AttributeType.MAX_HUNGRY,
                            AttributeType.MAX_THIRSTY,
                        ]);
                        const combatAttrs = AttributeType.values().filter(attribute => !stateMaximums.has(attribute));
                        for (const attribute of combatAttrs) {
                            b.tab(155, label => label
                                .icon(attribute.icon)
                                .text(' ')
                                .tooltip(
                                    attribute.getDescription(attr[attribute.key]),
                                    name => name.weight('bold', text => text.text(attribute.label)),
                                ))
                                .text(`${attribute.format(attr[attribute.key])}\n`);
                        }

                        b.divider('스탯')
                         .tab(L, b2 => b2.weight('bold',b3 => b3.text('스탯포인트'))).text(`${player.statPoint}\n`);

                        const statTypes = StatType.values();
                        for (let i = 0; i < statTypes.length; i += 2) {
                            const left = statTypes[i];
                            const right = statTypes[i + 1];
                            b.tab(L, b2 => b2.tooltip(left.getDescription(stats[left.key]), b3 => b3.weight('bold', b4 => b4.text(left.label))))
                             .tab(V, b2 => b2.text(String(stats[left.key])));
                            if (right) {
                                b.tab(L, b2 => b2.tooltip(right.getDescription(stats[right.key]), b3 => b3.weight('bold', b4 => b4.text(right.label))))
                                 .text(`${stats[right.key]}\n`);
                            } else {
                                b.text('\n');
                            }
                        }

                        const statusEffects = player.getStatusEffectDisplaySnapshots();
                        b.divider('상태이상');
                        if (statusEffects.length === 0) {
                            b.color('gray', b2 => b2.text('(없음)\n'));
                        } else {
                            for (const effect of statusEffects) {
                                b.text(`Lv.${effect.level} `)
                                    .icon(effect.icon)
                                    .tooltip(
                                        detail => detail
                                            .appendNodes(parseChatMessage(effect.description))
                                            .text(`\n남은 시간 ${formatStatusDuration(effect.duration)} / ${formatStatusDuration(effect.maxDuration)}`),
                                        name => name.weight('bold', inner => inner.text(effect.label)),
                                    )
                                    .text(` ${formatStatusDuration(effect.duration)}\n`);
                            }
                        }

                        return b;
                    })
                    .build();

                const channel = getUserChannel(userId);
                if (args[0] === '공개') {
                    sendBotMessageToChannel(channel, chatNode);
                } else if (args[0] === '비공개') {
                    sendPrivateBotMessageToUser(userId, chatNode);
                    sendBotMessageFiltered(uid => uid !== userId, channel, chat().text('[ 상태창 ]  비공개 정보입니다.').build(), false);
                } else {
                    sendBotMessageToUser(userId, chatNode);
                }
            } catch (e) {
                logger.error('상태창 명령어 처리 중 오류:', e);
                sendBotMessageToUser(userId, '상태창을 불러오는 중 오류가 발생했습니다.');
            }
        },
    });

    registerCommand({
        name: '인벤토리',
        aliases: ['inv', 'i'],
        description: '인벤토리를 확인합니다.',
        information: true,
        args: [
            { name: '공개/비공개', description: '공개 여부를 결정합니다.', completions: ['공개', '비공개'] },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;

            const inv = player.inventory;
            const items = inv.items;

            const b = chat()
                .text(`[ 인벤토리 (${formatWeight(inv.currentWeight)} / ${formatWeight(inv.maxWeight)}) ]`);

            const SLOT = 35;
            const CAT  = 90;
            const NAME = 170;
            const CNT  = 55;

            b.text('\n').hide('목록 보기', inner => {
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    inner.tab(SLOT, b2 => b2.color('gray', b3 => b3.text(`[${i + 1}]`)))
                         .tab(CAT,  b2 => b2.color('gray', b3 => b3.text(`[${item.category}]`)))
                         .tab(NAME, b2 => itemLabel(b2, item))
                         .tab(CNT,  b2 => b2.text(`x${item.count}`));

                    if (item.data?.onUse) {
                        inner.closeButton(`/사용 ${i + 1}`, b2 => b2.text('사용')).text(' ');
                    }

                    if (item.equipSlot) {
                        inner.closeButton(`/장착 ${i + 1}`, b2 => b2.text('장착')).text(' ');
                    }

                    inner.closeButton(`/버리기 ${i + 1}`, b2 => b2.text('버리기')).text('\n');
                }
                return inner;
            });

            const channel = getUserChannel(userId);
            if (args[0] === '공개') {
                sendBotMessageToChannel(channel, b.build());
            } else if (args[0] === '비공개') {
                sendPrivateBotMessageToUser(userId, b.build());
                sendBotMessageFiltered(uid => uid !== userId, channel, chat().text('[ 인벤토리 ]  비공개 정보입니다.').build(), false);
            } else {
                sendBotMessageToUser(userId, b.build());
            }
        },
    });

    registerCommand({
        name: '사용',
        aliases: ['use', 'u'],
        description: '아이템을 1개 사용합니다.',
        showCommandUse: 'private',
        args: [
            { name: '슬롯ID', description: '사용할 아이템 인벤토리 슬롯 ID', required: true,
                completions(userId, args, raw) {
                    let player = getPlayerByUserId(userId);
                    if(!player) return [];
                    return player.inventory.items.map((item, slot): CompletionItem => ({
                        value: String(slot + 1),
                        description: item.name
                    }))
                },  
            },
        ],
        async handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;

            if (player.isDead) {
                sendBotMessageToUser(userId, '사망 상태에서는 행동할 수 없습니다.');
                return;
            }

            if (!player.canPerformAction(ActionType.ITEM_USE)) {
                sendBotMessageToUser(userId, '현재 아이템을 사용할 수 없는 상태입니다.');
                return;
            }

            const idx = parseInt(args[0], 10) - 1;
            if (isNaN(idx)) return;

            const item = player.inventory.getItemByIndex(idx);
            if (!item) {
                sendBotMessageToUser(userId, '인벤토리에 해당 아이템이 없습니다.');
                return;
            }

            if (player.inventory.isUsingItem) {
                sendBotMessageToUser(userId, '이미 아이템을 사용 중입니다.');
                return;
            }

            const itemId = item.id;
            const itemDataId = item.itemDataId;
            const countBefore = item.count;
            const result = player.inventory.useItem(itemId);
            if (!result) {
                sendBotMessageToUser(userId, `${item.name}은(는) 사용할 수 없습니다.`);
                return;
            }

            sendBotMessageToUser(userId, `${item.name}을(를) 사용합니다.`);

            await result;
            const remaining = player.inventory.getItem(itemId);
            if (!remaining || remaining.count < countBefore) {
                emitGameEvent(GameEventIds.ITEM_USED, {
                    actor: player,
                    data: { itemDataId },
                });
            }
        },
    });

    registerCommand({
        name: '버리기',
        aliases: ['drop', 'q'],
        description: '아이템을 지정한 개수만큼 현재 장소에 버립니다.',
        showCommandUse: 'show',
        args: [
            { name: '슬롯ID', description: '버릴 아이템 인벤토리 슬롯 ID', required: true,
                completions(userId) {
                    const player = getPlayerByUserId(userId);
                    if (!player) return [];
                    return player.inventory.items.map((item, slot): CompletionItem => ({
                        value: String(slot + 1),
                        description: item.name,
                    }));
                },
            },
            { name: '개수', description: '버릴 개수 (기본 1)' },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;

            if (player.isDead) {
                sendBotMessageToUser(userId, '사망 상태에서는 행동할 수 없습니다.');
                return;
            }

            if (!/^\d+$/.test(args[0] ?? '')) {
                sendBotMessageToUser(userId, '사용법: /버리기 <슬롯ID> [개수]');
                return;
            }
            const idx = Number(args[0]) - 1;

            const item = player.inventory.getItemByIndex(idx);
            if (!item) {
                sendBotMessageToUser(userId, '인벤토리에 해당 아이템이 없습니다.');
                return;
            }

            const countInput = args[1] ?? '1';
            if (!/^\d+$/.test(countInput) || Number(countInput) <= 0) {
                sendBotMessageToUser(userId, '버릴 개수는 1 이상의 정수여야 합니다.');
                return;
            }
            const count = Number(countInput);
            if (!Number.isSafeInteger(count) || count > item.count) {
                sendBotMessageToUser(userId, `버릴 수량이 부족합니다. (보유 ${item.count}개)`);
                return;
            }

            const location = getLocation(player.locationId);
            if (!location) {
                sendBotMessageToUser(userId, '현재 위치를 찾을 수 없습니다.');
                return;
            }

            const itemName = item.name;
            const snapshot = item.snapshot(count);

            if (!player.inventory.removeItemInstance(item, count)) {
                sendBotMessageToUser(userId, '아이템을 버리지 못했습니다. 다시 시도해주세요.');
                return;
            }
            location.addDroppedItem(snapshot);

            sendBotMessageToUser(userId, `${itemName} x${count}을(를) 버렸습니다.`);
        },
    });

    registerCommand({
        name: '장착',
        aliases: ['equip', 'eq'],
        description: '인벤토리의 아이템을 장착합니다.',
        showCommandUse: 'show',
        args: [
            { name: '슬롯ID', description: '장착할 아이템 인벤토리 슬롯 ID', required: true,
                completions(userId) {
                    const player = getPlayerByUserId(userId);
                    if (!player) return [];
                    return player.inventory.items
                        .map((item, slot): CompletionItem | null =>
                            item.equipSlot ? { value: String(slot + 1), description: `[${item.category}] ${item.name}` } : null
                        )
                        .filter((c): c is CompletionItem => c !== null);
                },
            },
            { name: '슬롯인덱스', description: '장착할 슬롯 인덱스 (1부터, 악세사리 등 다중 슬롯용)' },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;

            if (player.isDead) {
                sendBotMessageToUser(userId, '사망 상태에서는 행동할 수 없습니다.');
                return;
            }

            const idx = parseInt(args[0], 10) - 1;
            if (isNaN(idx)) return;

            const item = player.inventory.getItemByIndex(idx);
            if (!item) {
                sendBotMessageToUser(userId, '인벤토리에 해당 아이템이 없습니다.');
                return;
            }

            const slot = item.equipSlot as EquipSlot | null;
            if (!slot) {
                sendBotMessageToUser(userId, `${item.name}은(는) 장착할 수 없는 아이템입니다.`);
                return;
            }

            let targetSlotIndex: number | undefined;
            if (args[1]) {
                targetSlotIndex = parseInt(args[1], 10) - 1;
                if (isNaN(targetSlotIndex) || targetSlotIndex < 0 || targetSlotIndex >= SLOT_MAX[slot]) {
                    sendBotMessageToUser(userId, `유효한 슬롯 인덱스를 입력해주세요. (1~${SLOT_MAX[slot]})`);
                    return;
                }
            }

            const equipResult = player.equipInventoryItem(item, targetSlotIndex);

            if (!equipResult) {
                sendBotMessageToUser(userId, `${item.name}을(를) 장착할 수 없습니다.`);
                return;
            }
            const { displaced } = equipResult;
            if (displaced !== null) {
                sendBotMessageToUser(userId, `${item.name}을(를) 장착했습니다. (기존 장착 해제: ${getItemData(displaced.itemDataId)?.name ?? displaced.itemDataId})`);
            } else {
                sendBotMessageToUser(userId, `${item.name}을(를) 장착했습니다.`);
            }
        },
    });

    registerCommand({
        name: '장착해제',
        aliases: ['unequip'],
        description: '장착된 아이템을 해제합니다.',
        showCommandUse: 'show',
        args: [
            { name: '슬롯명', description: `해제할 슬롯 (${EquipSlotType.values().map(s => s.label).join('/')})`, required: true,
                completions: EquipSlotType.values().map(s => s.label),
            },
            { name: '인덱스', description: '해제할 슬롯 인덱스 (1부터, 악세사리 등 다중 슬롯용)' },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;

            if (player.isDead) {
                sendBotMessageToUser(userId, '사망 상태에서는 행동할 수 없습니다.');
                return;
            }

            const slotType = EquipSlotType.fromInput(args[0] ?? '');
            if (!slotType) {
                sendBotMessageToUser(userId, `유효한 슬롯명을 입력해주세요. (${EquipSlotType.values().map(s => s.label).join('/')})`);
                return;
            }

            const max = slotType.max;
            let slotIndex: number;

            if (args[1]) {
                slotIndex = parseInt(args[1], 10) - 1;
                if (isNaN(slotIndex) || slotIndex < 0 || slotIndex >= max) {
                    sendBotMessageToUser(userId, `유효한 인덱스를 입력해주세요. (1~${max})`);
                    return;
                }
            } else {
                // 마지막으로 장착된 슬롯 인덱스 탐색
                let lastOccupied = -1;
                for (let i = 0; i < max; i++) {
                    if (player.equipment.getEquipped(slotType.key, i)) lastOccupied = i;
                }
                if (lastOccupied === -1) {
                    sendBotMessageToUser(userId, `${slotType.label} 슬롯에 장착된 아이템이 없습니다.`);
                    return;
                }
                slotIndex = lastOccupied;
            }

            const unequipped = player.equipment.unequip(slotType.key, slotIndex, player.attribute);
            if (!unequipped) {
                sendBotMessageToUser(userId, `${slotType.label} 슬롯(${slotIndex + 1})에 장착된 아이템이 없습니다.`);
                return;
            }

            player.inventory.addItemSnapshot(unequipped.snapshot(unequipped.count));
            const countText = unequipped.count > 1 ? ` x${unequipped.count}` : '';
            sendBotMessageToUser(userId, `${getItemData(unequipped.itemDataId)?.name ?? unequipped.itemDataId}${countText}을(를) 장착 해제했습니다.`);
        },
    });

    registerCommand({
        name: '대상지정',
        aliases: ['target', 't'],
        description: '장소의 오브젝트를 현재 대상으로 지정합니다.',
        showCommandUse: 'hide',
        args: [
            {
                name: '번호',
                description: '현재 장소의 오브젝트 번호',
                required: true,
                completions: getObjectTargetCompletions,
            },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            if (player.isDefeated) {
                sendBotMessageToUser(userId, '사망 상태에서는 대상을 지정할 수 없습니다.');
                return;
            }
            const location = getLocation(player.locationId);
            if (!location) {
                sendBotMessageToUser(userId, '현재 위치를 찾을 수 없습니다.');
                return;
            }
            const number = Number(args[0]);
            const index = number - 1;
            if (!Number.isInteger(number) || index < 0) {
                sendBotMessageToUser(userId, '유효한 번호를 입력해주세요.');
                return;
            }
            const target = location.getObject(index);
            if (!target) {
                sendBotMessageToUser(userId, `${number}번 오브젝트가 없습니다. (현재 ${location.getObjectCount()}개)`);
                return;
            }
            if (target.isDefeated) {
                sendBotMessageToUser(userId, `이미 ${target.defeatLabel} 상태인 대상입니다.`);
                return;
            }
            player.currentTarget = target;
            emitGameEvent(GameEventIds.TARGET_SELECTED, {
                actor: player,
                subject: target,
                data: {
                    locationId: player.locationId,
                    targetNumber: number,
                    resourceDataId: target instanceof Resource ? target.resourceDataId : null,
                    monsterDataId: target instanceof Monster ? target.monsterDataId : null,
                },
            });
            sendBotMessageToUser(userId, chat()
                .color('gold', b => b.text('[대상 지정] '))
                .text(`${number}. Lv.${target.level} ${target.name}`)
                .build());
        },
    });

    registerCommand({
        name: '대상지정p',
        aliases: ['타겟p', '대상p', 'targetp', 'tgp'],
        description: '같은 장소의 플레이어를 PVP 대상으로 지정합니다.',
        showCommandUse: 'hide',
        args: [
            {
                name: '번호/닉네임/고유번호',
                description: '위치 목록 순번, 닉네임 또는 #고유번호',
                required: true,
                completions: getPvpTargetCompletions,
            },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            if (player.isDefeated) {
                sendBotMessageToUser(userId, '사망 상태에서는 대상을 지정할 수 없습니다.');
                return;
            }
            const target = resolvePvpTarget(userId, args[0]);
            if (!target || target.userId === userId || target.locationId !== player.locationId) {
                sendBotMessageToUser(userId, '같은 장소에서 해당 플레이어를 찾을 수 없습니다.');
                return;
            }
            if (target.isDefeated) {
                sendBotMessageToUser(userId, '사망한 플레이어는 대상으로 지정할 수 없습니다.');
                return;
            }
            const deniedReason = target.getAttackDeniedReason(player);
            if (deniedReason) {
                sendBotMessageToUser(userId, deniedReason);
                return;
            }
            player.currentTarget = target;
            sendBotMessageToUser(userId, chat()
                .color('$enemy', b => b.text('[PVP 대상 지정] '))
                .text(`Lv.${target.level} ${target.name} (#${target.userId})`)
                .build());
        },
    });

    registerCommand({
        name: '공격p',
        aliases: ['attackp', 'ap'],
        description: '같은 장소의 플레이어를 직접 공격합니다.',
        showCommandUse: 'hide',
        args: [
            {
                name: '번호/닉네임/고유번호',
                description: '대상 순번, 닉네임 또는 #고유번호',
                required: true,
                completions: getPvpTargetCompletions,
            },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            if (player.isDefeated) {
                sendBotMessageToUser(userId, '사망 상태에서는 공격할 수 없습니다.');
                return;
            }
            const target = resolvePvpTarget(userId, args[0]);
            if (!target || target.userId === userId || target.locationId !== player.locationId) {
                sendBotMessageToUser(userId, '같은 장소에서 해당 플레이어를 찾을 수 없습니다.');
                return;
            }
            if (target.isDefeated) {
                sendBotMessageToUser(userId, '사망한 플레이어는 공격할 수 없습니다.');
                return;
            }
            const deniedReason = target.getAttackDeniedReason(player);
            if (deniedReason) {
                sendBotMessageToUser(userId, deniedReason);
                return;
            }
            player.currentTarget = target;
            player.performBasicAttack(target);
        },
    });

    registerCommand({
        name: '공격',
        aliases: ['attack', 'a'],
        description: '장소의 오브젝트를 공격합니다.',
        showCommandUse: 'hide',
        args: [
            { name: '번호', description: '장소 내 오브젝트 번호 (생략 시 현재 타겟 공격)',
                completions: getObjectTargetCompletions,
            },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;

            if (player.isDead) {
                sendBotMessageToUser(userId, '사망 상태에서는 행동할 수 없습니다.');
                return;
            }

            const location = getLocation(player.locationId);
            if (!location) {
                sendBotMessageToUser(userId, '현재 위치를 찾을 수 없습니다.');
                return;
            }

            let target: Entity;

            if (args.length === 0) {
                const ct = player.currentTarget;
                if (!ct) {
                    sendBotMessageToUser(userId, '공격할 대상이 없습니다. 번호를 지정해주세요.');
                    return;
                }
                const onlinePlayerTarget = ct.isPlayer && ct.playerUserId !== undefined
                    && getPlayerByUserId(ct.playerUserId) === ct
                    && ct.locationId === player.locationId;
                if (!location.hasObject(ct) && !onlinePlayerTarget) {
                    player.currentTarget = null;
                    sendBotMessageToUser(userId, '현재 타겟이 이 장소에 없습니다.');
                    return;
                }
                target = ct;
            } else {
                const number = Number(args[0]);
                const idx = number - 1;
                if (!Number.isInteger(number) || idx < 0) {
                    sendBotMessageToUser(userId, '유효한 번호를 입력해주세요.');
                    return;
                }
                const selected = location.getObject(idx);
                if (!selected) {
                    sendBotMessageToUser(userId, `${idx + 1}번 오브젝트가 없습니다. (현재 ${location.getObjectCount()}개)`);
                    return;
                }
                target = selected;
                player.currentTarget = target;
            }

            player.performBasicAttack(target);
        },
    });

    registerCommand({
        name: '스탯분배',
        aliases: ['stat', '스탯부여', 'st', 'r'],
        description: '스탯 포인트를 분배합니다. 인자 없이 입력하면 분배 UI를 표시합니다.',
        showCommandUse: 'hide',
        args: [
            { name: '스탯', description: '근력 / 민첩 / 체력 / 감각 / 정신력 (또는 영문)',
                completions: StatType.values().map(s => s.label),
            },
            { name: '포인트', description: '투자할 포인트 수',
                completions(userId) {
                    const player = getPlayerByUserId(userId);
                    if (!player || player.statPoint <= 0) return [];
                    return Array.from({ length: Math.min(player.statPoint, 10) }, (_, i) =>
                        String(i + 1)
                    );
                },
            },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;

            const stats = player.stat.points;
            const available = player.statPoint;

            // 인자 없음: 분배 UI 표시
            if (args.length === 0) {
                const b = chat()
                    .color('gray', b2 => b2.text('[ 스탯 분배 ]  '))
                    .text('가용 포인트: ')
                    .color(available > 0 ? 'lime' : 'gray', b2 => b2.text(String(available)))
                    .text('\n');

                const L = 100;
                const V = 55;
                for (const stat of StatType.values()) {
                    b.tab(L, b2 => b2.tooltip(stat.getDescription(stats[stat.key]), b3 => b3.weight('bold', b4 => b4.text(stat.label))))
                     .tab(V, b2 => b2.text(String(stats[stat.key])));
                    if (available > 0) {
                        b.button(`/스탯분배 ${stat.key} 1`, b2 => b2.color('lime', b3 => b3.text('[+1]')));
                    }
                    b.text('\n');
                }

                sendBotMessageToUser(userId, b.build());
                return;
            }

            // 인자 1개: 사용법 안내
            if (args.length === 1) {
                sendBotMessageToUser(userId, `사용법: /스탯분배 [스탯] [포인트]\n예: /스탯분배 근력 3`);
                return;
            }

            // 인자 2개: 스탯 분배
            const statType = StatType.fromInput(args[0]);
            if (!statType) {
                sendBotMessageToUser(userId, `유효한 스탯 이름을 입력해주세요. (${StatType.values().map(s => s.label).join(' / ')})`);
                return;
            }

            const amount = parseInt(args[1], 10);
            if (isNaN(amount) || amount < 1) {
                sendBotMessageToUser(userId, '1 이상의 정수를 입력해주세요.');
                return;
            }

            if (available < amount) {
                sendBotMessageToUser(userId, `가용 포인트가 부족합니다. (현재 ${available})`);
                return;
            }

            player.allocateStat(statType, amount);
            sendBotMessageToUser(userId, chat()
                .color('yellow', b => b.text(statType.label))
                .text(` +${amount}  →  현재 ${player.stat.get(statType)}`)
                .text(`  (남은 포인트: ${player.statPoint})`)
                .build()
            );
        },
    });
}
