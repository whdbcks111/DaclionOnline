import { registerCommand } from '../modules/bot.js';
import { getUserChannel } from '../modules/channel.js';
import {
    sendBotMessageFiltered,
    sendBotMessageToChannel,
    sendBotMessageToUser,
    sendPrivateBotMessageToUser,
} from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';
import { chat } from '../utils/chatBuilder.js';

export function initProgressCommands(): void {
    registerCommand({
        name: '통계',
        aliases: ['statistics', 'stats'],
        description: '누적 게임 통계를 확인합니다.',
        information: true,
        args: [{
            name: '공개/비공개',
            description: '공개 여부를 결정합니다.',
            completions: ['공개', '비공개'],
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const snapshots = player.progress.getSnapshots(true);
            const builder = chat().color('gray', b => b.text('[ 통계 ]'));
            if (snapshots.length === 0) {
                builder.text('\n표시할 통계가 없습니다.');
            } else {
                for (const snapshot of snapshots) {
                    builder.text('\n')
                        .tooltip(snapshot.description, b => b.weight('bold', b2 => b2.text(snapshot.label)))
                        .text(`  ${snapshot.formattedValue}`);
                }
            }
            const nodes = builder.build();
            const channel = getUserChannel(userId);
            if (args[0] === '공개') {
                sendBotMessageToChannel(channel, nodes);
            } else if (args[0] === '비공개') {
                sendPrivateBotMessageToUser(userId, nodes);
                sendBotMessageFiltered(
                    id => id !== userId,
                    channel,
                    chat().text('[ 통계 ]  비공개 정보입니다.').build(),
                    false,
                );
            } else {
                sendBotMessageToUser(userId, nodes);
            }
        },
    });
}
