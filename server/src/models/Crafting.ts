import type Player from './Player.js';
import Inventory from './Inventory.js';
import type { InventoryItemSelection } from './Inventory.js';
import { getItemData } from './Item.js';
import type { Item, ItemSnapshot } from './Item.js';
import { defineProgress, ProgressType } from './Progress.js';
import { emitGameEvent, GameEventIds } from './GameEvent.js';
import { normalizeTag, normalizeTags } from '../../../shared/tags.js';
import type { TagId } from '../../../shared/tags.js';
import { startCoroutine, Wait } from '../modules/coroutine.js';
import { sendBotMessageToUser, sendNotificationToUser } from '../modules/message.js';
import { getOnlinePlayer } from '../modules/playerRegistry.js';
import logger from '../utils/logger.js';
import { chat } from '../utils/chatBuilder.js';

export interface SelectedCraftingItem {
    item: Item;
    count: number;
}

export interface SelectedCraftingIngredient {
    ingredient: CraftingRecipeIngredient;
    items: readonly SelectedCraftingItem[];
}

export interface CraftingFactoryContext {
    player: Player;
    recipe: CraftingRecipe;
    quantity: number;
    ingredients: readonly SelectedCraftingIngredient[];
}

export interface CraftingDiscoveryContext {
    player: Player;
    recipe: CraftingRecipe;
}

export interface CraftingRecipeData {
    id: string;
    /** 생략하면 resultItemDataId의 아이템 이름을 사용한다. */
    name?: string;
    aliases?: readonly string[];
    description?: string;
    resultItemDataId?: string;
    ingredients: readonly CraftingRecipeIngredient[];
    craftTime: number;
    create: (context: CraftingFactoryContext) => ItemSnapshot | readonly ItemSnapshot[];
    /** 생략하면 재료 1회분을 모두 소지했을 때 발견한다. */
    discoveryCondition?: (context: CraftingDiscoveryContext) => boolean;
    tags?: readonly TagId[];
}

export interface CraftingExecutionResult {
    success: boolean;
    reason?: string;
    outputs?: readonly ItemSnapshot[];
}

export class CraftingRecipeIngredient {
    readonly label: string;
    readonly count: number;
    private readonly predicate: (item: Item) => boolean;

    constructor(label: string, count: number, matches: (item: Item) => boolean) {
        if (!label.trim()) throw new Error('제작 재료 label은 비어 있을 수 없습니다.');
        if (!Number.isSafeInteger(count) || count <= 0) {
            throw new Error(`제작 재료 수량은 1 이상의 안전한 정수여야 합니다: ${count}`);
        }
        this.label = label.trim();
        this.count = count;
        this.predicate = matches;
    }

    matches(item: Item): boolean { return this.predicate(item); }

    static item(itemDataId: string, count: number, label?: string): CraftingRecipeIngredient {
        const itemName = getItemData(itemDataId)?.name ?? itemDataId;
        return new CraftingRecipeIngredient(
            label ?? itemName,
            count,
            item => item.itemDataId === itemDataId,
        );
    }
}

export class CraftingRecipe {
    readonly id: string;
    readonly name: string;
    readonly aliases: readonly string[];
    readonly description: string;
    readonly resultItemDataId?: string;
    readonly ingredients: readonly CraftingRecipeIngredient[];
    readonly craftTime: number;
    readonly tags: readonly TagId[];
    private readonly factory: CraftingRecipeData['create'];
    private readonly discoveryCondition?: CraftingRecipeData['discoveryCondition'];

    constructor(data: CraftingRecipeData) {
        this.id = normalizeTag(data.id);
        const resultName = data.resultItemDataId ? getItemData(data.resultItemDataId)?.name : undefined;
        if (data.resultItemDataId && !resultName) {
            throw new Error(`제작 결과 아이템 정의를 찾을 수 없습니다: ${data.resultItemDataId}`);
        }
        this.name = data.name?.trim() || resultName || this.id;
        this.aliases = Object.freeze([...(data.aliases ?? [])].map(alias => alias.trim()).filter(Boolean));
        this.description = data.description?.trim() ?? '';
        if (data.ingredients.length === 0) throw new Error(`제작 재료가 없습니다: ${this.id}`);
        this.ingredients = Object.freeze([...data.ingredients]);
        if (!Number.isFinite(data.craftTime) || data.craftTime < 0) {
            throw new Error(`제작 시간은 0 이상의 유한한 값이어야 합니다: ${this.id}/${data.craftTime}`);
        }
        this.craftTime = data.craftTime;
        this.resultItemDataId = data.resultItemDataId;
        this.factory = data.create;
        this.discoveryCondition = data.discoveryCondition;
        this.tags = Object.freeze(normalizeTags(data.tags ?? []));
    }

    matchesInput(input: string): boolean {
        const normalized = input.trim().toLowerCase();
        return this.id === normalized
            || this.name.toLowerCase() === normalized
            || this.aliases.some(alias => alias.toLowerCase() === normalized);
    }

    selectIngredients(inventory: Inventory, quantity = 1): SelectedCraftingIngredient[] | null {
        if (!Number.isSafeInteger(quantity) || quantity <= 0) return null;
        const selected = inventory.selectItems(this.ingredients.map(ingredient => ({
            count: ingredient.count * quantity,
            matches: (item: Item) => ingredient.matches(item),
        })));
        if (!selected) return null;
        return this.groupSelections(selected);
    }

    canDiscover(player: Player): boolean {
        return this.discoveryCondition?.({ player, recipe: this })
            ?? this.selectIngredients(player.inventory, 1) !== null;
    }

    createOutputs(context: CraftingFactoryContext): ItemSnapshot[] {
        const created = this.factory(context);
        const outputs = Array.isArray(created) ? created : [created];
        return outputs.map(output => ({
            itemDataId: output.itemDataId,
            count: output.count,
            durability: output.durability,
            metadataDelta: output.metadataDelta ? { ...output.metadataDelta } : null,
            tags: [...output.tags],
        }));
    }

    private groupSelections(selections: readonly InventoryItemSelection[]): SelectedCraftingIngredient[] {
        return this.ingredients.map((ingredient, requirementIndex) => ({
            ingredient,
            items: selections
                .filter(selection => selection.requirementIndex === requirementIndex)
                .map(selection => ({ item: selection.item, count: selection.count })),
        }));
    }
}

const recipes = new Map<string, CraftingRecipe>();
const activeCrafts = new Map<number, symbol>();

export function defineCraftingRecipe(data: CraftingRecipeData): CraftingRecipe {
    const recipe = new CraftingRecipe(data);
    recipes.set(recipe.id, recipe);
    defineProgress({
        id: getRecipeDiscoveryProgressId(recipe.id),
        type: ProgressType.FLAG,
        label: `${recipe.name} 제작법 발견`,
        description: `${recipe.name} 제작법을 발견했는지 나타냅니다.`,
        visible: false,
        tags: ['progress:crafting-recipe'],
    });
    return recipe;
}

export function getCraftingRecipe(id: string): CraftingRecipe | undefined {
    return recipes.get(normalizeTag(id));
}

export function getAllCraftingRecipes(): readonly CraftingRecipe[] {
    return [...recipes.values()];
}

export function findCraftingRecipeByInput(input: string): CraftingRecipe | undefined {
    return getAllCraftingRecipes().find(recipe => recipe.matchesInput(input));
}

export function getRecipeDiscoveryProgressId(recipeId: string): string {
    const normalized = normalizeTag(recipeId);
    const separator = normalized.indexOf(':');
    return `crafting:recipe/${normalized.slice(0, separator)}/${normalized.slice(separator + 1)}`;
}

export function isCraftingRecipeDiscovered(player: Player, recipe: CraftingRecipe): boolean {
    return player.progress.getFlag(getRecipeDiscoveryProgressId(recipe.id));
}

export function discoverCraftingRecipe(
    player: Player,
    recipe: CraftingRecipe,
    source = 'automatic',
): boolean {
    if (isCraftingRecipeDiscovered(player, recipe)) return false;
    player.progress.setFlag(getRecipeDiscoveryProgressId(recipe.id), true);
    const message = `제작법 [ ${recipe.name} ] 을(를) 발견했습니다!`;
    sendBotMessageToUser(player.userId, chat().color('gold', b => b.text(message)).build());
    sendNotificationToUser(player.userId, {
        key: `crafting-recipe:${recipe.id}`,
        message,
    });
    emitGameEvent(GameEventIds.CRAFTING_RECIPE_DISCOVERED, {
        actor: player,
        data: { recipeId: recipe.id, source },
    });
    return true;
}

export function updateCraftingRecipeDiscovery(player: Player): void {
    for (const recipe of recipes.values()) {
        if (isCraftingRecipeDiscovered(player, recipe)) continue;
        try {
            if (recipe.canDiscover(player)) discoverCraftingRecipe(player, recipe);
        } catch (error) {
            logger.error(`제작법 발견 조건 실패: ${recipe.id}`, error);
        }
    }
}

export function getDiscoveredCraftingRecipes(player: Player): CraftingRecipe[] {
    return [...recipes.values()].filter(recipe => isCraftingRecipeDiscovered(player, recipe));
}

export function isCrafting(player: Player): boolean {
    return activeCrafts.has(player.userId);
}

export function executeCrafting(
    player: Player,
    recipe: CraftingRecipe,
    quantity: number,
): CraftingExecutionResult {
    const ingredients = recipe.selectIngredients(player.inventory, quantity);
    if (!ingredients) return { success: false, reason: '필요한 제작 재료가 부족합니다.' };

    let outputs: ItemSnapshot[];
    try {
        outputs = recipe.createOutputs({ player, recipe, quantity, ingredients });
    } catch (error) {
        logger.error(`제작 결과 생성 실패: ${recipe.id}`, error);
        return { success: false, reason: '제작 결과를 생성하지 못했습니다.' };
    }
    if (outputs.length === 0) return { success: false, reason: '제작 결과가 비어 있습니다.' };

    const selections = ingredients.flatMap((ingredient, requirementIndex) =>
        ingredient.items.map(selected => ({
            requirementIndex,
            item: selected.item,
            count: selected.count,
        })),
    );
    if (!player.inventory.replaceSelectedItems(selections, outputs)) {
        return { success: false, reason: '재료가 변경되었거나 결과물을 보관할 공간이 부족합니다.' };
    }
    emitGameEvent(GameEventIds.ITEM_CRAFTED, {
        actor: player,
        data: { recipeId: recipe.id, quantity },
    });
    return { success: true, outputs };
}

export function startCrafting(
    player: Player,
    recipe: CraftingRecipe,
    quantity: number,
): CraftingExecutionResult {
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 99) {
        return { success: false, reason: '제작 개수는 1~99의 정수여야 합니다.' };
    }
    updateCraftingRecipeDiscovery(player);
    if (!isCraftingRecipeDiscovered(player, recipe)) {
        return { success: false, reason: '아직 발견하지 못한 제작법입니다.' };
    }
    if (player.isDefeated) return { success: false, reason: '사망 상태에서는 제작할 수 없습니다.' };
    if (isCrafting(player)) return { success: false, reason: '이미 다른 아이템을 제작 중입니다.' };
    if (!recipe.selectIngredients(player.inventory, quantity)) {
        return { success: false, reason: '필요한 제작 재료가 부족합니다.' };
    }

    const totalTime = recipe.craftTime * quantity;
    if (!Number.isFinite(totalTime)) {
        return { success: false, reason: '제작 시간을 계산할 수 없습니다.' };
    }
    const token = Symbol(recipe.id);
    activeCrafts.set(player.userId, token);
    sendNotificationToUser(player.userId, {
        key: 'crafting-progress',
        message: `${recipe.name} ${quantity}개 제작 중...`,
        length: Math.max(1000, totalTime * 1000),
    });

    function* routine() {
        try {
            yield Wait(totalTime);
            if (activeCrafts.get(player.userId) !== token || getOnlinePlayer(player.userId) !== player) return;
            if (player.isDefeated) {
                sendNotificationToUser(player.userId, {
                    key: 'crafting-failed',
                    message: '사망하여 제작이 취소되었습니다.',
                });
                return;
            }
            const result = executeCrafting(player, recipe, quantity);
            if (!result.success) {
                sendNotificationToUser(player.userId, {
                    key: 'crafting-failed',
                    message: result.reason ?? '제작에 실패했습니다.',
                });
                return;
            }
            const outputText = formatOutputSummary(result.outputs ?? []);
            sendBotMessageToUser(player.userId, chat()
                .color('gold', b => b.text('[제작 완료] '))
                .text(outputText)
                .build());
            sendNotificationToUser(player.userId, {
                key: 'crafting-complete',
                message: `${outputText} 제작을 완료했습니다!`,
            });
        } catch (error) {
            logger.error(`제작 처리 실패: ${recipe.id}`, error);
            if (getOnlinePlayer(player.userId) === player) {
                sendNotificationToUser(player.userId, {
                    key: 'crafting-failed',
                    message: '제작 중 오류가 발생했습니다.',
                });
            }
        } finally {
            if (activeCrafts.get(player.userId) === token) activeCrafts.delete(player.userId);
        }
    }
    startCoroutine(routine());
    return { success: true };
}

export function cancelCrafting(player: Player): boolean {
    return activeCrafts.delete(player.userId);
}

function formatOutputSummary(outputs: readonly ItemSnapshot[]): string {
    const counts = new Map<string, number>();
    for (const output of outputs) {
        counts.set(output.itemDataId, (counts.get(output.itemDataId) ?? 0) + output.count);
    }
    return [...counts].map(([id, count]) => `${getItemData(id)?.name ?? id} x${count}`).join(', ');
}
