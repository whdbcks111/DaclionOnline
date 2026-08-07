import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GameTags } from '../../../../shared/tags.js';
import {
    CodexCategory,
    createCodexEntryId,
    getAllCodexEntries,
} from '../../models/progression/Codex.js';
import {
    CraftingRecipeIngredient,
    defineCraftingRecipe,
    getAllCraftingRecipes,
} from '../../models/professions/Crafting.js';
import { defineItem, getItemData } from '../../models/economy/Item.js';
import { defineLocation, getAllLocationData, reloadAllLocations } from '../../models/world/Location.js';
import { defineMonster, getAllMonsterData } from '../../models/actors/Monster.js';
import { defineResource, getAllResourceData } from '../../models/actors/Resource.js';
import type { LocationData } from '../../../../shared/types.js';
import '../combat/projectiles.js';
import '../economy/items.js';
import '../combat/statusEffects.js';
import './monsters.js';
import '../combat/bossPatterns.js';
import './resources.js';
import '../economy/shops.js';
import '../combat/tagEffects.js';
import '../progression/jobs.js';
import '../progression/progress.js';
import '../progression/titles.js';
import './dungeonPuzzles.js';
import '../combat/skills.js';
import '../professions/crafting.js';
import '../progression/quests.js';
import './npcs.js';
import '../professions/fishing.js';
import './ascendantFrontier.js';
import { mergeAscendantLocations } from './ascendantRegions.js';
import { initializeCodexData } from './codex.js';

const baseLocations = JSON.parse(
    readFileSync(new URL('./locations.json', import.meta.url), 'utf-8'),
) as LocationData[];

function entryIds(category: CodexCategory): string[] {
    return getAllCodexEntries(category).map(entry => entry.id).sort();
}

function defineTestItem(id: string, category: string): void {
    defineItem({
        id,
        name: id,
        description: '도감 마스터 분류 시험 아이템',
        category,
        weight: 0.1,
        stackable: true,
        maxStack: 99,
        baseMetadata: null,
        onUse: null,
        equipSlot: null,
        modifiers: null,
        baseDurability: null,
        tags: [],
    });
}

test('도감 마스터 데이터는 현재 전체 분류와 미래 등록을 재초기화로 정확히 반영한다', async t => {
    reloadAllLocations(mergeAscendantLocations(baseLocations));
    initializeCodexData();

    await t.test('현재 마스터의 일반 몬스터·보스·광물·숨김 포함 장소·제작 요리를 빠짐없이 분류한다', () => {
        const monsters = getAllMonsterData();
        const resources = getAllResourceData();
        const locations = getAllLocationData();
        const cookingRecipeIds = getAllCraftingRecipes().flatMap(recipe => {
            const item = recipe.resultItemDataId ? getItemData(recipe.resultItemDataId) : undefined;
            return item && (item.category === '음식' || item.category === '생선 요리')
                ? [recipe.id]
                : [];
        }).sort();

        assert.deepEqual(entryIds(CodexCategory.MONSTER), monsters
            .filter(monster => !monster.tags.includes(GameTags.ENTITY_BOSS))
            .map(monster => `monster:${monster.id}`)
            .sort());
        assert.deepEqual(entryIds(CodexCategory.BOSS), monsters
            .filter(monster => monster.tags.includes(GameTags.ENTITY_BOSS))
            .map(monster => `boss:${monster.id}`)
            .sort());
        assert.deepEqual(entryIds(CodexCategory.ORE), resources
            .filter(resource => resource.tags.includes(GameTags.RESOURCE_ORE))
            .map(resource => `ore:${resource.id}`)
            .sort());
        assert.deepEqual(entryIds(CodexCategory.EXPLORATION), locations
            .map(location => `exploration:${location.id}`)
            .sort());
        assert.deepEqual(entryIds(CodexCategory.COOKING), cookingRecipeIds
            .map(recipeId => createCodexEntryId(CodexCategory.COOKING, recipeId)));

        assert.deepEqual({
            monster: entryIds(CodexCategory.MONSTER).length,
            boss: entryIds(CodexCategory.BOSS).length,
            ore: entryIds(CodexCategory.ORE).length,
            exploration: entryIds(CodexCategory.EXPLORATION).length,
            cooking: entryIds(CodexCategory.COOKING).length,
        }, {
            monster: 153,
            boss: 45,
            ore: 18,
            exploration: 624,
            cooking: 19,
        });
        assert.equal(locations.filter(location => location.tags.includes(GameTags.LOCATION_HIDDEN)).length, 31);
        const explorationIds = new Set(entryIds(CodexCategory.EXPLORATION));
        assert.ok(locations
            .filter(location => location.tags.includes(GameTags.LOCATION_HIDDEN))
            .every(location => explorationIds.has(`exploration:${location.id}`)));

        for (const [category, thresholds] of [
            [CodexCategory.MONSTER, { bronze: 10, silver: 50, gold: 200 }],
            [CodexCategory.BOSS, { bronze: 1, silver: 5, gold: 20 }],
            [CodexCategory.ORE, { bronze: 5, silver: 25, gold: 100 }],
            [CodexCategory.EXPLORATION, { bronze: 1, silver: 1, gold: 1 }],
            [CodexCategory.COOKING, { bronze: 1, silver: 5, gold: 20 }],
        ] as const) {
            for (const entry of getAllCodexEntries(category)) {
                assert.deepEqual(entry.thresholds, thresholds);
            }
        }
    });

    await t.test('새 master 등록 뒤 재초기화하면 태그·결과 종류를 따르고 제작법별 요리를 분리한다', () => {
        defineMonster({
            id: 'codex_test_monster',
            name: '도감 일반 시험체',
            description: '',
            level: 1,
            exp: 0,
            baseAttribute: { maxLife: 1 },
            drops: [],
            expReward: 0,
            equipments: [],
            tags: [],
        });
        defineMonster({
            id: 'codex_test_boss',
            name: '도감 보스 시험체',
            description: '',
            level: 1,
            exp: 0,
            baseAttribute: { maxLife: 1 },
            drops: [],
            expReward: 0,
            equipments: [],
            tags: [GameTags.ENTITY_BOSS],
        });
        defineResource({
            id: 'codex_test_ore',
            name: '도감 시험 광맥',
            level: 1,
            baseAttribute: { maxLife: 1 },
            drops: [],
            expReward: { min: 0, max: 0 },
            tags: [GameTags.RESOURCE_ORE],
        });
        defineResource({
            id: 'codex_test_herb',
            name: '도감 제외 약초',
            level: 1,
            baseAttribute: { maxLife: 1 },
            drops: [],
            expReward: { min: 0, max: 0 },
            tags: [],
        });
        defineLocation({
            id: 'codex_test_hidden_location',
            name: '도감 숨김 시험 장소',
            zoneType: 'neutral',
            x: 99_001,
            y: 99_001,
            z: 0,
            npcIds: [],
            objects: [],
            connections: [],
            tags: [GameTags.LOCATION_HIDDEN],
        });
        defineTestItem('codex_test_ingredient', '재료');
        defineTestItem('codex_test_food', '음식');
        defineTestItem('codex_test_fish_dish', '생선 요리');
        defineTestItem('codex_test_weapon', '무기');

        for (const [id, resultItemDataId] of [
            ['codex-test:food-a', 'codex_test_food'],
            ['codex-test:food-b', 'codex_test_food'],
            ['codex-test:fish-dish', 'codex_test_fish_dish'],
            ['codex-test:weapon', 'codex_test_weapon'],
        ] as const) {
            defineCraftingRecipe({
                id,
                resultItemDataId,
                ingredients: [CraftingRecipeIngredient.item('codex_test_ingredient', 1)],
                craftTime: 0,
                create: () => ({
                    itemDataId: resultItemDataId,
                    count: 1,
                    durability: null,
                    metadataDelta: null,
                    tags: [],
                }),
            });
        }

        initializeCodexData();

        assert.ok(entryIds(CodexCategory.MONSTER).includes('monster:codex_test_monster'));
        assert.ok(entryIds(CodexCategory.BOSS).includes('boss:codex_test_boss'));
        assert.ok(entryIds(CodexCategory.ORE).includes('ore:codex_test_ore'));
        assert.ok(!entryIds(CodexCategory.ORE).includes('ore:codex_test_herb'));
        assert.ok(entryIds(CodexCategory.EXPLORATION)
            .includes('exploration:codex_test_hidden_location'));
        assert.ok(entryIds(CodexCategory.COOKING).includes('cooking:codex-test/food-a'));
        assert.ok(entryIds(CodexCategory.COOKING).includes('cooking:codex-test/food-b'));
        assert.ok(entryIds(CodexCategory.COOKING).includes('cooking:codex-test/fish-dish'));
        assert.ok(!entryIds(CodexCategory.COOKING).includes('cooking:codex-test/weapon'));
    });
});
