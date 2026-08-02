import assert from 'node:assert/strict';
import test from 'node:test';
import { GameTags } from '../../../shared/tags.js';
import { getItemData, MAX_STACKABLE_ITEM_COUNT } from '../models/Item.js';
import { getAllMonsterData, getMonsterData } from '../models/Monster.js';
import { MonsterRank, MonsterStatProfile } from '../models/MonsterStats.js';
import './items.js';
import {
    defineWorldMonster,
    MASTERY_ESSENCE_ITEM_ID,
} from './monsters.js';
import './ascendantFrontier.js';

const HIGH_BOSS_ID = 'test_mastery_essence_high_boss';
const LOW_BOSS_ID = 'test_mastery_essence_low_boss';

defineWorldMonster({
    id: HIGH_BOSS_ID,
    name: '숙련 정수 고레벨 경계 시험체',
    description: '중복 숙련 정수 드롭 정규화를 검증한다.',
    level: 400,
    statProfile: MonsterStatProfile.BRUISER,
    drops: [
        { itemDataId: 'gold_ore', minCount: 2, maxCount: 3, chance: 0.4 },
        { itemDataId: MASTERY_ESSENCE_ITEM_ID, minCount: 2, maxCount: 4, chance: 0.2 },
        { itemDataId: MASTERY_ESSENCE_ITEM_ID, minCount: 3, maxCount: 3, chance: 0.5 },
    ],
    goldReward: 0,
    tags: [GameTags.ENTITY_BOSS],
});

defineWorldMonster({
    id: LOW_BOSS_ID,
    name: '숙련 정수 저레벨 경계 시험체',
    description: 'Lv.399 자동 드롭 제외를 검증한다.',
    level: 399,
    statProfile: MonsterStatProfile.BRUISER,
    drops: [{ itemDataId: 'gold_ore', minCount: 1, maxCount: 1, chance: 0.4 }],
    goldReward: 0,
    tags: [GameTags.ENTITY_BOSS],
});

test('숙련의 정수는 가볍게 쌓이는 비사용 재료로 등록된다', () => {
    const item = getItemData(MASTERY_ESSENCE_ITEM_ID);

    assert.equal(item?.name, '숙련의 정수');
    assert.equal(item?.image, 'items/mastery_essence');
    assert.equal(item?.category, '재료');
    assert.equal(item?.weight, 0.1);
    assert.equal(item?.stackable, true);
    assert.equal(item?.maxStack, MAX_STACKABLE_ITEM_COUNT);
    assert.equal(item?.onUse, null);
    assert.equal(item?.equipSlot, null);
});

test('Lv.400 이상 BOSS는 현재와 미래 정의 모두 숙련의 정수를 정확히 하나 확정 드롭한다', () => {
    const highBosses = getAllMonsterData()
        .filter(monster => monster.statRank === MonsterRank.BOSS && monster.level >= 400);

    assert.ok(highBosses.length > 1);
    for (const boss of highBosses) {
        const essenceDrops = boss.drops
            .filter(drop => drop.itemDataId === MASTERY_ESSENCE_ITEM_ID);
        assert.deepEqual(essenceDrops, [{
            itemDataId: MASTERY_ESSENCE_ITEM_ID,
            minCount: 1,
            maxCount: 1,
            chance: 1,
        }], boss.id);
    }

    assert.equal(getMonsterData(HIGH_BOSS_ID)?.statRank, MonsterRank.BOSS);
    assert.deepEqual(
        getMonsterData(HIGH_BOSS_ID)?.drops.filter(drop => drop.itemDataId !== MASTERY_ESSENCE_ITEM_ID),
        [{ itemDataId: 'gold_ore', minCount: 2, maxCount: 3, chance: 0.4 }],
    );
});

test('Lv.399 이하 BOSS에는 숙련의 정수가 자동 추가되지 않는다', () => {
    const lowBosses = getAllMonsterData()
        .filter(monster => monster.statRank === MonsterRank.BOSS && monster.level <= 399);

    assert.ok(lowBosses.length > 1);
    assert.ok(lowBosses.every(boss =>
        boss.drops.every(drop => drop.itemDataId !== MASTERY_ESSENCE_ITEM_ID)));
    assert.equal(getMonsterData(LOW_BOSS_ID)?.statRank, MonsterRank.BOSS);
});
