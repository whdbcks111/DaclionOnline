import { CraftingRecipeIngredient, defineCraftingRecipe } from '../models/Crafting.js';
import { getItemData } from '../models/Item.js';

defineCraftingRecipe({
    id: 'basic:iron_pickaxe',
    resultItemDataId: 'iron_pickaxe',
    aliases: ['철곡괭이'],
    description: '철과 돌을 다듬어 기본 곡괭이보다 튼튼한 철 곡괭이를 제작합니다.',
    ingredients: [
        CraftingRecipeIngredient.item('iron_ore', 3),
        CraftingRecipeIngredient.item('stone', 2),
    ],
    craftTime: 4,
    create: ({ quantity }) => ({
        itemDataId: 'iron_pickaxe',
        count: quantity,
        durability: getItemData('iron_pickaxe')?.baseDurability ?? null,
        metadataDelta: null,
        tags: [],
    }),
    tags: ['crafting:tool', 'crafting:mining'],
});
