import { registerCommand } from '../modules/bot.js';
import { sendBotMessageToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';
import { getWorldMapSnapshot } from '../models/WorldMap.js';
import { chat } from '../utils/chatBuilder.js';

export function initMapCommands(): void {
    registerCommand({
        name: '지도',
        aliases: ['map'],
        description: '방문한 장소와 인접한 미방문 장소를 지도로 확인합니다.',
        showCommandUse: 'private',
        information: true,
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;

            const snapshot = getWorldMapSnapshot(player);
            sendBotMessageToUser(userId, chat()
                .text(`[ 지도 ] 방문한 장소 ${snapshot.locations.filter(location => location.visited).length}곳\n`)
                .hide('지도 보기', builder => builder.worldMap(snapshot))
                .build());
        },
    });
}
