import type { CompletionItem } from '../../../shared/types.js';
import { registerCommand } from '../modules/bot.js';
import { sendBotMessageToUser, sendNotificationToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';
import {
    findOnlinePlayerByIdentity,
    getOnlinePlayer,
    getOnlinePlayerIdentitySnapshots,
} from '../modules/playerRegistry.js';
import { PARTY_INVITATION_TTL_MS, partyManager } from '../modules/party.js';
import { chat } from '../utils/chatBuilder.js';

function onlineIdentityCompletions(userId: number): CompletionItem[] {
    return getOnlinePlayerIdentitySnapshots(userId).map(player => ({
        value: player.nickname,
        description: `ID ${player.userId} · Lv.${player.level}`,
    }));
}

function partyMemberCompletions(userId: number): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    if (!player) return [];
    const party = partyManager.getHudData(player);
    return party?.members
        .filter(member => member.userId !== userId)
        .map(member => ({ value: member.nickname, description: `ID ${member.userId} · Lv.${member.level}` })) ?? [];
}

function sendToUsers(userIds: readonly number[], content: string): void {
    for (const userId of new Set(userIds)) {
        if (getOnlinePlayer(userId)) sendBotMessageToUser(userId, content);
    }
}

function notifyModeResult(userId: number, message: string): void {
    sendNotificationToUser(userId, { key: 'party-action', message, length: 2500 });
}

export function initPartyCommands(): void {
    registerCommand({
        name: '파티초대', aliases: ['partyinvite', 'pi'], description: '온라인 플레이어를 파티에 초대합니다.',
        showCommandUse: 'hide',
        args: [{
            name: '고유번호 또는 닉네임', description: '초대할 온라인 플레이어', required: true, isText: true,
            completions: onlineIdentityCompletions,
        }],
        handler(userId, args) {
            const inviter = getPlayerByUserId(userId);
            const target = findOnlinePlayerByIdentity(args[0] ?? '');
            if (!inviter) return;
            if (!target) { sendBotMessageToUser(userId, '해당 고유번호 또는 닉네임의 온라인 플레이어를 찾을 수 없습니다.'); return; }
            const result = partyManager.invite(inviter, target);
            if (!result.success) { sendBotMessageToUser(userId, result.reason ?? '파티 초대에 실패했습니다.'); return; }

            sendBotMessageToUser(userId, `${target.name}님에게 파티 초대를 보냈습니다.`);
            sendBotMessageToUser(target.userId, chat()
                .color('gold', b => b.weight('bold', x => x.text('[ 파티 초대 ] ')))
                .text(`${inviter.name}님이 파티에 초대했습니다. `)
                .button('/파티수락', b => b.color('lime', x => x.text('[수락]')))
                .text(' ')
                .button('/파티거절', b => b.color('red', x => x.text('[거절]')))
                .text(`\n${Math.floor(PARTY_INVITATION_TTL_MS / 1000)}초 안에 응답해주세요.`)
                .build());
            notifyModeResult(target.userId, `${inviter.name}님의 파티 초대가 도착했습니다.`);
        },
    });

    registerCommand({
        name: '파티수락', aliases: ['partyaccept', 'pa'], description: '도착한 파티 초대를 수락합니다.',
        showCommandUse: 'hide',
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const result = partyManager.accept(player);
            if (!result.success) { sendBotMessageToUser(userId, result.reason ?? '파티 초대를 수락할 수 없습니다.'); return; }
            sendToUsers(result.affectedUserIds ?? [], `${player.name}님이 파티에 참가했습니다.`);
        },
    });

    registerCommand({
        name: '파티거절', aliases: ['partydecline', 'pd'], description: '도착한 파티 초대를 거절합니다.',
        showCommandUse: 'hide',
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const invitation = partyManager.getInvitation(userId);
            const result = partyManager.decline(userId);
            if (!result.success) { sendBotMessageToUser(userId, result.reason ?? '파티 초대를 거절할 수 없습니다.'); return; }
            sendBotMessageToUser(userId, '파티 초대를 거절했습니다.');
            if (invitation) sendBotMessageToUser(invitation.inviterUserId, `${player.name}님이 파티 초대를 거절했습니다.`);
        },
    });

    registerCommand({
        name: '파티나가기', aliases: ['partyleave', 'pl'], description: '현재 파티에서 나갑니다.',
        showCommandUse: 'hide',
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const result = partyManager.leave(player);
            if (!result.success) { sendBotMessageToUser(userId, result.reason ?? '파티에서 나갈 수 없습니다.'); return; }
            sendToUsers(result.affectedUserIds ?? [], `${player.name}님이 파티에서 나갔습니다.`);
        },
    });

    registerCommand({
        name: '파티해산', aliases: ['partydisband'], description: '파티장이 현재 파티를 해산합니다.',
        showCommandUse: 'hide',
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const result = partyManager.disband(player);
            if (!result.success) { sendBotMessageToUser(userId, result.reason ?? '파티를 해산할 수 없습니다.'); return; }
            sendToUsers(result.affectedUserIds ?? [], `${player.name}님이 파티를 해산했습니다.`);
        },
    });

    registerCommand({
        name: '파티강퇴', aliases: ['partykick', 'pk'], description: '파티장이 파티원을 강퇴합니다.',
        showCommandUse: 'hide',
        args: [{
            name: '고유번호 또는 닉네임', description: '강퇴할 같은 파티원', required: true, isText: true,
            completions: partyMemberCompletions,
        }],
        handler(userId, args) {
            const leader = getPlayerByUserId(userId);
            const target = findOnlinePlayerByIdentity(args[0] ?? '');
            if (!leader) return;
            if (!target) { sendBotMessageToUser(userId, '해당 고유번호 또는 닉네임의 온라인 플레이어를 찾을 수 없습니다.'); return; }
            const result = partyManager.kick(leader, target);
            if (!result.success) { sendBotMessageToUser(userId, result.reason ?? '파티원을 강퇴할 수 없습니다.'); return; }
            sendToUsers(result.affectedUserIds ?? [], `${target.name}님이 파티에서 강퇴되었습니다.`);
        },
    });

    registerCommand({
        name: '파티정보', aliases: ['partyinfo', 'pinfo'], description: '현재 파티 구성과 파티원 상태를 확인합니다.',
        showCommandUse: 'private',
        information: true,
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const party = partyManager.getHudData(player);
            if (!party) { sendBotMessageToUser(userId, '파티에 소속되어 있지 않습니다.'); return; }
            const builder = chat().color('gold', b => b.weight('bold', x => x.text(`[ 파티 정보 ]  ${party.members.length}명`)))
                .text('\n').hide('파티원 보기', b => {
                    for (const member of party.members) {
                        const lifeRatio = member.maxLife > 0 ? member.life / member.maxLife : 0;
                        const mentalityRatio = member.maxMentality > 0 ? member.mentality / member.maxMentality : 0;
                        b.text(`${member.isLeader ? '♛ ' : ''}Lv.${member.level} ${member.nickname}  ID ${member.userId}`)
                            .color(member.sameLocation ? 'lime' : 'gray', x => x.text(member.sameLocation ? ' · 같은 장소' : ' · 다른 장소'))
                            .text('\n  HP ').progress({ value: lifeRatio, length: '8em', color: '$life', thickness: 6 })
                            .text(` ${Math.ceil(member.life)}/${Math.ceil(member.maxLife)}`)
                            .text('\n  MP ').progress({ value: mentalityRatio, length: '8em', color: '$magic', thickness: 6 })
                            .text(` ${Math.ceil(member.mentality)}/${Math.ceil(member.maxMentality)}\n`);
                    }
                    return b;
                });
            sendBotMessageToUser(userId, builder.build());
        },
    });
}
