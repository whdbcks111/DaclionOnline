import assert from 'node:assert/strict';
import test from 'node:test';
import {
    calculateMonsterBaseAttributes,
    inferMonsterStatProfile,
    MonsterRank,
    MonsterStatProfile,
} from './MonsterStats.js';

test('몬스터 스탯 프로필과 등급은 클래스형 enum 조회 API를 제공한다', () => {
    assert.equal(MonsterStatProfile.fromKey('caster'), MonsterStatProfile.CASTER);
    assert.equal(MonsterStatProfile.fromInput('기동형'), MonsterStatProfile.SKIRMISHER);
    assert.equal(MonsterRank.fromKey('field-boss'), MonsterRank.FIELD_BOSS);
    assert.equal(MonsterRank.fromInput('보스'), MonsterRank.BOSS);
});

test('같은 레벨에서도 역할과 체급에 따라 일관된 능력치 예산이 배분된다', () => {
    const bruiser = calculateMonsterBaseAttributes({
        level: 100,
        profile: MonsterStatProfile.BRUISER,
    });
    const caster = calculateMonsterBaseAttributes({
        level: 100,
        profile: MonsterStatProfile.CASTER,
    });
    const boss = calculateMonsterBaseAttributes({
        level: 100,
        profile: MonsterStatProfile.BRUISER,
        rank: MonsterRank.BOSS,
    });

    assert.ok((bruiser.atk ?? 0) > (caster.atk ?? 0));
    assert.ok((caster.magicForce ?? 0) > (bruiser.magicForce ?? 0));
    assert.ok((boss.maxLife ?? 0) >= (bruiser.maxLife ?? 0) * 7);
    assert.ok((boss.attackSpeed ?? 0) < (bruiser.attackSpeed ?? 0));
});

test('고유 가중치와 최종 오버라이드는 프로필을 복제하지 않고 개체 특성을 만든다', () => {
    const attributes = calculateMonsterBaseAttributes({
        level: 80,
        profile: MonsterStatProfile.TANK,
        weights: { maxLife: 1.2, magicDef: 0.8 },
        overrides: { speed: 0.42, critRate: 0 },
    });
    assert.equal(attributes.speed, 0.42);
    assert.equal(attributes.critRate, 0);
    assert.ok((attributes.maxLife ?? 0) > 0);
});

test('기존 마스터의 공격 방식과 능력치에서 점진 이전용 역할을 추론한다', () => {
    assert.equal(inferMonsterStatProfile({ atk: 100, magicForce: 150 }, 'magic'), MonsterStatProfile.CASTER);
    assert.equal(inferMonsterStatProfile({ atk: 100, speed: 2.2 }), MonsterStatProfile.SKIRMISHER);
    assert.equal(inferMonsterStatProfile({ atk: 100, def: 90 }), MonsterStatProfile.TANK);
    assert.equal(inferMonsterStatProfile({ atk: 100, def: 20 }), MonsterStatProfile.BRUISER);
});
