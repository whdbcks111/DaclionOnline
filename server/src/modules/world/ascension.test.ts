import assert from 'node:assert/strict';
import test from 'node:test';
import {
    DACLEVIS_REVELATION_FLAG,
    ORIGINBOUNDARY_SOVEREIGN_DEFEATED_FLAG,
} from '../../data/progression/ascension.js';
import type Player from '../../models/actors/Player.js';
import { PlayerProgress } from '../../models/progression/Progress.js';
import {
    ASCENSION_ARTIFACT_ITEM_ID,
    ASCENSION_BONUS_STAT_POINTS,
    ASCENSION_PASSIVE_SKILL_ID,
    ASCENSION_RANK_COUNTER,
} from '../../models/progression/Ascension.js';
import { ascendPlayer, getAscensionDeniedReason, grantOriginboundaryDefeatProgress } from './ascension.js';

function createPlayerShell(userId: number): Player {
    return { progress: PlayerProgress.createEmpty(userId) } as Player;
}

test('아르케 처치 자격은 기여 플레이어마다 한 번만 영속 flag로 기록된다', () => {
    const first = createPlayerShell(93_001);
    const second = createPlayerShell(93_002);

    assert.equal(grantOriginboundaryDefeatProgress([first, second]), 2);
    assert.equal(first.progress.getFlag(ORIGINBOUNDARY_SOVEREIGN_DEFEATED_FLAG), true);
    assert.equal(second.progress.getFlag(ORIGINBOUNDARY_SOVEREIGN_DEFEATED_FLAG), true);
    assert.equal(grantOriginboundaryDefeatProgress([first, second]), 0);
});

test('초월은 아르케 제압·진실 확인·Lv.1000을 모두 요구하며 한 번만 허용된다', () => {
    const player = createPlayerShell(93_003);
    Object.assign(player, { level: 999, isDefeated: false });
    assert.match(getAscensionDeniedReason(player) ?? '', /아르케/);

    player.progress.setFlag(ORIGINBOUNDARY_SOVEREIGN_DEFEATED_FLAG, true);
    assert.match(getAscensionDeniedReason(player) ?? '', /다클레비스/);
    player.progress.setFlag(DACLEVIS_REVELATION_FLAG, true);
    assert.match(getAscensionDeniedReason(player) ?? '', /Lv\.1000/);

    Object.assign(player, { level: 1_000 });
    assert.equal(getAscensionDeniedReason(player), undefined);
    player.progress.increment(ASCENSION_RANK_COUNTER);
    assert.match(getAscensionDeniedReason(player) ?? '', /이미 초월/);
});

test('초월 실행은 초기화 뒤 단계·패시브·귀속 아티팩트를 한 번 지급하고 저장을 요청한다', () => {
    const progress = PlayerProgress.createEmpty(93_004);
    progress.setFlag(ORIGINBOUNDARY_SOVEREIGN_DEFEATED_FLAG, true);
    progress.setFlag(DACLEVIS_REVELATION_FLAG, true);
    const calls: string[] = [];
    let bonusStatPoints = 0;
    const player = {
        userId: 93_004,
        level: 1_000,
        isDefeated: false,
        progress,
        resetForAscension: (bonus: number) => {
            bonusStatPoints = bonus;
            calls.push('reset');
            return { previousLevel: 1_000 };
        },
        skills: { grant: (id: string) => { calls.push(`skill:${id}`); } },
        inventory: { addItem: (id: string) => { calls.push(`item:${id}`); return true; } },
        save: async () => { calls.push('save'); },
    } as unknown as Player;

    const result = ascendPlayer(player);
    assert.equal(result.success, true);
    assert.equal(result.previousLevel, 1_000);
    assert.equal(bonusStatPoints, ASCENSION_BONUS_STAT_POINTS);
    assert.equal(progress.getCounter(ASCENSION_RANK_COUNTER), 1n);
    assert.deepEqual(calls, [
        'reset',
        `skill:${ASCENSION_PASSIVE_SKILL_ID}`,
        `item:${ASCENSION_ARTIFACT_ITEM_ID}`,
        'save',
    ]);
    assert.equal(ascendPlayer(player).success, false);
});
