import assert from 'node:assert/strict';
import test from 'node:test';
import { PartyManager, calculatePartyExpGrant } from './party.js';
import type { PartyParticipant } from './party.js';

class FakePlayer implements PartyParticipant {
    life = 100;
    maxLife = 100;
    mentality = 50;
    maxMentality = 50;
    isDefeated = false;
    maxExp = 1_000;
    gainedExp = 0;

    constructor(
        readonly userId: number,
        readonly name: string,
        readonly level: number,
        readonly locationId = 'field',
    ) {}

    gainExp(amount: number): number[] {
        this.gainedExp += amount;
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
    assert.equal(manager.kick(member, leader).success, false);
    assert.equal(manager.kick(leader, member).success, true);
    assert.equal(manager.getParty(leader), undefined);
    assert.equal(manager.getParty(member), undefined);
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

test('몬스터 경험치는 같은 장소의 생존 파티원에게 레벨 차이 감쇠 후 지급된다', () => {
    const level40 = new FakePlayer(1, 'Lv40', 40);
    const level30 = new FakePlayer(2, 'Lv30', 30);
    const level20 = new FakePlayer(3, 'Lv20', 20);
    const level10 = new FakePlayer(4, 'Lv10', 10);
    const remote = new FakePlayer(5, '원격', 40, 'town');
    const { manager } = fixture(level40, level30, level20, level10, remote);

    for (const [index, member] of [level30, level20, level10, remote].entries()) {
        manager.invite(level40, member, 1_000 + index * 2);
        manager.accept(member, 1_001 + index * 2);
    }

    const grants = manager.distributeMonsterExp(level40, 100, 'field');
    assert.deepEqual(grants.map(grant => [grant.userId, grant.amount]), [
        [level40.userId, 100],
        [level30.userId, 50],
        [level20.userId, 20],
        [level10.userId, 10],
    ]);
    assert.equal(remote.gainedExp, 0);
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
