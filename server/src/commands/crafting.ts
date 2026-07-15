import { registerCommand } from '../modules/bot.js';
import { sendBotMessageToUser, sendNotificationToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';
import {
    findCraftingRecipeByInput,
    getDiscoveredCraftingRecipes,
    startCrafting,
    updateCraftingRecipeDiscovery,
} from '../models/Crafting.js';
import { chat } from '../utils/chatBuilder.js';
import { parseCommandInput } from '../../../shared/commandInput.js';
import type { CompletionItem } from '../../../shared/types.js';

export function parseCraftingCommandRemainder(remainder: string): {
    recipeName: string;
    quantity: number;
} | null {
    const trimmed = remainder.trim();
    if (!trimmed) return null;
    const parts = trimmed.split(/\s+/);
    const last = parts.at(-1) ?? '';
    const hasQuantity = /^\d+$/.test(last);
    if (hasQuantity) parts.pop();
    const recipeName = parts.join(' ').trim();
    if (!recipeName) return null;
    return { recipeName, quantity: hasQuantity ? Number(last) : 1 };
}

function recipeCompletions(userId: number): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    if (!player) return [];
    updateCraftingRecipeDiscovery(player);
    return getDiscoveredCraftingRecipes(player).map(recipe => ({
        value: recipe.name,
        description: `${recipe.ingredients.map(ingredient => `${ingredient.label} x${ingredient.count}`).join(', ')} · ${recipe.craftTime}초`,
    }));
}

export function initCraftingCommands(): void {
    registerCommand({
        name: '제작법목록',
        aliases: ['recipes'],
        description: '그동안 발견한 제작법을 확인합니다.',
        showCommandUse: 'hide',
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            updateCraftingRecipeDiscovery(player);
            const recipes = getDiscoveredCraftingRecipes(player);
            const builder = chat().color('gray', b => b.text(`[ 제작법 목록 ]  ${recipes.length}개`));
            if (recipes.length === 0) {
                builder.text('\n아직 발견한 제작법이 없습니다.');
            } else {
                for (const [index, recipe] of recipes.entries()) {
                    const craftable = recipe.selectIngredients(player.inventory, 1) !== null;
                    builder.text('\n')
                        .color('gray', b => b.text(`${index + 1}. `));
                    if (recipe.resultItemDataId) builder.icon(`items/${recipe.resultItemDataId}`);
                    builder.weight('bold', b => b.color('gold', b2 => b2.text(recipe.name)))
                        .text(`  ${recipe.craftTime}초  `)
                        .color(craftable ? 'lime' : 'gray', b => b.text(craftable ? '제작 가능' : '재료 부족'))
                        .text('\n   재료: ')
                        .color('gray', b => b.text(recipe.ingredients
                            .map(ingredient => `${ingredient.label} x${ingredient.count}`)
                            .join(', ')))
                        .text('  ')
                        .closeButton(`/제작 ${recipe.name}`, b => b.color('gold', b2 => b2.text('[제작]')));
                }
            }
            sendBotMessageToUser(userId, builder.build());
        },
    });

    registerCommand({
        name: '제작',
        aliases: ['craft'],
        description: '발견한 제작법으로 아이템을 제작합니다. 마지막 숫자는 제작 개수입니다.',
        showCommandUse: 'hide',
        args: [
            {
                name: '제작법이름',
                description: '제작할 제작법 이름',
                required: true,
                isText: true,
                completions: recipeCompletions,
            },
            {
                name: '개수',
                description: '제작할 개수 (1~99, 기본 1)',
            },
        ],
        handler(userId, _args, raw) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const input = parseCommandInput(raw);
            const parsed = input ? parseCraftingCommandRemainder(input.remainder) : null;
            if (!parsed) {
                sendBotMessageToUser(userId, '사용법: /제작 <제작법이름> [개수]');
                return;
            }
            updateCraftingRecipeDiscovery(player);
            const recipe = findCraftingRecipeByInput(parsed.recipeName);
            if (!recipe || !getDiscoveredCraftingRecipes(player).includes(recipe)) {
                sendBotMessageToUser(userId, '아직 발견하지 못했거나 존재하지 않는 제작법입니다.');
                return;
            }
            const result = startCrafting(player, recipe, parsed.quantity);
            if (!result.success) {
                const reason = result.reason ?? '제작을 시작할 수 없습니다.';
                sendNotificationToUser(userId, { key: 'crafting-failed', message: reason });
                sendBotMessageToUser(userId, reason);
                return;
            }
            sendBotMessageToUser(userId, `${recipe.name} ${parsed.quantity}개 제작을 시작했습니다.`);
        },
    });
}
