import assert from 'node:assert/strict';
import test from 'node:test';
import {
    defineItem,
    createAcquisitionRequirements,
    isPersistedItemMetadataDelta,
    Item,
    ItemMetadataKeys,
    migratePersistedItemMetadata,
    type ItemData,
    type ItemMetadata,
} from './Item.js';
import Attribute, { AttributeType } from '../core/Attribute.js';
import Equipment, {
    ArmorDurabilityDamageMode,
    calculateArmorDurabilityDamageChance,
    EquipSlotType,
} from './Equipment.js';
import Inventory, { InventorySortMode } from './Inventory.js';
import Player from '../actors/Player.js';

function itemData(
    id: string,
    image?: string,
    baseMetadata: ItemMetadata | null = null,
    baseDurability: number | null = null,
): ItemData {
    return {
        id,
        name: id,
        description: '',
        image,
        category: 'test',
        weight: 0,
        stackable: false,
        maxStack: 1,
        baseMetadata,
        onUse: null,
        equipSlot: null,
        modifiers: null,
        baseDurability,
        tags: [],
    };
}

test('아이템 이미지는 metadata, 정의, ID 기본 경로 순서로 결정한다', () => {
    defineItem(itemData('test_default_image'));
    defineItem(itemData('test_defined_image', 'items/defined'));

    assert.equal(new Item('test_default_image', 1, null, null).image, 'items/test_default_image');
    assert.equal(new Item('test_defined_image', 1, null, null).image, 'items/defined');
    assert.equal(
        new Item('test_defined_image', 1, null, { image: 'items/metadata' }).image,
        'items/metadata',
    );
});

test('아이템 레벨·스탯 조건은 유효한 값만 영속 snapshot으로 정규화한다', () => {
    defineItem({ ...itemData('required_blade'), equipSlot: 'mainHand' });
    const item = new Item('required_blade', 1, null, {
        [ItemMetadataKeys.REQUIREMENTS]: {
            level: 80.9,
            stats: { strength: 20.8, unknown: 999, agility: -1 },
            source: 'treasure',
        },
    });
    assert.deepEqual(item.requirements, {
        level: 80,
        stats: { strength: 20 },
        source: 'treasure',
    });
});

test('상점 장비는 완만한 성장 조건을 받고 보물 장비는 같은 구간에서 더 느슨하다', () => {
    defineItem({
        ...itemData('high_greatsword'),
        category: '대검',
        equipSlot: 'mainHand',
        tags: ['item:weapon', 'weapon:sword'],
    });
    assert.deepEqual(createAcquisitionRequirements('high_greatsword', 1000, 'shop'), {
        level: 720,
        stats: { strength: 200 },
        source: 'shop',
    });
    assert.deepEqual(createAcquisitionRequirements('high_greatsword', 1000, 'treasure'), {
        level: 500,
        stats: { strength: 120 },
        source: 'treasure',
    });
});

test('안전하지 않은 metadata 이미지 경로는 정의 이미지로 대체한다', () => {
    defineItem(itemData('test_safe_image', 'items/safe'));

    assert.equal(
        new Item('test_safe_image', 1, null, { image: '../outside' }).image,
        'items/safe',
    );
    assert.throws(() => defineItem(itemData('test_invalid_image', 'https://example.com/item.png')));
});

test('override가 없는 인스턴스는 변경된 기본 metadata를 즉시 상속한다', () => {
    defineItem(itemData('test_live_base', undefined, { amount: 50, time: 1 }));
    const item = new Item('test_live_base', 1, null, null);

    assert.equal(item.getMetadata<number>('amount'), 50);
    defineItem(itemData('test_live_base', undefined, { amount: 80, time: 2 }));
    assert.deepEqual(item.getMetadataSnapshot(), { amount: 80, time: 2 });
});

test('metadata setter는 delta만 저장하고 변경 callback을 호출한다', () => {
    defineItem(itemData('test_metadata_api', undefined, { amount: 50 }));
    const item = new Item('test_metadata_api', 1, null, null);
    let changes = 0;
    item.setPersistentChangeHandler(() => { changes++; });

    item.setMetadata('amount', 75);
    assert.equal(item.getMetadata<number>('amount'), 75);
    assert.deepEqual(item.getMetadataDeltaSnapshot(), { amount: 75 });
    assert.equal(changes, 1);

    item.setMetadata('amount', 50);
    assert.equal(item.getMetadata<number>('amount'), 50);
    assert.equal(item.getMetadataDeltaSnapshot(), null);
    assert.equal(changes, 2);
});

test('인벤토리 퀵 HUD는 사용 가능한 아이템을 정의별로 합산한다', () => {
    defineItem({
        ...itemData('test_quick_potion', 'items/health_potion'),
        name: '시험 포션',
        stackable: true,
        maxStack: 999,
        onUse: 'test_use_handler',
    });
    defineItem(itemData('test_quick_material'));
    const inventory = Inventory.createEmpty(1, 100);
    inventory.addItem('test_quick_potion', 2);
    inventory.addItem('test_quick_potion', 3);
    inventory.addItem('test_quick_material', 4);

    assert.deepEqual(inventory.getUsableItemHudSnapshots(), [{
        itemDataId: 'test_quick_potion',
        name: '시험 포션',
        icon: 'items/health_potion',
        count: 5,
        bundleEligible: false,
    }]);
    assert.equal(inventory.getFirstUsableItemByData('test_quick_potion')?.itemDataId, 'test_quick_potion');
    assert.equal(inventory.getFirstUsableItemByData('test_quick_material'), undefined);
});

test('인벤토리 슬롯 반출은 snapshot 생성과 수량 제거를 하나의 경계에서 처리한다', () => {
    defineItem({ ...itemData('test_atomic_take'), stackable: true, maxStack: 999 });
    const inventory = Inventory.createEmpty(1, 100);
    inventory.addItem('test_atomic_take', 5);

    const taken = inventory.takeItemSnapshotByIndex(0, 3);
    assert.equal(taken?.name, 'test_atomic_take');
    assert.equal(taken?.snapshot.count, 3);
    assert.equal(inventory.getItemByIndex(0)?.count, 2);
    assert.equal(inventory.takeItemSnapshotByIndex(0, 3), undefined);
    assert.equal(inventory.getItemByIndex(0)?.count, 2);
});

test('제작 장비 metadata는 이름·설명·최대 내구도·인스턴스 능력치를 안전하게 재정의한다', () => {
    defineItem({
        ...itemData('test_forged_weapon', 'items/old_sword', null, 50),
        equipSlot: 'mainHand',
        modifiers: [{ attribute: 'atk', op: 'add', value: 2, source: '' }],
    });
    const item = new Item('test_forged_weapon', 1, null, {
        customName: '정밀한 철 장검',
        customDescription: '단조 시험으로 제작된 무기.',
        maxDurability: 180,
        instanceModifiers: [
            { attribute: 'atk', op: 'add', value: 14 },
            { attribute: 'critRate', op: 'add', value: 0.02 },
            { attribute: 'unknown', op: 'add', value: 999 },
        ],
    });
    assert.equal(item.name, '정밀한 철 장검');
    assert.equal(item.description, '단조 시험으로 제작된 무기.');
    assert.equal(item.baseDurability, 180);
    assert.equal(item.durability, 180);
    assert.deepEqual(item.modifiers?.map(({ attribute, op, value }) => ({ attribute, op, value })), [
        { attribute: 'atk', op: 'add', value: 14 },
        { attribute: 'critRate', op: 'add', value: 0.02 },
    ]);

    const equipment = Equipment.createEmpty();
    const attribute = new Attribute({ atk: 10, critRate: 0 });
    assert.equal(equipment.equip('mainHand', item, attribute), true);
    assert.equal(attribute.get(AttributeType.ATK), 24);
    assert.equal(attribute.get(AttributeType.CRIT_RATE), 0.02);
    item.setMetadata('instanceModifiers', [{ attribute: 'atk', op: 'add', value: 20 }]);
    assert.equal(attribute.get(AttributeType.ATK), 30);
    assert.equal(attribute.get(AttributeType.CRIT_RATE), 0);
});

test('기본 공격 오버라이드 key는 base metadata와 인스턴스 delta를 따른다', () => {
    defineItem(itemData('test_attack_override', undefined, { basicAttackOverride: 'projectile' }));
    const item = new Item('test_attack_override', 1, null, null);

    assert.equal(item.basicAttackOverrideKey, 'projectile');
    item.setMetadata('basicAttackOverride', 'custom_attack');
    assert.equal(item.basicAttackOverrideKey, 'custom_attack');
    item.resetMetadata('basicAttackOverride');
    assert.equal(item.basicAttackOverrideKey, 'projectile');
});

test('구형 전체 metadata는 기본값과 다른 필드만 delta로 마이그레이션한다', () => {
    defineItem(itemData('test_legacy_metadata', undefined, { amount: 50, time: 1 }));
    const persisted = migratePersistedItemMetadata('test_legacy_metadata', {
        amount: 50,
        time: 3,
        image: 'items/legacy_variant',
    });

    assert.equal(isPersistedItemMetadataDelta(persisted), true);
    assert.deepEqual(persisted.values, { time: 3, image: 'items/legacy_variant' });

    const item = Item.fromPersistence('test_legacy_metadata', 1, null, persisted);
    assert.deepEqual(item.getMetadataSnapshot(), {
        amount: 50,
        time: 3,
        image: 'items/legacy_variant',
    });
});

test('내구도 API는 설정·증가·차감을 범위 안에서 처리하고 변경 callback을 호출한다', () => {
    defineItem(itemData('test_durability', undefined, null, 10));
    const item = new Item('test_durability', 1, 10, null);
    let changes = 0;
    item.setPersistentChangeHandler(() => { changes++; });

    assert.equal(item.decreaseDurability(3), 7);
    assert.equal(item.durabilityRatio, 0.7);
    assert.equal(item.increaseDurability(20), 10);
    assert.equal(item.setDurability(-5), 0);
    assert.equal(item.isBroken, true);
    assert.equal(changes, 3);

    assert.equal(item.decreaseDurability(), 0);
    assert.equal(changes, 3);
    assert.throws(() => item.changeDurability(Number.NaN));
});

test('장비 내구도 HUD snapshot은 무기·보호구만 고정 슬롯 순서로 노출한다', () => {
    const definitions = [
        { id: 'test_hud_weapon', slot: 'mainHand', tags: ['item:weapon'], image: 'items/old_sword' },
        { id: 'test_hud_shield', slot: 'offHand', tags: ['item:armor'], image: 'items/old_shield' },
        { id: 'test_hud_body', slot: 'body', tags: ['item:armor'], image: 'items/armor' },
        { id: 'test_hud_accessory', slot: 'accessory', tags: ['item:armor'], image: 'items/ring' },
    ] as const;
    const equipment = Equipment.createEmpty();
    const attribute = new Attribute({});
    for (const definition of definitions) {
        defineItem({
            ...itemData(definition.id, definition.image, null, 20),
            equipSlot: definition.slot,
            tags: [...definition.tags],
        });
        assert.equal(equipment.equip(
            definition.slot,
            new Item(definition.id, 1, definition.id === 'test_hud_body' ? 8 : 15, null),
            attribute,
        ), true);
    }

    assert.deepEqual(equipment.getDurabilityHudSnapshots().map(snapshot => ({
        group: snapshot.group,
        slot: snapshot.slot,
        itemDataId: snapshot.itemDataId,
        current: snapshot.current,
        max: snapshot.max,
        ratio: snapshot.ratio,
    })), [
        { group: 'weapon', slot: 'mainHand', itemDataId: 'test_hud_weapon', current: 15, max: 20, ratio: 0.75 },
        { group: 'armor', slot: 'body', itemDataId: 'test_hud_body', current: 8, max: 20, ratio: 0.4 },
        { group: 'armor', slot: 'offHand', itemDataId: 'test_hud_shield', current: 15, max: 20, ratio: 0.75 },
    ]);
});

test('수리는 손상률에 따라 최대 내구도를 영구 감소시키고 새 상한 안에서 복구한다', () => {
    defineItem(itemData('test_degrading_repair', undefined, null, 100));
    const item = new Item('test_degrading_repair', 1, 80, null);

    assert.deepEqual(item.repairDurability(10, 0), {
        durability: 90,
        maxDurability: 100,
        lostMaxDurability: 0,
    });
    item.setDurability(10);
    assert.deepEqual(item.repairDurability(30, 0.12), {
        durability: 40,
        maxDurability: 88,
        lostMaxDurability: 12,
    });
    assert.equal(item.baseDurability, 88);
    assert.equal(item.getMetadata<number>('maxDurability'), 88);
});

test('소유 중인 아이템 내구도가 0이 되면 인벤토리 또는 장비에서 파괴된다', () => {
    defineItem(itemData('test_break_inventory', undefined, null, 2));
    defineItem({
        ...itemData('test_break_equipment', undefined, null, 2),
        equipSlot: 'mainHand',
        modifiers: [{ attribute: 'atk', op: 'add', value: 5, source: '' }],
    });

    const inventory = Inventory.createEmpty(1, 100);
    inventory.addItem('test_break_inventory', 1);
    const inventoryItem = inventory.getItemByIndex(0)!;
    assert.equal(inventory.decreaseItemDurability(inventoryItem.id, 2), 0);
    assert.equal(inventory.getIndexedItems().length, 0);

    const equipment = Equipment.createEmpty();
    const attribute = new Attribute({ atk: 10 });
    const weapon = new Item('test_break_equipment', 1, 2, null);
    assert.equal(equipment.equip('mainHand', weapon, attribute), true);
    assert.equal(attribute.getBase(AttributeType.ATK), 10);
    assert.equal(attribute.get(AttributeType.ATK), 15);
    assert.equal(equipment.decreaseItemDurability('mainHand', 0, 2), 0);
    assert.equal(equipment.getEquipped('mainHand'), undefined);
    assert.equal(attribute.get(AttributeType.ATK), 10);
});

test('방어구 내구도 손상 모드와 실제 생명력 피해 확률은 경계값을 안정적으로 제공한다', () => {
    assert.deepEqual(
        ArmorDurabilityDamageMode.values().map(mode => mode.key),
        ['single', 'all'],
    );
    assert.equal(ArmorDurabilityDamageMode.fromKey('SINGLE'), ArmorDurabilityDamageMode.SINGLE);
    assert.equal(ArmorDurabilityDamageMode.fromInput('전 부위'), ArmorDurabilityDamageMode.ALL);
    assert.equal(ArmorDurabilityDamageMode.SINGLE.explicitOnly, false);
    assert.equal(ArmorDurabilityDamageMode.ALL.explicitOnly, true);

    assert.equal(calculateArmorDurabilityDamageChance(0, 100), 0.1);
    assert.ok(Math.abs(calculateArmorDurabilityDamageChance(10, 100) - 0.22) < 1e-12);
    assert.equal(calculateArmorDurabilityDamageChance(50, 100), 0.7);
    assert.equal(calculateArmorDurabilityDamageChance(1_000, 100), 0.7);
});

test('SINGLE 방어구 내구도 손상은 확률 경계와 부위 가중치를 따라 한 부위만 선택한다', () => {
    const definitions = [
        ['test_armor_weighted_body', 'body'],
        ['test_armor_weighted_legs', 'legs'],
        ['test_armor_weighted_head', 'head'],
        ['test_armor_weighted_feet', 'feet'],
    ] as const;
    const equipment = Equipment.createEmpty();
    const attribute = new Attribute({});
    for (const [id, slot] of definitions) {
        defineItem({ ...itemData(id, undefined, null, 20), equipSlot: slot });
        assert.equal(equipment.equip(slot, new Item(id, 1, 20, null), attribute), true);
    }

    const miss = equipment.damageArmorDurability(10, 100, ArmorDurabilityDamageMode.SINGLE, {
        chance: () => 0.22,
        slot: () => 0,
    });
    assert.deepEqual(miss, []);

    const cases = [
        [0, 'body'],
        [0.399_999, 'body'],
        [0.4, 'legs'],
        [0.649_999, 'legs'],
        [0.65, 'head'],
        [0.849_999, 'head'],
        [0.85, 'feet'],
        [1, 'feet'],
    ] as const;
    for (const [slotRoll, expectedSlot] of cases) {
        const result = equipment.damageArmorDurability(10, 100, ArmorDurabilityDamageMode.SINGLE, {
            chance: () => 0.219_999,
            slot: () => slotRoll,
        });
        assert.equal(result.length, 1);
        assert.equal(result[0]?.slot, expectedSlot);
    }

    assert.equal(equipment.getEquipped('body')?.durability, 18);
    assert.equal(equipment.getEquipped('legs')?.durability, 18);
    assert.equal(equipment.getEquipped('head')?.durability, 18);
    assert.equal(equipment.getEquipped('feet')?.durability, 18);
});

test('SINGLE 방어구 내구도 부위 가중치는 장착 중인 후보만으로 재정규화한다', () => {
    defineItem({ ...itemData('test_armor_present_body', undefined, null, 3), equipSlot: 'body' });
    defineItem({ ...itemData('test_armor_present_feet', undefined, null, 3), equipSlot: 'feet' });
    const equipment = Equipment.createEmpty();
    const attribute = new Attribute({});
    equipment.equip('body', new Item('test_armor_present_body', 1, 3, null), attribute);
    equipment.equip('feet', new Item('test_armor_present_feet', 1, 3, null), attribute);

    const body = equipment.damageArmorDurability(1, 100, ArmorDurabilityDamageMode.SINGLE, {
        chance: () => 0,
        slot: () => (40 / 55) - 1e-6,
    });
    const feet = equipment.damageArmorDurability(1, 100, ArmorDurabilityDamageMode.SINGLE, {
        chance: () => 0,
        slot: () => 40 / 55,
    });

    assert.equal(body[0]?.slot, 'body');
    assert.equal(feet[0]?.slot, 'feet');
});

test('ALL 방어구 내구도 손상은 전 부위를 감소시키고 파괴된 장비의 modifier를 제거한다', () => {
    defineItem({ ...itemData('test_armor_all_head', undefined, null, 2), equipSlot: 'head' });
    defineItem({
        ...itemData('test_armor_all_body', undefined, null, 1),
        equipSlot: 'body',
        modifiers: [{ attribute: 'def', op: 'add', value: 5, source: '' }],
    });
    defineItem({ ...itemData('test_armor_all_accessory', undefined, null, 2), equipSlot: 'accessory' });
    const equipment = Equipment.createEmpty();
    const attribute = new Attribute({ def: 10 });
    equipment.equip('head', new Item('test_armor_all_head', 1, 2, null), attribute);
    equipment.equip('body', new Item('test_armor_all_body', 1, 1, null), attribute);
    equipment.equip('accessory', new Item('test_armor_all_accessory', 1, 2, null), attribute);
    assert.equal(attribute.get(AttributeType.DEF), 15);

    const damaged = equipment.damageArmorDurability(1, 100, ArmorDurabilityDamageMode.ALL, {
        chance: () => { throw new Error('ALL은 확률 RNG를 사용하지 않아야 합니다.'); },
        slot: () => { throw new Error('ALL은 부위 RNG를 사용하지 않아야 합니다.'); },
    });

    assert.deepEqual(damaged, [
        {
            slot: 'body',
            slotIndex: 0,
            itemDataId: 'test_armor_all_body',
            itemName: 'test_armor_all_body',
            previousDurability: 1,
            durability: 0,
            broken: true,
        },
        {
            slot: 'head',
            slotIndex: 0,
            itemDataId: 'test_armor_all_head',
            itemName: 'test_armor_all_head',
            previousDurability: 2,
            durability: 1,
            broken: false,
        },
    ]);
    assert.equal(attribute.get(AttributeType.DEF), 10);
    assert.equal(equipment.getEquipped('head')?.durability, 1);
    assert.equal(equipment.getEquipped('body'), undefined);
    assert.equal(equipment.getEquipped('accessory')?.durability, 2);
});

test('가방 슬롯 장비는 다른 장비와 독립적으로 최대 중량 modifier를 적용한다', () => {
    defineItem({
        ...itemData('test_bag'),
        equipSlot: 'bag',
        modifiers: [{ attribute: 'maxWeight', op: 'add', value: 40, source: '' }],
    });
    const equipment = Equipment.createEmpty();
    const attribute = new Attribute({ maxWeight: 100 });

    assert.equal(EquipSlotType.fromInput('배낭'), EquipSlotType.BAG);
    assert.equal(equipment.equip('bag', new Item('test_bag', 1, null, null), attribute), true);
    assert.equal(attribute.get(AttributeType.MAX_WEIGHT), 140);
    assert.equal(AttributeType.MAX_WEIGHT.format(attribute.get(AttributeType.MAX_WEIGHT)), '140kg');
    assert.equal(equipment.unequip('bag', 0, attribute)?.itemDataId, 'test_bag');
    assert.equal(attribute.get(AttributeType.MAX_WEIGHT), 100);
});

test('장비 교체 미리보기는 실제 슬롯 교체와 같은 최종 add·multiply 결과를 상태 변경 없이 계산한다', () => {
    defineItem({
        ...itemData('preview_filler_charm'),
        equipSlot: 'accessory',
    });
    defineItem({
        ...itemData('preview_zero_charm'),
        equipSlot: 'accessory',
        modifiers: [
            { attribute: 'atk', op: 'add', value: 10, source: 'item-template:old' },
            { attribute: 'atk', op: 'multiply', value: 0, source: 'item-template:old' },
            { attribute: 'maxLife', op: 'add', value: 20, source: 'item-template:old' },
        ],
        experienceGainMultiplier: 0.8,
    });
    defineItem({
        ...itemData('preview_candidate_charm'),
        equipSlot: 'accessory',
        modifiers: [
            { attribute: 'atk', op: 'add', value: 30, source: 'item-template:candidate' },
            { attribute: 'atk', op: 'multiply', value: 1.1, source: 'item-template:candidate' },
            { attribute: 'maxLife', op: 'add', value: 50, source: 'item-template:candidate' },
            { attribute: 'maxWeight', op: 'add', value: 25, source: 'item-template:candidate' },
        ],
        experienceGainMultiplier: 2,
    });
    const equipment = Equipment.createEmpty();
    const attribute = new Attribute({ atk: 100, maxLife: 1_000, maxMentality: 500, maxWeight: 100 });
    attribute.addModifiers([
        { attribute: 'atk', op: 'add', value: 20, source: 'buff:attack' },
        { attribute: 'atk', op: 'multiply', value: 1.5, source: 'buff:attack' },
        { attribute: 'maxLife', op: 'multiply', value: 1.2, source: 'skill:life' },
    ]);
    equipment.equip('accessory', new Item('preview_filler_charm', 1, null, null), attribute, 0);
    equipment.equip('accessory', new Item('preview_filler_charm', 1, null, null), attribute, 1);
    const oldItem = new Item('preview_zero_charm', 1, null, null);
    equipment.equip('accessory', oldItem, attribute, 2);
    const candidate = new Item('preview_candidate_charm', 1, null, null);
    const inventory = Inventory.createEmpty(1, 777);
    const playerState = {
        equipment,
        attribute,
        inventory,
        life: 321,
        mentality: 123,
    } as unknown as Player;
    const experienceModifiers = new Map<string, number>();
    equipment.applyOwnerEffects({
        removeExperienceGainModifier: (source: string) => experienceModifiers.delete(source),
        setExperienceGainModifier: (source: string, multiplier: number) => {
            experienceModifiers.set(source, multiplier);
        },
    } as any);

    const computedBefore = { ...attribute.computed };
    const modifiersBefore = attribute.modifiers.map(modifier => ({ ...modifier }));
    const equippedBefore = equipment.getAllEquipped().map(entry => ({ ...entry }));
    const dirtyBefore = equipment.dirty;
    const experienceBefore = [...experienceModifiers];
    const preview = Player.prototype.getItemEquipmentAttributePreview.call(playerState, candidate)!;

    assert.equal(preview.slot, 'accessory');
    assert.equal(preview.slotIndex, 2);
    assert.equal(preview.slotLabel, '장신구3');
    assert.equal(preview.currentItemName, 'preview_zero_charm');
    assert.deepEqual(preview.changes.map(change => change.attribute), ['maxLife', 'maxWeight', 'atk']);
    const attackChange = preview.changes.find(change => change.attribute === 'atk')!;
    assert.equal(attackChange.attribute, 'atk');
    assert.equal(attackChange.before, 0);
    assert.ok(Math.abs(attackChange.after - 247.5) < 1e-9);
    assert.ok(Math.abs(attackChange.delta - 247.5) < 1e-9);
    assert.deepEqual(preview.changes.find(change => change.attribute === 'maxLife'), {
        attribute: 'maxLife', before: 1_224, after: 1_260, delta: 36,
    });
    assert.equal(preview.changes.find(change => change.attribute === 'maxWeight')?.after, 125);
    assert.deepEqual(attribute.computed, computedBefore);
    assert.deepEqual(attribute.modifiers, modifiersBefore);
    assert.deepEqual(equipment.getAllEquipped(), equippedBefore);
    assert.equal(equipment.dirty, dirtyBefore);
    assert.equal(playerState.life, 321);
    assert.equal(playerState.mentality, 123);
    assert.equal(inventory.maxWeight, 777);
    assert.deepEqual([...experienceModifiers], experienceBefore);

    const displaced = equipment.equipSwap('accessory', candidate, attribute);
    assert.equal(displaced, oldItem);
    assert.equal(equipment.getEquipped('accessory', 2), candidate);
    for (const change of preview.changes) {
        assert.equal(attribute.get(AttributeType.fromKey(change.attribute)!), change.after);
    }
});

test('장착 대상 resolver는 다중 슬롯의 첫 빈칸·가득 찬 마지막 칸·명시 인덱스를 공유한다', () => {
    defineItem({ ...itemData('preview_slot_charm'), equipSlot: 'accessory' });
    const equipment = Equipment.createEmpty();
    const attribute = new Attribute();
    equipment.equip('accessory', new Item('preview_slot_charm', 1, null, null), attribute, 0);
    const exactItem = new Item('preview_slot_charm', 1, null, null);
    equipment.equip('accessory', exactItem, attribute, 2);

    assert.equal(equipment.resolveEquipTarget('accessory')?.slotIndex, 1);
    assert.equal(equipment.resolveEquipTarget('accessory', 0)?.slotIndex, 0);
    assert.equal(equipment.previewItemAttributeChange(exactItem, attribute, 2)?.changes.length, 0);
    equipment.equip('accessory', new Item('preview_slot_charm', 1, null, null), attribute, 1);
    assert.equal(equipment.resolveEquipTarget('accessory')?.slotIndex, 2);
    assert.equal(equipment.resolveEquipTarget('accessory', 3), undefined);
});

test('머리·몸통·다리·발·주무기·보조무기·장신구·가방 모든 장비 슬롯에서 교체 미리보기를 만든다', () => {
    const equipment = Equipment.createEmpty();
    const attribute = new Attribute({ def: 10 });

    for (const [index, slotType] of EquipSlotType.values().entries()) {
        const itemId = `preview_all_slots_${slotType.key}`;
        defineItem({
            ...itemData(itemId),
            equipSlot: slotType.key,
            modifiers: [{ attribute: 'def', op: 'add', value: index + 1, source: 'item-template' }],
        });

        const preview = equipment.previewItemAttributeChange(
            new Item(itemId, 1, null, null),
            attribute,
        );
        assert.equal(preview?.slot, slotType.key);
        assert.equal(preview?.slotIndex, 0);
        assert.equal(preview?.slotLabel, slotType.max > 1 ? `${slotType.label}1` : slotType.label);
        assert.equal(preview?.currentItemName, null);
        assert.deepEqual(preview?.changes, [{
            attribute: 'def',
            before: 10,
            after: 11 + index,
            delta: index + 1,
        }]);
    }
});

test('능력치 교체 미리보기는 부동 오차를 숨기고 클래스형 능력치 순서를 유지한다', () => {
    const attribute = new Attribute({ maxLife: 100, atk: 10, def: 5 });
    const changes = attribute.previewModifierSourceReplacement('equip:test:0', [
        { attribute: 'def', op: 'add', value: 2, source: 'ignored' },
        { attribute: 'atk', op: 'add', value: 1e-12, source: 'ignored' },
        { attribute: 'maxLife', op: 'add', value: 10, source: 'ignored' },
    ]);
    assert.deepEqual(changes.map(change => change.attribute), ['maxLife', 'def']);
    assert.equal(attribute.hasSource('equip:test:0'), false);
});

test('스택형 장착 아이템 미리보기는 묶음 수량과 무관하게 modifier를 한 번만 적용한다', () => {
    defineItem({
        ...itemData('preview_stack_bait'),
        stackable: true,
        maxStack: 99,
        equipSlot: 'offHand',
        modifiers: [{ attribute: 'luck', op: 'add', value: 2, source: 'item-template' }],
    });
    const equipment = Equipment.createEmpty();
    const attribute = new Attribute({ luck: 3 });
    const preview = equipment.previewItemAttributeChange(
        new Item('preview_stack_bait', 20, null, null),
        attribute,
    );
    assert.equal(preview?.changes.find(change => change.attribute === 'luck')?.after, 5);
});

test('인벤토리는 종류별·이름순·자동 기준으로 아이템 표시 순서를 정리한다', () => {
    for (const data of [
        { id: 'sort_potion', name: '마법약', category: '소모품', onUse: 'heal_mp', durability: null },
        { id: 'sort_wood', name: '나무', category: '재료', onUse: null, durability: null },
        { id: 'sort_ore', name: '광석', category: '광물', onUse: null, durability: null },
        { id: 'sort_sword', name: '다리검', category: '무기', onUse: null, durability: 10 },
        { id: 'sort_armor', name: '가죽갑옷', category: '방어구', onUse: null, durability: 10 },
    ]) {
        defineItem({
            ...itemData(data.id, undefined, null, data.durability),
            name: data.name,
            category: data.category,
            onUse: data.onUse,
        });
    }

    const createInventory = () => {
        const inventory = Inventory.createEmpty(1, 100);
        for (const id of ['sort_sword', 'sort_wood', 'sort_potion', 'sort_armor', 'sort_ore']) {
            assert.equal(inventory.addItem(id, 1), true);
        }
        return inventory;
    };
    const ids = (inventory: Inventory) => inventory.items.map(item => item.itemDataId);

    const category = createInventory();
    assert.equal(category.sortItems(InventorySortMode.CATEGORY), true);
    assert.deepEqual(ids(category), ['sort_ore', 'sort_sword', 'sort_armor', 'sort_potion', 'sort_wood']);

    const name = createInventory();
    assert.equal(name.sortItems(InventorySortMode.NAME), true);
    assert.deepEqual(ids(name), ['sort_armor', 'sort_ore', 'sort_wood', 'sort_sword', 'sort_potion']);

    const automatic = createInventory();
    assert.equal(automatic.sortItems(), true);
    assert.deepEqual(ids(automatic), ['sort_potion', 'sort_ore', 'sort_wood', 'sort_sword', 'sort_armor']);

    assert.equal(InventorySortMode.fromKey('auto'), InventorySortMode.AUTO);
    assert.equal(InventorySortMode.fromInput('종류'), InventorySortMode.CATEGORY);
    assert.equal(InventorySortMode.fromInput('이름순'), InventorySortMode.NAME);
});

test('스택형 미끼는 묶음 전체를 장착하고 사용할 때마다 한 개씩 소비한다', () => {
    defineItem({
        ...itemData('test_bait_stack'),
        stackable: true,
        maxStack: 99,
        equipSlot: 'offHand',
    });
    const inventory = Inventory.createEmpty(1, 100);
    const equipment = Equipment.createEmpty();
    const attribute = new Attribute({});
    inventory.addItem('test_bait_stack', 10);
    const bait = inventory.getItemByIndex(0)!;
    const player = { inventory, equipment, attribute } as unknown as Player;

    assert.ok(Player.prototype.equipInventoryItem.call(player, bait, 0));
    assert.equal(inventory.getCount('test_bait_stack'), 0);
    assert.equal(equipment.getEquipped('offHand')?.count, 10);

    assert.ok(equipment.consumeEquippedItem('offHand', 0, attribute));
    assert.equal(equipment.getEquipped('offHand')?.count, 9);
    assert.ok(equipment.consumeEquippedItem('offHand', 0, attribute, 9));
    assert.equal(equipment.getEquipped('offHand'), undefined);
});
