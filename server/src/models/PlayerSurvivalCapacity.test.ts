import assert from 'node:assert/strict';
import test from 'node:test';
import {
    calculateLevelSurvivalCapacityBonus,
    LEVEL_SURVIVAL_CAPACITY_PER_LEVEL,
} from './Player.js';
import Player from './Player.js';
import Attribute from './Attribute.js';

test('최대 배고픔과 수분은 Lv.1 기본치 이후 레벨마다 1씩 증가한다', () => {
    assert.equal(LEVEL_SURVIVAL_CAPACITY_PER_LEVEL, 1);
    assert.equal(calculateLevelSurvivalCapacityBonus(1), 0);
    assert.equal(calculateLevelSurvivalCapacityBonus(2), 1);
    assert.equal(calculateLevelSurvivalCapacityBonus(200), 199);
    assert.equal(calculateLevelSurvivalCapacityBonus(500), 499);
});

test('잘못된 레벨은 생존 자원 최대치 보너스를 만들지 않는다', () => {
    assert.equal(calculateLevelSurvivalCapacityBonus(0), 0);
    assert.equal(calculateLevelSurvivalCapacityBonus(-10), 0);
    assert.equal(calculateLevelSurvivalCapacityBonus(Number.NaN), 0);
    assert.equal(calculateLevelSurvivalCapacityBonus(Number.POSITIVE_INFINITY), 0);
});

test('Player 레벨을 바꾸면 생존 자원 최대치를 교체하고 감소한 최대치로 현재값을 보정한다', () => {
    const player = Object.create(Player.prototype) as Player;
    const shell = player as unknown as Record<string, unknown>;
    shell._level = 1;
    shell._thirsty = 250;
    shell._hungry = 250;
    shell._life = 100;
    shell._mentality = 100;
    shell._dirty = false;
    shell.attribute = new Attribute({
        maxLife: 100,
        maxMentality: 100,
        maxThirsty: 100,
        maxHungry: 100,
    });

    player.level = 200;
    assert.equal(player.maxThirsty, 299);
    assert.equal(player.maxHungry, 299);
    assert.equal(player.thirsty, 250, '최대치가 늘어도 현재 수분을 자동 회복하지 않는다.');
    assert.equal(player.hungry, 250, '최대치가 늘어도 현재 배고픔을 자동 회복하지 않는다.');

    player.level = 2;
    assert.equal(player.maxThirsty, 101);
    assert.equal(player.maxHungry, 101);
    assert.equal(player.thirsty, 101);
    assert.equal(player.hungry, 101);
});
