import assert from 'node:assert/strict';
import test from 'node:test';
import { GameTags } from '../../../shared/tags.js';
import { Item } from './Item.js';
import { createForgedItemSnapshot, ForgeForm, ForgeMaterial } from './Forging.js';
import { PlayerProgress } from './Progress.js';
import Skill from './Skill.js';
import type Player from './Player.js';
import type Entity from './Entity.js';
import Inventory from './Inventory.js';
import {
    calculateForgingExperience,
    calculateSmeltingExperience,
    canUseMetalForging,
} from '../modules/forging.js';
import '../data/items.js';
import '../data/progress.js';
import '../data/skills.js';

test('단조 결과는 형태·재료·정확도 어휘군과 난수 변형을 조합해 RPG식 이름을 만든다', () => {
    const low = createForgedItemSnapshot(ForgeForm.SWORD, ForgeMaterial.IRON, { accuracy: 0.5, random: () => 0 });
    const high = createForgedItemSnapshot(ForgeForm.SWORD, ForgeMaterial.IRON, { accuracy: 1, random: () => 0 });
    const lowItem = Item.fromSnapshot(low);
    const highItem = Item.fromSnapshot(high);

    assert.equal(low.itemDataId, 'forged_sword');
    assert.equal(lowItem.name, '애시본 철 블레이드');
    assert.equal(highItem.name, '아스트라엘 철 블레이드');
    assert.ok(highItem.modifiers![0].value > lowItem.modifiers![0].value);
    assert.ok(highItem.baseDurability! > lowItem.baseDurability!);
    assert.equal(highItem.hasTag(GameTags.MATERIAL_IRON), true);
    assert.equal(highItem.hasTag(GameTags.PROPERTY_METAL), true);
});

test('재료 속성과 랜덤 단조 성향은 이름과 상충하는 능력치 보너스를 함께 바꾼다', () => {
    const snapshot = createForgedItemSnapshot(ForgeForm.DAGGER, ForgeMaterial.RUBY, {
        accuracy: 0.9,
        random: () => 0.99,
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

    assert.ok(noviceAttack >= 20 && noviceAttack <= 40, `초급 단조 공격력 ${noviceAttack}`);
    assert.ok(masterAttack >= 90, `장인 단조 공격력 ${masterAttack}`);
    assert.ok(masterAttack > noviceAttack * 3);
    assert.ok(master.baseDurability! > novice.baseDurability! * 2);
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

test('제련과 단조 경험치는 현재 레벨 요구 경험치에 비례해 고레벨에서도 성장한다', () => {
    const low = { maxExp: 4_000 };
    const high = { maxExp: 80_000 };

    assert.equal(calculateSmeltingExperience(low, 4), 40);
    assert.equal(calculateSmeltingExperience(high, 4), 800);
    assert.equal(calculateSmeltingExperience(high, 100), 3_200);
    assert.equal(calculateForgingExperience(high, ForgeMaterial.IRON, 1), 2_880);
    assert.ok(calculateForgingExperience(high, ForgeMaterial.DIAMOND, 1)
        > calculateForgingExperience(high, ForgeMaterial.IRON, 1));
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
