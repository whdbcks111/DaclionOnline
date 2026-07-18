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
import { canUseMetalForging } from '../modules/forging.js';
import '../data/items.js';
import '../data/progress.js';
import '../data/skills.js';

test('단조 결과는 형태·재료·정확도를 결정적으로 반영하고 trait만 난수로 선택한다', () => {
    const low = createForgedItemSnapshot(ForgeForm.SWORD, ForgeMaterial.IRON, { accuracy: 0.5, random: () => 0 });
    const high = createForgedItemSnapshot(ForgeForm.SWORD, ForgeMaterial.IRON, { accuracy: 1, random: () => 0 });
    const lowItem = Item.fromSnapshot(low);
    const highItem = Item.fromSnapshot(high);

    assert.equal(low.itemDataId, 'forged_sword');
    assert.equal(lowItem.name, '균형 잡힌 철 장검');
    assert.ok(highItem.modifiers![0].value > lowItem.modifiers![0].value);
    assert.ok(highItem.baseDurability! > lowItem.baseDurability!);
    assert.equal(highItem.hasTag(GameTags.MATERIAL_IRON), true);
    assert.equal(highItem.hasTag(GameTags.PROPERTY_METAL), true);
});

test('재료 속성과 랜덤 단조 trait는 결과 태그와 보조 능력치를 바꾼다', () => {
    const snapshot = createForgedItemSnapshot(ForgeForm.DAGGER, ForgeMaterial.RUBY, {
        accuracy: 0.9,
        random: () => 0.99,
        creatorUserId: 77,
    });
    const item = Item.fromSnapshot(snapshot);

    assert.equal(item.name, '정밀한 홍염 단검');
    assert.equal(item.hasTag(GameTags.PROPERTY_FIRE), true);
    assert.equal(item.hasTag(GameTags.WEAPON_DAGGER), true);
    assert.ok(item.modifiers?.some(modifier => modifier.attribute === 'magicForce'));
    assert.ok(item.modifiers?.some(modifier => modifier.attribute === 'armorPen'));
    assert.equal(item.getMetadata<{ creatorUserId: number }>('forge')?.creatorUserId, 77);
});

test('대장장이 직업의 마력 제련은 원광을 레벨 수량만큼 일괄 교환한다', () => {
    const progress = PlayerProgress.createEmpty(77);
    const inventory = Inventory.createEmpty(77, 100);
    let mentality = 100;
    const player = {
        userId: 77,
        progress,
        inventory,
        career: { hasJob: (id: string) => id === 'career:blacksmith' },
        skills: { has: () => false },
        canSpendMentality: (amount: number) => mentality >= amount,
        spendMentality: (amount: number) => { if (mentality < amount) return false; mentality -= amount; return true; },
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
