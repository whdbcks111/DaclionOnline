import assert from 'node:assert/strict';
import test from 'node:test';
import {
    ORIGINBOUNDARY_SOVEREIGN_DEFEATED_FLAG,
} from '../../data/progression/ascension.js';
import type Player from '../../models/actors/Player.js';
import { PlayerProgress } from '../../models/progression/Progress.js';
import { grantOriginboundaryDefeatProgress } from './ascension.js';

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
