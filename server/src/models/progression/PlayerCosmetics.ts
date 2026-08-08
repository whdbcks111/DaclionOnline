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

function frameGrantedProgressId(key: CosmeticFrameKey): string {
    return `cosmetic:frame/${key}`;
}

function frameRevokedProgressId(key: CosmeticFrameKey): string {
    return `cosmetic:frame-revoked/${key}`;
}

function emoteGrantedProgressId(key: ChatEmoteKey): string {
    return `cosmetic:emote-granted/${key}`;
}

function emoteRevokedProgressId(key: ChatEmoteKey): string {
    return `cosmetic:emote-revoked/${key}`;
}

for (const frame of COSMETIC_FRAMES) {
    defineProgress({
        id: frameGrantedProgressId(frame.key),
        type: ProgressType.FLAG,
        label: `프레임 지급: ${frame.name}`,
        description: `${frame.name} 프레임의 관리자 조건 없는 지급 여부입니다.`,
        visible: false,
    });
    defineProgress({
        id: frameRevokedProgressId(frame.key),
        type: ProgressType.FLAG,
        label: `프레임 삭제: ${frame.name}`,
        description: `${frame.name} 프레임의 관리자 삭제 여부입니다.`,
        visible: false,
    });
}

for (const emote of CHAT_EMOTES) {
    defineProgress({
        id: emoteOwnedProgressId(emote.key),
        type: ProgressType.FLAG,
        label: `감정표현: ${emote.name}`,
        description: `${emote.name} 감정표현의 구매·뽑기 보유 여부입니다.`,
        visible: false,
    });
    defineProgress({
        id: emoteGrantedProgressId(emote.key),
        type: ProgressType.FLAG,
        label: `감정표현 지급: ${emote.name}`,
        description: `${emote.name} 감정표현의 관리자 조건 없는 지급 여부입니다.`,
        visible: false,
    });
    defineProgress({
        id: emoteRevokedProgressId(emote.key),
        type: ProgressType.FLAG,
        label: `감정표현 삭제: ${emote.name}`,
        description: `${emote.name} 감정표현의 관리자 삭제 여부입니다.`,
        visible: false,
    });
}

export interface CosmeticFrameSnapshot extends CosmeticFrameDefinition {
    readonly unlocked: boolean;
    readonly adminGranted: boolean;
    readonly revoked: boolean;
    readonly selectedAvatar: boolean;
    readonly selectedChat: boolean;
    readonly unlockDescription: string;
}

export interface ChatEmoteSnapshot extends ChatEmoteDefinition {
    readonly unlocked: boolean;
    readonly owned: boolean;
    readonly adminGranted: boolean;
    readonly revoked: boolean;
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
    if (emote.raffleOnly) return '낚시 감정표현 뽑기권';
    if (emote.goldPrice) return `${emote.goldPrice.toLocaleString('ko-KR')} Gold 구매`;
    if (emote.requiresAscension) return '초월 달성';
    if (emote.requiredLevel) return `Lv.${emote.requiredLevel.toLocaleString('ko-KR')} 달성`;
    return '기본 제공';
}

export function isCosmeticFrameUnlocked(player: Player, frameOrKey: CosmeticFrameDefinition | CosmeticFrameKey): boolean {
    const frame = typeof frameOrKey === 'string' ? getCosmeticFrame(frameOrKey) : frameOrKey;
    return Boolean(frame
        && !player.progress.getFlag(frameRevokedProgressId(frame.key))
        && (
            player.progress.getFlag(frameGrantedProgressId(frame.key))
            || meetsUnlockCondition(player, frame)
        ));
}

export function getCosmeticFrameSnapshots(player: Player): readonly CosmeticFrameSnapshot[] {
    const selected = getPlayerCosmeticAppearance(player);
    return Object.freeze(COSMETIC_FRAMES.map(frame => {
        const revoked = player.progress.getFlag(frameRevokedProgressId(frame.key));
        return Object.freeze({
            ...frame,
            unlocked: isCosmeticFrameUnlocked(player, frame),
            adminGranted: player.progress.getFlag(frameGrantedProgressId(frame.key)),
            revoked,
            selectedAvatar: selected.avatarFrame === frame.key,
            selectedChat: selected.chatFrame === frame.key,
            unlockDescription: revoked ? '관리자에 의해 삭제됨' : frameUnlockDescription(frame),
        });
    }));
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
    if (!emote) return false;
    if (player.progress.getFlag(emoteRevokedProgressId(emote.key))) return false;
    if (player.progress.getFlag(emoteGrantedProgressId(emote.key))) return true;
    if (player.progress.getFlag(emoteOwnedProgressId(emote.key))) return true;
    if (emote.raffleOnly) return false;
    if (!meetsUnlockCondition(player, emote)) return false;
    return !emote.goldPrice || player.progress.getFlag(emoteOwnedProgressId(emote.key));
}

export function getChatEmoteSnapshots(player: Player): readonly ChatEmoteSnapshot[] {
    return Object.freeze(CHAT_EMOTES.map(emote => {
        const revoked = player.progress.getFlag(emoteRevokedProgressId(emote.key));
        return Object.freeze({
            ...emote,
            unlocked: isChatEmoteUnlocked(player, emote),
            owned: player.progress.getFlag(emoteOwnedProgressId(emote.key)),
            adminGranted: player.progress.getFlag(emoteGrantedProgressId(emote.key)),
            revoked,
            unlockDescription: revoked ? '관리자에 의해 삭제됨' : emoteUnlockDescription(emote),
        });
    }));
}

export type BuyChatEmoteResult =
    | { readonly success: true; readonly emote: ChatEmoteDefinition; readonly goldSpent: number }
    | { readonly success: false; readonly reason: string };

export function buyChatEmote(player: Player, emoteKey: ChatEmoteKey): BuyChatEmoteResult {
    const emote = getChatEmote(emoteKey);
    if (!emote) return { success: false, reason: '존재하지 않는 감정표현입니다.' };
    if (!emote.goldPrice) return { success: false, reason: '이 감정표현은 구매형이 아닙니다.' };
    if (player.progress.getFlag(emoteRevokedProgressId(emote.key))) {
        return { success: false, reason: '관리자에 의해 삭제된 감정표현입니다.' };
    }
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

export type DrawChatEmoteResult =
    | { readonly success: true; readonly emote: ChatEmoteDefinition }
    | { readonly success: false; readonly reason: string };

/** 낚시 뽑기권은 기본·초월 전용을 제외한 미보유 감정표현 중 하나를 중복 없이 영구 해금한다. */
export function drawRandomChatEmote(player: Player, random: () => number = Math.random): DrawChatEmoteResult {
    const candidates = CHAT_EMOTES.filter(emote =>
        emote.raffleEligible !== false
        && !player.progress.getFlag(emoteRevokedProgressId(emote.key))
        && !isChatEmoteUnlocked(player, emote));
    if (candidates.length === 0) {
        return { success: false, reason: '뽑기권으로 얻을 수 있는 감정표현을 모두 보유하고 있습니다.' };
    }
    const randomValue = random();
    const roll = Number.isFinite(randomValue) ? Math.max(0, Math.min(0.999999, randomValue)) : 0;
    const emote = candidates[Math.floor(roll * candidates.length)] ?? candidates[0];
    player.progress.setFlag(emoteOwnedProgressId(emote.key));
    return Object.freeze({ success: true, emote });
}

export interface AdminCosmeticChangeResult {
    readonly changed: boolean;
    readonly name: string;
}

/** 정상 레벨·초월·Gold 조건과 분리된 관리자 지급 경계. */
export function grantCosmeticFrame(player: Player, frameKey: CosmeticFrameKey): AdminCosmeticChangeResult {
    const frame = getCosmeticFrame(frameKey);
    if (!frame) throw new Error(`Unknown cosmetic frame: ${frameKey}`);
    const progressId = frameGrantedProgressId(frame.key);
    const granted = !player.progress.getFlag(progressId)
        || player.progress.getFlag(frameRevokedProgressId(frame.key));
    player.progress.setFlag(frameRevokedProgressId(frame.key), false);
    if (granted) player.progress.setFlag(progressId);
    return Object.freeze({ changed: granted, name: frame.name });
}

/** 구매형·조건형을 포함한 감정표현 하나를 관리자 권한으로 영구 지급한다. */
export function grantChatEmote(player: Player, emoteKey: ChatEmoteKey): AdminCosmeticChangeResult {
    const emote = getChatEmote(emoteKey);
    if (!emote) throw new Error(`Unknown chat emote: ${emoteKey}`);
    const progressId = emoteGrantedProgressId(emote.key);
    const granted = !player.progress.getFlag(progressId)
        || player.progress.getFlag(emoteRevokedProgressId(emote.key));
    player.progress.setFlag(emoteRevokedProgressId(emote.key), false);
    if (granted) player.progress.setFlag(progressId);
    return Object.freeze({ changed: granted, name: emote.name });
}

/** 관리자 패널 삭제는 자연 해금까지 차단하며, 다시 관리자 지급하기 전까지 유지된다. */
export function revokeCosmeticFrame(player: Player, frameKey: CosmeticFrameKey): AdminCosmeticChangeResult {
    const frame = getCosmeticFrame(frameKey);
    if (!frame) throw new Error(`Unknown cosmetic frame: ${frameKey}`);
    const alreadyRevoked = player.progress.getFlag(frameRevokedProgressId(frame.key));
    player.progress.setFlag(frameGrantedProgressId(frame.key), false);
    player.progress.setFlag(frameRevokedProgressId(frame.key), true);
    if (player.progress.getState(COSMETIC_AVATAR_FRAME_PROGRESS_ID) === frame.key) {
        player.progress.reset(COSMETIC_AVATAR_FRAME_PROGRESS_ID);
    }
    if (player.progress.getState(COSMETIC_CHAT_FRAME_PROGRESS_ID) === frame.key) {
        player.progress.reset(COSMETIC_CHAT_FRAME_PROGRESS_ID);
    }
    return Object.freeze({ changed: !alreadyRevoked, name: frame.name });
}

/** 구매·관리자 지급·조건 해금을 모두 차단하는 관리자 삭제 경계. */
export function revokeChatEmote(player: Player, emoteKey: ChatEmoteKey): AdminCosmeticChangeResult {
    const emote = getChatEmote(emoteKey);
    if (!emote) throw new Error(`Unknown chat emote: ${emoteKey}`);
    const alreadyRevoked = player.progress.getFlag(emoteRevokedProgressId(emote.key));
    player.progress.setFlag(emoteOwnedProgressId(emote.key), false);
    player.progress.setFlag(emoteGrantedProgressId(emote.key), false);
    player.progress.setFlag(emoteRevokedProgressId(emote.key), true);
    return Object.freeze({ changed: !alreadyRevoked, name: emote.name });
}
