import type { ChatNode } from '../../../shared/types.js';
import { registerCommand } from '../modules/bot.js';
import {
    claimAllMailboxAttachments,
    claimMailboxMessage,
    cleanupCompletedMailboxMessages,
    listMailboxMessages,
    readMailboxMessage,
    type MailboxClaimResult,
    type MailboxMessageDetail,
    type MailboxMessageSummary,
} from '../modules/mailbox.js';
import { sendPrivateBotMessageToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';
import { chat } from '../utils/chatBuilder.js';
import logger from '../utils/logger.js';

const mailDateFormatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
});

function parseMailId(value: string | undefined): number | undefined {
    if (!value || !/^\d+$/.test(value)) return undefined;
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function attachmentStatus(mail: MailboxMessageSummary): string {
    if (mail.attachmentCount <= 0) return '첨부 없음';
    if (mail.claimedAt) return '수령 완료';
    if (mail.expired) return '만료';
    return `첨부 ${mail.attachmentCount}개`;
}

export function buildMailboxListMessage(messages: readonly MailboxMessageSummary[]): ChatNode[] {
    const builder = chat().weight('bold', title => title.text('[ 우편함 ]'));
    if (messages.length === 0) {
        return builder.text('\n도착한 우편이 없습니다.').build();
    }
    builder.text('\n우편 번호로 /우편읽기, /우편수령을 사용할 수 있습니다.');
    for (const mail of messages) {
        builder.text('\n\n')
            .color(mail.readAt ? '$text-secondary' : 'gold', marker => marker.text(mail.readAt ? '○' : '●'))
            .weight('bold', title => title.text(` #${mail.id} ${mail.subject}`))
            .text('  ')
            .button(`/우편읽기 ${mail.id}`, button => button.text('[읽기]'))
            .text(`\n${mail.senderLabel} · ${mailDateFormatter.format(mail.createdAt)} · ${attachmentStatus(mail)}`);
    }
    return builder
        .text('\n\n')
        .button('/우편수령 전체', button => button.text('[전체 첨부 수령]'))
        .text('  ')
        .button('/우편정리', button => button.text('[완료 우편 정리]'))
        .build();
}

export function buildMailboxDetailMessage(mail: MailboxMessageDetail): ChatNode[] {
    const builder = chat()
        .weight('bold', title => title.text(`[ 우편 #${mail.id} ] ${mail.subject}`))
        .text(`\n보낸 이: ${mail.senderLabel}`)
        .text(`\n도착: ${mailDateFormatter.format(mail.createdAt)}`)
        .divider()
        .text(mail.body);
    if (mail.attachmentCorrupted) {
        builder.text('\n\n').color('red', warning => warning.text('첨부 정보가 손상되었습니다. 관리자에게 문의해 주세요.'));
    } else if (mail.attachments.length > 0) {
        builder.text('\n\n').weight('bold', title => title.text(`[ 첨부 · ${attachmentStatus(mail)} ]`));
        for (const item of mail.attachments) builder.text(`\n${item.name} x${item.count}`);
    }
    if (mail.expiresAt) builder.text(`\n\n만료: ${mailDateFormatter.format(mail.expiresAt)}`);
    if (mail.attachments.length > 0 && !mail.claimedAt && !mail.expired && !mail.attachmentCorrupted) {
        builder.text('\n\n').button(`/우편수령 ${mail.id}`, button => button.text('[첨부 수령]'));
    }
    return builder.build();
}

function formatClaimSuccess(result: Extract<MailboxClaimResult, { success: true }>): ChatNode[] {
    const builder = chat()
        .weight('bold', title => title.text(`[ 우편 #${result.mailId} 수령 완료 ]`));
    for (const item of result.items) builder.text(`\n${item.name} x${item.count}`);
    if (!result.memorySynchronized) {
        builder.text('\n\n').color('orange', warning =>
            warning.text('첨부는 서버에 안전하게 저장됐습니다. 현재 인벤토리에 보이지 않으면 다시 접속해 주세요.'));
    }
    return builder.build();
}

async function handleClaim(userId: number, rawId: string | undefined): Promise<void> {
    const player = getPlayerByUserId(userId);
    const mailId = parseMailId(rawId);
    if (!player || !mailId) {
        sendPrivateBotMessageToUser(userId, '사용법: /우편수령 <우편번호|전체>');
        return;
    }
    const result = await claimMailboxMessage(player, mailId);
    sendPrivateBotMessageToUser(userId, result.success ? formatClaimSuccess(result) : result.reason);
}

export function initMailboxCommands(): void {
    registerCommand({
        name: '우편함',
        aliases: ['mailbox', 'mail'],
        description: '시스템 우편 목록을 확인합니다.',
        showCommandUse: 'private',
        async handler(userId) {
            try {
                sendPrivateBotMessageToUser(userId, buildMailboxListMessage(await listMailboxMessages(userId)));
            } catch (error) {
                logger.error(`우편함 목록 조회 실패: user=${userId}`, error);
                sendPrivateBotMessageToUser(userId, '우편함을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
            }
        },
    });

    registerCommand({
        name: '우편읽기',
        aliases: ['mailread'],
        description: '우편 번호에 해당하는 본문과 첨부를 확인합니다.',
        showCommandUse: 'private',
        args: [{ name: '우편번호', description: '/우편함에 표시된 번호', required: true }],
        async handler(userId, args) {
            const mailId = parseMailId(args[0]);
            if (!mailId) {
                sendPrivateBotMessageToUser(userId, '사용법: /우편읽기 <우편번호>');
                return;
            }
            try {
                const mail = await readMailboxMessage(userId, mailId);
                sendPrivateBotMessageToUser(userId, mail
                    ? buildMailboxDetailMessage(mail)
                    : '해당 우편을 찾을 수 없습니다.');
            } catch (error) {
                logger.error(`우편 읽기 실패: user=${userId}, mail=${mailId}`, error);
                sendPrivateBotMessageToUser(userId, '우편을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
            }
        },
    });

    registerCommand({
        name: '우편수령',
        aliases: ['mailclaim'],
        description: '우편 첨부 아이템 한 통 또는 받을 수 있는 전체를 수령합니다.',
        showCommandUse: 'private',
        args: [{ name: '우편번호', description: '/우편함에 표시된 번호 또는 전체', required: true }],
        async handler(userId, args) {
            try {
                if (args[0] === '전체') {
                    const player = getPlayerByUserId(userId);
                    if (!player) return;
                    const batch = await claimAllMailboxAttachments(player);
                    const results = batch.results;
                    const succeeded = results.filter(result => result.success);
                    const failed = results.filter(result => !result.success);
                    if (results.length === 0) {
                        sendPrivateBotMessageToUser(userId, '수령할 수 있는 우편 첨부가 없습니다.');
                        return;
                    }
                    const itemCount = succeeded.reduce((sum, result) =>
                        sum + (result.success ? result.items.reduce((inner, item) => inner + item.count, 0) : 0), 0);
                    sendPrivateBotMessageToUser(
                        userId,
                        `우편 ${succeeded.length}통의 첨부 ${itemCount}개를 수령했습니다.${failed.length > 0 ? ` (${failed.length}통 보류)` : ''}${batch.hasMore ? '\n처리 한도 밖의 첨부가 남아 있습니다. /우편수령 전체를 다시 실행해 주세요.' : ''}`,
                    );
                    return;
                }
                await handleClaim(userId, args[0]);
            } catch (error) {
                logger.error(`우편 첨부 수령 명령 실패: user=${userId}`, error);
                sendPrivateBotMessageToUser(userId, '우편 수령을 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
            }
        },
    });

    registerCommand({
        name: '우편정리',
        aliases: ['mailcleanup'],
        description: '수령 완료·읽음·만료 상태의 우편을 정리합니다.',
        showCommandUse: 'private',
        async handler(userId) {
            try {
                const removed = await cleanupCompletedMailboxMessages(userId);
                sendPrivateBotMessageToUser(userId, `완료된 우편 ${removed}통을 정리했습니다.`);
            } catch (error) {
                logger.error(`우편 정리 실패: user=${userId}`, error);
                sendPrivateBotMessageToUser(userId, '우편 정리를 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
            }
        },
    });
}
