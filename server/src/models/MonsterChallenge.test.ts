import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
import Monster, { getMonsterData, hasMonsterChallengePattern } from './Monster.js';
import { defineLocation } from './Location.js';
import { cancelMiniGame, hasActiveMiniGame } from '../modules/minigame.js';
import { getIO, initSocket } from '../modules/socket.js';
import '../data/items.js';
import '../data/statusEffects.js';
import '../data/skills.js';
import '../data/monsters.js';
import '../data/bossPatterns.js';

class ChallengeTarget extends Entity {
    override readonly name = '회피 시험자';
    readonly userId = 9911;

    constructor() {
        super(32, 0, 'challenge-test', { maxLife: 1_000, speed: 2 }, Equipment.createEmpty());
    }

    override get isPlayer(): boolean { return true; }
    override get playerUserId(): number { return this.userId; }
}

const server = createServer();
initSocket(server, 'http://localhost');
defineLocation({
    id: 'challenge-test', name: '패턴 시험장', zoneType: 'hostile', x: 0, y: 0, z: 0,
    npcIds: [], objects: [], connections: [], tags: [],
});
test.after(() => { getIO().close(); });

test('보스 challengePattern은 현재 위협 대상에게 실제 미니게임 세션을 시작한다', () => {
    const monster = new Monster('crystal_vein_overlord', 'challenge-test');
    const target = new ChallengeTarget();
    monster.acquireCombatTarget(target);

    assert.equal(getMonsterData('crystal_vein_overlord')?.challengePattern?.handler, 'crystal:cave-in');
    assert.equal(hasMonsterChallengePattern('crystal:cave-in'), true);

    monster.update(8.1);

    assert.equal(monster.isChallengePatternActive, true);
    assert.equal(hasActiveMiniGame(target.userId), true);
    assert.equal(cancelMiniGame(target.userId, '테스트 종료'), true);
    assert.equal(hasActiveMiniGame(target.userId), false);
});
