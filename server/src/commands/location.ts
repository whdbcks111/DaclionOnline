import { registerCommand } from "../modules/bot.js";
import { sendBotMessageToUser, sendNotificationToUser } from "../modules/message.js";
import { getPlayerByUserId } from "../modules/player.js";
import { chat } from "../utils/chatBuilder.js";
import { getLocation, distanceBetween } from "../models/Location.js";
import { startCoroutine, Wait } from "../modules/coroutine.js";
import type { CoroutineGenerator } from "../modules/coroutine.js";
import type Player from "../models/Player.js";

function* travelCoroutine(player: Player, targetLocationId: string): CoroutineGenerator {
    const from = getLocation(player.locationId);
    const to = getLocation(targetLocationId);
    if (!from || !to) return;

    const distance = distanceBetween(from.data, to.data);
    const speed = player.attribute.get('speed');
    const totalTime = Math.max(1, distance / Math.max(0.01, speed) / 5);
    let elapsed = 0;

    player.moving = true;

    sendNotificationToUser(player.userId, {
        key: 'travel',
        message: `${to.data.name}(으)로 이동 시작... (${Math.ceil(totalTime)}초)`,
    });

    while (elapsed < totalTime) {
        const waitTime = Math.min(1, totalTime - elapsed);
        yield Wait(waitTime);
        elapsed += waitTime;

        const progress = Math.min(100, Math.floor((elapsed / totalTime) * 100));
        sendNotificationToUser(player.userId, {
            key: 'travel',
            message: `${to.data.name}(으)로 이동 중... ${progress}%`,
        });
    }

    player.locationId = targetLocationId;
    player.moving = false;

    sendNotificationToUser(player.userId, {
        key: 'travel',
        message: `${to.data.name}에 도착했습니다.`,
    });
}

export function initLocationCommands(): void {
    registerCommand({
        name: '이동',
        aliases: ['move', 'go'],
        description: '다른 장소로 이동합니다.',
        showCommandUse: 'show',
        args: [
            { name: '장소이름', description: '이동할 장소 이름', required: false },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;

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
                                b.button(`/이동 ${conn.name}`, b2 => b2.text(conn.name)).text('\n');
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
        showCommandUse: 'hide',
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;

            const location = getLocation(player.locationId);
            if (!location) {
                sendBotMessageToUser(userId, '현재 위치를 찾을 수 없습니다.');
                return;
            }

            const monsterList = location.monsters.length > 0
                ? location.monsters.map(m => m.name).join(', ')
                : '없음';

            sendBotMessageToUser(userId, chat()
                .text(`[ 현재 위치 ]\n`)
                .color('yellow', b => b.text('장소')).text(` ${location.data.name}\n`)
                .color('yellow', b => b.text('좌표')).text(` (${location.data.x}, ${location.data.y}, ${location.data.z})\n`)
                .color('yellow', b => b.text('몬스터')).text(` ${monsterList}\n`)
                .color('yellow', b => b.text('바닥 아이템')).text(` ${location.droppedItems.length}개\n`)
                .build()
            );
        },
    });

}
