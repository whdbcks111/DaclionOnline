import { registerCommand } from "../modules/bot.js";
import { sendBotMessageToUser, sendBotMessageToChannel, sendBotMessageFiltered } from "../modules/message.js";
import { getUserChannel } from "../modules/channel.js";
import { chat } from "../utils/chatBuilder.js";
import { getPlayerByUserId } from "../modules/player.js";
import { getLocation } from "../models/Location.js";
import { getItemData, Item } from "../models/Item.js";
import type { EquipSlot } from "../models/Equipment.js";
import Monster from "../models/Monster.js";
import { STAT_TYPES } from "../models/Stat.js";
import type { StatType } from "../models/Stat.js";
import prisma from "../config/prisma.js";
import logger from "../utils/logger.js";

const STAT_KR: Record<StatType, string> = {
    strength: '근력', agility: '민첩', vitality: '체력', sensibility: '감각', mentality: '정신력',
};
const STAT_FROM_INPUT: Record<string, StatType> = {
    '근력': 'strength', 'strength': 'strength',
    '민첩': 'agility',  'agility': 'agility',
    '체력': 'vitality', 'vitality': 'vitality',
    '감각': 'sensibility', 'sensibility': 'sensibility',
    '정신력': 'mentality', 'mentality': 'mentality',
};

export function initPlayerCommands(): void {
    registerCommand({
        name: '상태창',
        aliases: ['status', 's'],
        args: [
            { name: '공개/비공개', description: '공개 여부를 결정합니다.' },
        ],
        description: '플레이어 정보를 확인합니다.',
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
                const lifeRatio = Math.min(1, player.life / player.maxLife);
                const mentalityRatio = Math.min(1, player.mentality / player.maxMentality);
                const thirstyRatio = Math.min(1, player.thirsty / player.maxThirsty);
                const hungryRatio = Math.min(1, player.hungry / player.maxHungry);
                const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(2);

                const L = 80;
                const V = 50;

                const chatNode = chat()
                    .text('[ 상태창 ]  ')
                    .color('yellow', b => b.text(user.nickname))
                    .text('  Lv.')
                    .color('lime', b => b.text(String(player.level)))
                    .text('\n')
                    .hide('상세 보기', b =>
                        b
                        .color('gray', b2 => b2.text('─── 기본 정보 ───\n'))
                        .color('yellow', b => b.text(user.nickname))
                        .text('  Lv.')
                        .color('lime', b => b.text(String(player.level)))
                        .text('\n')
                        .color('yellow', b2 => b2.text('EXP'))
                        .text('  ')
                        .progress({ value: expRatio, length: 120, color: '#a855f7', thickness: 8 })
                        .text(`  ${player.exp} / ${player.maxExp}\n`)
                        .color('yellow', b2 => b2.text('위치'))
                        .text(` ${location?.data.name ?? '???'}  `)
                        .color(player.moving ? 'gold' : 'gray', b2 => b2.text(player.moving ? '이동 중' : '대기 중'))
                        .text('\n')

                        .color('gray', b2 => b2.text('─── 상태 ───\n'))
                        .color('yellow', b2 => b2.text('생명력'))
                        .text('  ')
                        .progress({ value: lifeRatio, length: 120, color: '$life', thickness: 8 })
                        .text(`  ${player.life.toFixed(1)} / ${player.maxLife.toFixed(1)}\n`)
                        .color('yellow', b2 => b2.text('정신력'))
                        .text('  ')
                        .progress({ value: mentalityRatio, length: 120, color: '$magic', thickness: 8 })
                        .text(`  ${player.mentality.toFixed(1)} / ${player.maxMentality.toFixed(1)}\n`)
                        .color('yellow', b2 => b2.text('배고픔'))
                        .text('  ')
                        .progress({ value: hungryRatio, length: 120, color: '$hungry', thickness: 8 })
                        .text(`  ${player.hungry.toFixed(1)} / ${player.maxHungry.toFixed(1)}\n`)
                        .color('yellow', b2 => b2.text('목마름'))
                        .text('  ')
                        .progress({ value: thirstyRatio, length: 120, color: '$thirsty', thickness: 8 })
                        .text(`  ${player.thirsty.toFixed(1)} / ${player.maxThirsty.toFixed(1)}\n`)

                        .color('gray', b2 => b2.text('─── 능력치 ───\n'))
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('공격력'))).tab(V, b2 => b2.text(fmt(attr.atk)))
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('마법력'))).text(`${fmt(attr.magicForce)}\n`)
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('방어력'))).tab(V, b2 => b2.text(fmt(attr.def)))
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('마법저항'))).text(`${fmt(attr.magicDef)}\n`)
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('방어관통'))).tab(V, b2 => b2.text(fmt(attr.armorPen)))
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('마법관통'))).text(`${fmt(attr.magicPen)}\n`)
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('이동속도'))).tab(V, b2 => b2.text(fmt(attr.speed)))
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('공격속도'))).text(`${fmt(attr.attackSpeed)}\n`)
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('치명타율'))).tab(V, b2 => b2.text(`${(attr.critRate * 100).toFixed(1)}%`))
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('치명타피해'))).text(`${(attr.critDmg * 100).toFixed(0)}%\n`)
                        
                        .color('gray', b2 => b2.text('─── 스탯 ───\n'))
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('스탯포인트'))).text(`${player.statPoint}\n`)
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('근력'))).tab(V, b2 => b2.text(String(stats.strength)))
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('민첩'))).tab(V, b2 => b2.text(String(stats.agility)))
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('체력'))).text(`${stats.vitality}\n`)
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('감각'))).tab(V, b2 => b2.text(String(stats.sensibility)))
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('정신력'))).text(`${stats.mentality}\n`)
                    )
                    .build();

                const channel = getUserChannel(userId);
                if (args[0] === '공개') {
                    sendBotMessageToChannel(channel, chatNode);
                } else {
                    sendBotMessageToUser(userId, chatNode);
                    sendBotMessageFiltered(uid => uid !== userId, channel, chat().text('[ 상태창 ]  비공개 정보입니다.').build(), false);
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
        args: [
            { name: '공개/비공개', description: '공개 여부를 결정합니다.' },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;

            const inv = player.inventory;
            const items = inv.items;
            const fmtW = (w: number) => Number.isInteger(w) ? String(w) : w.toFixed(1);

            const b = chat()
                .text(`[ 인벤토리 (${fmtW(inv.currentWeight)} / ${fmtW(inv.maxWeight)}) ]`);

            const SLOT = 35;
            const CAT  = 90;
            const NAME = 170;
            const CNT  = 55;

            b.text('\n').hide('목록 보기', inner => {
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    inner.tab(SLOT, b2 => b2.color('gray', b3 => b3.text(`[${i + 1}]`)))
                         .tab(CAT,  b2 => b2.color('gray', b3 => b3.text(`[${item.category}]`)))
                         .tab(NAME, b2 => b2.text(item.name))
                         .tab(CNT,  b2 => b2.text(`x${item.count}`));

                    if (item.data?.onUse) {
                        inner.closeButton(`/사용 ${i + 1}`, b2 => b2.text('사용')).text(' ');
                    }

                    inner.closeButton(`/버리기 ${i + 1}`, b2 => b2.text('버리기')).text('\n');
                }
                return inner;
            });

            const channel = getUserChannel(userId);
            if (args[0] === '공개') {
                sendBotMessageToChannel(channel, b.build());
            } else {
                sendBotMessageToUser(userId, b.build());
                sendBotMessageFiltered(uid => uid !== userId, channel, chat().text('[ 인벤토리 ]  비공개 정보입니다.').build(), false);
            }
        },
    });

    registerCommand({
        name: '사용',
        aliases: ['use'],
        description: '아이템을 1개 사용합니다.',
        showCommandUse: 'show',
        args: [
            { name: '슬롯ID', description: '사용할 아이템 인벤토리 슬롯 ID', required: true },
        ],
        async handler(userId, args) {
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

            if (player.inventory.isUsingItem) {
                sendBotMessageToUser(userId, '이미 아이템을 사용 중입니다.');
                return;
            }

            const result = player.inventory.useItem(item.id);
            if (!result) {
                sendBotMessageToUser(userId, `${item.name}은(는) 사용할 수 없습니다.`);
                return;
            }

            await result;
        },
    });

    registerCommand({
        name: '버리기',
        aliases: ['drop'],
        description: '아이템을 1개 현재 장소에 버립니다.',
        showCommandUse: 'show',
        args: [
            { name: '슬롯ID', description: '버릴 아이템 인벤토리 슬롯 ID', required: true },
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

            const location = getLocation(player.locationId);
            if (!location) {
                sendBotMessageToUser(userId, '현재 위치를 찾을 수 없습니다.');
                return;
            }

            const itemName = item.name;
            const itemDataId = item.itemDataId;

            player.inventory.removeItem(item.id, 1);
            location.addDroppedItem(itemDataId, 1);

            sendBotMessageToUser(userId, `${itemName}을(를) 버렸습니다.`);
        },
    });

    registerCommand({
        name: '장착',
        aliases: ['equip'],
        description: '인벤토리의 아이템을 장착합니다.',
        showCommandUse: 'show',
        args: [
            { name: '슬롯ID', description: '장착할 아이템 인벤토리 슬롯 ID', required: true },
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

            const equipItem = new Item(item.itemDataId, 1, item.durability, item.metadata ? { ...item.metadata } : null);
            const success = player.equipment.equip(slot, equipItem, player.attribute);
            if (!success) {
                sendBotMessageToUser(userId, `${item.name}을(를) 장착할 수 없습니다. (슬롯이 가득 찼습니다.)`);
                return;
            }

            player.inventory.removeItem(item.id, 1);
            sendBotMessageToUser(userId, `${item.name}을(를) 장착했습니다.`);
        },
    });

    registerCommand({
        name: '공격',
        aliases: ['attack', 'a'],
        description: '장소의 몬스터를 공격합니다.',
        showCommandUse: 'hide',
        args: [
            { name: '번호', description: '장소 내 몬스터 번호 (생략 시 현재 타겟 공격)' },
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

            let monster: Monster;

            if (args.length === 0) {
                const ct = player.currentTarget;
                if (!ct) {
                    sendBotMessageToUser(userId, '공격할 대상이 없습니다. 번호를 지정해주세요.');
                    return;
                }
                const found = location.monsters.find(m => m === ct);
                if (!found) {
                    player.currentTarget = null;
                    sendBotMessageToUser(userId, '현재 타겟이 이 장소에 없습니다.');
                    return;
                }
                monster = found;
            } else {
                const idx = parseInt(args[0], 10) - 1;
                if (isNaN(idx) || idx < 0) {
                    sendBotMessageToUser(userId, '유효한 번호를 입력해주세요.');
                    return;
                }
                if (idx >= location.monsters.length) {
                    sendBotMessageToUser(userId, `${idx + 1}번 몬스터가 없습니다. (현재 ${location.monsters.length}마리)`);
                    return;
                }
                monster = location.monsters[idx];
                player.currentTarget = monster;
            }

            player.attack(monster);
        },
    });

    registerCommand({
        name: '스탯분배',
        aliases: ['stat'],
        description: '스탯 포인트를 분배합니다. 인자 없이 입력하면 분배 UI를 표시합니다.',
        showCommandUse: 'hide',
        args: [
            { name: '스탯', description: '근력 / 민첩 / 체력 / 감각 / 정신력 (또는 영문)' },
            { name: '포인트', description: '투자할 포인트 수' },
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
                for (const stat of STAT_TYPES) {
                    b.tab(L, b2 => b2.color('yellow', b3 => b3.text(STAT_KR[stat])))
                     .tab(V, b2 => b2.text(String(stats[stat])));
                    if (available > 0) {
                        b.button(`/스탯분배 ${stat} 1`, b2 => b2.color('lime', b3 => b3.text('[+1]')));
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
            const statType = STAT_FROM_INPUT[args[0].toLowerCase()] ?? STAT_FROM_INPUT[args[0]];
            if (!statType) {
                sendBotMessageToUser(userId, `유효한 스탯 이름을 입력해주세요. (${Object.values(STAT_KR).join(' / ')})`);
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
                .color('yellow', b => b.text(STAT_KR[statType]))
                .text(` +${amount}  →  현재 ${player.stat.get(statType)}`)
                .text(`  (남은 포인트: ${player.statPoint})`)
                .build()
            );
        },
    });
}
