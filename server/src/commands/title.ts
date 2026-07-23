import { registerCommand } from '../modules/bot.js';
import { getPlayerByUserId } from '../modules/player.js';
import { sendBotMessageToUser, sendNotificationToUser } from '../modules/message.js';
import { chat } from '../utils/chatBuilder.js';
import type { CompletionItem } from '../../../shared/types.js';

function ownedTitleCompletions(userId: number): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    if (!player) return [];
    return player.titles.getOwnedSnapshots().map(title => ({
        value: title.name,
        description: `${title.equipped ? '장착 중 · ' : ''}${title.description}`,
    }));
}

export function initTitleCommands(): void {
    registerCommand({
        name: '칭호목록',
        aliases: ['titlelist', 'tl'],
        description: '획득한 칭호와 고유 패시브 효과를 확인합니다.',
        information: true,
        showCommandUse: 'hide',
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const titles = player.titles.getOwnedSnapshots();
            const builder = chat()
                .color('gray', nested => nested.text(`[ 칭호 목록 ]  ${titles.length}개`))
                .text('\n')
                .weight('bold', nested => nested.text('장착 중'))
                .text(`  ${player.titles.equippedName || '(없음)'}`);

            if (titles.length === 0) {
                builder.text('\n\n특정 행동과 업적을 달성하면 칭호를 획득할 수 있습니다.');
            } else {
                builder.text('\n').hide('보유 칭호 보기', list => {
                    for (const [index, title] of titles.entries()) {
                        list.text(index > 0 ? '\n\n' : '\n')
                            .color('gray', number => number.text(`${index + 1}. `))
                            .weight('bold', name => name.color(title.equipped ? 'gold' : 'white', text => text.text(title.name)));
                        if (title.equipped) {
                            list.text('  ').color(title.passiveActive ? 'lime' : 'gray', status =>
                                status.text(title.passiveActive ? '패시브 활성' : '장착 중'));
                        }
                        list.text(`\n${title.description}`)
                            .text('\n')
                            .color('gray', condition => condition.text(`획득 조건  ${title.acquisitionDescription}`));
                        if (!title.equipped) {
                            list.text('\n')
                                .closeButton(`/칭호장착 ${title.name}`, button => button.color('gold', text => text.text('[장착]')));
                        }
                    }
                    return list;
                });
            }
            sendBotMessageToUser(userId, builder.build());
        },
    });

    registerCommand({
        name: '칭호장착',
        aliases: ['titleequip', 'te', 'tu'],
        description: '보유한 칭호 하나를 장착합니다.',
        showCommandUse: 'hide',
        args: [{
            name: '칭호이름',
            description: '장착할 보유 칭호 이름 또는 목록 번호',
            required: true,
            isText: true,
            completions: ownedTitleCompletions,
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const result = player.titles.equip(args[0] ?? '');
            if (!result.success || !result.title) {
                sendNotificationToUser(userId, {
                    key: 'title:equip-failed',
                    message: result.reason ?? '칭호를 장착할 수 없습니다.',
                });
                return;
            }
            const message = `칭호 [ ${result.title.name} ] 을(를) 장착했습니다.`;
            sendBotMessageToUser(userId, chat()
                .color('gold', builder => builder.weight('bold', nested => nested.text(message)))
                .text(`\n${result.title.description}`)
                .build());
            sendNotificationToUser(userId, { key: 'title:equipped', message });
        },
    });

    registerCommand({
        name: '칭호장착해제',
        aliases: ['titleunequip', 'tue'],
        description: '현재 장착한 칭호를 해제합니다.',
        showCommandUse: 'hide',
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const result = player.titles.unequip();
            if (!result.success || !result.title) {
                sendNotificationToUser(userId, {
                    key: 'title:unequip-failed',
                    message: result.reason ?? '칭호를 해제할 수 없습니다.',
                });
                return;
            }
            const message = `칭호 [ ${result.title.name} ] 을(를) 해제했습니다.`;
            sendBotMessageToUser(userId, message);
            sendNotificationToUser(userId, { key: 'title:unequipped', message });
        },
    });
}
