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
import { AttributeType } from './Attribute.js';
import { ActionType } from './Action.js';
import { StatusEffectType } from './StatusEffect.js';

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

test('철근 심장수호자는 고속·고마법저항 대상 한 명에게 방어 무시 제압기를 확정 적중시킨다', () => {
    const monster = new Monster('ironroot_heartwarden', 'challenge-test');
    const target = new ChallengeTarget();
    target.attribute.addModifiers([
        { attribute: AttributeType.MAX_LIFE.key, op: 'add', value: 3_000, source: 'test:endgame' },
        { attribute: AttributeType.MAGIC_DEF.key, op: 'add', value: 10_000, source: 'test:endgame' },
        { attribute: AttributeType.SPEED.key, op: 'add', value: 100, source: 'test:endgame' },
    ]);
    target.life = target.maxLife;
    monster.currentTarget = target;

    const outcome = monster.activateSkill('ironroot_lockdown');
    assert.equal(outcome.activated, true);
    monster.skills.update(1.5);

    assert.equal(target.life, target.maxLife * 0.75);
    assert.equal(target.hasStatusEffect(StatusEffectType.fromKey('overmaster')!), true);
    assert.equal(target.canPerformAction(ActionType.ATTACK), false);
    assert.equal(target.canPerformAction(ActionType.EVASION), false);
});
