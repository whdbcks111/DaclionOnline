import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { simulateFishingCapture, type FishingCaptureConfig } from '../../../shared/minigames.js';
import { getItemData } from './Item.js';
import { FishRarity, getAllFish, getFishByRarity, rollFishRarity } from './Fishing.js';
import '../data/items.js';
import '../data/fishing.js';

const baseConfig: FishingCaptureConfig = {
    seed: 12345,
    durationMs: 10_000,
    rarityLabel: '일반',
    rarityColor: '#ffffff',
    fishIcon: 'items/silver_minnow',
    difficulty: 1,
    netShape: 'circle',
    netWidth: 100,
    netHeight: 100,
    netSpeed: 30,
    initialGauge: 0.5,
    fillPerSecond: 0.2,
    drainPerSecond: 0.2,
};

test('낚시 trace 시뮬레이터는 채집 유지와 이탈을 서버에서 재현한다', () => {
    const input = [{ at: 0, x: 0, y: 0 }];
    const caught = simulateFishingCapture(baseConfig, input, 3_000);
    assert.equal(caught.finished, true);
    assert.equal(caught.success, true);

    const escaped = simulateFishingCapture({ ...baseConfig, netWidth: 1, netHeight: 1 }, input, 3_000);
    assert.equal(escaped.finished, true);
    assert.equal(escaped.success, false);
});

test('행운은 상위 물고기 등급의 가중치를 증가시킨다', () => {
    const rolls = Array.from({ length: 10_000 }, (_, index) => (index + 0.5) / 10_000);
    const highTierCount = (luck: number) => rolls
        .map(value => rollFishRarity(luck, () => value))
        .filter(rarity => rarity.difficulty >= FishRarity.RARE.difficulty)
        .length;
    assert.ok(highTierCount(30) > highTierCount(0));
    assert.deepEqual(FishRarity.values().map(rarity => rarity.label), ['일반', '고급', '희귀', '서사', '전설', '신화']);
    assert.deepEqual(FishRarity.values().map(rarity => rarity.sellPrice), [5, 20, 90, 400, 1800, 8000]);
});

test('모든 낚시 보상 아이템은 128px 투명 아이콘을 가진다', () => {
    assert.equal(getAllFish().length, 36);
    for (const rarity of FishRarity.values()) {
        assert.equal(getFishByRarity(rarity).length, 6, rarity.label);
        for (const fish of getFishByRarity(rarity)) {
            assert.ok(getItemData(fish.itemDataId)?.tags.includes(rarity.tag), `${fish.id}: ${rarity.tag}`);
        }
    }
    const itemIds = ['beginner_fishing_rod', 'earthworm_bait', ...getAllFish().map(fish => fish.itemDataId)];
    for (const itemDataId of itemIds) {
        const png = readFileSync(new URL(`../../../client/public/icons/items/${itemDataId}.png`, import.meta.url));
        assert.equal(png.readUInt32BE(16), 128, itemDataId);
        assert.equal(png.readUInt32BE(20), 128, itemDataId);
        assert.equal(png[25], 6, `${itemDataId} must be RGBA`);
    }
});
