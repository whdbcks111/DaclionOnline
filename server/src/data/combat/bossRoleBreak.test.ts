import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import type Player from '../../models/actors/Player.js';
import Entity from '../../models/core/Entity.js';
import Equipment from '../../models/economy/Equipment.js';
import Monster, {
    getMonsterData,
    hasMonsterChallengePattern,
} from '../../models/actors/Monster.js';
import { defineLocation } from '../../models/world/Location.js';
import { emitGameEvent, GameEventIds } from '../../models/core/GameEvent.js';
import { StatusEffectType } from '../../models/combat/StatusEffect.js';
import { ThreatAction } from '../../models/combat/Threat.js';
import { cancelMiniGame, hasActiveMiniGame } from '../../modules/professions/minigame.js';
import {
    registerOnlinePlayer,
    unregisterOnlinePlayer,
} from '../../modules/player/playerRegistry.js';
import { getIO, initSocket } from '../../modules/infrastructure/socket.js';
import '../economy/items.js';
import './statusEffects.js';
import './skills.js';
import '../world/monsters.js';
import {
    ROLE_BREAK_BOSS_PATTERNS,
} from './bossPatterns.js';
import {
    BossRoleBreakRequirement,
    type BossRoleBreakPatternConfig,
} from './bossRoleBreakConfig.js';

const TEST_LOCATION_ID = 'boss-role-break-test';
const AWAY_LOCATION_ID = 'boss-role-break-away';

class RoleBreakTarget extends Entity {
    override readonly name: string;
    readonly userId: number;
    playerEnabled = true;
    damageCalls = 0;

    constructor(userId: number, name = `역할 시험자 ${userId}`, locationId = TEST_LOCATION_ID) {
        super(1, 0, locationId, { maxLife: 1_000 }, Equipment.createEmpty());
        this.userId = userId;
        this.name = name;
    }

    override get isPlayer(): boolean { return this.playerEnabled; }
    override get playerUserId(): number { return this.userId; }

    override damage(...args: Parameters<Entity['damage']>): ReturnType<Entity['damage']> {
        this.damageCalls++;
        return super.damage(...args);
    }
}

class RaidTestMonster extends Monster {
    constructor(
        monsterDataId: string,
        private readonly creditUserIds: readonly number[],
    ) {
        super(monsterDataId, TEST_LOCATION_ID);
    }

    override getDefeatCreditUserIds(): readonly number[] {
        return [...this.creditUserIds];
    }
}

const server = createServer();
initSocket(server, 'http://localhost');
defineLocation({
    id: TEST_LOCATION_ID,
    name: '역할 파훼 시험장',
    zoneType: 'hostile',
    x: 0,
    y: 0,
    z: 0,
    npcIds: [],
    objects: [],
    connections: [],
    tags: [],
});
defineLocation({
    id: AWAY_LOCATION_ID,
    name: '역할 파훼 대기실',
    zoneType: 'safe',
    x: 1,
    y: 0,
    z: 0,
    npcIds: [],
    objects: [],
    connections: [],
    tags: [],
});

const registeredUserIds = new Set<number>();

function registerTarget(target: RoleBreakTarget): void {
    registerOnlinePlayer(target as unknown as Player);
    registeredUserIds.add(target.userId);
}

function getConfig(monsterDataId: string): Readonly<BossRoleBreakPatternConfig> {
    const config = ROLE_BREAK_BOSS_PATTERNS.find(value => value.monsterDataId === monsterDataId);
    assert.ok(config, `역할 파훼 설정 누락: ${monsterDataId}`);
    return config;
}

function startRoleBreak(
    monster: Monster,
    target: RoleBreakTarget,
    config = getConfig(monster.monsterDataId),
): void {
    monster.acquireCombatTarget(target);
    // AI tick이 현재 대상을 다시 고를 때도 위협 원장이 명시적으로 유지되어야 한다.
    assert.equal(monster.recordThreat(target, ThreatAction.ATTACK, 1), true);
    // 보스 도입 무적과 challenge 초기 지연은 서로 다른 tick 경계다.
    if (monster.isBossIntroActive) monster.update(10);
    monster.update(config.initialDelay + 0.01);
    assert.equal(monster.isChallengePatternActive, true);
    assert.equal(monster.getDamageReceivedModifier(), config.wardMultiplier);
}

function satisfyRequirement(
    monster: Monster,
    target: RoleBreakTarget,
    requirement: BossRoleBreakRequirement,
): void {
    if (requirement === BossRoleBreakRequirement.TAUNT) {
        assert.equal(monster.taunt(target, monster.maxLife), true);
        return;
    }
    const effectType = requirement.statusEffectId
        ? StatusEffectType.fromKey(requirement.statusEffectId)
        : undefined;
    assert.ok(effectType, `상태효과 요구사항 누락: ${requirement.key}`);
    assert.equal(monster.applyStatusEffect(effectType, 20, 1, target).action.changed, true);
}

test.afterEach(() => {
    for (const userId of registeredUserIds) {
        cancelMiniGame(userId, '역할 파훼 테스트 정리');
        unregisterOnlinePlayer(userId);
    }
    registeredUserIds.clear();
});

test.after(() => { getIO().close(); });

test('역할 파훼 세 보스의 요구 행동과 시간·피해 수치를 마스터 설정에 그대로 연결한다', () => {
    assert.deepEqual(ROLE_BREAK_BOSS_PATTERNS.map(config => ({
        handlerId: config.handlerId,
        monsterDataId: config.monsterDataId,
        label: config.label,
        requirements: config.requirements.map(value => value.key),
        duration: config.duration,
        wardMultiplier: config.wardMultiplier,
        vulnerabilityMultiplier: config.vulnerabilityMultiplier,
        vulnerabilityDuration: config.vulnerabilityDuration,
        failureLifeRatio: config.failureLifeRatio,
        initialDelay: config.initialDelay,
        interval: config.interval,
    })), [
        {
            handlerId: 'role-break:nebula-sovereign',
            monsterDataId: 'nebula_sovereign',
            label: '성운 왕권 봉쇄',
            requirements: ['defense_reduction', 'magic_defense_reduction'],
            duration: 12,
            wardMultiplier: 0.55,
            vulnerabilityMultiplier: 1.15,
            vulnerabilityDuration: 7,
            failureLifeRatio: 0.28,
            initialDelay: 9,
            interval: { min: 28, max: 34 },
        },
        {
            handlerId: 'role-break:zero-hour-queen',
            monsterDataId: 'zero_hour_queen',
            label: '영시 왕좌 봉쇄',
            requirements: ['taunt', 'magic_defense_reduction'],
            duration: 11,
            wardMultiplier: 0.5,
            vulnerabilityMultiplier: 1.18,
            vulnerabilityDuration: 7,
            failureLifeRatio: 0.35,
            initialDelay: 8,
            interval: { min: 26, max: 32 },
        },
        {
            handlerId: 'role-break:last-constellation',
            monsterDataId: 'last_constellation',
            label: '종성 삼중 봉쇄',
            requirements: ['taunt', 'defense_reduction', 'magic_defense_reduction'],
            duration: 14,
            wardMultiplier: 0.45,
            vulnerabilityMultiplier: 1.2,
            vulnerabilityDuration: 8,
            failureLifeRatio: 0.42,
            initialDelay: 8,
            interval: { min: 24, max: 30 },
        },
    ]);

    for (const config of ROLE_BREAK_BOSS_PATTERNS) {
        assert.equal(Object.isFrozen(config), true);
        assert.equal(Object.isFrozen(config.requirements), true);
        assert.equal(Object.isFrozen(config.interval), true);
        assert.deepEqual(getMonsterData(config.monsterDataId)?.challengePattern, {
            handler: config.handlerId,
            initialDelay: config.initialDelay,
            interval: { ...config.interval },
        });
        assert.equal(hasMonsterChallengePattern(config.handlerId), true);
    }
});

test('세 역할 파훼는 각자 요구한 행동만 수집하고 마지막 조건 즉시 보스를 노출한다', () => {
    const cases = [
        {
            monsterDataId: 'nebula_sovereign',
            irrelevant: BossRoleBreakRequirement.TAUNT,
        },
        {
            monsterDataId: 'zero_hour_queen',
            irrelevant: BossRoleBreakRequirement.DEFENSE_REDUCTION,
        },
        {
            monsterDataId: 'last_constellation',
            irrelevant: undefined,
        },
    ] as const;

    cases.forEach(({ monsterDataId, irrelevant }, index) => {
        const config = getConfig(monsterDataId);
        const target = new RoleBreakTarget(96_100 + index);
        const monster = new Monster(monsterDataId, TEST_LOCATION_ID);
        startRoleBreak(monster, target, config);

        if (irrelevant) {
            satisfyRequirement(monster, target, irrelevant);
            assert.equal(monster.getDamageReceivedModifier(), config.wardMultiplier);
        }
        for (const requirement of config.requirements.slice(0, -1)) {
            satisfyRequirement(monster, target, requirement);
            assert.equal(monster.getDamageReceivedModifier(), config.wardMultiplier);
        }

        satisfyRequirement(monster, target, config.requirements.at(-1)!);
        assert.equal(monster.isChallengePatternActive, true);
        assert.equal(monster.getDamageReceivedModifier(), config.vulnerabilityMultiplier);

        monster.update(config.vulnerabilityDuration - 0.25);
        assert.equal(monster.getDamageReceivedModifier(), config.vulnerabilityMultiplier);
        monster.update(0.5);
        assert.equal(monster.isChallengePatternActive, false);
        assert.equal(monster.getDamageReceivedModifier(), 1);
    });
});

test('역할 파훼 제한시간이 끝나면 참여자 전원만 최대 생명력 비율 고정 피해를 받는다', () => {
    const config = getConfig('last_constellation');
    const leader = new RoleBreakTarget(96_201, '파티장');
    const member = new RoleBreakTarget(96_202, '파티원');
    const outsider = new RoleBreakTarget(96_203, '비참여자');
    const awayParticipant = new RoleBreakTarget(96_204, '다른 장소 참여자', AWAY_LOCATION_ID);
    const deadParticipant = new RoleBreakTarget(96_205, '사망한 참여자');
    const offlineParticipant = new RoleBreakTarget(96_206, '오프라인 참여자');
    [leader, member, outsider, awayParticipant, deadParticipant].forEach(registerTarget);
    deadParticipant.onDeath();

    const monster = new RaidTestMonster(config.monsterDataId, [
        member.userId,
        awayParticipant.userId,
        deadParticipant.userId,
        offlineParticipant.userId,
    ]);
    startRoleBreak(monster, leader, config);
    const lifeBefore = new Map([
        [leader.userId, leader.life],
        [member.userId, member.life],
        [outsider.userId, outsider.life],
        [awayParticipant.userId, awayParticipant.life],
    ]);

    monster.update(config.duration);

    assert.equal(leader.life, lifeBefore.get(leader.userId)! - leader.maxLife * config.failureLifeRatio);
    assert.equal(member.life, lifeBefore.get(member.userId)! - member.maxLife * config.failureLifeRatio);
    assert.equal(outsider.life, lifeBefore.get(outsider.userId));
    assert.equal(awayParticipant.life, lifeBefore.get(awayParticipant.userId));
    assert.equal(leader.damageCalls, 1);
    assert.equal(member.damageCalls, 1);
    assert.equal(outsider.damageCalls, 0);
    assert.equal(awayParticipant.damageCalls, 0);
    assert.equal(deadParticipant.damageCalls, 0);
    assert.equal(offlineParticipant.damageCalls, 0);
    assert.equal(monster.isChallengePatternActive, false);
    assert.equal(monster.getDamageReceivedModifier(), 1);
});

test('역할 파훼는 보스 사망·부활과 대상 이탈 때 구독 및 피해 배율을 남기지 않는다', () => {
    const config = getConfig('last_constellation');
    const target = new RoleBreakTarget(96_301);
    const monster = new Monster(config.monsterDataId, TEST_LOCATION_ID);
    startRoleBreak(monster, target, config);
    for (const requirement of config.requirements) satisfyRequirement(monster, target, requirement);
    assert.equal(monster.getDamageReceivedModifier(), config.vulnerabilityMultiplier);

    // 경량 Entity fixture를 실제 전리품 수령 Player로 캐스팅하지 않도록 보상 판정만 끈다.
    target.playerEnabled = false;
    monster.onDeath();
    assert.equal(monster.isChallengePatternActive, false);
    assert.equal(monster.getDamageReceivedModifier(), 1);
    emitGameEvent(GameEventIds.MONSTER_TAUNTED, { actor: target, subject: monster });
    assert.equal(monster.getDamageReceivedModifier(), 1);

    monster.respawn();
    target.playerEnabled = true;
    startRoleBreak(monster, target, config);
    assert.equal(monster.getDamageReceivedModifier(), config.wardMultiplier);
    target.locationId = AWAY_LOCATION_ID;
    monster.update(0.1);
    assert.equal(monster.isChallengePatternActive, false);
    assert.equal(monster.getDamageReceivedModifier(), 1);
    emitGameEvent(GameEventIds.STATUS_EFFECT_APPLIED, {
        actor: target,
        subject: monster,
        data: { effectId: 'defense_reduction' },
    });
    assert.equal(monster.getDamageReceivedModifier(), 1);
});

test('기존 세 회피 패턴은 역할 파훼 추가 후에도 등록되고 실제 미니게임을 시작한다', () => {
    for (const handlerId of [
        'crystal:cave-in',
        'ironroot:resonance-storm',
        'astral:crossfire',
    ]) {
        assert.equal(hasMonsterChallengePattern(handlerId), true);
    }

    const target = new RoleBreakTarget(96_401);
    const monster = new Monster('crystal_vein_overlord', TEST_LOCATION_ID);
    monster.acquireCombatTarget(target);
    assert.equal(monster.recordThreat(target, ThreatAction.ATTACK, 1), true);
    if (monster.isBossIntroActive) monster.update(10);
    monster.update(8.1);

    assert.equal(monster.isChallengePatternActive, true);
    assert.equal(hasActiveMiniGame(target.userId), true);
    assert.equal(cancelMiniGame(target.userId, '호환성 테스트 종료'), true);
    assert.equal(hasActiveMiniGame(target.userId), false);
});
