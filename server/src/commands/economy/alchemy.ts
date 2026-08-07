import type { CompletionItem } from '../../../../shared/types.js';
import { parseCommandInput } from '../../../../shared/commandInput.js';
import {
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
} from '../../models/professions/Alchemy.js';
import { getItemData } from '../../models/economy/Item.js';
import { StatType } from '../../models/core/Stat.js';
import { StatusEffectType } from '../../models/combat/StatusEffect.js';
import type Player from '../../models/actors/Player.js';
import {
    adjustAlchemyDraftReagent,
    cancelAlchemyDraft,
    canUseAlchemy,
    initAlchemyDraftLifecycle,
    openAlchemyDraft,
    setAlchemyDraftBottleCount,
    setAlchemyDraftDelivery,
    startAlchemy,
    startAlchemyDraft,
    subscribeAlchemyDraftEvents,
    type AlchemyDraftMutationResult,
    type AlchemyDraftSnapshot,
} from '../../modules/professions/alchemy.js';
import { registerCommand } from '../../modules/communication/bot.js';
import {
    deleteMessage,
    sendBotMessageToUser,
    sendNotificationToUser,
    sendPrivateBotMessageToUser,
} from '../../modules/communication/message.js';
import { getPlayerByUserId } from '../../modules/player/player.js';
import { chat } from '../../utils/chatBuilder.js';

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
    if (parts.length < 1 || parts.length > 5) return undefined;
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
    if (totals.size < 1 || totals.size > 5) return undefined;
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
    if (!player || !canUseAlchemy(player)) return [];
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
            value: `${getItemName(reagent.itemDataId)}x1,`,
            description: details.join(' · '),
        }];
    });
}

/** 재료 정보 자동완성은 해당 계정이 실제 가마솥에 넣어 본 재료로만 제한한다. */
export function getAlchemyReagentInfoCompletions(userId: number): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    if (!player || !canUseAlchemy(player)) return [];
    const sensibility = player.stat.get(StatType.SENSIBILITY);
    return getExperimentedAlchemyReagents(player.progress).map(reagent => {
        const insight = getAlchemyReagentInsight(reagent.itemDataId, sensibility);
        return {
            value: getItemName(reagent.itemDataId),
            description: insight?.tier?.label ?? `실험 기록 · 감각 ${AlchemyReagentInsightTier.BASIC.minimumSensibility} 필요`,
        };
    });
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

const alchemyDraftCardIds = new Map<number, { readonly draftId: string; readonly messageId: string }>();
let alchemyDraftPresenterInitialized = false;

function removeAlchemyDraftCard(userId: number, draftId?: string): void {
    const tracked = alchemyDraftCardIds.get(userId);
    if (!tracked || (draftId !== undefined && tracked.draftId !== draftId)) return;
    deleteMessage(tracked.messageId);
    alchemyDraftCardIds.delete(userId);
}

/** 공개 draft snapshot과 현재 inventory API만 사용해 사용자 전용 준비 카드를 만든다. */
export function buildAlchemyDraftCard(player: Player, draft: AlchemyDraftSnapshot) {
    const selectedById = new Map(draft.ingredients.map(ingredient => [ingredient.itemDataId, ingredient]));
    const builder = chat()
        .color('gold', value => value.weight('bold', nested => nested.text('[ 가마솥 연성 준비 ]')))
        .text('\n병 수: ');
    for (const count of [1, 2, 3]) {
        builder.button(`/연금준비병 ${draft.id} ${draft.revision} ${count}`, button =>
            count === draft.bottleCount
                ? button.color('gold', text => text.text(`[${count}병 ✓]`))
                : button.text(`[${count}병]`))
            .text(' ');
    }
    builder.text(`\n정제수: 필요 ${draft.bottleCount} · 보유 ${draft.waterBottleCount}`)
        .text('\n전달 방식: ');
    for (const delivery of AlchemyDelivery.values()) {
        builder.button(`/연금준비방식 ${draft.id} ${draft.revision} ${delivery.key}`, button =>
            delivery.key === draft.deliveryKey
                ? button.color('gold', text => text.text(`[${delivery.label} ✓]`))
                : button.text(`[${delivery.label}]`))
            .text(' ');
    }

    builder.divider(`선택 재료 · ${draft.ingredients.length}/5종 · 총 ${draft.totalIngredientCount}개`);
    if (draft.ingredients.length === 0) {
        builder.color('gray', value => value.text('아래 보유 재료에서 하나 이상 추가해주세요.\n'));
    } else {
        for (const ingredient of draft.ingredients) {
            const item = getItemData(ingredient.itemDataId);
            if (item?.image) builder.icon(item.image);
            builder.text(`${item?.name ?? ingredient.itemDataId} x${ingredient.count} / 보유 ${ingredient.ownedCount} `)
                .button(`/연금준비재료 ${draft.id} ${draft.revision} ${ingredient.itemDataId} -1`, button =>
                    button.color('red', text => text.text('[-1]')));
            if (ingredient.count < ingredient.ownedCount) {
                builder.text(' ').button(`/연금준비재료 ${draft.id} ${draft.revision} ${ingredient.itemDataId} 1`, button =>
                    button.color('lime', text => text.text('[+1]')));
            }
            if (ingredient.count > ingredient.ownedCount) {
                builder.color('red', value => value.text('  보유량 부족'));
            }
            builder.text('\n');
        }
    }

    const ownedReagents = getAllAlchemyReagents()
        .map(reagent => ({ reagent, owned: player.inventory.getCount(reagent.itemDataId) }))
        .filter(({ reagent, owned }) => owned > (selectedById.get(reagent.itemDataId)?.count ?? 0))
        .sort((left, right) => getItemName(left.reagent.itemDataId)
            .localeCompare(getItemName(right.reagent.itemDataId), 'ko-KR'));
    if (ownedReagents.length > 0) {
        builder.hide('보유 연금 재료에서 추가', hidden => {
            for (const { reagent, owned } of ownedReagents) {
                const item = getItemData(reagent.itemDataId);
                if (item?.image) hidden.icon(item.image);
                hidden.text(`${item?.name ?? reagent.itemDataId} · 보유 ${owned} `)
                    .button(`/연금준비재료 ${draft.id} ${draft.revision} ${reagent.itemDataId} 1`, button =>
                        button.color('lime', text => text.text('[+1]')))
                    .text('\n');
            }
            return hidden;
        }).text('\n');
    } else {
        builder.color('gray', value => value.text('더 추가할 수 있는 보유 연금 재료가 없습니다.\n'));
    }
    builder.button(`/연금준비시작 ${draft.id} ${draft.revision}`, button =>
        button.color('lime', text => text.weight('bold', nested => nested.text('[조제 시작]'))))
        .text(' ')
        .closeButton(`/연금준비취소 ${draft.id} ${draft.revision}`, button =>
            button.color('red', text => text.text('[준비 취소]')))
        .text('\n')
        .color('gray', value => value.text('재료는 미니게임을 실제로 시작할 때 확정 소모됩니다.'));
    return builder.build();
}

function ensureAlchemyDraftPresenter(): void {
    if (alchemyDraftPresenterInitialized) return;
    alchemyDraftPresenterInitialized = true;
    initAlchemyDraftLifecycle();
    subscribeAlchemyDraftEvents(event => {
        if (event.type === 'ended') {
            removeAlchemyDraftCard(event.userId, event.draftId);
            return;
        }
        const player = getPlayerByUserId(event.draft.userId);
        if (!player) return;
        removeAlchemyDraftCard(player.userId);
        const messageId = sendPrivateBotMessageToUser(
            player.userId,
            buildAlchemyDraftCard(player, event.draft),
        );
        alchemyDraftCardIds.set(player.userId, { draftId: event.draft.id, messageId });
    });
}

function reportAlchemyDraftResult(userId: number, result: AlchemyDraftMutationResult): void {
    if (!result.success) {
        sendPrivateBotMessageToUser(userId, result.reason ?? '연금술 준비를 처리하지 못했습니다.');
    }
}

function reportAlchemyStartResult(userId: number, result: ReturnType<typeof startAlchemy>): void {
    if (result.success) return;
    const reason = result.reason ?? '연금술 조제를 시작할 수 없습니다.';
    sendPrivateBotMessageToUser(userId, reason);
    sendNotificationToUser(userId, { key: 'alchemy:start-failed', message: reason });
}

export function initAlchemyCommands(): void {
    ensureAlchemyDraftPresenter();
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
            if (!canUseAlchemy(player)) {
                sendBotMessageToUser(userId, '연금 재료 해석에는 현재 연금술사 직업과 패시브 스킬 [ 가마솥 연성 ]이 모두 필요합니다.');
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
            if (!canUseAlchemy(player)) {
                sendBotMessageToUser(userId, '연금 조합표를 읽으려면 현재 연금술사 직업과 패시브 스킬 [ 가마솥 연성 ]이 모두 필요합니다.');
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
        name: '연금준비병',
        aliases: ['alchemyprepbottles'],
        description: '연금술 준비 카드의 병 수를 바꿉니다.',
        showCommandUse: 'hide',
        args: [
            { name: '준비ID', description: '서버가 발급한 현재 준비 ID', required: true },
            { name: '상태번호', description: '현재 준비 카드 revision', required: true },
            { name: '병수', description: '1~3병', required: true, list: ['1', '2', '3'] },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            reportAlchemyDraftResult(
                userId,
                setAlchemyDraftBottleCount(player, args[0] ?? '', Number(args[1]), Number(args[2])),
            );
        },
    });

    registerCommand({
        name: '연금준비방식',
        aliases: ['alchemyprepdelivery'],
        description: '연금술 준비 카드의 전달 방식을 바꿉니다.',
        showCommandUse: 'hide',
        args: [
            { name: '준비ID', description: '서버가 발급한 현재 준비 ID', required: true },
            { name: '상태번호', description: '현재 준비 카드 revision', required: true },
            {
                name: '방식', description: '음용 또는 투척', required: true,
                list: AlchemyDelivery.values().map(value => value.key),
            },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const delivery = AlchemyDelivery.fromKey(args[2] ?? '');
            if (!delivery) {
                sendPrivateBotMessageToUser(userId, '전달 방식이 올바르지 않습니다.');
                return;
            }
            reportAlchemyDraftResult(
                userId,
                setAlchemyDraftDelivery(player, args[0] ?? '', Number(args[1]), delivery),
            );
        },
    });

    registerCommand({
        name: '연금준비재료',
        aliases: ['alchemyprepreagent'],
        description: '연금술 준비 카드의 재료를 한 개 더하거나 뺍니다.',
        showCommandUse: 'hide',
        args: [
            { name: '준비ID', description: '서버가 발급한 현재 준비 ID', required: true },
            { name: '상태번호', description: '현재 준비 카드 revision', required: true },
            { name: '재료ID', description: '등록된 연금 재료 ID', required: true },
            { name: '변경량', description: '+1 또는 -1', required: true, list: ['1', '-1'] },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const delta = Number(args[3]);
            if (delta !== 1 && delta !== -1) {
                sendPrivateBotMessageToUser(userId, '재료는 한 번에 +1 또는 -1만 바꿀 수 있습니다.');
                return;
            }
            reportAlchemyDraftResult(
                userId,
                adjustAlchemyDraftReagent(
                    player,
                    args[0] ?? '',
                    Number(args[1]),
                    args[2] ?? '',
                    delta,
                ),
            );
        },
    });

    registerCommand({
        name: '연금준비시작',
        aliases: ['alchemyprepstart'],
        description: '현재 연금술 준비 내용으로 가마솥 추적을 시작합니다.',
        showCommandUse: 'hide',
        args: [
            { name: '준비ID', description: '서버가 발급한 현재 준비 ID', required: true },
            { name: '상태번호', description: '현재 준비 카드 revision', required: true },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (player) {
                reportAlchemyStartResult(userId, startAlchemyDraft(player, args[0] ?? '', Number(args[1])));
            }
        },
    });

    registerCommand({
        name: '연금준비취소',
        aliases: ['alchemyprepcancel'],
        description: '현재 연금술 준비를 취소합니다.',
        showCommandUse: 'hide',
        args: [
            { name: '준비ID', description: '서버가 발급한 현재 준비 ID', required: true },
            { name: '상태번호', description: '현재 준비 카드 revision', required: true },
        ],
        handler(userId, args) {
            const result = cancelAlchemyDraft(userId, args[0] ?? '', Number(args[1]));
            reportAlchemyDraftResult(userId, result);
            if (result.success) sendPrivateBotMessageToUser(userId, '연금술 준비를 취소했습니다.');
        },
    });

    registerCommand({
        name: '연금술',
        aliases: ['연금', 'alchemy', 'al'],
        description: '1~3병의 재료와 전달 방식을 골라 가마솥 추적 조제를 시작합니다.',
        showCommandUse: 'private',
        args: [
            {
                name: '병수', description: '한 번에 조제할 병 수 (1~3)', required: false,
                list: ['1', '2', '3'], completions: ['1', '2', '3'],
            },
            {
                name: '방식', description: '완성품 전달 방식', required: false,
                list: AlchemyDelivery.values().flatMap(value => [value.label, value.key]),
                completions: AlchemyDelivery.values().map(value => ({ value: value.label, description: value.key })),
            },
            {
                name: '재료목록', description: '쉼표로 구분한 재료명x수량', required: false,
                isText: true, completions: getAlchemyReagentCompletions,
            },
        ],
        handler(userId, _args, raw) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            if (!canUseAlchemy(player)) {
                sendBotMessageToUser(userId, '연금술 조제에는 현재 연금술사 직업과 패시브 스킬 [ 가마솥 연성 ]이 모두 필요합니다.');
                return;
            }
            const parsedInput = parseCommandInput(raw);
            const remainder = parsedInput?.remainder.trim() ?? '';
            if (!remainder) {
                reportAlchemyDraftResult(userId, openAlchemyDraft(player));
                return;
            }
            const parsed = parseAlchemyCommandRemainder(remainder);
            if (!parsed) {
                sendPrivateBotMessageToUser(
                    userId,
                    '사용법: /연금술 <1~3> <음용|투척> <재료명x수량, ...>\n'
                    + '재료는 1~5종이며, 여러 종류는 쉼표로 구분하고 같은 재료는 x수량으로 합쳐 입력해주세요.',
                );
                return;
            }
            reportAlchemyStartResult(userId, startAlchemy(player, parsed));
        },
    });
}
