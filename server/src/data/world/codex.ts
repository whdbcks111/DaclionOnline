import {
    CodexCategory,
    createCodexEntryId,
    reloadCodexRegistry,
} from '../../models/progression/Codex.js';
import { getAllCraftingRecipes } from '../../models/professions/Crafting.js';
import { getItemData } from '../../models/economy/Item.js';
import { getAllLocationData } from '../../models/world/Location.js';
import { getAllMonsterData } from '../../models/actors/Monster.js';
import { getAllResourceData } from '../../models/actors/Resource.js';
import { GameTags } from '../../../../shared/tags.js';

const MONSTER_THRESHOLDS = { bronze: 10, silver: 50, gold: 200 } as const;
const BOSS_THRESHOLDS = { bronze: 1, silver: 5, gold: 20 } as const;
const ORE_THRESHOLDS = { bronze: 5, silver: 25, gold: 100 } as const;
const EXPLORATION_THRESHOLDS = { bronze: 1, silver: 1, gold: 1 } as const;
const COOKING_THRESHOLDS = { bronze: 1, silver: 5, gold: 20 } as const;
const COOKING_ITEM_CATEGORIES = new Set(['음식', '생선 요리']);

/**
 * 등록을 마친 마스터 데이터의 공개 snapshot으로 도감 원본을 전부 다시 만든다.
 * 장소 JSON이 로드된 뒤 호출해야 하며, 관리자 장소 재로드 후에도 같은 함수를 재사용할 수 있다.
 */
export function initializeCodexData(): void {
    const monsters = getAllMonsterData().sort((a, b) => a.id.localeCompare(b.id));
    const ores = getAllResourceData()
        .filter(resource => resource.tags.includes(GameTags.RESOURCE_ORE))
        .sort((a, b) => a.id.localeCompare(b.id));
    const locations = getAllLocationData().sort((a, b) => a.id.localeCompare(b.id));
    const cookingRecipes = getAllCraftingRecipes()
        .filter(recipe => {
            const item = recipe.resultItemDataId ? getItemData(recipe.resultItemDataId) : undefined;
            return Boolean(item && COOKING_ITEM_CATEGORIES.has(item.category));
        })
        .sort((a, b) => a.id.localeCompare(b.id));

    reloadCodexRegistry([
        ...monsters
            .filter(monster => !monster.tags.includes(GameTags.ENTITY_BOSS))
            .map(monster => ({
                id: createCodexEntryId(CodexCategory.MONSTER, monster.id),
                category: CodexCategory.MONSTER,
                name: monster.name,
                thresholds: MONSTER_THRESHOLDS,
            })),
        ...monsters
            .filter(monster => monster.tags.includes(GameTags.ENTITY_BOSS))
            .map(monster => ({
                id: createCodexEntryId(CodexCategory.BOSS, monster.id),
                category: CodexCategory.BOSS,
                name: monster.name,
                thresholds: BOSS_THRESHOLDS,
            })),
        ...ores.map(resource => ({
            id: createCodexEntryId(CodexCategory.ORE, resource.id),
            category: CodexCategory.ORE,
            name: resource.name,
            thresholds: ORE_THRESHOLDS,
        })),
        ...locations.map(location => ({
            id: createCodexEntryId(CodexCategory.EXPLORATION, location.id),
            category: CodexCategory.EXPLORATION,
            name: location.name,
            thresholds: EXPLORATION_THRESHOLDS,
        })),
        ...cookingRecipes
            .map(recipe => ({
                id: createCodexEntryId(CodexCategory.COOKING, recipe.id),
                category: CodexCategory.COOKING,
                name: recipe.name,
                thresholds: COOKING_THRESHOLDS,
            })),
    ]);
}
