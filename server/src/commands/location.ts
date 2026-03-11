import { registerCommand } from "../modules/bot.js";
import { sendBotMessageToChannel, sendBotMessageToUser, sendNotificationToUser } from "../modules/message.js";
import { getPlayerByUserId, getOnlinePlayers } from "../modules/player.js";
import { getSessionByUserId } from "../modules/login.js";
import { chat } from "../utils/chatBuilder.js";
import { getLocation, distanceBetween } from "../models/Location.js";
import { getItemData } from "../models/Item.js";
import { startCoroutine, Wait } from "../modules/coroutine.js";
import type { CoroutineGenerator } from "../modules/coroutine.js";
import type Player from "../models/Player.js";
import { AttributeType } from "../models/Attribute.js";
import { getUserChannel } from "../modules/channel.js";
import type { CompletionItem } from "../../../shared/types.js";

function* travelCoroutine(player: Player, targetLocationId: string): CoroutineGenerator {
    const from = getLocation(player.locationId);
    const to = getLocation(targetLocationId);
    if (!from || !to) return;

    const distance = distanceBetween(from.data, to.data);
    const speed = player.attribute.get(AttributeType.SPEED);
    const totalTime = Math.max(1, distance / Math.max(0.01, speed) / 5);
    let elapsed = 0;

    player.moving = true;

    sendBotMessageToChannel(getUserChannel(player.userId), `${to.data.name}(으)로 이동 시작... (${Math.ceil(totalTime)}초)`);

    while (elapsed < totalTime) {
        const waitTime = Math.min(0.5, totalTime - elapsed);
        yield Wait(waitTime);
        elapsed += waitTime;

        const progress = Math.min(100, Math.floor((elapsed / totalTime) * 100));
        sendNotificationToUser(player.userId, {
            key: 'travel',
            message: chat()
                .text(`${to.data.name}(으)로 이동 중... \n`)
                .progress({ value: progress / 100, color: 'white', length: 200, thickness: 6 })
                .text(` ${progress.toFixed(1)}%`)
                .build(),
            editExists: true,
            showProgress: false,
        });
    }

    player.locationId = targetLocationId;
    player.moving = false;

    sendBotMessageToChannel(getUserChannel(player.userId), `${to.data.name}에 도착했습니다.`,);
}

export function initLocationCommands(): void {
    registerCommand({
        name: '이동',
        aliases: ['move', 'go'],
        description: '다른 장소로 이동합니다.',
        showCommandUse: 'show',
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
                        for (const conn of connections) {
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

            const targetName = args.join(' ');
            const target = connections.find(c => c.name === targetName);

            if (!target) {
                sendBotMessageToUser(userId, `이동할 수 없는 장소입니다: ${targetName}`);
                return;
            }

            if (target.status === 'locked') {
                sendBotMessageToUser(userId, `${targetName}은(는) 잠겨 있습니다.`);
                return;
            }

            startCoroutine(travelCoroutine(player, target.locationId));
        },
    });

    registerCommand({
        name: '위치',
        aliases: ['where', 'location'],
        description: '현재 위치 정보를 확인합니다.',
        showCommandUse: 'show',
        handler(userId) {
            const player = getPlayerByUserId(userId);
            const channel = getUserChannel(userId);
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
                .text('\n')
                .color('gray', b2 => b2.text('[ 몬스터 ]\n'));

            if (location.monsters.length === 0) {
                b.color('gray', b2 => b2.text('없음\n'));
            } else {
                for (const m of location.monsters) {
                    const ratio = m.maxLife > 0 ? m.life / m.maxLife : 0;
                    const pct = Math.floor(ratio * 100);
                    b.text('- ')
                     .text(`Lv.${m.level}`)
                     .text(` ${m.name} `)
                     .progress({ value: ratio, length: 80, color: '$enemy', thickness: 6 })
                     .text(` ${pct}%\n`);
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
                     .progress({ value: ratio, length: 80, color: '$life', thickness: 6 })
                     .text(` ${pct}%\n`);
                }
            }

            b.text('\n').color('gray', b2 => b2.text('[ 바닥 아이템 ]\n'));

            if (location.droppedItems.length === 0) {
                b.color('gray', b2 => b2.text('없음\n'));
            } else {
                const grouped = new Map<string, number>();
                for (const di of location.droppedItems) {
                    grouped.set(di.itemDataId, (grouped.get(di.itemDataId) ?? 0) + di.count);
                }
                for (const [itemDataId, count] of grouped) {
                    const name = getItemData(itemDataId)?.name ?? itemDataId;
                    b.text(`- ${name} x${count}\n`);
                }
            }

            b.text('\n').color('gray', b2 => b2.text('[ 이동 가능 장소 ]\n'));

            const connections = location.getAvailableConnections(player);
            if (connections.length === 0) {
                b.color('gray', b2 => b2.text('없음\n'));
            } else {
                for (const conn of connections) {
                    if (conn.status === 'locked') {
                        b.text('- ').color('gray', b2 => b2.text(`🔒 ${conn.name} (잠김)`)).text('\n');
                    } else {
                        b.text('- ').text(`${conn.name} `)
                         .button(`/이동 ${conn.name}`, b2 => b2.text('[이동]'), true)
                         .text('\n');
                    }
                }
            }

            sendBotMessageToChannel(channel, b.build());
        },
    });

}
