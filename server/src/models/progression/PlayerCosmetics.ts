import {
    CHAT_EMOTES,
    COSMETIC_FRAMES,
    getChatEmote,
    getCosmeticFrame,
    type ChatEmoteDefinition,
    type ChatEmoteKey,
    type CosmeticFrameDefinition,
    type CosmeticFrameKey,
} from '../../../../shared/cosmetics.js';
import type { ChatNode } from '../../../../shared/types.js';
import type Player from '../actors/Player.js';
import { isAscended } from './Ascension.js';
import { defineProgress, ProgressType } from './Progress.js';

export type CosmeticFrameSlot = 'avatar' | 'chat';

const COSMETIC_LEVEL_MILESTONE_PROGRESS_ID = 'cosmetic:level-milestone';
const COSMETIC_AVATAR_FRAME_PROGRESS_ID = 'cosmetic:avatar-frame';
const COSMETIC_CHAT_FRAME_PROGRESS_ID = 'cosmetic:chat-frame';

defineProgress({
    id: COSMETIC_LEVEL_MILESTONE_PROGRESS_ID,
    type: ProgressType.COUNTER,
    label: '꾸미기 레벨 이정표',
    description: '한 번이라도 달성해 영구 해금한 프로필 꾸미기 레벨 이정표입니다.',
    visible: false,
});
defineProgress({
    id: COSMETIC_AVATAR_FRAME_PROGRESS_ID,
    type: ProgressType.STATE,
    label: '프로필 원형 프레임',
    description: '현재 장착한 프로필 원형 프레임 ID입니다.',
    visible: false,
});
defineProgress({
    id: COSMETIC_CHAT_FRAME_PROGRESS_ID,
    type: ProgressType.STATE,
    label: '채팅 카드 프레임',
    description: '현재 장착한 채팅 카드 프레임 ID입니다.',
    visible: false,
});

function emoteOwnedProgressId(key: ChatEmoteKey): string {
    return `cosmetic:emote/${key}`;
}

for (const emote of CHAT_EMOTES) {
    if (!emote.goldPrice) continue;
    defineProgress({
        id: emoteOwnedProgressId(emote.key),
        type: ProgressType.FLAG,
        label: `감정표현: ${emote.name}`,
        description: `${emote.name} 감정표현의 Gold 해금 여부입니다.`,
        visible: false,
    });
}

export interface CosmeticFrameSnapshot extends CosmeticFrameDefinition {
    readonly unlocked: boolean;
    readonly selectedAvatar: boolean;
    readonly selectedChat: boolean;
    readonly unlockDescription: string;
}

export interface ChatEmoteSnapshot extends ChatEmoteDefinition {
    readonly unlocked: boolean;
    readonly unlockDescription: string;
}

export interface PlayerCosmeticAppearance {
    readonly avatarFrame?: CosmeticFrameKey;
    readonly chatFrame?: CosmeticFrameKey;
}

export function syncPlayerCosmeticUnlocks(player: Player): number {
    const existing = player.progress.getCounterNumber(COSMETIC_LEVEL_MILESTONE_PROGRESS_ID);
    const reached = COSMETIC_FRAMES
        .map(frame => frame.requiredLevel ?? 0)
        .concat(CHAT_EMOTES.map(emote => emote.requiredLevel ?? 0))
        .filter(level => level <= player.level)
        .reduce((highest, level) => Math.max(highest, level), 0);
    if (reached > existing) player.progress.setCounter(COSMETIC_LEVEL_MILESTONE_PROGRESS_ID, reached);
    return Math.max(existing, reached);
}

function meetsUnlockCondition(
    player: Player,
    definition: Pick<CosmeticFrameDefinition | ChatEmoteDefinition, 'requiredLevel' | 'requiresAscension'>,
): boolean {
    if (definition.requiredLevel && syncPlayerCosmeticUnlocks(player) < definition.requiredLevel) return false;
    if (definition.requiresAscension && !isAscended(player.progress)) return false;
    return true;
}

function frameUnlockDescription(frame: CosmeticFrameDefinition): string {
    if (frame.requiresAscension) return '초월 달성';
    return `Lv.${frame.requiredLevel?.toLocaleString('ko-KR') ?? 1} 달성`;
}

function emoteUnlockDescription(emote: ChatEmoteDefinition): string {
    if (emote.goldPrice) return `${emote.goldPrice.toLocaleString('ko-KR')} Gold 구매`;
    if (emote.requiresAscension) return '초월 달성';
    if (emote.requiredLevel) return `Lv.${emote.requiredLevel.toLocaleString('ko-KR')} 달성`;
    return '기본 제공';
}

export function isCosmeticFrameUnlocked(player: Player, frameOrKey: CosmeticFrameDefinition | CosmeticFrameKey): boolean {
    const frame = typeof frameOrKey === 'string' ? getCosmeticFrame(frameOrKey) : frameOrKey;
    return Boolean(frame && meetsUnlockCondition(player, frame));
}

export function getCosmeticFrameSnapshots(player: Player): readonly CosmeticFrameSnapshot[] {
    const selected = getPlayerCosmeticAppearance(player);
    return Object.freeze(COSMETIC_FRAMES.map(frame => Object.freeze({
        ...frame,
        unlocked: isCosmeticFrameUnlocked(player, frame),
        selectedAvatar: selected.avatarFrame === frame.key,
        selectedChat: selected.chatFrame === frame.key,
        unlockDescription: frameUnlockDescription(frame),
    })));
}

export function getPlayerCosmeticAppearance(player: Player): PlayerCosmeticAppearance {
    syncPlayerCosmeticUnlocks(player);
    const avatarKey = player.progress.getState(COSMETIC_AVATAR_FRAME_PROGRESS_ID);
    const chatKey = player.progress.getState(COSMETIC_CHAT_FRAME_PROGRESS_ID);
    const avatar = getCosmeticFrame(avatarKey);
    const chat = getCosmeticFrame(chatKey);
    return Object.freeze({
        ...(avatar && isCosmeticFrameUnlocked(player, avatar) ? { avatarFrame: avatar.key } : {}),
        ...(chat && isCosmeticFrameUnlocked(player, chat) ? { chatFrame: chat.key } : {}),
    });
}

export type SelectCosmeticFrameResult =
    | { readonly success: true; readonly slot: CosmeticFrameSlot; readonly frame?: CosmeticFrameDefinition }
    | { readonly success: false; readonly reason: string };

export function selectCosmeticFrame(
    player: Player,
    slot: CosmeticFrameSlot,
    frameKey?: CosmeticFrameKey,
): SelectCosmeticFrameResult {
    const progressId = slot === 'avatar'
        ? COSMETIC_AVATAR_FRAME_PROGRESS_ID
        : COSMETIC_CHAT_FRAME_PROGRESS_ID;
    if (!frameKey) {
        player.progress.reset(progressId);
        return { success: true, slot };
    }
    const frame = getCosmeticFrame(frameKey);
    if (!frame) return { success: false, reason: '존재하지 않는 프레임입니다.' };
    if (!isCosmeticFrameUnlocked(player, frame)) {
        return { success: false, reason: `${frame.name} 프레임은 ${frameUnlockDescription(frame)} 후 사용할 수 있습니다.` };
    }
    player.progress.setState(progressId, frame.key);
    return { success: true, slot, frame };
}

export function isChatEmoteUnlocked(player: Player, emoteOrKey: ChatEmoteDefinition | ChatEmoteKey): boolean {
    const emote = typeof emoteOrKey === 'string' ? getChatEmote(emoteOrKey) : emoteOrKey;
    if (!emote || !meetsUnlockCondition(player, emote)) return false;
    return !emote.goldPrice || player.progress.getFlag(emoteOwnedProgressId(emote.key));
}

export function getChatEmoteSnapshots(player: Player): readonly ChatEmoteSnapshot[] {
    return Object.freeze(CHAT_EMOTES.map(emote => Object.freeze({
        ...emote,
        unlocked: isChatEmoteUnlocked(player, emote),
        unlockDescription: emoteUnlockDescription(emote),
    })));
}

export type BuyChatEmoteResult =
    | { readonly success: true; readonly emote: ChatEmoteDefinition; readonly goldSpent: number }
    | { readonly success: false; readonly reason: string };

export function buyChatEmote(player: Player, emoteKey: ChatEmoteKey): BuyChatEmoteResult {
    const emote = getChatEmote(emoteKey);
    if (!emote) return { success: false, reason: '존재하지 않는 감정표현입니다.' };
    if (!emote.goldPrice) return { success: false, reason: '이 감정표현은 구매형이 아닙니다.' };
    if (player.progress.getFlag(emoteOwnedProgressId(emote.key))) {
        return { success: false, reason: '이미 해금한 감정표현입니다.' };
    }
    if (player.gold < emote.goldPrice) {
        return { success: false, reason: `${emote.goldPrice.toLocaleString('ko-KR')} Gold가 필요합니다.` };
    }
    player.gold -= emote.goldPrice;
    player.progress.setFlag(emoteOwnedProgressId(emote.key));
    return Object.freeze({ success: true, emote, goldSpent: emote.goldPrice });
}

export function createChatEmoteNode(player: Player, emoteKey: ChatEmoteKey): ChatNode | undefined {
    return isChatEmoteUnlocked(player, emoteKey) ? Object.freeze({ type: 'emote', id: emoteKey }) : undefined;
}
