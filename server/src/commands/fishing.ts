import { registerCommand } from '../modules/bot.js';
import { startFishing } from '../modules/fishing.js';
import { sendBotMessageToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';

export function initFishingCommands(): void {
    registerCommand({
        name: '낚시',
        aliases: ['fish', 'f'],
        description: '낚시 가능 구역에서 낚싯대와 미끼를 사용합니다. 미끼 미장착 시 인벤토리 묶음을 자동 장착합니다.',
        showCommandUse: 'private',
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const result = startFishing(player);
            sendBotMessageToUser(userId, result.message);
        },
    });
}
