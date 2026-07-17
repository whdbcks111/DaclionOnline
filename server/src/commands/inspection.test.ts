import assert from 'node:assert/strict';
import test from 'node:test';
import Attribute from '../models/Attribute.js';
import Equipment from '../models/Equipment.js';
import Inventory from '../models/Inventory.js';
import { defineItem, Item } from '../models/Item.js';
import Monster, { defineMonster } from '../models/Monster.js';
import type Player from '../models/Player.js';
import Stat, { StatType } from '../models/Stat.js';
import {
    getItemInspectionTier,
    getMonsterInspectionTier,
    getSensibilityRequirementReason,
    resolveItemInspectionTarget,
} from './inspection.js';

defineItem({
    id: 'inspection_test_potion',
    name: '감정 시험 물약',
    description: '시험용 물약',
    category: 'consumable',
    weight: 0.2,
    stackable: true,
    maxStack: 20,
    baseMetadata: { power: 10 },
    onUse: null,
    equipSlot: null,
    modifiers: null,
    baseDurability: null,
    tags: ['property:water'],
});

defineItem({
    id: 'inspection_test_sword',
    name: '감정 시험 검',
    description: '시험용 검',
    category: 'weapon',
    weight: 2,
    stackable: false,
    maxStack: 1,
    baseMetadata: null,
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [{ attribute: 'atk', op: 'add', value: 5, source: 'item' }],
    baseDurability: 30,
    tags: ['item:weapon'],
});

function createPlayer(): Player {
    const inventory = Inventory.createEmpty(99001, 100);
    inventory.addItem('inspection_test_potion', 2);
    const equipment = Equipment.createEmpty();
    equipment.equip(
        'mainHand',
        new Item('inspection_test_sword', 1, 20, null),
        new Attribute(),
    );
    return {
        inventory,
        equipment,
        stat: new Stat({ sensibility: 49 }),
    } as Player;
}

test('감각 단계는 감정과 몬스터 정보의 공개 범위를 순차적으로 연다', () => {
    assert.equal(getItemInspectionTier(49), 0);
    assert.equal(getItemInspectionTier(50), 1);
    assert.equal(getItemInspectionTier(75), 2);
    assert.equal(getItemInspectionTier(100), 3);
    assert.equal(getMonsterInspectionTier(99), 0);
    assert.equal(getMonsterInspectionTier(100), 1);
    assert.equal(getMonsterInspectionTier(125), 2);
    assert.equal(getMonsterInspectionTier(150), 3);
});

test('감각 요구 조건과 인벤토리·장착칸 감정 대상을 공개 API로 판정한다', () => {
    const player = createPlayer();
    assert.match(getSensibilityRequirementReason(player, 50) ?? '', /필요: 50, 현재: 49/);
    player.stat.set(StatType.SENSIBILITY, 50);
    assert.equal(getSensibilityRequirementReason(player, 50), undefined);

    assert.equal(resolveItemInspectionTarget(player, '1')?.item.itemDataId, 'inspection_test_potion');
    assert.equal(resolveItemInspectionTarget(player, '손')?.item.itemDataId, 'inspection_test_sword');
    assert.equal(resolveItemInspectionTarget(player, '주무기')?.sourceLabel, '손');
    assert.equal(resolveItemInspectionTarget(player, '999'), undefined);
});

test('아이템과 몬스터 감정 스냅샷은 설명과 전투 정보를 복제해 제공한다', () => {
    const player = createPlayer();
    const item = resolveItemInspectionTarget(player, '손')!.item;
    const itemSnapshot = item.getInspectionSnapshot();
    assert.equal(itemSnapshot.description, '시험용 검');
    assert.equal(itemSnapshot.durability, 20);
    assert.equal(itemSnapshot.modifiers[0].attribute, 'atk');

    defineMonster({
        id: 'inspection_test_monster',
        name: '감정 시험 몬스터',
        description: '감각으로 분석할 수 있는 시험 몬스터.',
        level: 10,
        exp: 0,
        baseAttribute: { maxLife: 200, atk: 30 },
        drops: [{ itemDataId: 'inspection_test_potion', minCount: 1, maxCount: 2, chance: 0.5 }],
        expReward: 100,
        goldReward: { min: 10, max: 20 },
        equipments: [],
        attack: { damageType: 'magic' },
        tags: ['property:water'],
    });
    const monsterSnapshot = new Monster('inspection_test_monster').getInspectionSnapshot();
    assert.equal(monsterSnapshot.description, '감각으로 분석할 수 있는 시험 몬스터.');
    assert.equal(monsterSnapshot.attributes.maxLife, 200);
    assert.equal(monsterSnapshot.attack?.damageType, 'magic');
    assert.equal(monsterSnapshot.drops[0].chance, 0.5);
});
