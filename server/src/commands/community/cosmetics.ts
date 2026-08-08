import {
    CHAT_EMOTES,
    COSMETIC_FRAMES,
    type ChatEmoteDefinition,
    type CosmeticFrameDefinition,
} from '../../../../shared/cosmetics.js';
import type { CompletionItem } from '../../../../shared/types.js';
import { ActionType } from '../../models/core/Action.js';
import {
    buyChatEmote,
    createChatEmoteNode,
    getChatEmoteSnapshots,
    getCosmeticFrameSnapshots,
    selectCosmeticFrame,
    type CosmeticFrameSlot,
} from '../../models/progression/PlayerCosmetics.js';
import { registerCommand } from '../../modules/communication/bot.js';
import {
    sendBotMessageToUser,
    sendNotificationToUser,
    sendPlayerContentToCurrentChannel,
} from '../../modules/communication/message.js';
import { getPlayerByUserId } from '../../modules/player/player.js';
import { chat } from '../../utils/chatBuilder.js';

function normalized(value: string): string {
    return value.trim().toLocaleLowerCase('ko-KR').replace(/\s+/g, '');
}

function findFrame(value: string): CosmeticFrameDefinition | undefined {
    const input = normalized(value);
    return COSMETIC_FRAMES.find(frame => frame.key === input || normalized(frame.name) === input);
}

function findEmote(value: string): ChatEmoteDefinition | undefined {
    const input = normalized(value);
    return CHAT_EMOTES.find(emote => emote.key === input || normalized(emote.name) === input);
}

function frameCompletions(userId: number): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    if (!player) return [];
    return [
        { value: '기본', description: '선택한 슬롯의 프레임 해제' },
        ...getCosmeticFrameSnapshots(player)
            .filter(frame => frame.unlocked)
            .map(frame => ({ value: frame.name, description: frame.description })),
    ];
}

function emoteCompletions(userId: number): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    if (!player) return [];
    return getChatEmoteSnapshots(player).map(emote => ({
        value: emote.name,
        description: `${emote.glyph} · ${emote.unlocked ? '사용 가능' : emote.unlockDescription}`,
    }));
}

function sendFrameList(userId: number): void {
    const player = getPlayerByUserId(userId);
    if (!player) return;
    const frames = getCosmeticFrameSnapshots(player);
    const builder = chat()
        .weight('bold', title => title.text('[ 프로필 프레임 ]'))
        .text('\n프로필 원형과 채팅 카드에 서로 다른 프레임을 장착할 수 있습니다.');
    for (const frame of frames) {
        const selected = [frame.selectedAvatar ? '프로필' : '', frame.selectedChat ? '채팅' : '']
            .filter(Boolean).join('·');
        builder.text('\n\n')
            .color(frame.unlocked ? '$info' : '$text-tertiary', name => name.weight('bold', text => text.text(frame.name)))
            .text(`  ${frame.animated ? '애니메이션 · ' : ''}${selected || (frame.unlocked ? '해금됨' : frame.unlockDescription)}`)
            .text(`\n${frame.description}`);
        if (frame.unlocked) {
            builder.text('\n')
                .button(`/프레임설정 프로필 ${frame.name}`, button => button.text('[프로필 장착]'))
                .text(' ')
                .button(`/프레임설정 채팅 ${frame.name}`, button => button.text('[채팅 장착]'));
        }
    }
    builder.text('\n\n')
        .button('/프레임설정 프로필 기본', button => button.text('[프로필 해제]'))
        .text(' ')
        .button('/프레임설정 채팅 기본', button => button.text('[채팅 해제]'));
    sendBotMessageToUser(userId, builder.build());
}

function parseFrameSlot(value: string): CosmeticFrameSlot | undefined {
    const input = normalized(value);
    if (input === '프로필' || input === 'avatar') return 'avatar';
    if (input === '채팅' || input === 'chat') return 'chat';
    return undefined;
}

function sendEmoteList(userId: number): void {
    const player = getPlayerByUserId(userId);
    if (!player) return;
    const builder = chat()
        .weight('bold', title => title.text('[ 채팅 감정표현 ]'))
        .text('\n해금한 감정표현은 현재 채널에 크게 표시됩니다.');
    for (const emote of getChatEmoteSnapshots(player)) {
        builder.text('\n\n')
            .size('1.35em', glyph => glyph.text(emote.glyph))
            .text(' ')
            .weight('bold', name => name.text(emote.name))
            .color(emote.unlocked ? '$info' : '$text-tertiary', status => (
                status.text(`  ${emote.unlocked ? '사용 가능' : emote.unlockDescription}`)
            ))
            .text(`\n${emote.description}\n`);
        if (emote.unlocked) {
            builder.button(`/감정표현 사용 ${emote.name}`, button => button.text('[사용]'));
        } else if (emote.goldPrice) {
            builder.button(`/감정표현 구매 ${emote.name}`, button => button.text('[구매]'));
        }
    }
    sendBotMessageToUser(userId, builder.build());
}

function useEmote(userId: number, emote: ChatEmoteDefinition): void {
    const player = getPlayerByUserId(userId);
    if (!player) return;
    if (!player.canPerformAction(ActionType.CHAT)) {
        sendNotificationToUser(userId, { key: 'emote:chat-disabled', message: '현재 채팅 감정표현을 사용할 수 없습니다.' });
        return;
    }
    const node = createChatEmoteNode(player, emote.key);
    if (!node) {
        sendNotificationToUser(userId, { key: 'emote:locked', message: `${emote.name} 감정표현이 아직 해금되지 않았습니다.` });
        return;
    }
    if (!sendPlayerContentToCurrentChannel(userId, [node])) {
        sendNotificationToUser(userId, { key: 'emote:session-missing', message: '채팅 세션을 확인할 수 없습니다.' });
    }
}

export function initCosmeticCommands(): void {
    registerCommand({
        name: '프레임목록',
        aliases: ['프로필프레임', 'framelist'],
        description: '해금한 프로필 원형·채팅 카드 프레임을 확인합니다.',
        information: true,
        showCommandUse: 'hide',
        handler: sendFrameList,
    });

    registerCommand({
        name: '프레임설정',
        aliases: ['frameequip'],
        description: '프로필 원형 또는 채팅 카드 프레임을 별도로 설정합니다.',
        showCommandUse: 'hide',
        args: [{
            name: '슬롯',
            description: '프로필 또는 채팅',
            required: true,
            completions: ['프로필', '채팅'],
        }, {
            name: '프레임',
            description: '해금한 프레임 또는 기본',
            required: true,
            completions: frameCompletions,
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const slot = parseFrameSlot(args[0] ?? '');
            if (!slot) {
                sendNotificationToUser(userId, { key: 'frame:invalid-slot', message: '슬롯은 프로필 또는 채팅으로 선택해주세요.' });
                return;
            }
            const frameInput = args[1] ?? '';
            const clear = ['기본', '해제', 'none'].includes(normalized(frameInput));
            const frame = clear ? undefined : findFrame(frameInput);
            if (!clear && !frame) {
                sendNotificationToUser(userId, { key: 'frame:invalid', message: '존재하지 않는 프레임입니다.' });
                return;
            }
            const result = selectCosmeticFrame(player, slot, frame?.key);
            if (!result.success) {
                sendNotificationToUser(userId, { key: 'frame:locked', message: result.reason });
                return;
            }
            const slotName = slot === 'avatar' ? '프로필 원형' : '채팅 카드';
            sendNotificationToUser(userId, {
                key: `frame:equipped:${slot}`,
                message: frame ? `${slotName}에 ${frame.name} 프레임을 장착했습니다.` : `${slotName} 프레임을 해제했습니다.`,
            });
            sendFrameList(userId);
        },
    });

    registerCommand({
        name: '감정표현',
        aliases: ['이모티콘', 'emote'],
        description: '채팅 감정표현을 확인·구매·사용합니다.',
        showCommandUse: 'hide',
        args: [{
            name: '작업',
            description: '목록, 구매, 사용 또는 감정표현 이름',
            required: false,
            completions: ['목록', '구매', '사용'],
        }, {
            name: '감정표현',
            description: '대상 감정표현',
            required: false,
            completions: emoteCompletions,
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const action = normalized(args[0] ?? '목록');
            if (action === '목록' || action === 'list') {
                sendEmoteList(userId);
                return;
            }
            const direct = findEmote(args[0] ?? '');
            const emote = direct ?? findEmote(args[1] ?? '');
            if (!emote) {
                sendNotificationToUser(userId, { key: 'emote:invalid', message: '존재하지 않는 감정표현입니다.' });
                return;
            }
            if (direct || action === '사용' || action === 'use') {
                useEmote(userId, emote);
                return;
            }
            if (action !== '구매' && action !== 'buy') {
                sendNotificationToUser(userId, { key: 'emote:invalid-action', message: '작업은 목록, 구매 또는 사용으로 선택해주세요.' });
                return;
            }
            const result = buyChatEmote(player, emote.key);
            if (!result.success) {
                sendNotificationToUser(userId, { key: 'emote:buy-failed', message: result.reason });
                return;
            }
            sendNotificationToUser(userId, {
                key: `emote:bought:${emote.key}`,
                message: `${emote.name} 감정표현을 ${result.goldSpent.toLocaleString('ko-KR')} Gold에 해금했습니다.`,
            });
            sendEmoteList(userId);
        },
    });
}
