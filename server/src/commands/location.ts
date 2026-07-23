import { registerCommand } from "../modules/bot.js";
import { sendBotMessageToUser, sendNotificationToUser, sendPrivateBotMessageToUser } from "../modules/message.js";
import { getPlayerByUserId, getOnlinePlayers } from "../modules/player.js";
import { getSessionByUserId } from "../modules/login.js";
import { chat } from "../utils/chatBuilder.js";
import { getLocation } from "../models/Location.js";
import { getItemSnapshotDisplay } from "../models/Item.js";
import type { CompletionItem } from "../../../shared/types.js";
import { ActionType } from "../models/Action.js";
import { getVisitedLocationMatches } from "../models/WorldMap.js";
import { cancelNavigation, startAutoNavigation, startLocationTravel } from "../modules/navigation.js";

export function initLocationCommands(): void {
    registerCommand({
        name: '이동',
        aliases: ['move', 'go', 'mv', 'v'],
        description: '다른 장소로 이동합니다.',
        showCommandUse: 'private',
        args: [
            { name: '장소이름', description: '이동할 장소 이름', required: false,
                completions(userId) {
                    const player = getPlayerByUserId(userId);
                    if (!player) return [];
                    const location = getLocation(player.locationId);
                    if (!location) return [];
                    return location.getAvailableConnections(player).map((c): CompletionItem =>
                        c.status === 'locked'
                            ? { value: c.name, description: '(잠김)' }
                            : c.name
                    );
                },
            },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;

            if (player.isDead) {
                sendBotMessageToUser(userId, '사망 상태에서는 행동할 수 없습니다.');
                return;
            }

            if (player.moving) {
                sendBotMessageToUser(userId, '이동 중에는 다시 이동할 수 없습니다.');
                return;
            }

            const currentLocation = getLocation(player.locationId);
            if (!currentLocation) {
                sendBotMessageToUser(userId, '현재 위치를 찾을 수 없습니다.');
                return;
            }

            const connections = currentLocation.getAvailableConnections(player);

            if (args.length === 0) {
                if (connections.length === 0) {
                    sendBotMessageToUser(userId, '이동 가능한 장소가 없습니다.');
                    return;
                }

                const msg = chat()
                    .text(`[ ${currentLocation.data.name} ] 이동 가능 장소\n`)
                    .hide('목록 보기', b => {
                        for (let index = 0; index < connections.length; index++) {
                            const conn = connections[index];
                            b.text(`${index + 1}. `);
                            if (conn.status === 'locked') {
                                b.color('gray', b2 => b2.text(`🔒 ${conn.name} (잠김)`)).text('\n');
                            } else {
                                b.button(`/이동 ${conn.name}`, b2 => b2.text(conn.name), true).text('\n');
                            }
                        }
                        return b;
                    })
                    .build();

                sendBotMessageToUser(userId, msg);
                return;
            }

            if (!player.canPerformAction(ActionType.LOCATION_TRAVEL)) {
                sendNotificationToUser(userId, {
                    key: 'action-disabled:location-travel',
                    message: '현재 다른 장소로 이동할 수 없는 상태입니다.',
                });
                return;
            }

            const targetName = args.join(' ');
            const target = currentLocation.findAvailableConnection(player, targetName);

            if (!target) {
                sendBotMessageToUser(userId, `이동할 수 없는 장소입니다: ${targetName}`);
                return;
            }

            if (target.status === 'locked') {
                const reason = target.lockReason ? ` (${target.lockReason})` : '';
                sendBotMessageToUser(userId, `잠긴 길이라 이동할 수 없습니다: ${target.name}${reason}`);
                return;
            }

            const result = startLocationTravel(player, target.locationId);
            if (!result.ok && result.reason) sendBotMessageToUser(userId, result.reason);
        },
    });

    registerCommand({
        name: '자동이동',
        aliases: ['nav', 'ago', 'av', 'amv'],
        description: '방문한 장소까지 최단 경로로 자동이동합니다.',
        showCommandUse: 'private',
        args: [
            {
                name: '장소명검색어',
                description: '이미 방문한 목적지의 이름 또는 검색어',
                required: true,
                isText: true,
                completions(userId) {
                    const player = getPlayerByUserId(userId);
                    if (!player) return [];
                    return getVisitedLocationMatches(player).map((location): CompletionItem => ({
                        value: location.name,
                        description: location.locationId,
                    }));
                },
            },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;

            const input = args[0]?.trim() ?? '';
            const matches = getVisitedLocationMatches(player, input);
            if (matches.length === 0) {
                sendBotMessageToUser(userId, `방문한 장소에서 '${input}'에 맞는 목적지를 찾지 못했습니다.`);
                return;
            }
            if (matches.length > 1) {
                const message = chat()
                    .text(`검색 결과가 ${matches.length}개입니다. 목적지를 선택해주세요.\n`);
                for (const match of matches.slice(0, 20)) {
                    message
                        .button(`/자동이동 ${match.locationId}`, b => b.text(match.name), true)
                        .color('gray', b => b.text(`  ${match.locationId}`))
                        .text('\n');
                }
                if (matches.length > 20) message.text(`외 ${matches.length - 20}개`);
                sendBotMessageToUser(userId, message.build());
                return;
            }

            const result = startAutoNavigation(player, matches[0].locationId);
            if (!result.ok && result.reason) sendBotMessageToUser(userId, result.reason);
        },
    });

    registerCommand({
        name: '이동취소',
        aliases: ['vc', 'mvc', 'goc'],
        description: '진행 중인 이동 또는 자동이동을 취소합니다.',
        showCommandUse: 'private',
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            if (!cancelNavigation(player)) {
                sendBotMessageToUser(userId, '현재 진행 중인 이동이 없습니다.');
            }
        },
    });

    registerCommand({
        name: '줍기',
        aliases: ['pickup', 'p'],
        description: '현재 위치의 바닥 아이템을 줍습니다.',
        showCommandUse: 'show',
        args: [
            { name: '번호/전체', description: '주울 바닥 아이템 번호 또는 전체', required: true,
                completions(userId) {
                    const player = getPlayerByUserId(userId);
                    if (!player) return [];
                    const location = getLocation(player.locationId);
                    if (!location) return [];
                    const items = location.getDroppedItemDisplays();
                    return [
                        ...items.map((item, index): CompletionItem => ({
                            value: String(index + 1),
                            description: `${item.name} x${item.count}`,
                        })),
                        ...(items.length > 0 ? [{ value: '전체', description: '바닥 아이템 모두 줍기' }] : []),
                    ];
                },
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

            const droppedItems = location.getDroppedItems();
            if (droppedItems.length === 0) {
                sendBotMessageToUser(userId, '현재 위치에 주울 아이템이 없습니다.');
                return;
            }

            if (args[0] === '전체') {
                if (!player.inventory.canAddSnapshots(droppedItems)) {
                    sendBotMessageToUser(userId, '인벤토리 중량이 부족하여 바닥 아이템을 모두 주울 수 없습니다.');
                    return;
                }

                const pickedItems = location.pickupAllItems();
                for (const item of pickedItems) player.inventory.addItemSnapshot(item);
                const totalCount = pickedItems.reduce((sum, item) => sum + item.count, 0);
                sendBotMessageToUser(userId, `바닥 아이템 ${totalCount}개를 모두 주웠습니다.`);
                return;
            }

            const itemNumber = Number(args[0]);
            const index = itemNumber - 1;
            if (!Number.isInteger(itemNumber) || index < 0 || index >= droppedItems.length) {
                sendBotMessageToUser(userId, `유효한 번호를 입력해주세요. (1~${droppedItems.length} 또는 전체)`);
                return;
            }

            const selected = droppedItems[index];
            if (!player.inventory.canAddSnapshot(selected)) {
                sendBotMessageToUser(userId, '인벤토리 중량이 부족하여 아이템을 주울 수 없습니다.');
                return;
            }

            const picked = location.pickupItem(index);
            if (!picked) {
                sendBotMessageToUser(userId, '아이템을 줍는 중 오류가 발생했습니다.');
                return;
            }
            if (!player.inventory.addItemSnapshot(picked)) {
                location.addDroppedItem(picked);
                sendBotMessageToUser(userId, '아이템을 줍는 중 오류가 발생했습니다.');
                return;
            }

            const itemName = getItemSnapshotDisplay(picked).name;
            sendBotMessageToUser(userId, `${itemName} x${picked.count}을(를) 주웠습니다.`);
        },
    });

    registerCommand({
        name: '상호작용',
        aliases: ['interact', 'it'],
        description: '현재 위치의 오브젝트와 상호작용합니다.',
        showCommandUse: 'hide',
        args: [
            { name: '번호', description: '상호작용할 오브젝트 번호', required: true,
                completions(userId) {
                    const player = getPlayerByUserId(userId);
                    const location = player ? getLocation(player.locationId) : undefined;
                    if (!location) return [];
                    return location.getObjects().map((object, index): CompletionItem => ({
                        value: String(index + 1),
                        description: `${object.name}${object.isInteractable ? ' (상호작용 가능)' : ''}`,
                    }));
                },
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
            if (!location) return;
            const number = Number(args[0]);
            const object = Number.isInteger(number) ? location.getObject(number - 1) : undefined;
            if (!object) {
                sendBotMessageToUser(userId, '유효한 오브젝트 번호를 입력해주세요.');
                return;
            }
            if (!object.interact(player)) {
                sendNotificationToUser(userId, {
                    key: 'object-interaction',
                    message: '상호작용이 불가능한 오브젝트입니다.',
                });
            }
        },
    });

    registerCommand({
        name: '위치',
        aliases: ['where', 'loc', 'l', 'm'],
        description: '현재 위치 정보를 확인합니다.',
        showCommandUse: 'private',
        information: true,
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;

            const location = getLocation(player.locationId);
            if (!location) {
                sendBotMessageToUser(userId, '현재 위치를 찾을 수 없습니다.');
                return;
            }

            const b = chat()
                .text('[ 현재 위치 ]\n')
                .color('yellow', b2 => b2.text('장소')).text(` ${location.data.name}\n`)
                .color('yellow', b2 => b2.text('좌표')).text(` (${location.data.x}, ${location.data.y}, ${location.data.z})\n`)
                .color('yellow', b2 => b2.text('구역')).text(` ${location.riskPolicy.label} · PVP ${location.riskPolicy.pvpAllowed ? '허용' : '금지'}\n`)
                .text('\n')
                .color('gray', b2 => b2.text('[ 오브젝트 ]\n'));

            const objects = location.getObjects();
            if (objects.length === 0) {
                b.color('gray', b2 => b2.text('없음\n'));
            } else {
                for (let index = 0; index < objects.length; index++) {
                    const object = objects[index];
                    b.text(`${index + 1}. `)
                     .text(`Lv.${object.level}`)
                     .text(` ${object.name} `);
                    if (object.isDefeated) {
                        b.color('red', b2 => b2.text(`(${object.defeatLabel})`)).text('\n');
                        continue;
                    }
                    const ratio = object.maxLife > 0
                        ? Math.max(0, Math.min(1, object.life / object.maxLife))
                        : 0;
                    const pct = Math.floor(ratio * 100);
                    b.health({ life: object.life, maxLife: object.maxLife, shields: object.getShieldBarSegments(), length: 80, color: '$enemy', thickness: 6 })
                     .text(` ${pct}%`);
                    if (object.isInteractable) {
                        b.text(' ').button(`/상호작용 ${index + 1}`, b2 => b2.text('[상호작용]'), true);
                    }
                    b.text('\n');
                }
            }

            b.text('\n').color('gray', b2 => b2.text('[ NPC ]\n'));

            const npcs = location.getNpcs();
            if (npcs.length === 0) {
                b.color('gray', b2 => b2.text('없음\n'));
            } else {
                for (let index = 0; index < npcs.length; index++) {
                    const npc = npcs[index];
                    const questMarker = player.quests.getNpcMarker(npc.id);
                    b.text(`${index + 1}. `);
                    if (questMarker) {
                        b.tooltip(questMarker.label, marker => marker
                            .color(questMarker.color, text => text.weight('bold', value => value.text(`${questMarker.symbol} `))));
                    }
                    b
                     .color('gold', b2 => b2.text(npc.name));
                    if (npc.description) {
                        b.color('gray', b2 => b2.text(` - ${npc.description}`));
                    }
                    b.text(' ')
                     .button(`/대화 ${index + 1}`, b2 => b2.text('[대화]'), true)
                     .text('\n');
                }
            }

            b.text('\n').color('gray', b2 => b2.text('[ 플레이어 ]\n'));

            const playersHere = getOnlinePlayers().filter(p => p.locationId === player.locationId);
            if (playersHere.length === 0) {
                b.color('gray', b2 => b2.text('없음\n'));
            } else {
                for (const p of playersHere) {
                    const nickname = getSessionByUserId(p.userId)?.nickname ?? '(알 수 없음)';
                    const ratio = p.maxLife > 0 ? p.life / p.maxLife : 0;
                    const pct = Math.floor(ratio * 100);
                    b.text(`#${p.userId} `)
                     .text(`Lv.${p.level}`)
                     .text(` ${nickname} `)
                     .health({ life: p.life, maxLife: p.maxLife, shields: p.getShieldBarSegments(), length: 80, color: '$life', thickness: 6 })
                     .text(` ${pct}%`);
                    if (p.userId !== player.userId && location.riskPolicy.pvpAllowed && !p.isDefeated) {
                        b.text(' ').button(`/대상지정p #${p.userId}`, b2 => b2.text('[PVP 대상]'), true);
                    }
                    b.text('\n');
                }
            }

            b.text('\n').color('gray', b2 => b2.text('[ 바닥 아이템 ]\n'));

            const droppedItems = location.getDroppedItemDisplays();
            if (droppedItems.length === 0) {
                b.color('gray', b2 => b2.text('없음\n'));
            } else {
                for (let index = 0; index < droppedItems.length; index++) {
                    const item = droppedItems[index];
                    b.color('gray', b2 => b2.text(`[${index + 1}] `))
                     .text(`${item.name} x${item.count} `)
                     .button(`/줍기 ${index + 1}`, b2 => b2.text('[줍기]'), true)
                     .text('\n');
                }
                b.button('/줍기 전체', b2 => b2.text('[전체 줍기]'), true).text('\n');
            }

            b.text('\n').color('gray', b2 => b2.text('[ 이동 가능 장소 ]\n'));

            const connections = location.getAvailableConnections(player);
            if (connections.length === 0) {
                b.color('gray', b2 => b2.text('없음\n'));
            } else {
                for (let index = 0; index < connections.length; index++) {
                    const conn = connections[index];
                    if (conn.status === 'locked') {
                        b.text(`${index + 1}. `).color('gray', b2 => b2.text(`🔒 ${conn.name} (잠김)`)).text('\n');
                    } else {
                        b.text(`${index + 1}. `).text(`${conn.name} `)
                         .button(`/이동 ${conn.name}`, b2 => b2.text('[이동]'), true)
                         .text('\n');
                    }
                }
            }

            sendBotMessageToUser(userId, b.build());
        },
    });

}
