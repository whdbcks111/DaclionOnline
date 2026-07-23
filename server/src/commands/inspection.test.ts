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
    buildItemInspection,
    buildMonsterInspection,
    getItemInspectionTier,
    getMonsterInspectionTier,
    getSensibilityRequirementReason,
    resolveItemInspectionTarget,
} from './inspection.js';
import { buildAffinityMessage } from './affinity.js';
import '../data/tagEffects.js';

function collectRenderedText(value: unknown): string {
    if (Array.isArray(value)) return value.map(collectRenderedText).join('');
    if (!value || typeof value !== 'object') return '';
    const record = value as Record<string, unknown>;
    return (typeof record.text === 'string' ? record.text : '')
        + Object.entries(record)
            .filter(([key]) => key !== 'text')
            .map(([, child]) => collectRenderedText(child))
            .join('');
}

defineItem({
    id: 'inspection_test_potion',
    name: '감정 시험 물약',
    description: '시험용 물약',
    category: 'consumable',
    weight: 0.2,
    stackable: true,
    maxStack: 20,
    baseMetadata: { amount: 10 },
    onUse: 'heal_hp',
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

    const monsterSnapshot = new Monster('inspection_test_monster').getInspectionSnapshot();
    assert.equal(monsterSnapshot.description, '감각으로 분석할 수 있는 시험 몬스터.');
    assert.equal(monsterSnapshot.attributes.maxLife, 200);
    assert.equal(monsterSnapshot.attack?.damageType, 'magic');
    assert.equal(monsterSnapshot.drops[0].chance, 0.5);
});

test('감정 결과는 같은 능력치의 고정값과 비율 modifier를 한 줄로 합친다', () => {
    const item = new Item('inspection_test_sword', 1, 20, {
        instanceModifiers: [
            { attribute: 'armorPen', op: 'add', value: 4 },
            { attribute: 'armorPen', op: 'add', value: 14 },
            { attribute: 'armorPen', op: 'multiply', value: 1.1 },
            { attribute: 'armorPen', op: 'multiply', value: 1.2 },
        ],
    });
    const text = collectRenderedText(buildItemInspection(item.getInspectionSnapshot(), '인벤토리 1번', 100));

    assert.equal(text.match(/물리 관통력/g)?.length, 1);
    assert.match(text, /\+18 \+32%/);
    assert.doesNotMatch(text, /\+110%|\+120%/);
});

test('사용자용 감정·몬스터정보·속성표에는 내부 ID, raw 태그와 metadata key가 노출되지 않는다', () => {
    const player = createPlayer();
    const item = resolveItemInspectionTarget(player, '1')!.item;
    const itemText = collectRenderedText(buildItemInspection(item.getInspectionSnapshot(), '인벤토리 1번', 100));
    assert.doesNotMatch(itemText, /inspection_test_potion|property:water|아이템 ID|식별 태그|메타데이터|amount/);
    assert.match(itemText, /생명력 10 회복/);
    assert.match(itemText, /0\.4kg \(0\.2kg × 2\)/);

    const monster = new Monster('inspection_test_monster');
    const monsterText = collectRenderedText(buildMonsterInspection(monster, 1, 150));
    assert.doesNotMatch(monsterText, /inspection_test_monster|property:water|식별 태그/);
    assert.match(monsterText, /감정 시험 몬스터/);

    const affinityText = collectRenderedText(buildAffinityMessage());
    assert.doesNotMatch(affinityText, /property:|trait:/);
    assert.match(affinityText, /불|물/);
});
