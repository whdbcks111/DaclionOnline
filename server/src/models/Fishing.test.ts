import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    appendMiniGameInputSample,
    getHazardDodgeHazards,
    MAX_MINIGAME_INPUT_SAMPLES,
    MINIGAME_INPUT_SAMPLE_INTERVAL_MS,
    simulateFishingCapture,
    simulateForgeRhythm,
    simulateHazardDodge,
    snapshotMiniGameInputs,
    type FishingCaptureConfig,
    type ForgeRhythmConfig,
    type HazardDodgeConfig,
} from '../../../shared/minigames.js';
import { getItemData } from './Item.js';
import {
    FishRarity,
    getAllFish,
    getFishByRarity,
    getFishRarityChances,
    rollFishRarity,
    rollFishingWaitSeconds,
} from './Fishing.js';
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

test('위험 회피 미니게임은 같은 seed와 입력을 서버에서 결정론적으로 재현한다', () => {
    const config: HazardDodgeConfig = {
        seed: 7788,
        durationMs: 5_000,
        label: '결정론 시험',
        mode: 'mixed',
        difficulty: 4,
        playerLabel: 'T',
        playerSpeed: 18,
        playerSize: 6,
        telegraphMs: 700,
    };
    const inputs = [{ at: 0, x: 1, y: 0 }, { at: 900, x: 0, y: -1 }];
    assert.deepEqual(
        simulateHazardDodge(config, inputs, 2_000),
        simulateHazardDodge(config, inputs, 2_000),
    );
    const safeShortGame = simulateHazardDodge({ ...config, durationMs: 200 }, [{ at: 0, x: 0, y: 0 }], 200);
    assert.equal(safeShortGame.finished, true);
    assert.equal(safeShortGame.success, true);
});

test('후반 보스용 위험 회피 난이도는 6을 넘어 위험 구역 크기까지 확장된다', () => {
    const config: HazardDodgeConfig = {
        seed: 7788,
        durationMs: 7_000,
        label: '후반 난이도 시험',
        mode: 'mixed',
        difficulty: 6,
        playerLabel: 'T',
        playerSpeed: 18,
        playerSize: 7,
        telegraphMs: 300,
    };
    const normal = getHazardDodgeHazards(config, 600)[0];
    const endgame = getHazardDodgeHazards({ ...config, difficulty: 10 }, 600)[0];
    assert.ok(normal && endgame);
    assert.equal(endgame.type, normal.type);
    assert.ok(Math.min(endgame.width, endgame.height) > Math.min(normal.width, normal.height));
});

test('공명 폭주는 같은 seed로 예고 후 세 줄 레이저 연사를 재현한다', () => {
    const config: HazardDodgeConfig = {
        seed: 7788,
        durationMs: 10_000,
        label: '지핵 공명 폭주',
        mode: 'resonance',
        difficulty: 10,
        playerLabel: 'T',
        playerSpeed: 18,
        playerSize: 7,
        telegraphMs: 300,
    };
    const barrage = getHazardDodgeHazards(config, 1_350)
        .filter(hazard => hazard.id.startsWith('laser-barrage:3:'));
    assert.equal(barrage.length, 3);
    assert.equal(barrage.every(hazard => hazard.type === 'laser'), true);
    assert.ok(barrage.some(hazard => hazard.active));
    assert.ok(barrage.some(hazard => !hazard.active));
});

test('단조 리듬 미니게임은 타격 시각을 서버에서 재현해 정확도와 성공을 판정한다', () => {
    const config: ForgeRhythmConfig = {
        durationMs: 3_000,
        label: '시험 단조',
        beatTimesMs: [500, 1_000, 1_500, 2_000],
        hitWindowMs: 200,
        perfectWindowMs: 60,
        requiredAccuracy: 0.75,
    };
    const perfect = simulateForgeRhythm(config, config.beatTimesMs.map(at => ({ at, action: 'strike' as const })), 3_000);
    assert.equal(perfect.success, true);
    assert.equal(perfect.perfectCount, 4);
    assert.equal(perfect.maxCombo, 4);
    assert.equal(perfect.accuracy, 1);

    const missed = simulateForgeRhythm(config, [{ at: 500, action: 'strike' }], 3_000);
    assert.equal(missed.success, false);
    assert.equal(missed.missCount, 3);
    assert.equal(missed.accuracy, 0.25);
});

test('연속 조작 trace는 20ms 단위로 합쳐지고 전송 시 불변 snapshot이 된다', () => {
    const inputs = [{ at: 0, x: 0, y: 0 }];
    for (let at = 1; at <= 1_000; at++) {
        appendMiniGameInputSample(inputs, { at, x: at % 2, y: 0 });
    }
    assert.ok(inputs.length <= 52);
    assert.ok(MAX_MINIGAME_INPUT_SAMPLES * MINIGAME_INPUT_SAMPLE_INTERVAL_MS > 30_000);

    const snapshot = snapshotMiniGameInputs(inputs, 500);
    assert.ok(snapshot.every(input => input.at <= 500));
    const originalX = snapshot[0].x;
    inputs[0].x = 99;
    assert.equal(snapshot[0].x, originalX);
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
    const baseChances = getFishRarityChances(0);
    const luckyChances = getFishRarityChances(100);
    assert.ok(Math.abs(baseChances.reduce((sum, chance) => sum + chance.probability, 0) - 1) < 1e-12);
    assert.ok(luckyChances[0].probability < baseChances[0].probability);
    assert.ok(luckyChances.at(-1)!.probability > baseChances.at(-1)!.probability);
});

test('입질 대기 시간은 45~65초 기본 범위와 입질 속도를 그대로 반영한다', () => {
    const beginnerBiteSpeed = 1 + 0.1 + 0.35;
    assert.equal(rollFishingWaitSeconds(1, () => 0), 45);
    assert.equal(rollFishingWaitSeconds(1, () => 1), 65);
    assert.equal(rollFishingWaitSeconds(beginnerBiteSpeed, () => 0), 45 / beginnerBiteSpeed);
    assert.ok(rollFishingWaitSeconds(beginnerBiteSpeed, () => 0) >= 30);
    assert.equal(rollFishingWaitSeconds(100, () => 0), 45 / 100);
});

test('모든 낚시 보상 아이템은 128px 투명 아이콘을 가진다', () => {
    assert.equal(getAllFish().length, 36);
    for (const rarity of FishRarity.values()) {
        assert.equal(getFishByRarity(rarity).length, 6, rarity.label);
        for (const fish of getFishByRarity(rarity)) {
            assert.ok(getItemData(fish.itemDataId)?.tags.includes(rarity.tag), `${fish.id}: ${rarity.tag}`);
        }
    }
    const itemIds = [
        'beginner_fishing_rod',
        'refined_fishing_rod',
        'wide_net_fishing_rod',
        'swift_current_fishing_rod',
        'earthworm_bait',
        ...getAllFish().map(fish => fish.itemDataId),
    ];
    for (const itemDataId of itemIds) {
        const png = readFileSync(new URL(`../../../client/public/icons/items/${itemDataId}.png`, import.meta.url));
        assert.equal(png.readUInt32BE(16), 128, itemDataId);
        assert.equal(png.readUInt32BE(20), 128, itemDataId);
        assert.equal(png[25], 6, `${itemDataId} must be RGBA`);
    }
});
