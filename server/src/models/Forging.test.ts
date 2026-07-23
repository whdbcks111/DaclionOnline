import assert from 'node:assert/strict';
import test from 'node:test';
import { GameTags } from '../../../shared/tags.js';
import { Item } from './Item.js';
import {
    MAX_WEAPON_REINFORCEMENT,
    calculateForgedItemLevel,
    createForgedItemSnapshot,
    ForgeForm,
    ForgeMaterial,
    ForgeQuality,
    reinforceWeapon,
    renameForgedItem,
} from './Forging.js';
import { PlayerProgress } from './Progress.js';
import Skill from './Skill.js';
import type Player from './Player.js';
import type Entity from './Entity.js';
import Inventory from './Inventory.js';
import {
    calculateForgingExperience,
    calculateSmeltingExperience,
    canUseMetalForging,
    createForgingRhythmConfig,
} from '../modules/forging.js';
import '../data/items.js';
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
        assert.match(item.description, /^Lv\.\d+ 우수 단조품\./);
    }
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

test('전투 대장장이 무기 강화는 +5까지 실패 없이 긍정 능력치를 누적한다', () => {
    const weapon = Item.fromSnapshot(createForgedItemSnapshot(ForgeForm.SWORD, ForgeMaterial.IRON, {
        accuracy: 0.8,
        random: () => 0,
        creatorLevel: 200,
        sensibility: 1_000,
    }));
    const attackBefore = weapon.modifiers?.filter(modifier => modifier.attribute === 'atk' && modifier.op === 'add')
        .reduce((sum, modifier) => sum + modifier.value, 0) ?? 0;

    for (let level = 1; level <= MAX_WEAPON_REINFORCEMENT; level++) {
        const result = reinforceWeapon(weapon, { creatorLevel: 200, sensibility: 1_000, skillLevel: level });
        assert.equal(result.success, true);
        assert.equal(result.level, level);
        assert.ok(result.addedModifiers?.every(modifier => modifier.op === 'add' ? modifier.value > 0 : modifier.value > 1));
    }

    const attackAfter = weapon.modifiers?.filter(modifier => modifier.attribute === 'atk' && modifier.op === 'add')
        .reduce((sum, modifier) => sum + modifier.value, 0) ?? 0;
    assert.equal(weapon.reinforcementLevel, 5);
    assert.match(weapon.name, / \+5$/);
    assert.ok(attackAfter >= attackBefore + 150, `강화 전 ${attackBefore}, 강화 후 ${attackAfter}`);
    assert.equal(reinforceWeapon(weapon, { creatorLevel: 200, sensibility: 1_000, skillLevel: 5 }).success, false);
});

test('무기가 아닌 장비는 강화할 수 없다', () => {
    const shield = Item.fromSnapshot(createForgedItemSnapshot(ForgeForm.SHIELD, ForgeMaterial.IRON, {
        accuracy: 0.8,
        random: () => 0,
    }));
    assert.equal(reinforceWeapon(shield, { creatorLevel: 200, sensibility: 1_000, skillLevel: 1 }).success, false);
    assert.equal(shield.reinforcementLevel, 0);
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
