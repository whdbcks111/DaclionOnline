import assert from 'node:assert/strict';
import test from 'node:test';
import { GameTags } from '../../../shared/tags.js';
import {
    calculateForgedProjectileAcceleration,
    getItemData,
    Item,
    ItemMetadataKeys,
    type ItemMetadataValue,
} from './Item.js';
import {
    MAX_EQUIPMENT_REINFORCEMENT,
    calculateRepairMaxDurabilityLossRate,
    calculateForgeCraftsmanship,
    calculateForgedItemLevel,
    calculateForgedRequiredLevel,
    createAssembledBowSnapshot,
    createForgedArrowSnapshot,
    createForgedItemSnapshot,
    createInfusedStaffSnapshot,
    createEquipmentRepairPlan,
    ForgeForm,
    ForgeMaterial,
    ForgeQuality,
    reinforceEquipment,
    renameForgedItem,
    selectEquipmentRepairMaterials,
    EquipmentReinforcementStage,
} from './Forging.js';
import { PlayerProgress } from './Progress.js';
import Skill from './Skill.js';
import type Player from './Player.js';
import type Entity from './Entity.js';
import Inventory from './Inventory.js';
import {
    calculateForgingExperience,
    calculateSmeltingExperience,
    canUseForgeForm,
    canUseMetalForging,
    createForgingRhythmConfig,
    getAvailableForgeForms,
    startForging,
} from '../modules/forging.js';
import '../data/items.js';
import '../data/ascendantFrontier.js';
import '../data/progress.js';
import '../data/skills.js';

test('단조 결과는 보통 일반명을 사용하고 완벽한 품질에는 형태 고유명을 만든다', () => {
    const low = createForgedItemSnapshot(ForgeForm.SWORD, ForgeMaterial.IRON, { accuracy: 0.5, random: () => 0 });
    const high = createForgedItemSnapshot(ForgeForm.SWORD, ForgeMaterial.IRON, { accuracy: 1, random: () => 0 });
    const lowItem = Item.fromSnapshot(low);
    const highItem = Item.fromSnapshot(high);

    assert.equal(low.itemDataId, 'forged_sword');
    assert.equal(lowItem.name, '철 장검');
    assert.equal(highItem.name, '아스트라엘 철 블레이드');
    assert.ok(highItem.modifiers![0].value > lowItem.modifiers![0].value);
    assert.ok(highItem.baseDurability! > lowItem.baseDurability!);
    assert.equal(highItem.hasTag(GameTags.MATERIAL_IRON), true);
    assert.equal(highItem.hasTag(GameTags.PROPERTY_METAL), true);
});

test('투구·흉갑·각반·철갑화도 각 방어구 슬롯에 단조할 수 있다', () => {
    const armorForms = [
        [ForgeForm.HELMET, 'head'],
        [ForgeForm.CHESTPLATE, 'body'],
        [ForgeForm.GREAVES, 'legs'],
        [ForgeForm.SABATONS, 'feet'],
    ] as const;

    for (const [form, slot] of armorForms) {
        const item = Item.fromSnapshot(createForgedItemSnapshot(form, ForgeMaterial.IRON, {
            accuracy: 0.8,
            creatorLevel: 100,
            random: () => 0,
        }));
        assert.equal(item.data?.equipSlot, slot, form.label);
        assert.equal(item.hasTag(GameTags.ITEM_ARMOR), true, form.label);
        assert.ok(item.modifiers?.some(modifier => modifier.attribute === 'def' && modifier.value > 0), form.label);
        assert.match(item.description, /^성능 Lv\.\d+ · 착용 Lv\.\d+ 우수 단조품\./);
    }
});

test('단조 성능 상한은 실제 제작 성장치와 착용 레벨을 함께 제한한다', () => {
    const uncapped = Item.fromSnapshot(createForgedItemSnapshot(ForgeForm.SWORD, ForgeMaterial.ORIGIN_PRISM, {
        accuracy: 1,
        creatorLevel: 1000,
        sensibility: 1200,
        random: () => 0,
    }));
    const capped = Item.fromSnapshot(createForgedItemSnapshot(ForgeForm.SWORD, ForgeMaterial.ORIGIN_PRISM, {
        accuracy: 1,
        creatorLevel: 1000,
        sensibility: 1200,
        performanceLevelCap: 500,
        random: () => 0,
    }));
    const forge = capped.getMetadata<Record<string, unknown>>(ItemMetadataKeys.FORGE);
    assert.equal(forge?.itemLevel, 500);
    assert.equal(capped.requirements?.level, 400);
    assert.equal(calculateForgedRequiredLevel(501), 401);
    assert.ok((capped.modifiers?.[0].value ?? 0) < (uncapped.modifiers?.[0].value ?? 0));
});

test('단검과 철갑화는 형태 자체에서 제작 성장에 비례한 이동속도를 얻는다', () => {
    const options = {
        accuracy: 0.9,
        creatorLevel: 200,
        sensibility: 1_000,
        forgingPrecision: 1.5,
        random: () => 0,
    };
    const dagger = Item.fromSnapshot(createForgedItemSnapshot(ForgeForm.DAGGER, ForgeMaterial.IRON, options));
    const sabatons = Item.fromSnapshot(createForgedItemSnapshot(ForgeForm.SABATONS, ForgeMaterial.IRON, options));
    const sword = Item.fromSnapshot(createForgedItemSnapshot(ForgeForm.SWORD, ForgeMaterial.IRON, options));

    const additiveSpeed = (item: Item) => item.modifiers
        ?.filter(modifier => modifier.attribute === 'speed' && modifier.op === 'add')
        .reduce((sum, modifier) => sum + modifier.value, 0) ?? 0;
    assert.ok(additiveSpeed(dagger) > 0.1);
    assert.ok(additiveSpeed(sabatons) > additiveSpeed(dagger));
    assert.equal(additiveSpeed(sword), 0);
});

test('마나 수정 단조품은 제작자 성장에 비례한 마법 능력치를 얻는다', () => {
    const novice = Item.fromSnapshot(createForgedItemSnapshot(ForgeForm.SWORD, ForgeMaterial.MANA_CRYSTAL, {
        accuracy: 0.8,
        creatorLevel: 30,
        sensibility: 100,
        random: () => 0,
    }));
    const master = Item.fromSnapshot(createForgedItemSnapshot(ForgeForm.SWORD, ForgeMaterial.MANA_CRYSTAL, {
        accuracy: 0.8,
        creatorLevel: 200,
        sensibility: 1_000,
        forgingPrecision: 1.5,
        random: () => 0,
    }));
    const modifier = (item: Item, attribute: string) => item.modifiers
        ?.filter(candidate => candidate.attribute === attribute && candidate.op === 'add')
        .reduce((sum, candidate) => sum + candidate.value, 0) ?? 0;

    assert.equal(master.hasTag(GameTags.MATERIAL_MANA_CRYSTAL), true);
    assert.ok(modifier(master, 'magicForce') > modifier(novice, 'magicForce'));
    assert.ok(modifier(master, 'maxMentality') > modifier(novice, 'maxMentality'));
    assert.ok(modifier(master, 'magicPen') > modifier(novice, 'magicPen'));
});

test('마나 수정 단조 재료는 원석·정제 명칭과 공백 없는 입력을 해석한다', () => {
    assert.equal(ForgeMaterial.fromInput('마나 수정'), ForgeMaterial.MANA_CRYSTAL);
    assert.equal(ForgeMaterial.fromInput('마나수정'), ForgeMaterial.MANA_CRYSTAL);
    assert.equal(ForgeMaterial.fromInput('정제 마나 수정'), ForgeMaterial.MANA_CRYSTAL);
    assert.equal(ForgeMaterial.fromInput('정제마나수정'), ForgeMaterial.MANA_CRYSTAL);
});

test('야전 수리는 원 단조 소재를 우선하고 없으면 같은 속성 소재를 선택한다', () => {
    const item = Item.fromSnapshot(createForgedItemSnapshot(
        ForgeForm.SWORD,
        ForgeMaterial.RUBY,
        { accuracy: 0.8, random: () => 0 },
    ));
    item.setDurability(Math.floor(item.baseDurability! * 0.2));
    const plan = createEquipmentRepairPlan(item, 1)!;
    assert.equal(plan.requiredMaterialCount, 2);
    assert.equal(plan.preferredMaterialItemDataId, 'refined_ruby');
    assert.equal(plan.maxDurabilityLossRate, 0.12);

    const preferredInventory = Inventory.createEmpty(801, 100);
    preferredInventory.addItem('refined_ruby', 2);
    preferredInventory.addItem('ember_alloy', 2);
    const preferred = selectEquipmentRepairMaterials(preferredInventory, item, plan)!;
    assert.deepEqual(preferred.materialNames, ['제련된 루비']);
    assert.equal(preferredInventory.consumeSelectedItems(preferred.selections), true);
    assert.equal(preferredInventory.getCount('refined_ruby'), 0);
    assert.equal(preferredInventory.getCount('ember_alloy'), 2);

    const compatibleInventory = Inventory.createEmpty(802, 100);
    compatibleInventory.addItem('ember_alloy', 2);
    const compatible = selectEquipmentRepairMaterials(compatibleInventory, item, plan)!;
    assert.deepEqual(compatible.materialNames, ['홍염강']);
    assert.equal(compatibleInventory.consumeSelectedItems(compatible.selections), true);
    assert.equal(compatibleInventory.getCount('ember_alloy'), 0);
});

test('가벼운 손상은 최대 내구도를 보존하고 심각한 손상은 10% 넘게 열화된다', () => {
    assert.equal(calculateRepairMaxDurabilityLossRate(0.2), 0);
    assert.equal(calculateRepairMaxDurabilityLossRate(0.4), 0.02);
    assert.equal(calculateRepairMaxDurabilityLossRate(0.7), 0.06);
    assert.equal(calculateRepairMaxDurabilityLossRate(0.9), 0.12);
});

test('원석 마나 수정만 가진 단조 시 정제 방법을 안내한다', () => {
    const progress = PlayerProgress.createEmpty(79);
    const inventory = Inventory.createEmpty(79, 100);
    inventory.addItem('mana_crystal', 10);
    const player = {
        userId: 79,
        progress,
        inventory,
        isDefeated: false,
        career: { hasJob: (id: string) => id === 'career:blacksmith' },
        skills: { has: () => false },
    } as unknown as Player;

    const result = startForging(player, ForgeForm.SWORD, ForgeMaterial.MANA_CRYSTAL);
    assert.equal(result.success, false);
    assert.match(result.reason ?? '', /정제 마나 수정/);
    assert.match(result.reason ?? '', /마력 제련/);
});

test('단조 곡괭이는 일반 공격력 대신 제작자 성장에 비례한 채굴력을 얻는다', () => {
    const pickaxe = Item.fromSnapshot(createForgedItemSnapshot(
        ForgeForm.PICKAXE,
        ForgeMaterial.IRON,
        {
            accuracy: 0.85,
            creatorLevel: 200,
            sensibility: 1_000,
            forgingPrecision: 1.5,
            random: () => 0,
        },
    ));
    const miningPower = pickaxe.modifiers
        ?.find(modifier => modifier.attribute === 'miningPower')?.value ?? 0;

    assert.ok(miningPower >= 700, `장인 단조 곡괭이 채굴력 ${miningPower}`);
    assert.equal(pickaxe.hasTag(GameTags.TOOL_MINING), true);
});

test('재료 속성과 랜덤 단조 성향은 이름과 상충하는 능력치 보너스를 함께 바꾼다', () => {
    const rolls = [0.99, 0.5, 0.99, 0.99, 0.99];
    const snapshot = createForgedItemSnapshot(ForgeForm.DAGGER, ForgeMaterial.RUBY, {
        accuracy: 0.9,
        random: () => rolls.shift() ?? 0.5,
        creatorUserId: 77,
    });
    const item = Item.fromSnapshot(snapshot);

    assert.equal(item.name, '브레이크제로 루비 스팅어');
    assert.equal(item.hasTag(GameTags.PROPERTY_FIRE), true);
    assert.equal(item.hasTag(GameTags.WEAPON_DAGGER), true);
    assert.ok(item.modifiers?.some(modifier => modifier.attribute === 'magicForce'));
    assert.ok(item.modifiers?.some(modifier => modifier.attribute === 'critDmg' && modifier.value >= 0.32));
    const attack = item.modifiers?.find(modifier => modifier.attribute === 'atk')?.value ?? 0;
    const balanced = Item.fromSnapshot(createForgedItemSnapshot(ForgeForm.DAGGER, ForgeMaterial.RUBY, {
        accuracy: 0.9,
        random: () => 0,
    }));
    const balancedAttack = balanced.modifiers?.find(modifier => modifier.attribute === 'atk')?.value ?? 0;
    assert.ok(attack > balancedAttack, '불안정 성향은 내구도를 희생해 공격력을 높여야 한다.');
    assert.ok(item.baseDurability! < balanced.baseDurability!);
    assert.equal(item.getMetadata<{ creatorUserId: number }>('forge')?.creatorUserId, 77);
});

test('일반 이름은 높은 확률로 나오며 성향이 있으면 평범한 이름에도 드러난다', () => {
    const balanced = Item.fromSnapshot(createForgedItemSnapshot(ForgeForm.SWORD, ForgeMaterial.IRON, {
        accuracy: 0.8,
        random: () => 0,
    }));
    const rolls = [0.99, 0, 0];
    const volatile = Item.fromSnapshot(createForgedItemSnapshot(ForgeForm.SWORD, ForgeMaterial.IRON, {
        accuracy: 0.8,
        random: () => rolls.shift() ?? 0,
    }));

    assert.equal(balanced.name, '철 장검');
    assert.equal(volatile.name, '불안정한 철 장검');
});

test('희귀 특이 각인은 기본 형태와 무관한 상충 능력치와 이름 단어를 추가한다', () => {
    const createQuirkItem = (quirkIndex: number) => {
        const rolls = [0, 0.99, (quirkIndex + 0.1) / 5, 0, 0];
        return Item.fromSnapshot(createForgedItemSnapshot(ForgeForm.SWORD, ForgeMaterial.IRON, {
            accuracy: 0.9,
            random: () => rolls.shift() ?? 0,
            creatorLevel: 200,
            sensibility: 1_000,
            forgingPrecision: 1.5,
        }));
    };

    const overdrive = createQuirkItem(0);
    const armorRend = createQuirkItem(1);
    const fatal = createQuirkItem(2);
    const lifeBound = createQuirkItem(3);
    const spellBound = createQuirkItem(4);

    assert.match(overdrive.name, /^오버드라이브 /);
    assert.ok(overdrive.modifiers?.some(modifier => modifier.attribute === 'speed' && modifier.value < 1));
    assert.ok(armorRend.modifiers?.some(modifier => modifier.attribute === 'armorPen' && modifier.value >= 28));
    assert.ok(fatal.modifiers?.some(modifier => modifier.attribute === 'critRate' && modifier.value < 0));
    assert.ok(fatal.modifiers?.some(modifier => modifier.attribute === 'critDmg' && modifier.value >= 0.55));
    assert.ok(lifeBound.modifiers?.some(modifier => modifier.attribute === 'maxLife' && modifier.value >= 900));
    assert.ok(spellBound.modifiers?.some(modifier => modifier.attribute === 'magicForce' && modifier.value >= 80));
    assert.equal(spellBound.getMetadata<{ quirk: string }>('forge')?.quirk, 'spell_bound');

    const extremeRolls = [0, 0.99, 0.99, 0, 0];
    const extremeSpellBound = Item.fromSnapshot(createForgedItemSnapshot(ForgeForm.SWORD, ForgeMaterial.IRON, {
        accuracy: 0.9,
        random: () => extremeRolls.shift() ?? 0,
        creatorLevel: 10_000,
        sensibility: 1_000_000,
        forgingPrecision: 2,
    }));
    const extremeMagicForce = extremeSpellBound.modifiers
        ?.find(modifier => modifier.attribute === 'magicForce')?.value ?? 0;
    assert.equal(extremeMagicForce, 160);
});

test('방어 형태는 무기 전용 치명타 성향을 제외한다', () => {
    const shield = Item.fromSnapshot(createForgedItemSnapshot(ForgeForm.SHIELD, ForgeMaterial.IRON, {
        accuracy: 0.85,
        random: () => 0.99,
    }));
    assert.ok(!shield.modifiers?.some(modifier => modifier.attribute === 'critDmg'));
    assert.ok(shield.modifiers?.some(modifier => modifier.attribute === 'magicForce'));
});

test('완벽한 다이아몬드 도끼는 형태 고유 명명 규칙을 사용한다', () => {
    const snapshot = createForgedItemSnapshot(ForgeForm.AXE, ForgeMaterial.DIAMOND, {
        accuracy: 1,
        random: () => 0.42,
    });
    assert.equal(Item.fromSnapshot(snapshot).name, '익스클리프 다이아몬드 액스');
});

test('엘리트 대장장이 전용 단조 형태는 해당 계보 스킬이 있을 때만 열린다', () => {
    const owned = new Set<string>();
    const player = { skills: { has: (id: string) => owned.has(id) } } as unknown as Player;

    assert.equal(canUseForgeForm(player, ForgeForm.SWORD), true);
    assert.equal(canUseForgeForm(player, ForgeForm.STAFF_FRAME), false);
    assert.equal(canUseForgeForm(player, ForgeForm.BOW_LIMB), false);
    assert.ok(!getAvailableForgeForms(player).includes(ForgeForm.ARROWHEADS));

    owned.add('staff_infusing');
    assert.equal(canUseForgeForm(player, ForgeForm.STAFF_FRAME), true);
    assert.equal(canUseForgeForm(player, ForgeForm.BOW_LIMB), false);

    owned.add('artificer_manufacturing');
    assert.equal(canUseForgeForm(player, ForgeForm.BOW_LIMB), true);
    assert.equal(canUseForgeForm(player, ForgeForm.ARROWHEADS), true);
});

test('마도 대장장이는 지팡이 틀의 품질을 유지하며 마법 무기로 완성한다', () => {
    const frame = Item.fromSnapshot(createForgedItemSnapshot(
        ForgeForm.STAFF_FRAME,
        ForgeMaterial.RUBY,
        { accuracy: 0.9, random: () => 0, creatorLevel: 200, sensibility: 1_000 },
    ));
    const result = createInfusedStaffSnapshot(frame);
    assert.equal(result.success, true);
    const staff = Item.fromSnapshot(result.snapshot!);

    assert.equal(staff.itemDataId, 'forged_staff');
    assert.equal(staff.name, '루비 지팡이');
    assert.equal(staff.hasTag(GameTags.WEAPON_STAFF), true);
    assert.equal(staff.hasTag(GameTags.PROPERTY_FIRE), true);
    assert.ok(staff.modifiers?.some(modifier => modifier.attribute === 'magicForce' && modifier.value > 0));
    assert.ok(staff.modifiers?.some(modifier => modifier.attribute === 'magicPen' && modifier.value > 0));
    assert.ok(staff.modifiers?.some(modifier =>
        modifier.attribute === 'projectileAcceleration' && modifier.value > 1));
    assert.equal(staff.getMetadata('basicAttackOverride'), 'projectile');
});

test('기계 장인은 단조 활대와 화살촉을 기존 투사체 시스템과 호환되는 병기로 조립한다', () => {
    const limb = Item.fromSnapshot(createForgedItemSnapshot(
        ForgeForm.BOW_LIMB,
        ForgeMaterial.DIAMOND,
        { accuracy: 0.85, random: () => 0, creatorLevel: 200, sensibility: 1_000 },
    ));
    const arrowheads = Item.fromSnapshot(createForgedItemSnapshot(
        ForgeForm.ARROWHEADS,
        ForgeMaterial.IRON,
        { accuracy: 0.85, random: () => 0, creatorLevel: 200, sensibility: 1_000 },
    ));
    const bowResult = createAssembledBowSnapshot(limb);
    const arrowResult = createForgedArrowSnapshot(arrowheads);
    const bow = Item.fromSnapshot(bowResult.snapshot!);
    const arrows = Item.fromSnapshot(arrowResult.snapshot!);

    assert.equal(bowResult.success, true);
    assert.equal(bow.itemDataId, 'forged_bow');
    assert.equal(bow.name, '다이아몬드 활');
    assert.equal(bow.hasTag(GameTags.WEAPON_BOW), true);
    assert.equal(bow.hasTag(GameTags.MATERIAL_DIAMOND), true);
    assert.ok(bow.modifiers?.some(modifier => modifier.attribute === 'atk' && modifier.value > 0));
    assert.ok(bow.modifiers?.some(modifier =>
        modifier.attribute === 'projectileAcceleration' && modifier.value > 1));

    assert.equal(arrowResult.success, true);
    assert.equal(arrows.itemDataId, 'wooden_arrow');
    assert.equal(arrows.count, 10);
    assert.equal(arrows.name, '철 화살');
    assert.equal(arrows.hasTag(GameTags.MATERIAL_IRON), true);
    const projectile = arrows.getMetadata<{
        overrides?: { damageBonus?: number; tags?: string[] };
    }>('projectile');
    assert.ok(projectile?.overrides?.damageBonus! > 2);
    assert.equal(arrows.hasTag(GameTags.PROPERTY_METAL), true);
    assert.equal(projectile?.overrides?.tags?.includes(GameTags.PROPERTY_METAL), false);
    assert.equal(projectile?.overrides?.tags?.includes(GameTags.MATERIAL_IRON), true);
});

test('장인의 명명은 직접 만든 단조품만 안전한 이름으로 변경한다', () => {
    const own = Item.fromSnapshot(createForgedItemSnapshot(ForgeForm.SWORD, ForgeMaterial.IRON, {
        accuracy: 0.8,
        random: () => 0,
        creatorUserId: 77,
    }));
    const other = Item.fromSnapshot(createForgedItemSnapshot(ForgeForm.SWORD, ForgeMaterial.IRON, {
        accuracy: 0.8,
        random: () => 0,
        creatorUserId: 88,
    }));

    assert.deepEqual(renameForgedItem(own, 77, '  별을 벼린 검  '), { success: true, name: '별을 벼린 검' });
    assert.equal(own.name, '별을 벼린 검');
    assert.equal(renameForgedItem(other, 77, '도둑 이름').success, false);
    assert.equal(renameForgedItem(own, 77, '[color=red]검').success, false);
});

test('장비 강화는 원래 긍정 능력치에 비례해 +15에서 90%를 추가한다', () => {
    const weapon = Item.fromSnapshot(createForgedItemSnapshot(ForgeForm.SWORD, ForgeMaterial.IRON, {
        accuracy: 0.8,
        random: () => 0,
        creatorLevel: 200,
        sensibility: 1_000,
    }));
    const attackBefore = weapon.modifiers?.filter(modifier => modifier.attribute === 'atk' && modifier.op === 'add')
        .reduce((sum, modifier) => sum + modifier.value, 0) ?? 0;

    for (let level = 1; level <= MAX_EQUIPMENT_REINFORCEMENT; level++) {
        const result = reinforceEquipment(weapon, { random: () => 0 });
        assert.equal(result.success, true);
        assert.equal(result.outcome, 'success');
        assert.equal(result.level, level);
        assert.ok(result.addedModifiers?.every(modifier => modifier.op === 'add' ? modifier.value > 0 : modifier.value > 1));
    }

    const attackAfter = weapon.modifiers?.filter(modifier => modifier.attribute === 'atk' && modifier.op === 'add')
        .reduce((sum, modifier) => sum + modifier.value, 0) ?? 0;
    assert.equal(weapon.reinforcementLevel, 15);
    assert.match(weapon.name, / \+15$/);
    assert.ok(Math.abs(attackAfter / attackBefore - 1.9) < 0.0001, `강화 전 ${attackBefore}, 강화 후 ${attackAfter}`);
    assert.equal(reinforceEquipment(weapon, { random: () => 0 }).success, false);
});

test('고강화 실패는 확률표에 따라 유지·하락·파괴로 갈린다', () => {
    const createWeapon = () => Item.fromSnapshot(createForgedItemSnapshot(
        ForgeForm.SWORD,
        ForgeMaterial.IRON,
        { accuracy: 0.8, random: () => 0, creatorLevel: 200, sensibility: 1_000 },
    ));
    const retained = createWeapon();
    assert.equal(reinforceEquipment(retained, { random: () => 0 }).success, true);
    assert.equal(reinforceEquipment(retained, { random: () => 0.99 }).outcome, 'retained');
    assert.equal(retained.reinforcementLevel, 1);

    const downgraded = createWeapon();
    for (let level = 1; level <= 6; level++) {
        reinforceEquipment(downgraded, { random: () => 0 });
    }
    const attackBeforeDowngrade = downgraded.modifiers?.filter(modifier =>
        modifier.attribute === 'atk' && modifier.op === 'add'
    ).reduce((sum, modifier) => sum + modifier.value, 0) ?? 0;
    const downgrade = reinforceEquipment(downgraded, { random: () => 0.95 });
    assert.equal(downgrade.outcome, 'downgraded');
    assert.equal(downgraded.reinforcementLevel, 5);
    const attackAfterDowngrade = downgraded.modifiers?.filter(modifier =>
        modifier.attribute === 'atk' && modifier.op === 'add'
    ).reduce((sum, modifier) => sum + modifier.value, 0) ?? 0;
    assert.ok(attackAfterDowngrade < attackBeforeDowngrade);

    const destroyed = createWeapon();
    for (let level = 1; level <= 8; level++) {
        reinforceEquipment(destroyed, { random: () => 0 });
    }
    assert.equal(reinforceEquipment(destroyed, { random: () => 0.99 }).outcome, 'destroyed');
    assert.equal(destroyed.reinforcementLevel, 8);
});

test('모든 강화 단계 확률은 정확히 100%이며 하락과 파괴는 지정 단계부터 시작한다', () => {
    for (const stage of EquipmentReinforcementStage.values()) {
        assert.equal(
            stage.successRate + stage.retainRate + stage.downgradeRate + stage.destructionRate,
            100,
        );
        assert.equal(stage.downgradeRate > 0, stage.level >= 7);
        assert.equal(stage.destructionRate > 0, stage.level >= 9);
    }
});

test('방패와 전신 방어구도 원래 방어·생존 부가 수치에 비례해 강화된다', () => {
    const shield = Item.fromSnapshot(createForgedItemSnapshot(ForgeForm.SHIELD, ForgeMaterial.IRON, {
        accuracy: 0.8,
        random: () => 0,
    }));
    assert.equal(reinforceEquipment(shield, { random: () => 0 }).success, true);
    assert.equal(shield.reinforcementLevel, 1);

    const armor = Item.fromSnapshot({
        itemDataId: 'devouring_root_cuirass',
        count: 1,
        durability: null,
        metadataDelta: null,
        tags: [],
    });
    const before = armor.getReinforcementBaseModifiers();
    assert.equal(before.filter(modifier => modifier.op === 'add' && modifier.value > 0).length, 4);
    assert.equal(reinforceEquipment(armor, { random: () => 0 }).success, true);
    for (const modifier of before.filter(modifier => modifier.op === 'add' && modifier.value > 0)) {
        const after = armor.modifiers?.filter(candidate =>
            candidate.attribute === modifier.attribute && candidate.op === 'add'
        ).reduce((sum, candidate) => sum + candidate.value, 0) ?? 0;
        const original = before.filter(candidate =>
            candidate.attribute === modifier.attribute && candidate.op === 'add'
        ).reduce((sum, candidate) => sum + candidate.value, 0);
        assert.ok(Math.abs(after / original - 1.05) < 0.0001, `${modifier.attribute}: ${original} → ${after}`);
    }
});

test('곱연산 부가 능력치는 1을 넘는 보너스 부분만 비례 강화한다', () => {
    const staff = Item.fromSnapshot({
        itemDataId: 'starwood_staff',
        count: 1,
        durability: null,
        metadataDelta: null,
        tags: [],
    });
    for (let level = 1; level <= MAX_EQUIPMENT_REINFORCEMENT; level++) {
        assert.equal(reinforceEquipment(staff, { random: () => 0 }).success, true);
    }
    const acceleration = staff.modifiers?.filter(modifier =>
        modifier.attribute === 'projectileAcceleration' && modifier.op === 'multiply'
    ).reduce((product, modifier) => product * modifier.value, 1) ?? 1;

    assert.ok(Math.abs(acceleration - (1 + 0.14 * 1.9)) < 0.0001, `투사체 가속 배율 ${acceleration}`);
});

test('기존 고정 수치 강화 기록도 저장된 단계에 맞는 비례 강화로 소급 계산한다', () => {
    const weapon = Item.fromSnapshot(createForgedItemSnapshot(ForgeForm.SWORD, ForgeMaterial.IRON, {
        accuracy: 0.8,
        random: () => 0,
        creatorLevel: 200,
        sensibility: 1_000,
    }));
    const baseAttack = weapon.getReinforcementBaseModifiers().filter(modifier =>
        modifier.attribute === 'atk' && modifier.op === 'add'
    ).reduce((sum, modifier) => sum + modifier.value, 0);
    weapon.setMetadata(ItemMetadataKeys.REINFORCEMENT, {
        level: 10,
        modifiers: [{ attribute: 'atk', op: 'add', value: 99_999 }],
    });
    const reinforcedAttack = weapon.modifiers?.filter(modifier =>
        modifier.attribute === 'atk' && modifier.op === 'add'
    ).reduce((sum, modifier) => sum + modifier.value, 0) ?? 0;

    assert.ok(Math.abs(reinforcedAttack / baseAttack - 1.6) < 0.0001);
});

test('고레벨 제작자의 감각과 제련 정밀도는 단조 장비를 고레벨 드롭 이상으로 성장시킨다', () => {
    const novice = Item.fromSnapshot(createForgedItemSnapshot(ForgeForm.SWORD, ForgeMaterial.IRON, {
        accuracy: 1,
        random: () => 0,
        creatorLevel: 20,
        sensibility: 100,
        forgingPrecision: 0.15,
    }));
    const master = Item.fromSnapshot(createForgedItemSnapshot(ForgeForm.SWORD, ForgeMaterial.DIAMOND, {
        accuracy: 1,
        random: () => 0,
        creatorLevel: 200,
        sensibility: 1_000,
        forgingPrecision: 1.5,
    }));
    const noviceAttack = novice.modifiers?.find(modifier => modifier.attribute === 'atk')?.value ?? 0;
    const masterAttack = master.modifiers?.find(modifier => modifier.attribute === 'atk')?.value ?? 0;

    assert.ok(noviceAttack >= 40 && noviceAttack <= 60, `초급 단조 공격력 ${noviceAttack}`);
    assert.ok(masterAttack >= 600, `장인 단조 공격력 ${masterAttack}`);
    assert.ok(masterAttack > noviceAttack * 10);
    assert.ok(master.baseDurability! > novice.baseDurability! * 2);
});

test('감각 1000의 200레벨 대장장이가 만든 철 장검도 근력 성장에 밀리지 않는 화력을 가진다', () => {
    const weapon = Item.fromSnapshot(createForgedItemSnapshot(ForgeForm.SWORD, ForgeMaterial.IRON, {
        accuracy: 0.85,
        random: () => 0,
        creatorLevel: 200,
        sensibility: 1_000,
        forgingPrecision: 1.5,
    }));
    const attack = weapon.modifiers?.find(modifier => modifier.attribute === 'atk')?.value ?? 0;
    assert.ok(attack >= 450, `장인 철 장검 공격력 ${attack}`);
    assert.ok(attack <= 550, `장인 철 장검 공격력 ${attack}`);
});

test('후반 명품 단조 무기는 Lv.950 상점 무기의 주·부가 능력치 예산을 따라간다', () => {
    const options = {
        accuracy: 0.85,
        random: () => 0,
        creatorLevel: 950,
        sensibility: 2_087,
        forgingPrecision: 3.13,
    };
    const additive = (item: Item, attribute: string) => item.modifiers
        ?.filter(modifier => modifier.attribute === attribute && modifier.op === 'add')
        .reduce((sum, modifier) => sum + modifier.value, 0) ?? 0;
    const multiplier = (item: Item, attribute: string) => item.modifiers
        ?.filter(modifier => modifier.attribute === attribute && modifier.op === 'multiply')
        .reduce((product, modifier) => product * modifier.value, 1) ?? 1;
    const master = (itemDataId: string) => Item.fromSnapshot({
        itemDataId,
        count: 1,
        durability: null,
        metadataDelta: null,
        tags: [],
    });

    const sword = Item.fromSnapshot(createForgedItemSnapshot(
        ForgeForm.SWORD, ForgeMaterial.EMBER_ALLOY, options,
    ));
    const dagger = Item.fromSnapshot(createForgedItemSnapshot(
        ForgeForm.DAGGER, ForgeMaterial.EMBER_ALLOY, options,
    ));
    const limb = Item.fromSnapshot(createForgedItemSnapshot(
        ForgeForm.BOW_LIMB, ForgeMaterial.EMBER_ALLOY, options,
    ));
    const bowResult = createAssembledBowSnapshot(limb);
    assert.ok(bowResult.snapshot);
    const bow = Item.fromSnapshot(bowResult.snapshot);
    const frame = Item.fromSnapshot(createForgedItemSnapshot(
        ForgeForm.STAFF_FRAME, ForgeMaterial.MANA_CRYSTAL, options,
    ));
    const staffResult = createInfusedStaffSnapshot(frame);
    assert.ok(staffResult.snapshot);
    const staff = Item.fromSnapshot(staffResult.snapshot);

    const shopSword = master('originboundary_sword');
    const shopDagger = master('originboundary_dagger');
    const shopBow = master('originboundary_bow');
    const shopStaff = master('originboundary_staff');
    assert.ok(getItemData('originboundary_staff'));

    assert.ok(additive(sword, 'atk') >= additive(shopSword, 'atk') * 1.15);
    assert.ok(additive(sword, 'armorPen') >= additive(shopSword, 'armorPen') * 0.85);
    assert.ok(additive(dagger, 'atk') >= additive(shopDagger, 'atk'));
    assert.ok(additive(dagger, 'armorPen') >= additive(shopDagger, 'armorPen') * 0.9);
    assert.ok(additive(dagger, 'speed') >= additive(shopDagger, 'speed'));
    assert.ok(additive(bow, 'atk') >= additive(shopBow, 'atk') * 1.2);
    assert.ok(additive(bow, 'critRate') >= additive(shopBow, 'critRate') * 0.9);
    assert.ok(multiplier(bow, 'projectileAcceleration') >= multiplier(shopBow, 'projectileAcceleration'));
    assert.ok(additive(staff, 'magicForce') >= additive(shopStaff, 'magicForce') * 1.1);
    assert.ok(additive(staff, 'magicPen') >= additive(shopStaff, 'magicPen'));
    assert.ok(additive(staff, 'mentalityRegen') >= additive(shopStaff, 'mentalityRegen') * 0.95);
    assert.ok(multiplier(staff, 'projectileAcceleration') >= multiplier(shopStaff, 'projectileAcceleration'));
});

test('기존 후반 단조품도 저장된 단조 기록으로 새 성장 공식을 소급 적용한다', () => {
    const legacyStaff = Item.fromSnapshot({
        itemDataId: 'forged_staff',
        count: 1,
        durability: 1_000,
        metadataDelta: {
            [ItemMetadataKeys.INSTANCE_MODIFIERS]: [
                { attribute: 'magicForce', op: 'add', value: 1_900 },
                { attribute: 'magicPen', op: 'add', value: 220 },
                { attribute: 'mentalityRegen', op: 'add', value: 11.5 },
                { attribute: 'projectileAcceleration', op: 'multiply', value: 1.9 },
            ],
            [ItemMetadataKeys.FORGE]: {
                form: 'staff',
                itemLevel: 900,
                accuracy: 0.85,
                forgingPrecision: 3,
            },
        },
        tags: [],
    });
    const additive = (attribute: string) => legacyStaff.modifiers
        ?.filter(modifier => modifier.attribute === attribute && modifier.op === 'add')
        .reduce((sum, modifier) => sum + modifier.value, 0) ?? 0;
    const acceleration = legacyStaff.modifiers
        ?.filter(modifier => modifier.attribute === 'projectileAcceleration' && modifier.op === 'multiply')
        .reduce((product, modifier) => product * modifier.value, 1) ?? 1;

    assert.ok(additive('magicForce') > 2_300);
    assert.ok(additive('magicPen') > 500);
    assert.ok(additive('mentalityRegen') >= 67);
    assert.ok(acceleration >= 4);
});

test('기존 미완성 지팡이 틀과 활대는 완성 보정을 한 번만 적용한다', () => {
    const legacyMetadata = (form: string, modifiers: ItemMetadataValue[]) => ({
        [ItemMetadataKeys.INSTANCE_MODIFIERS]: modifiers,
        [ItemMetadataKeys.FORGE]: {
            form,
            itemLevel: 900,
            accuracy: 0.85,
            forgingPrecision: 3,
        },
    });
    const legacyFrame = Item.fromSnapshot({
        itemDataId: 'forged_staff_frame',
        count: 1,
        durability: 1_000,
        metadataDelta: legacyMetadata('staff_frame', [
            { attribute: 'magicForce', op: 'add', value: 1_900 },
        ]),
        tags: [],
    });
    const legacyLimb = Item.fromSnapshot({
        itemDataId: 'forged_bow_limb',
        count: 1,
        durability: 1_000,
        metadataDelta: legacyMetadata('bow_limb', [
            { attribute: 'atk', op: 'add', value: 1_900 },
        ]),
        tags: [],
    });

    const staffResult = createInfusedStaffSnapshot(legacyFrame);
    const bowResult = createAssembledBowSnapshot(legacyLimb);
    assert.ok(staffResult.snapshot);
    assert.ok(bowResult.snapshot);
    const staff = Item.fromSnapshot(staffResult.snapshot);
    const bow = Item.fromSnapshot(bowResult.snapshot);
    const staffAcceleration = staff.modifiers
        ?.filter(modifier => modifier.attribute === 'projectileAcceleration' && modifier.op === 'multiply')
        .reduce((product, modifier) => product * modifier.value, 1) ?? 1;
    const bowAcceleration = bow.modifiers
        ?.filter(modifier => modifier.attribute === 'projectileAcceleration' && modifier.op === 'multiply')
        .reduce((product, modifier) => product * modifier.value, 1) ?? 1;

    assert.equal(staffAcceleration, calculateForgedProjectileAcceleration(900));
    assert.equal(bowAcceleration, calculateForgedProjectileAcceleration(900));
});

test('대장장이 직업의 마력 제련은 원광을 레벨 수량만큼 일괄 교환한다', () => {
    const progress = PlayerProgress.createEmpty(77);
    const inventory = Inventory.createEmpty(77, 100);
    let mentality = 100;
    let characterExperience = 0;
    const player = {
        userId: 77,
        maxExp: 1_000,
        progress,
        inventory,
        career: { hasJob: (id: string) => id === 'career:blacksmith' },
        skills: { has: () => false },
        canSpendMentality: (amount: number) => mentality >= amount,
        spendMentality: (amount: number) => { if (mentality < amount) return false; mentality -= amount; return true; },
        gainExp: (amount: number) => { characterExperience += amount; return []; },
    } as unknown as Player;

    assert.equal(canUseMetalForging(player), true);
    inventory.addItem('iron_ore', 5);
    const skill = new Skill({ playerId: 77, skillDataId: 'arcane_smelting', level: 2 });
    const context = { owner: player as unknown as Entity, player, skill };
    assert.equal(skill.data.canActivate?.(context).accepted, true);
    skill.data.onStart?.(context);
    assert.equal(inventory.getCount('iron_ore'), 1);
    assert.equal(inventory.getCount('refined_iron'), 4);
    assert.equal(mentality, 82);
    assert.equal(characterExperience, 10);
});

test('제련은 요구 경험치에, 단조는 완성품 레벨과 품질에 비례해 성장한다', () => {
    const low = { maxExp: 4_000 };
    const high = { maxExp: 80_000 };

    assert.equal(calculateSmeltingExperience(low, 4), 40);
    assert.equal(calculateSmeltingExperience(high, 4), 800);
    assert.equal(calculateSmeltingExperience(high, 100), 3_200);
    assert.equal(calculateForgingExperience(200, ForgeQuality.GOOD), 3_200);
    assert.equal(calculateForgingExperience(200, ForgeQuality.MASTERWORK), 4_640);

    const ironLevel = calculateForgedItemLevel(ForgeMaterial.IRON, { accuracy: 0.85, creatorLevel: 200 });
    const diamondLevel = calculateForgedItemLevel(ForgeMaterial.DIAMOND, { accuracy: 0.85, creatorLevel: 200 });
    assert.ok(diamondLevel > ironLevel);
    assert.ok(calculateForgingExperience(diamondLevel, ForgeQuality.EXCELLENT)
        > calculateForgingExperience(ironLevel, ForgeQuality.GOOD));
});

test('홍염강은 화산 전용 화염 합금이며 일반 철보다 어려운 리듬과 높은 보정을 가진다', () => {
    const item = Item.fromSnapshot(createForgedItemSnapshot(ForgeForm.AXE, ForgeMaterial.EMBER_ALLOY, {
        accuracy: 0.85,
        random: () => 0,
    }));
    assert.equal(ForgeMaterial.fromInput('홍염강'), ForgeMaterial.EMBER_ALLOY);
    assert.equal(ForgeMaterial.fromInput('ember_alloy'), ForgeMaterial.EMBER_ALLOY);
    assert.equal(item.hasTag(GameTags.MATERIAL_EMBER), true);
    assert.equal(item.hasTag(GameTags.PROPERTY_FIRE), true);

    const iron = createForgingRhythmConfig(ForgeForm.AXE, ForgeMaterial.IRON, 0);
    const ember = createForgingRhythmConfig(ForgeForm.AXE, ForgeMaterial.EMBER_ALLOY, 0);
    assert.ok(ember.difficulty > iron.difficulty);
    assert.ok(ember.qualityBonus > iron.qualityBonus);
    assert.ok(ember.beatTimesMs.length > iron.beatTimesMs.length);
});

test('제련 정밀도는 45% 이후에도 리듬 판정과 완성품 숙련을 계속 높인다', () => {
    const precision45 = createForgingRhythmConfig(ForgeForm.CHESTPLATE, ForgeMaterial.IRON, 0.45);
    const precision100 = createForgingRhythmConfig(ForgeForm.CHESTPLATE, ForgeMaterial.IRON, 1);
    const precision200 = calculateForgeCraftsmanship({ accuracy: 1, forgingPrecision: 2 });
    const precision300 = calculateForgeCraftsmanship({ accuracy: 1, forgingPrecision: 3 });

    assert.ok(precision100.hitWindowMs > precision45.hitWindowMs);
    assert.ok(precision100.perfectWindowMs > precision45.perfectWindowMs);
    assert.ok(precision300.primaryPower > precision200.primaryPower);
    assert.ok(precision300.multiplier > precision200.multiplier);
});

test('금속 단조 스킬만 보유해도 단조 권한을 가진다', () => {
    const progress = PlayerProgress.createEmpty(78);
    const owned = new Set(['metal_forging']);
    const player = {
        progress,
        career: { hasJob: () => false },
        skills: { has: (id: string) => owned.has(id) },
    } as unknown as Player;

    assert.equal(progress.getFlag('profession:blacksmith'), false);
    assert.equal(canUseMetalForging(player), true);
    owned.clear();
    assert.equal(canUseMetalForging(player), false);
});
