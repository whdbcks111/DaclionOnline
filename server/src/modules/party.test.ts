import assert from 'node:assert/strict';
import test from 'node:test';
import {
    PartyManager,
    allocateContributionWeightedExp,
    calculatePartyExpGrant,
    calculatePartyExpPool,
} from './party.js';
import type { PartyExperienceGainOptions, PartyParticipant } from './party.js';

class FakePlayer implements PartyParticipant {
    life = 100;
    maxLife = 100;
    mentality = 50;
    maxMentality = 50;
    isDefeated = false;
    maxExp = 1_000;
    gainedExp = 0;
    lastGainOptions: PartyExperienceGainOptions | undefined;
    experienceGainModifier = 1;

    constructor(
        readonly userId: number,
        readonly name: string,
        readonly level: number,
        readonly locationId = 'field',
    ) {}

    getExperienceGainModifier(): number { return this.experienceGainModifier; }

    gainExp(amount: number, options?: PartyExperienceGainOptions): number[] {
        this.gainedExp += Math.floor(amount * this.experienceGainModifier);
        this.lastGainOptions = options;
        return [];
    }
}

function fixture(...players: FakePlayer[]) {
    const byId = new Map(players.map(player => [player.userId, player]));
    return { manager: new PartyManager(userId => byId.get(userId)), byId };
}

test('초대를 수락하면 초대자가 파티장이 되고 파티장만 강퇴할 수 있다', () => {
    const leader = new FakePlayer(1, '리더', 20);
    const member = new FakePlayer(2, '파티원', 18);
    const { manager } = fixture(leader, member);

    assert.equal(manager.invite(leader, member, 1_000).success, true);
    assert.equal(manager.accept(member, 1_001).success, true);
    assert.equal(manager.getParty(leader)?.leaderUserId, leader.userId);
    assert.equal(manager.areInSameParty(leader.userId, member.userId), true);
    assert.equal(manager.kick(member, leader).success, false);
    assert.equal(manager.kick(leader, member).success, true);
    assert.equal(manager.areInSameParty(leader.userId, member.userId), false);
    assert.equal(manager.getParty(leader), undefined);
    assert.equal(manager.getParty(member), undefined);
});

test('파티 이벤트 audience는 파티 전체를 복사해 반환하고 솔로는 본인만 반환한다', () => {
    const leader = new FakePlayer(1, '리더', 20);
    const member = new FakePlayer(2, '파티원', 18);
    const { manager } = fixture(leader, member);

    assert.deepEqual(manager.getEventAudienceUserIds(leader.userId), [leader.userId]);
    manager.invite(leader, member, 1_000);
    manager.accept(member, 1_001);

    const audience = manager.getEventAudienceUserIds(leader.userId);
    audience.length = 0;
    assert.deepEqual(manager.getEventAudienceUserIds(member.userId), [leader.userId, member.userId]);
});

test('파티장이 나가면 남은 가입 순서의 첫 파티원에게 파티장이 이전된다', () => {
    const leader = new FakePlayer(1, '리더', 20);
    const first = new FakePlayer(2, '첫째', 19);
    const second = new FakePlayer(3, '둘째', 18);
    const { manager } = fixture(leader, first, second);

    manager.invite(leader, first, 1_000);
    manager.accept(first, 1_001);
    manager.invite(leader, second, 1_002);
    manager.accept(second, 1_003);
    manager.leave(leader);

    assert.equal(manager.getParty(first)?.leaderUserId, first.userId);
    assert.deepEqual(manager.getParty(first)?.memberUserIds, [first.userId, second.userId]);
});

test('몬스터 경험치는 claim 안의 양수 기여·온라인·동일 장소·생존 인원에게만 지급된다', () => {
    const level40 = new FakePlayer(1, 'Lv40', 40);
    const level30 = new FakePlayer(2, 'Lv30', 30);
    level30.experienceGainModifier = 1.5;
    const zero = new FakePlayer(3, '무기여', 20);
    const defeated = new FakePlayer(4, '사망', 50);
    defeated.isDefeated = true;
    const remote = new FakePlayer(5, '원격', 60, 'town');
    const unclaimed = new FakePlayer(6, '후발 가입', 100);
    const offline = new FakePlayer(7, '오프라인', 70);
    const { manager } = fixture(level40, level30, zero, defeated, remote, unclaimed);

    const grants = manager.distributeMonsterExp(100, 'field', {
        claimedUserIds: [level40.userId, level30.userId, zero.userId, defeated.userId, remote.userId, offline.userId],
        contributions: [
            { userId: level40.userId, total: 60 },
            { userId: level30.userId, total: 30 },
            { userId: defeated.userId, total: 90 },
            { userId: remote.userId, total: 90 },
            { userId: offline.userId, total: 90 },
            { userId: unclaimed.userId, total: 10_000 },
        ],
        lastAttackOwnerUserId: zero.userId,
    });
    assert.deepEqual(grants.map(grant => [
        grant.userId,
        grant.poolShare,
        grant.levelAdjustedShare,
        grant.grantedExp,
    ]), [
        [level40.userId, 76, 76, 76],
        [level30.userId, 44, 22, 33],
    ]);
    assert.equal(grants[0]?.contributionRatio, 2 / 3);
    assert.equal(grants[1]?.contributionRatio, 1 / 3);
    assert.equal(grants[1]?.levelGapMultiplier, 0.5);
    assert.equal(level40.gainedExp, 76);
    assert.equal(level30.gainedExp, 33);
    assert.equal(zero.gainedExp, 0);
    assert.equal(defeated.gainedExp, 0);
    assert.equal(remote.gainedExp, 0);
    assert.equal(unclaimed.gainedExp, 0);
    assert.equal(offline.gainedExp, 0);
    assert.equal(
        [level40, level30].every(player => player.lastGainOptions?.protectFromPendingDeathPenalty),
        true,
        '처치 경험치는 바로 이어지는 사망 패널티에서 보호되어야 한다.',
    );
});

test('양수 기여가 전혀 없을 때만 claim 안의 유효한 마지막 공격자를 fallback으로 쓴다', () => {
    const fallback = new FakePlayer(1, '막타', 20);
    const positiveButOffline = new FakePlayer(2, '오프라인 기여자', 20);
    const { manager } = fixture(fallback);

    const grants = manager.distributeMonsterExp(100, 'field', {
        claimedUserIds: [fallback.userId],
        contributions: [],
        lastAttackOwnerUserId: fallback.userId,
    });
    assert.deepEqual(grants.map(grant => [grant.userId, grant.poolShare, grant.contributionRatio]), [
        [fallback.userId, 100, 1],
    ]);

    const blockedFallback = manager.distributeMonsterExp(100, 'field', {
        claimedUserIds: [fallback.userId, positiveButOffline.userId],
        contributions: [{ userId: positiveButOffline.userId, total: 1 }],
        lastAttackOwnerUserId: fallback.userId,
    });
    assert.deepEqual(blockedFallback, []);
});

test('다른 장소에서 실제 DoT 막타를 낸 생존 플레이어는 현장 지급 대상이 없을 때 솔로 경험치를 받는다', () => {
    const remoteLethal = new FakePlayer(1, '원격 지속 피해 막타', 20, 'town');
    const { manager } = fixture(remoteLethal);

    const grants = manager.distributeMonsterExp(100, 'field', {
        claimedUserIds: [remoteLethal.userId],
        contributions: [{ userId: remoteLethal.userId, total: 100 }],
        actualLethalUserId: remoteLethal.userId,
    });

    assert.deepEqual(grants.map(grant => [grant.userId, grant.poolShare, grant.contributionRatio]), [
        [remoteLethal.userId, 100, 1],
    ]);
    assert.equal(remoteLethal.gainedExp, 100);
});

test('현장 기여자가 있으면 원격 실제 막타자를 추가하지 않고 하나의 경험치 풀만 분배한다', () => {
    const local = new FakePlayer(1, '현장 기여자', 20, 'field');
    const remoteLethal = new FakePlayer(2, '원격 지속 피해 막타', 20, 'town');
    const { manager } = fixture(local, remoteLethal);

    const grants = manager.distributeMonsterExp(100, 'field', {
        claimedUserIds: [local.userId, remoteLethal.userId],
        contributions: [
            { userId: local.userId, total: 10 },
            { userId: remoteLethal.userId, total: 90 },
        ],
        actualLethalUserId: remoteLethal.userId,
    });

    assert.deepEqual(grants.map(grant => [grant.userId, grant.poolShare]), [[local.userId, 100]]);
    assert.equal(local.gainedExp, 100);
    assert.equal(remoteLethal.gainedExp, 0);
});

test('실제 막타 원인은 이후 0피해 현장 공격자 fallback보다 우선한다', () => {
    const remoteLethal = new FakePlayer(1, '실제 원격 막타', 20, 'town');
    const zeroDamageLocal = new FakePlayer(2, '0피해 현장 공격자', 20, 'field');
    const { manager } = fixture(remoteLethal, zeroDamageLocal);

    const grants = manager.distributeMonsterExp(100, 'field', {
        claimedUserIds: [remoteLethal.userId, zeroDamageLocal.userId],
        contributions: [],
        lastAttackOwnerUserId: zeroDamageLocal.userId,
        actualLethalUserId: remoteLethal.userId,
    });

    assert.deepEqual(grants.map(grant => grant.userId), [remoteLethal.userId]);
    assert.equal(remoteLethal.gainedExp, 100);
    assert.equal(zeroDamageLocal.gainedExp, 0);
});

test('파티 경험치 풀은 유효 인원 한 명당 20%씩 늘고 솔로 보상은 그대로다', () => {
    assert.equal(calculatePartyExpPool(100, 0), 0);
    assert.equal(calculatePartyExpPool(100, 1), 100);
    assert.equal(calculatePartyExpPool(100, 2), 120);
    assert.equal(calculatePartyExpPool(100, 3), 140);
    assert.equal(calculatePartyExpPool(Number.NaN, 3), 0);
});

test('Hamilton 분배는 20% 균등 + 80% 기여 가중과 확정 tie-break를 따른다', () => {
    const equal = allocateContributionWeightedExp(10, [
        { userId: 1, contribution: 1 },
        { userId: 2, contribution: 1 },
        { userId: 3, contribution: 1 },
    ]);
    assert.deepEqual(equal.map(entry => entry.poolShare), [4, 3, 3]);

    const twoToOne = allocateContributionWeightedExp(100, [
        { userId: 1, contribution: 2 },
        { userId: 2, contribution: 1 },
    ]);
    assert.deepEqual(twoToOne.map(entry => entry.poolShare), [63, 37]);

    const tiedRemainders = allocateContributionWeightedExp(100, [
        { userId: 1, contribution: 2 },
        { userId: 2, contribution: 1 },
        { userId: 3, contribution: 1 },
    ]);
    assert.deepEqual(tiedRemainders.map(entry => entry.poolShare), [47, 27, 26]);
});

test('Hamilton 분배는 중복 userId를 합치고 invalid 기여를 버리며 항상 풀 총합을 보존한다', () => {
    const shares = allocateContributionWeightedExp(101, [
        { userId: 2, contribution: 1 },
        { userId: 1, contribution: 1 },
        { userId: 1, contribution: 2 },
        { userId: 3, contribution: 0 },
        { userId: 4, contribution: Number.NaN },
        { userId: 1.5, contribution: 100 },
    ]);
    assert.deepEqual(shares.map(entry => [entry.userId, entry.contribution]), [[1, 3], [2, 1]]);
    assert.equal(shares.reduce((sum, entry) => sum + entry.poolShare, 0), 101);
    for (let pool = 0; pool < 50; pool++) {
        const allocated = allocateContributionWeightedExp(pool, [
            { userId: 9, contribution: 7 },
            { userId: 3, contribution: 5 },
            { userId: 6, contribution: 2 },
        ]);
        assert.equal(allocated.reduce((sum, entry) => sum + entry.poolShare, 0), pool);
    }
});

test('30레벨 이상 차이는 10% 감쇠와 다음 레벨 요구 경험치 10% 상한을 모두 적용한다', () => {
    assert.deepEqual(calculatePartyExpGrant(10_000, 30, 500), { amount: 50, multiplier: 0.1 });
    assert.deepEqual(calculatePartyExpGrant(100, 9, 500), { amount: 100, multiplier: 1 });
});

test('파티 초대는 만료되고 파티 최대 인원은 5명이다', () => {
    const players = Array.from({ length: 6 }, (_, index) => new FakePlayer(index + 1, `P${index + 1}`, 10));
    const [leader, ...members] = players;
    const { manager } = fixture(...players);

    manager.invite(leader, members[0], 1_000);
    assert.equal(manager.accept(members[0], 61_001).success, false);

    for (const [index, member] of members.slice(0, 4).entries()) {
        manager.invite(leader, member, 100_000 + index * 2);
        assert.equal(manager.accept(member, 100_001 + index * 2).success, true);
    }
    assert.equal(manager.invite(leader, members[4], 200_000).success, false);
});
