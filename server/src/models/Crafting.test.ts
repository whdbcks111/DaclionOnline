import assert from 'node:assert/strict';
import test from 'node:test';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
import Inventory from './Inventory.js';
import { defineItem } from './Item.js';
import { PlayerProgress } from './Progress.js';
import type Player from './Player.js';
import {
    CraftingRecipeIngredient,
    defineCraftingRecipe,
    executeCrafting,
} from './Crafting.js';
import { parseCraftingCommandRemainder } from '../commands/crafting.js';

function defineTestItem(id: string, category: string, stackable: boolean, durability: number | null): void {
    defineItem({
        id,
        name: id,
        description: '',
        category,
        weight: 1,
        stackable,
        maxStack: stackable ? 99 : 1,
        baseMetadata: null,
        onUse: null,
        equipSlot: null,
        modifiers: null,
        baseDurability: durability,
        tags: [],
    });
}

defineTestItem('craft_test_old_sword', '검', false, 100);
defineTestItem('craft_test_new_sword', '검', false, 100);
defineTestItem('craft_test_repair_kit', '재료', true, null);
defineTestItem('craft_test_result', '결과', true, null);

class TestCraftingPlayer extends Entity {
    override readonly name = '제작 시험 플레이어';
    readonly userId = 7401;
    readonly inventory = Inventory.createEmpty(this.userId, 100);
    readonly progress = PlayerProgress.createEmpty(this.userId);

    constructor() {
        super(1, 0, 'test', { maxLife: 100 }, Equipment.createEmpty());
    }

    override get isPlayer(): boolean { return true; }
    override get playerUserId(): number { return this.userId; }
}

test('겹치는 재료 필터도 같은 아이템 수량을 중복하지 않고 가능한 조합을 찾는다', () => {
    const inventory = Inventory.createEmpty(1, 100);
    inventory.addItem('craft_test_old_sword', 1);
    inventory.addItem('craft_test_new_sword', 1);

    const selected = inventory.selectItems([
        { count: 1, matches: item => item.category === '검' },
        { count: 1, matches: item => item.itemDataId === 'craft_test_old_sword' },
    ]);

    assert.ok(selected);
    assert.equal(selected.reduce((sum, selection) => sum + selection.count, 0), 2);
    assert.equal(
        selected.find(selection => selection.requirementIndex === 1)?.item.itemDataId,
        'craft_test_old_sword',
    );
});

test('제작 결과의 무게를 받을 수 없으면 재료를 소비하지 않는다', () => {
    const inventory = Inventory.createEmpty(2, 1);
    inventory.addItem('craft_test_repair_kit', 1);
    const selected = inventory.selectItems([
        { count: 1, matches: item => item.itemDataId === 'craft_test_repair_kit' },
    ]);

    assert.ok(selected);
    assert.equal(inventory.replaceSelectedItems(selected, [{
        itemDataId: 'craft_test_result',
        count: 2,
        durability: null,
        metadataDelta: null,
        tags: [],
    }]), false);
    assert.equal(inventory.getCount('craft_test_repair_kit'), 1);
    assert.equal(inventory.getCount('craft_test_result'), 0);
});

test('제작 factory는 실제 선택된 재료를 받고 소비와 결과 추가를 한 번에 처리한다', () => {
    const recipe = defineCraftingRecipe({
        id: 'test:repair_sword',
        name: '시험 검 수리',
        ingredients: [
            new CraftingRecipeIngredient(
                '내구도 50% 이상의 검',
                1,
                item => item.category === '검'
                    && item.durability !== null
                    && item.baseDurability !== null
                    && item.durability >= item.baseDurability * 0.5,
            ),
            CraftingRecipeIngredient.item('craft_test_repair_kit', 2),
        ],
        craftTime: 1,
        create: ({ ingredients }) => {
            const sword = ingredients[0].items[0].item;
            return {
                ...sword.snapshot(1),
                durability: sword.baseDurability,
            };
        },
    });
    const player = new TestCraftingPlayer();
    player.inventory.addItem('craft_test_old_sword', 1);
    player.inventory.setItemDurability(
        player.inventory.getFirstItemByData('craft_test_old_sword')!.id,
        60,
    );
    player.inventory.addItem('craft_test_repair_kit', 2);

    const result = executeCrafting(player as unknown as Player, recipe, 1);

    assert.equal(result.success, true);
    assert.equal(player.inventory.getCount('craft_test_repair_kit'), 0);
    assert.equal(player.inventory.getCount('craft_test_old_sword'), 1);
    assert.equal(player.inventory.getFirstItemByData('craft_test_old_sword')?.durability, 100);
});

test('제작법 기본 발견 조건은 재료 소지이며 정의에서 override할 수 있다', () => {
    const defaultRecipe = defineCraftingRecipe({
        id: 'test:default_discovery',
        resultItemDataId: 'craft_test_result',
        ingredients: [CraftingRecipeIngredient.item('craft_test_repair_kit', 1)],
        craftTime: 0,
        create: () => ({
            itemDataId: 'craft_test_result', count: 1, durability: null, metadataDelta: null, tags: [],
        }),
    });
    const overrideRecipe = defineCraftingRecipe({
        id: 'test:override_discovery',
        resultItemDataId: 'craft_test_result',
        ingredients: [CraftingRecipeIngredient.item('craft_test_repair_kit', 99)],
        craftTime: 0,
        discoveryCondition: () => true,
        create: () => ({
            itemDataId: 'craft_test_result', count: 1, durability: null, metadataDelta: null, tags: [],
        }),
    });
    const player = new TestCraftingPlayer();

    assert.equal(defaultRecipe.canDiscover(player as unknown as Player), false);
    player.inventory.addItem('craft_test_repair_kit', 1);
    assert.equal(defaultRecipe.canDiscover(player as unknown as Player), true);
    assert.equal(overrideRecipe.canDiscover(player as unknown as Player), true);
    assert.equal(defaultRecipe.name, 'craft_test_result');
});

test('제작 명령은 마지막 숫자만 개수로 해석한다', () => {
    assert.deepEqual(parseCraftingCommandRemainder('철 곡괭이'), {
        recipeName: '철 곡괭이', quantity: 1,
    });
    assert.deepEqual(parseCraftingCommandRemainder('철 곡괭이 12'), {
        recipeName: '철 곡괭이', quantity: 12,
    });
    assert.equal(parseCraftingCommandRemainder('12'), null);
});
