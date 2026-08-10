import { registerCommand } from '../../modules/communication/bot.js';
import { sendBotMessageToUser } from '../../modules/communication/message.js';
import { getPlayerByUserId } from '../../modules/player/player.js';
import {
    getTravelHubSnapshots,
    setCurrentTravelHubAsResidence,
    travelToHub,
    unlockCurrentTravelHub,
} from '../../models/world/TravelHub.js';
import { chat } from '../../utils/chatBuilder.js';
import type { CompletionItem } from '../../../../shared/types.js';

function sendTravelHubList(userId: number): void {
    const player = getPlayerByUserId(userId);
    if (!player) return;
    const snapshots = getTravelHubSnapshots(player);
    const current = snapshots.find(snapshot => snapshot.current);
    const message = chat()
        .color('aqua', value => value.weight('bold', nested => nested.text('[ 공간 중계소 ]')))
        .text('\n지역 퀘스트와 해금 비용을 충족한 거점끼리 이동합니다. 목적지마다 사용료가 부과됩니다.\n');

    if (!current) {
        message.color('red', value => value.text('현재 장소에는 공간 중계핵이 없습니다.\n'));
    } else if (!current.unlocked) {
        message
            .color('yellow', value => value.text(`현재 중계소: ${current.name} (미해금)\n`))
            .text(`조건: ${current.prerequisiteLabel ?? '없음'} · 해금 ${current.unlockFee.toLocaleString()}G `)
            .button('/중계소개방', button => button.text('[해금]'), true)
            .text('\n');
    } else {
        message.color('yellow', value => value.text(`현재 중계소: ${current.name}\n`));
    }

    message.text('\n');
    for (const [index, snapshot] of snapshots.entries()) {
        message.text(`${index + 1}. `);
        if (!snapshot.unlocked) {
            message
                .color('gray', value => value.text(`🔒 ${snapshot.name}`))
                .text(` · ${snapshot.prerequisiteLabel ?? '지역 조건'} · 해금 ${snapshot.unlockFee.toLocaleString()}G`);
        } else if (snapshot.current) {
            message
                .color('aqua', value => value.text(snapshot.name))
                .color('gray', value => value.text(snapshot.residence ? ' · 현재 위치 · 거주점' : ' · 현재 위치'));
        } else if (current?.unlocked) {
            message
                .button(`/중계소 ${snapshot.locationId}`, button => button.text(snapshot.name), true)
                .color('gold', value => value.text(` · ${snapshot.useFee.toLocaleString()}G`))
                .color('gray', value => value.text(snapshot.residence ? ' · 거주점' : ''));
        } else {
            message
                .text(snapshot.name)
                .color('gold', value => value.text(` · ${snapshot.useFee.toLocaleString()}G`))
                .color('gray', value => value.text(snapshot.residence ? ' · 거주점' : ''));
        }
        message.text('\n');
    }
    sendBotMessageToUser(userId, message.build());
}

export function initTravelHubCommands(): void {
    registerCommand({
        name: '중계소',
        aliases: ['텔레포트', 'relay', 'travelhub'],
        description: '해금한 성장 거점 중계소를 확인하거나 유료 순간이동합니다.',
        showCommandUse: 'private',
        args: [{
            name: '목적지',
            description: '이동할 해금 중계소',
            isText: true,
            completions(userId) {
                const player = getPlayerByUserId(userId);
                if (!player) return [];
                return getTravelHubSnapshots(player)
                    .filter(snapshot => snapshot.unlocked && !snapshot.current)
                    .map((snapshot): CompletionItem => ({
                        value: snapshot.name,
                        description: `사용료 ${snapshot.useFee.toLocaleString()}G`,
                    }));
            },
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const input = args.join(' ').trim();
            if (!input) {
                sendTravelHubList(userId);
                return;
            }
            const result = travelToHub(player, input);
            if (!result.success || !result.snapshot) {
                sendBotMessageToUser(userId, result.reason ?? '중계소를 사용할 수 없습니다.');
                return;
            }
            const destination = result.snapshot;
            sendBotMessageToUser(userId, chat()
                .color('aqua', value => value.text(`${destination.name}(으)로 순간이동했습니다.`))
                .text(`\n사용료 ${result.goldSpent?.toLocaleString() ?? 0}G · 남은 골드 ${player.gold.toLocaleString()}G`)
                .build());
        },
    });

    registerCommand({
        name: '중계소개방',
        aliases: ['relayunlock'],
        description: '현재 성장 거점의 공간 중계소를 영구 해금합니다.',
        showCommandUse: 'hide',
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const result = unlockCurrentTravelHub(player);
            if (!result.success || !result.snapshot) {
                sendBotMessageToUser(userId, result.reason ?? '중계소를 해금할 수 없습니다.');
                return;
            }
            sendBotMessageToUser(userId, chat()
                .color('gold', value => value.weight('bold', nested => nested.text('[ 중계소 해금 ]')))
                .text(`\n${result.snapshot.name}을(를) 영구 해금했습니다.`)
                .text(`\n해금 비용 ${result.goldSpent?.toLocaleString() ?? 0}G · 남은 골드 ${player.gold.toLocaleString()}G`)
                .text('\n이제 `/중계소`에서 이 거점을 오갈 수 있습니다.')
                .build());
        },
    });

    registerCommand({
        name: '거주점',
        aliases: ['residence', 'homepoint'],
        description: '사망 후 부활할 성장 거점을 확인합니다.',
        showCommandUse: 'private',
        information: true,
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const snapshots = getTravelHubSnapshots(player);
            const residence = snapshots.find(snapshot => snapshot.residence)
                ?? snapshots.find(snapshot => snapshot.locationId === 'town_square');
            const current = snapshots.find(snapshot => snapshot.current);
            const message = chat()
                .color('yellow', value => value.weight('bold', nested => nested.text('[ 거주점 ]')))
                .text(`\n현재 부활 거점: ${residence?.name ?? '루미나르 개척촌 광장'}\n`);
            if (current?.unlocked && current.canSetResidence) {
                if (current.residence) message.color('gray', value => value.text('현재 장소가 이미 거주점입니다.'));
                else message
                    .text(`${current.name}을(를) 새 거주점으로 지정할 수 있습니다. `)
                    .button('/거주점설정', button => button.text('[지정]'), true);
            } else {
                message.color('gray', value => value.text('해금한 공간 중계소에서 거주점을 지정할 수 있습니다.'));
            }
            sendBotMessageToUser(userId, message.build());
        },
    });

    registerCommand({
        name: '거주점설정',
        aliases: ['residenceset'],
        description: '현재 해금된 중계소를 사망 후 부활 거점으로 지정합니다.',
        showCommandUse: 'hide',
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const result = setCurrentTravelHubAsResidence(player);
            if (!result.success || !result.snapshot) {
                sendBotMessageToUser(userId, result.reason ?? '거주점을 지정할 수 없습니다.');
                return;
            }
            sendBotMessageToUser(userId, `${result.snapshot.name}을(를) 새 거주점으로 지정했습니다. 사망 후 이곳에서 부활합니다.`);
        },
    });
}
