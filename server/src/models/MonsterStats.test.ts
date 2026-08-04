import assert from 'node:assert/strict';
import test from 'node:test';
import {
    calculateMonsterBaseAttributes,
    getMonsterOffensePressureScale,
    inferMonsterStatProfile,
    MonsterRank,
    MonsterStatProfile,
    normalizeMonsterDefenseForScale,
} from './MonsterStats.js';
import { calculateDefenseScale } from './Combat.js';

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
    assert.ok((boss.maxLife ?? 0) > (bruiser.maxLife ?? 0) * 6);
    assert.ok((boss.attackSpeed ?? 0) < (bruiser.attackSpeed ?? 0));
});

test('일반 몬스터 공격 압력은 후반 플레이어 성장선에 맞춰 낮아지고 보스 공격은 보존된다', () => {
    assert.ok(getMonsterOffensePressureScale(MonsterRank.NORMAL, 20) > 0.3);
    assert.ok(getMonsterOffensePressureScale(MonsterRank.ELITE, 180) > 0.2);
    assert.ok(getMonsterOffensePressureScale(MonsterRank.NORMAL, 500) < 0.07);
    assert.ok(getMonsterOffensePressureScale(MonsterRank.NORMAL, 1000) < 0.04);
    assert.equal(getMonsterOffensePressureScale(MonsterRank.FIELD_BOSS, 1000), 1);
    assert.equal(getMonsterOffensePressureScale(MonsterRank.BOSS, 1000), 1);

    let previous = 0;
    for (let level = 1; level <= 1000; level++) {
        const offense = calculateMonsterBaseAttributes({
            level,
            profile: MonsterStatProfile.BALANCED,
            rank: MonsterRank.NORMAL,
        }).atk ?? 0;
        assert.ok(offense >= previous, `Lv.${level}: ${offense} >= ${previous}`);
        previous = offense;
    }
    const level1200Offense = calculateMonsterBaseAttributes({
        level: 1200,
        profile: MonsterStatProfile.BALANCED,
        rank: MonsterRank.NORMAL,
    }).atk ?? 0;
    assert.ok(level1200Offense > previous);
});

test('표준 일반·보스 생명력은 고레벨 폭증을 제한하는 공용 곡선을 따른다', () => {
    const expected = [
        { level: 20, normal: 3_416, boss: 30_192 },
        { level: 50, normal: 14_300, boss: 116_688 },
        { level: 100, normal: 49_800, boss: 343_620 },
        { level: 200, normal: 191_300, boss: 1_078_932 },
        { level: 500, normal: 1_287_800, boss: 6_389_469 },
        { level: 1000, normal: 6_075_300, boss: 29_414_076 },
    ] as const;

    for (const sample of expected) {
        const normal = calculateMonsterBaseAttributes({
            level: sample.level,
            profile: MonsterStatProfile.BALANCED,
            rank: MonsterRank.NORMAL,
        }).maxLife;
        const boss = calculateMonsterBaseAttributes({
            level: sample.level,
            profile: MonsterStatProfile.BALANCED,
            rank: MonsterRank.BOSS,
        }).maxLife;
        const fieldBoss = calculateMonsterBaseAttributes({
            level: sample.level,
            profile: MonsterStatProfile.BALANCED,
            rank: MonsterRank.FIELD_BOSS,
        }).maxLife;

        assert.equal(normal, sample.normal, `Lv.${sample.level} 일반`);
        assert.equal(boss, sample.boss, `Lv.${sample.level} 보스`);
        assert.ok((fieldBoss ?? 0) < (boss ?? 0), `Lv.${sample.level} 필드 보스 < 보스`);
    }

    assert.ok(expected.at(-1)!.boss < 40_000_000);
    assert.ok(expected.at(-1)!.boss / expected.at(-2)!.boss < 5);
});

test('일반·필드 보스·보스 생명력은 Lv.1~1000에서 단조 증가한다', () => {
    const previous = new Map<MonsterRank, number>();
    for (let level = 1; level <= 1000; level++) {
        for (const rank of [MonsterRank.NORMAL, MonsterRank.FIELD_BOSS, MonsterRank.BOSS]) {
            const life = calculateMonsterBaseAttributes({
                level,
                profile: MonsterStatProfile.BALANCED,
                rank,
            }).maxLife ?? 0;
            assert.ok(life > (previous.get(rank) ?? 0), `${rank.label} Lv.${level}`);
            previous.set(rank, life);
        }
        assert.ok(
            (previous.get(MonsterRank.FIELD_BOSS) ?? 0) < (previous.get(MonsterRank.BOSS) ?? 0),
            `Lv.${level} 필드 보스 < 보스`,
        );
    }
});

test('고유 가중치와 최종 오버라이드는 프로필을 복제하지 않고 개체 특성을 만든다', () => {
    const attributes = calculateMonsterBaseAttributes({
        level: 80,
        profile: MonsterStatProfile.TANK,
        weights: { maxLife: 1.2, magicDef: 0.8 },
        overrides: { atk: 777, speed: 0.42, critRate: 0 },
    });
    assert.equal(attributes.atk, 777);
    assert.equal(attributes.speed, 0.42);
    assert.equal(attributes.critRate, 0);
    assert.ok((attributes.maxLife ?? 0) > 0);
});

test('고레벨 몬스터 방어 정규화는 새 척도에서도 기존 동레벨 피해 감소율을 보존한다', () => {
    for (const level of [1, 100, 200, 201, 350, 500, 1_000]) {
        const authoredDefense = 0.9 * level + 0.007 * level ** 2;
        const legacyScale = 100 + 2 * level + 0.005 * level ** 2;
        const normalizedDefense = normalizeMonsterDefenseForScale(level, authoredDefense);
        const legacyDamageRatio = legacyScale / (legacyScale + authoredDefense);
        const normalizedDamageRatio = calculateDefenseScale(level)
            / (calculateDefenseScale(level) + normalizedDefense);

        assert.ok(
            Math.abs(legacyDamageRatio - normalizedDamageRatio) < 1e-12,
            `Lv.${level}: ${legacyDamageRatio} !== ${normalizedDamageRatio}`,
        );
        if (level <= 200) assert.equal(normalizedDefense, authoredDefense);
    }
});

test('명시한 몬스터 방어·마법 방어 오버라이드도 같은 척도로 정규화한다', () => {
    const attributes = calculateMonsterBaseAttributes({
        level: 500,
        profile: MonsterStatProfile.TANK,
        overrides: { def: 900, magicDef: 700 },
    });

    assert.equal(attributes.def, normalizeMonsterDefenseForScale(500, 900));
    assert.equal(attributes.magicDef, normalizeMonsterDefenseForScale(500, 700));
});

test('기존 마스터의 공격 방식과 능력치에서 점진 이전용 역할을 추론한다', () => {
    assert.equal(inferMonsterStatProfile({ atk: 100, magicForce: 150 }, 'magic'), MonsterStatProfile.CASTER);
    assert.equal(inferMonsterStatProfile({ atk: 100, speed: 2.2 }), MonsterStatProfile.SKIRMISHER);
    assert.equal(inferMonsterStatProfile({ atk: 100, def: 90 }), MonsterStatProfile.TANK);
    assert.equal(inferMonsterStatProfile({ atk: 100, def: 20 }), MonsterStatProfile.BRUISER);
});
