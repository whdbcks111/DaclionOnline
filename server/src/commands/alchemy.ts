import type { CompletionItem } from '../../../shared/types.js';
import { parseCommandInput } from '../../../shared/commandInput.js';
import {
    ALCHEMIST_JOB_ID,
    AlchemyDelivery,
    getAlchemyReagent,
    getAllAlchemyFormulas,
    getAllAlchemyReagents,
    type AlchemyIngredientSelectionInput,
} from '../models/Alchemy.js';
import { getItemData } from '../models/Item.js';
import { startAlchemy } from '../modules/alchemy.js';
import { registerCommand } from '../modules/bot.js';
import { sendBotMessageToUser, sendNotificationToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';
import { chat } from '../utils/chatBuilder.js';

export interface ParsedAlchemyCommand {
    readonly bottleCount: number;
    readonly delivery: AlchemyDelivery;
    readonly ingredients: readonly AlchemyIngredientSelectionInput[];
}

function normalizeItemInput(value: string): string {
    return value.trim().toLocaleLowerCase('ko-KR').replace(/[\s_-]+/g, '');
}

function resolveReagentInput(input: string): string | undefined {
    const normalized = normalizeItemInput(input);
    if (!normalized) return undefined;
    const candidates = getAllAlchemyReagents().filter(reagent => {
        const item = getItemData(reagent.itemDataId);
        return normalizeItemInput(reagent.itemDataId) === normalized
            || normalizeItemInput(item?.name ?? '') === normalized;
    });
    if (candidates.length === 1) return candidates[0].itemDataId;
    const partial = getAllAlchemyReagents().filter(reagent =>
        normalizeItemInput(getItemData(reagent.itemDataId)?.name ?? '').includes(normalized));
    return partial.length === 1 ? partial[0].itemDataId : undefined;
}

/** `재료명x수량, 재료명:수량`을 중복 합산해 조제용 불변 입력으로 바꾼다. */
export function parseAlchemyIngredientList(input: string): readonly AlchemyIngredientSelectionInput[] | undefined {
    const parts = input.split(/[,，]/).map(value => value.trim()).filter(Boolean);
    if (parts.length < 2 || parts.length > 5) return undefined;
    const totals = new Map<string, number>();
    for (const part of parts) {
        const matched = part.match(/^(.+?)\s*(?:x|×|\*|:)\s*(\d+)$/i);
        if (!matched) return undefined;
        const itemDataId = resolveReagentInput(matched[1]);
        const count = Number(matched[2]);
        if (!itemDataId || !getAlchemyReagent(itemDataId)
            || !Number.isSafeInteger(count) || count < 1 || count > 99) return undefined;
        totals.set(itemDataId, (totals.get(itemDataId) ?? 0) + count);
    }
    if (totals.size < 2 || totals.size > 5) return undefined;
    const ingredients = [...totals].map(([itemDataId, count]) => ({ itemDataId, count }));
    return ingredients.reduce((sum, ingredient) => sum + ingredient.count, 0) <= 90
        ? ingredients : undefined;
}

export function parseAlchemyCommandRemainder(remainder: string): ParsedAlchemyCommand | undefined {
    const matched = remainder.trim().match(/^(\d+)\s+(\S+)\s+(.+)$/);
    if (!matched) return undefined;
    const bottleCount = Number(matched[1]);
    const delivery = AlchemyDelivery.fromInput(matched[2]);
    const ingredients = parseAlchemyIngredientList(matched[3]);
    if (!Number.isSafeInteger(bottleCount) || bottleCount < 1 || bottleCount > 3
        || !delivery || !ingredients) return undefined;
    return { bottleCount, delivery, ingredients };
}

function reagentCompletions(): CompletionItem[] {
    return getAllAlchemyReagents().map(reagent => {
        const item = getItemData(reagent.itemDataId);
        return {
            value: `${item?.name ?? reagent.itemDataId}x1`,
            description: reagent.traits.map(trait => trait.label).join(' · '),
        };
    });
}

function canUseAlchemy(userId: number): boolean {
    return getPlayerByUserId(userId)?.career.hasJob(ALCHEMIST_JOB_ID) ?? false;
}

export function initAlchemyCommands(): void {
    registerCommand({
        name: '연금술법',
        aliases: ['연금목록', 'alchemyrecipes', 'alr'],
        description: '등록된 연금 조합과 병당 재료, 음용·투척 사용법을 확인합니다.',
        showCommandUse: 'hide',
        information: true,
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            if (!canUseAlchemy(userId)) {
                sendBotMessageToUser(userId, '마법사 메인·성직자 서브의 엘리트 직업 [ 연금술사 ]만 조합식을 읽을 수 있습니다.');
                return;
            }
            const builder = chat()
                .divider('연금술 조합표')
                .text('표시 수량은 조제약 1병 기준이며, 2~3병 배치는 물병과 모든 재료가 같은 배수로 필요합니다.\n')
                .color('gray', value => value.text('투척형은 사용 시 현재 대상 중심으로 품질에 따른 수의 아군 또는 적에게 적용됩니다.\n'));
            for (const [index, formula] of getAllAlchemyFormulas().entries()) {
                const requirements = formula.ingredients.map(ingredient => {
                    const item = getItemData(ingredient.itemDataId);
                    const owned = player.inventory.getCount(ingredient.itemDataId);
                    return `${item?.name ?? ingredient.itemDataId} x${ingredient.count} (보유 ${owned})`;
                });
                builder.text('\n')
                    .weight('bold', value => value.color('gold', nested => nested.text(`${index + 1}. ${formula.name}`)))
                    .text(` · 난이도 ${formula.difficulty}\n   ${requirements.join(', ')}\n   `)
                    .color('gray', value => value.text(formula.description));
            }
            builder.text('\n\n예시: /연금술 2 투척 애도의 백합x4, 오아시스 대추야자x2');
            sendBotMessageToUser(userId, builder.build());
        },
    });

    registerCommand({
        name: '연금술',
        aliases: ['연금', 'alchemy', 'al'],
        description: '1~3병의 재료와 전달 방식을 골라 가마솥 추적 조제를 시작합니다.',
        showCommandUse: 'private',
        args: [
            {
                name: '병수', description: '한 번에 조제할 병 수 (1~3)', required: true,
                list: ['1', '2', '3'], completions: ['1', '2', '3'],
            },
            {
                name: '방식', description: '완성품 전달 방식', required: true,
                list: AlchemyDelivery.values().flatMap(value => [value.label, value.key]),
                completions: AlchemyDelivery.values().map(value => ({ value: value.label, description: value.key })),
            },
            {
                name: '재료목록', description: '쉼표로 구분한 재료명x수량', required: true,
                isText: true, completions: reagentCompletions(),
            },
        ],
        handler(userId, _args, raw) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            if (!canUseAlchemy(userId)) {
                sendBotMessageToUser(userId, '연금술 조제는 엘리트 직업 [ 연금술사 ]만 사용할 수 있습니다.');
                return;
            }
            const parsedInput = parseCommandInput(raw);
            const parsed = parsedInput ? parseAlchemyCommandRemainder(parsedInput.remainder) : undefined;
            if (!parsed) {
                sendBotMessageToUser(userId, '사용법: /연금술 <1~3> <음용|투척> <재료명x수량, 재료명x수량>');
                return;
            }
            const result = startAlchemy(player, parsed);
            if (!result.success) {
                const reason = result.reason ?? '연금술 조제를 시작할 수 없습니다.';
                sendBotMessageToUser(userId, reason);
                sendNotificationToUser(userId, { key: 'alchemy:start-failed', message: reason });
            }
        },
    });
}
