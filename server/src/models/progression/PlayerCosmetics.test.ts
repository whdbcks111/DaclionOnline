import assert from 'node:assert/strict';
import test from 'node:test';
import type Player from '../actors/Player.js';
import { CHAT_EMOTES } from '../../../../shared/cosmetics.js';
import { ASCENSION_RANK_COUNTER } from './Ascension.js';
import {
    buyChatEmote,
    createChatEmoteNode,
    drawRandomChatEmote,
    grantChatEmote,
    grantCosmeticFrame,
    getChatEmoteSnapshots,
    getCosmeticFrameSnapshots,
    getPlayerCosmeticAppearance,
    selectCosmeticFrame,
    revokeChatEmote,
    revokeCosmeticFrame,
} from './PlayerCosmetics.js';
import { PlayerProgress } from './Progress.js';

function createPlayer(userId: number, level: number, gold = 0): Player {
    return {
        userId,
        level,
        gold,
        progress: PlayerProgress.createEmpty(userId),
    } as Player;
}

test('레벨 프레임은 1000 단위 이정표에 영구 해금되고 두 슬롯에 별도로 장착된다', () => {
    const player = createPlayer(983_001, 999);
    assert.equal(getCosmeticFrameSnapshots(player).find(frame => frame.key === 'azure')?.unlocked, false);

    player.level = 1_000;
    assert.equal(selectCosmeticFrame(player, 'avatar', 'azure').success, true);
    assert.deepEqual(getPlayerCosmeticAppearance(player), { avatarFrame: 'azure' });

    player.level = 2_000;
    assert.equal(selectCosmeticFrame(player, 'chat', 'amethyst').success, true);
    assert.deepEqual(getPlayerCosmeticAppearance(player), {
        avatarFrame: 'azure',
        chatFrame: 'amethyst',
    });

    player.level = 1;
    assert.equal(getCosmeticFrameSnapshots(player).find(frame => frame.key === 'amethyst')?.unlocked, true);
    assert.equal(selectCosmeticFrame(player, 'avatar').success, true);
    assert.deepEqual(getPlayerCosmeticAppearance(player), { chatFrame: 'amethyst' });
});

test('Gold 감정표현은 한 번만 구매되고 조건형 감정표현은 레벨·초월로 해금된다', () => {
    const player = createPlayer(983_002, 1, 20_000);
    assert.deepEqual(createChatEmoteNode(player, 'wave'), { type: 'emote', id: 'wave' });
    assert.equal(createChatEmoteNode(player, 'cheer'), undefined);

    const bought = buyChatEmote(player, 'cheer');
    assert.equal(bought.success, true);
    assert.equal(player.gold, 5_000);
    assert.deepEqual(createChatEmoteNode(player, 'cheer'), { type: 'emote', id: 'cheer' });
    assert.equal(buyChatEmote(player, 'cheer').success, false);
    assert.equal(buyChatEmote(player, 'heart').success, false);

    player.level = 1_000;
    assert.equal(getChatEmoteSnapshots(player).find(emote => emote.key === 'sparkle')?.unlocked, true);
    player.progress.increment(ASCENSION_RANK_COUNTER);
    assert.equal(getChatEmoteSnapshots(player).find(emote => emote.key === 'transcendent')?.unlocked, true);
});

test('감정표현은 30종 이상이며 50·200·500·1500·2500 레벨 이정표를 각각 지원한다', () => {
    assert.ok(CHAT_EMOTES.length >= 30);
    assert.equal(new Set(CHAT_EMOTES.map(emote => emote.key)).size, CHAT_EMOTES.length);
    assert.equal(new Set(CHAT_EMOTES.map(emote => emote.image)).size, CHAT_EMOTES.length);

    const player = createPlayer(983_004, 49);
    for (const [level, key] of [
        [50, 'smile'],
        [200, 'applause'],
        [500, 'rage'],
        [1_500, 'laugh'],
        [2_500, 'crown'],
    ] as const) {
        assert.equal(createChatEmoteNode(player, key), undefined);
        player.level = level;
        assert.deepEqual(createChatEmoteNode(player, key), { type: 'emote', id: key });
    }
});

test('낚시 뽑기권 추첨은 미보유 후보를 중복 없이 해금하고 전용 감정표현도 포함한다', () => {
    const player = createPlayer(983_005, 1);
    const first = drawRandomChatEmote(player, () => 0);
    assert.equal(first.success, true);
    if (!first.success) return;
    assert.deepEqual(createChatEmoteNode(player, first.emote.key), { type: 'emote', id: first.emote.key });

    const second = drawRandomChatEmote(player, () => 0);
    assert.equal(second.success, true);
    if (!second.success) return;
    assert.notEqual(second.emote.key, first.emote.key);
    assert.equal(getChatEmoteSnapshots(player).find(emote => emote.key === first.emote.key)?.owned, true);

    const raffleOnly = CHAT_EMOTES.find(emote => emote.raffleOnly);
    assert.ok(raffleOnly);
    assert.equal(createChatEmoteNode(createPlayer(983_006, 10_000), raffleOnly!.key), undefined);
});

test('관리자 지급과 삭제는 정상 조건을 우회하고 삭제 시 장착·자연 해금을 차단한다', () => {
    const player = createPlayer(983_003, 3_000);
    assert.equal(selectCosmeticFrame(player, 'avatar', 'aurora').success, true);
    assert.equal(selectCosmeticFrame(player, 'chat', 'aurora').success, true);

    assert.equal(revokeCosmeticFrame(player, 'aurora').changed, true);
    assert.equal(getCosmeticFrameSnapshots(player).find(frame => frame.key === 'aurora')?.revoked, true);
    assert.deepEqual(getPlayerCosmeticAppearance(player), {});
    assert.equal(selectCosmeticFrame(player, 'avatar', 'aurora').success, false);

    assert.equal(grantCosmeticFrame(player, 'aurora').changed, true);
    assert.equal(selectCosmeticFrame(player, 'avatar', 'aurora').success, true);

    assert.equal(createChatEmoteNode(player, 'transcendent'), undefined);
    assert.equal(grantChatEmote(player, 'transcendent').changed, true);
    assert.deepEqual(createChatEmoteNode(player, 'transcendent'), { type: 'emote', id: 'transcendent' });
    assert.equal(revokeChatEmote(player, 'transcendent').changed, true);
    assert.equal(createChatEmoteNode(player, 'transcendent'), undefined);

    player.gold = 20_000;
    assert.equal(buyChatEmote(player, 'cheer').success, true);
    assert.equal(revokeChatEmote(player, 'cheer').changed, true);
    assert.equal(buyChatEmote(player, 'cheer').success, false);
    assert.equal(grantChatEmote(player, 'cheer').changed, true);
    assert.deepEqual(createChatEmoteNode(player, 'cheer'), { type: 'emote', id: 'cheer' });
});
