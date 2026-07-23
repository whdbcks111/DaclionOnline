import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getKarmaDeathPenalty,
    getKarmaHeroReward,
    getPvpKarmaGain,
    KarmaAccessPolicy,
    KarmaRules,
    KarmaState,
    KarmaTier,
} from './Karma.js';

test('카르마는 저장 기준 시각에서 온라인·오프라인 시간을 같은 속도로 자연 감소시킨다', () => {
    const state = new KarmaState(25, 1_000);
    const oneHourLater = 1_000 + 60 * 60 * 1_000;
    assert.equal(state.getValueAt(oneHourLater), 25 - KarmaRules.DECAY_PER_SECOND * 3_600);

    const changed = state.add(10, oneHourLater);
    assert.equal(changed.before, 14.2);
    assert.equal(changed.value, 24.2);
    assert.equal(state.snapshot(oneHourLater).updatedAt.getTime(), oneHourLater);
});

test('카르마 단계와 시설 제한은 클래스형 enum 임계값을 공유한다', () => {
    assert.equal(KarmaTier.forValue(99.9), KarmaTier.TAINTED);
    assert.equal(KarmaTier.forValue(100), KarmaTier.NOTORIOUS);
    assert.equal(KarmaTier.forValue(300), KarmaTier.OUTLAW);
    assert.equal(KarmaTier.NOTORIOUS.marked, true);
    assert.equal(KarmaAccessPolicy.BENEVOLENT_QUEST.getDeniedReason(99.9), undefined);
    assert.match(KarmaAccessPolicy.BENEVOLENT_QUEST.getDeniedReason(100) ?? '', /의뢰/);
    assert.equal(KarmaAccessPolicy.LAWFUL_SHOP.getDeniedReason(299.9), undefined);
    assert.match(KarmaAccessPolicy.LAWFUL_SHOP.getDeniedReason(300) ?? '', /거래/);
    assert.equal(KarmaTier.forValue(99.96), KarmaTier.NOTORIOUS);
});

test('일반 플레이어 PVP는 지역별 카르마를 주고 현상 대상 처치는 영웅 보상으로 전환된다', () => {
    assert.equal(getPvpKarmaGain('neutral', 0), 25);
    assert.equal(getPvpKarmaGain('hostile', 0), 10);
    assert.equal(getPvpKarmaGain('neutral', 100), 0);
    assert.equal(getKarmaHeroReward(99.9), undefined);
    assert.deepEqual(getKarmaHeroReward(100), { level: 1, durationSeconds: 900 });
    assert.deepEqual(getKarmaHeroReward(1_000), { level: 5, durationSeconds: 3_600 });
});

test('악명 단계 사망은 레거시형 부활 지연과 추가 재화 손실·고정 카르마 감소를 계산한다', () => {
    assert.deepEqual(getKarmaDeathPenalty(99.9), {
        respawnSeconds: 0,
        experienceLossRate: 0,
        goldLossRate: 0,
        karmaReduction: 0,
    });
    const penalty = getKarmaDeathPenalty(100);
    assert.equal(penalty.respawnSeconds, 400);
    assert.equal(penalty.experienceLossRate, 0.06);
    assert.equal(penalty.goldLossRate, 0.045);
    assert.equal(penalty.karmaReduction, 15);
});
