import type { CompletionItem } from '../../../shared/types.js';
import { parseCommandInput } from '../../../shared/commandInput.js';
import {
    ALCHEMIST_JOB_ID,
    AlchemyDelivery,
    AlchemyReagentInsightTier,
    getAlchemyReagentInsight,
    getAlchemyReagent,
    getAllAlchemyFormulas,
    getAllAlchemyReagents,
    getExperimentedAlchemyReagents,
    hasExperimentedAlchemyReagent,
    type AlchemyFormulaEffectDefinition,
    type AlchemyIngredientSelectionInput,
} from '../models/Alchemy.js';
import { getItemData } from '../models/Item.js';
import { StatType } from '../models/Stat.js';
import { StatusEffectType } from '../models/StatusEffect.js';
import type Player from '../models/Player.js';
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

function getItemName(itemDataId: string): string {
    return getItemData(itemDataId)?.name ?? itemDataId;
}

function formatAlchemyEffect(effect: Readonly<AlchemyFormulaEffectDefinition>): string {
    const parts = [effect.type.label];
    if (effect.statusEffectId) {
        parts.push(StatusEffectType.fromKey(effect.statusEffectId)?.label ?? '등록 상태 효과');
    }
    if (effect.basePower !== undefined) parts.push(`기본 위력 ${effect.basePower}`);
    if (effect.baseDuration !== undefined) parts.push(`기본 지속 ${effect.baseDuration}초`);
    if (effect.damageType) {
        const damageTypeLabel = effect.damageType === 'physical' ? '물리'
            : effect.damageType === 'magic' ? '마법' : '절대';
        parts.push(`${damageTypeLabel} 판정`);
    }
    return parts.join(' · ');
}

/** 조제 자동완성은 실험했거나 현재 보유한 재료만 노출한다. */
export function getAlchemyReagentCompletions(userId: number): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    if (!player?.career.hasJob(ALCHEMIST_JOB_ID)) return [];
    const sensibility = player.stat.get(StatType.SENSIBILITY);
    return getAllAlchemyReagents().flatMap(reagent => {
        const owned = player.inventory.getCount(reagent.itemDataId);
        const experimented = hasExperimentedAlchemyReagent(player.progress, reagent.itemDataId);
        if (!experimented && owned <= 0) return [];
        const details = [`보유 ${owned}`];
        if (!experimented) {
            details.push('미실험');
        } else {
            const insight = getAlchemyReagentInsight(reagent.itemDataId, sensibility);
            details.push(insight?.tier?.label ?? `해석은 감각 ${AlchemyReagentInsightTier.BASIC.minimumSensibility} 필요`);
            if (insight?.traitLabels.length) details.push(insight.traitLabels.join(' · '));
        }
        return [{
            value: `${getItemName(reagent.itemDataId)}x1`,
            description: details.join(' · '),
        }];
    });
}

/** 재료 정보 자동완성은 해당 계정이 실제 가마솥에 넣어 본 재료로만 제한한다. */
export function getAlchemyReagentInfoCompletions(userId: number): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    if (!player?.career.hasJob(ALCHEMIST_JOB_ID)) return [];
    const sensibility = player.stat.get(StatType.SENSIBILITY);
    return getExperimentedAlchemyReagents(player.progress).map(reagent => {
        const insight = getAlchemyReagentInsight(reagent.itemDataId, sensibility);
        return {
            value: getItemName(reagent.itemDataId),
            description: insight?.tier?.label ?? `실험 기록 · 감각 ${AlchemyReagentInsightTier.BASIC.minimumSensibility} 필요`,
        };
    });
}

function canUseAlchemy(userId: number): boolean {
    return getPlayerByUserId(userId)?.career.hasJob(ALCHEMIST_JOB_ID) ?? false;
}

/** 명령 handler와 회귀 테스트가 같은 미실험·감각 단계 메시지를 사용한다. */
export function createAlchemyReagentInformationMessage(
    player: Pick<Player, 'progress' | 'stat'>,
    input: string,
): string {
    const itemDataId = resolveReagentInput(input);
    if (!itemDataId) {
        return '해당 연금 재료를 하나로 특정할 수 없습니다. 재료 이름을 더 정확히 입력해주세요.';
    }
    const item = getItemData(itemDataId);
    if (!hasExperimentedAlchemyReagent(player.progress, itemDataId)) {
        return `[ ${item?.name ?? itemDataId} ]에 대한 연금 실험 기록이 없습니다. 가마솥에 직접 넣어 본 뒤 다시 확인해주세요.`;
    }
    const sensibility = player.stat.get(StatType.SENSIBILITY);
    const insight = getAlchemyReagentInsight(itemDataId, sensibility);
    if (!insight) return '연금 재료 정보를 불러오지 못했습니다.';
    if (!insight.tier) {
        return `[ ${item?.name ?? itemDataId} ]의 실험 기록은 있지만 해석하려면 감각 ${AlchemyReagentInsightTier.BASIC.minimumSensibility} 이상이 필요합니다. (현재 ${sensibility})`;
    }

    const lines = [
        `[ 연금 재료 해석: ${item?.name ?? itemDataId} ]`,
        `분류: ${item?.category ?? '미분류'}`,
        item?.description ?? '등록된 아이템 설명이 없습니다.',
    ];
    if (insight.traitLabels.length) lines.push(`성질: ${insight.traitLabels.join(' · ')}`);
    if (insight.formulaDetails.length) {
        lines.push('', '[ 병당 정밀 조합 ]');
        for (const formula of insight.formulaDetails) {
            const result = getItemName(formula.resultItemDataId);
            const ingredients = formula.ingredients
                .map(ingredient => `${getItemName(ingredient.itemDataId)} x${ingredient.count}`)
                .join(', ');
            lines.push(
                `${formula.name} → ${result} · 난이도 ${formula.difficulty}`,
                `병당 재료: ${ingredients}`,
                `등록 효과: ${formatAlchemyEffect(formula.effect)}`,
                formula.description,
            );
        }
    } else if (insight.compatibleFormulas.length) {
        lines.push('', '[ 배합 추론 ]');
        for (const formula of insight.compatibleFormulas) {
            const partners = formula.partnerItemDataIds.map(getItemName).join(', ');
            lines.push(`${formula.name} → ${getItemName(formula.resultItemDataId)} · 함께 반응: ${partners}`);
        }
    }
    if (insight.nextTier) {
        lines.push('', `다음 해석 단계: 감각 ${insight.nextTier.minimumSensibility} (${insight.nextTier.label})`);
    }
    return lines.join('\n');
}

export function initAlchemyCommands(): void {
    registerCommand({
        name: '연금재료정보',
        aliases: ['연금재료', 'alchemyreagent', 'ari'],
        description: '실험한 연금 재료를 감각에 따라 단계적으로 해석합니다.',
        showCommandUse: 'hide',
        information: true,
        args: [{
            name: '재료명', description: '가마솥에 실제로 넣어 본 연금 재료', required: true,
            isText: true, completions: getAlchemyReagentInfoCompletions,
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            if (!canUseAlchemy(userId)) {
                sendBotMessageToUser(userId, '연금 재료 해석은 엘리트 직업 [ 연금술사 ]만 사용할 수 있습니다.');
                return;
            }
            sendBotMessageToUser(userId, createAlchemyReagentInformationMessage(player, args[0] ?? ''));
        },
    });

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
                isText: true, completions: getAlchemyReagentCompletions,
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
