import assert from 'node:assert/strict';
import test from 'node:test';
import type Player from '../actors/Player.js';
import { ASCENSION_RANK_COUNTER } from './Ascension.js';
import {
    buyChatEmote,
    createChatEmoteNode,
    getChatEmoteSnapshots,
    getCosmeticFrameSnapshots,
    getPlayerCosmeticAppearance,
    selectCosmeticFrame,
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
