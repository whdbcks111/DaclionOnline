import assert from 'node:assert/strict';
import test from 'node:test';
import Attribute from '../../models/core/Attribute.js';
import Equipment from '../../models/economy/Equipment.js';
import Inventory from '../../models/economy/Inventory.js';
import { defineItem, Item, MAX_STACKABLE_ITEM_COUNT } from '../../models/economy/Item.js';
import Monster, { defineMonster } from '../../models/actors/Monster.js';
import Player from '../../models/actors/Player.js';
import Stat, { StatType } from '../../models/core/Stat.js';
import {
    buildItemInspection,
    buildMonsterInspection,
    getItemInspectionTier,
    getMonsterInspectionTier,
    getSensibilityRequirementReason,
    resolveItemInspectionTarget,
} from './inspection.js';
import { buildAffinityMessage } from '../world/affinity.js';
import { createMonsterTargetAnalysis } from '../../models/combat/Inspection.js';
import { GameTags } from '../../../../shared/tags.js';
import '../../data/combat/tagEffects.js';

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
    maxStack: MAX_STACKABLE_ITEM_COUNT,
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

defineItem({
    id: 'inspection_test_upgrade_sword',
    name: '감정 시험 강화검',
    description: '교체 능력치 비교용 검',
    category: 'weapon',
    weight: 2,
    stackable: false,
    maxStack: 1,
    baseMetadata: null,
    onUse: null,
    equipSlot: 'mainHand',
    modifiers: [
        { attribute: 'atk', op: 'add', value: 12, source: 'item-template' },
        { attribute: 'def', op: 'add', value: -3, source: 'item-template' },
    ],
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
    const attribute = new Attribute();
    equipment.equip(
        'mainHand',
        new Item('inspection_test_sword', 1, 20, null),
        attribute,
    );
    return {
        inventory,
        equipment,
        attribute,
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

test('타게팅 HUD 몬스터 분석은 몬스터정보와 같은 감각 단계만 공개한다', () => {
    const monster = new Monster('inspection_test_monster');
    const hidden = createMonsterTargetAnalysis(monster, 99);
    const affinities = createMonsterTargetAnalysis(monster, 100);
    const combat = createMonsterTargetAnalysis(monster, 125);
    const rewards = createMonsterTargetAnalysis(monster, 150);

    assert.equal(hidden.affinities.length, 0);
    assert.equal(hidden.combatAttributes.length, 0);
    assert.equal(hidden.nextSensibility, 100);
    assert.ok(affinities.affinities.some(value => value.label === '물'));
    assert.equal(affinities.combatAttributes.length, 0);
    assert.ok(combat.combatAttributes.some(value => value.label === '공격력'));
    assert.equal(combat.dropNames.length, 0);
    assert.deepEqual(rewards.dropNames, ['감정 시험 물약']);
    assert.doesNotMatch(JSON.stringify(rewards), /inspection_test_potion|property:water/);
});

test('감각 요구 조건과 인벤토리·장착칸 감정 대상을 공개 API로 판정한다', () => {
    const player = createPlayer();
    assert.match(getSensibilityRequirementReason(player, 50) ?? '', /필요: 50, 현재: 49/);
    player.stat.set(StatType.SENSIBILITY, 50);
    assert.equal(getSensibilityRequirementReason(player, 50), undefined);

    assert.equal(resolveItemInspectionTarget(player, '1')?.item.itemDataId, 'inspection_test_potion');
    assert.equal(resolveItemInspectionTarget(player, '손')?.item.itemDataId, 'inspection_test_sword');
    assert.equal(resolveItemInspectionTarget(player, '주무기')?.sourceLabel, '손');
    assert.equal(resolveItemInspectionTarget(player, '주무기')?.equippedSlotIndex, 0);
    assert.equal(resolveItemInspectionTarget(player, '손')?.increaseDurability(5), 25);
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

test('감각 75 장비 감정은 상세 맨 마지막에 실제 교체 최종 능력치 증감을 표시한다', () => {
    const player = createPlayer();
    const candidate = new Item('inspection_test_upgrade_sword', 1, 30, null);
    const preview = Player.prototype.getItemEquipmentAttributePreview.call(player, candidate)!;
    const locked = buildItemInspection(candidate.getInspectionSnapshot(), '인벤토리 2번', 74, preview);
    const visible = buildItemInspection(candidate.getInspectionSnapshot(), '인벤토리 2번', 75, preview);
    const visibleText = collectRenderedText(visible);
    const visibleJson = JSON.stringify(visible);

    assert.doesNotMatch(JSON.stringify(locked), /착용 시 변화|비교 슬롯|감정 시험 검|→/);
    assert.match(visibleJson, /착용 시 변화/);
    assert.match(visibleText, /비교 슬롯손 · 감정 시험 검/);
    assert.match(visibleText, /공격력15 → 22 \(\+7\)/);
    assert.match(visibleText, /방어력0 → -3 \(-3\)/);
    assert.ok(visibleJson.lastIndexOf('착용 시 변화') > visibleJson.lastIndexOf('특수 효과 분석'));
    assert.match(visibleJson, /attributes\/atk/);
    assert.match(visibleJson, /"color":"green"/);
    assert.match(visibleJson, /"color":"red"/);
    assert.match(visibleText, /실제 장착에는 위 필요 조건과 내구도 검사가 적용/);
});

test('비장비와 낮은 감각에는 비교 섹션이 없고 현재 장착 인스턴스는 변화 없음으로 표시한다', () => {
    const player = createPlayer();
    const potion = player.inventory.getItemByIndex(0)!;
    assert.equal(Player.prototype.getItemEquipmentAttributePreview.call(player, potion), undefined);
    assert.doesNotMatch(
        collectRenderedText(buildItemInspection(potion.getInspectionSnapshot(), '인벤토리 1번', 100)),
        /착용 시 변화/,
    );

    const equipped = player.equipment.getEquipped('mainHand', 0)!;
    const noChange = Player.prototype.getItemEquipmentAttributePreview.call(player, equipped, 0)!;
    assert.equal(noChange.changes.length, 0);
    assert.match(
        JSON.stringify(buildItemInspection(equipped.getInspectionSnapshot(), '손', 75, noChange)),
        /착용 시 변화[\s\S]*능력치 변화 없음/,
    );
});

test('사용자용 감정·몬스터정보·속성표에는 내부 ID, raw 태그와 metadata key가 노출되지 않는다', () => {
    const player = createPlayer();
    const item = resolveItemInspectionTarget(player, '1')!.item;
    const itemText = collectRenderedText(buildItemInspection(item.getInspectionSnapshot(), '인벤토리 1번', 100));
    assert.doesNotMatch(itemText, /inspection_test_potion|property:water|아이템 ID|식별 태그|메타데이터|amount/);
    assert.match(itemText, /생명력 10 회복/);
    assert.match(itemText, /0\.4kg \(0\.2kg × 2\)/);
    assert.match(itemText, /스택 제한 없음/);
    assert.doesNotMatch(itemText, /2000000000/);

    const monster = new Monster('inspection_test_monster');
    const monsterText = collectRenderedText(buildMonsterInspection(monster, 1, 150));
    assert.doesNotMatch(monsterText, /inspection_test_monster|property:water|식별 태그/);
    monster.tags.setRuntime('test:boss-display', [GameTags.ENTITY_BOSS]);
    assert.match(collectRenderedText(buildMonsterInspection(monster, 1, 150)), /♛ Lv\.10 감정 시험 몬스터/);
    assert.match(monsterText, /감정 시험 몬스터/);

    const affinityText = collectRenderedText(buildAffinityMessage());
    assert.doesNotMatch(affinityText, /property:|trait:/);
    assert.match(affinityText, /불|물/);
});
