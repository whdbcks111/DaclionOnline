import { AttributeType, type AttributeKey, type AttributeModifier } from '../models/Attribute.js';
import CodexBook, {
    CodexCategory,
    CodexRank,
    createCodexEntryId,
    type CodexCategoryKey,
    type CodexRankKey,
    type CodexRecordResult,
} from '../models/Codex.js';
import { GameEventIds, subscribeGameEvent, type GameEvent } from '../models/GameEvent.js';
import Monster from '../models/Monster.js';
import type Player from '../models/Player.js';
import Resource from '../models/Resource.js';
import { getVisitedLocationIds } from '../models/WorldMap.js';
import { sendBotMessageToUser, sendNotificationToUser } from './message.js';
import { chat } from '../utils/chatBuilder.js';
import { GameTags } from '../../../shared/tags.js';

interface CodexBonusProfile {
    readonly attributes: readonly AttributeKey[];
    readonly bronze: number;
    readonly silver: number;
    readonly gold: number;
}

export interface CodexBonusSnapshot {
    readonly categoryKey: CodexCategoryKey;
    readonly categoryLabel: string;
    readonly source: string;
    readonly rankKey?: CodexRankKey;
    readonly rankLabel?: string;
    readonly ratio: number;
    readonly percent: number;
    readonly attributeLabels: readonly string[];
}

const boundPlayers = new WeakSet<Player>();
const refreshingPlayers = new WeakSet<Player>();
let eventUnsubscribers: Array<() => void> = [];

function bonusSource(category: CodexCategory): string {
    return `codex:${category.key}`;
}

function getBonusProfile(category: CodexCategory): CodexBonusProfile {
    if (category === CodexCategory.MONSTER || category === CodexCategory.BOSS) {
        return {
            attributes: [AttributeType.ATK.key, AttributeType.MAGIC_FORCE.key],
            bronze: 0.0025,
            silver: 0.005,
            gold: 0.01,
        };
    }
    if (category === CodexCategory.ORE) {
        return {
            attributes: [AttributeType.DEF.key, AttributeType.MAGIC_DEF.key],
            bronze: 0.0025,
            silver: 0.005,
            gold: 0.01,
        };
    }
    if (category === CodexCategory.EXPLORATION) {
        return {
            attributes: [AttributeType.SPEED.key],
            bronze: 0.005,
            silver: 0.01,
            gold: 0.02,
        };
    }
    return {
        attributes: [AttributeType.MAX_LIFE.key, AttributeType.MAX_MENTALITY.key],
        bronze: 0.0025,
        silver: 0.005,
        gold: 0.01,
    };
}

function getHighestUnlockedRank(book: CodexBook, category: CodexCategory): CodexRank | undefined {
    return [...CodexRank.values()].reverse().find(rank => book.isRankUnlocked(category, rank));
}

function getRankBonusRatio(profile: CodexBonusProfile, rank?: CodexRank): number {
    return rank ? profile[rank.key] : 0;
}

/** 현재 영구 flag를 기준으로 한 분류별 실제 보너스 불변 snapshot. */
export function getCodexBonusSnapshots(player: Player): readonly CodexBonusSnapshot[] {
    return Object.freeze(CodexCategory.values().map(category => {
        const profile = getBonusProfile(category);
        const rank = getHighestUnlockedRank(player.codex, category);
        const ratio = getRankBonusRatio(profile, rank);
        return Object.freeze({
            categoryKey: category.key,
            categoryLabel: category.label,
            source: bonusSource(category),
            ...(rank ? { rankKey: rank.key, rankLabel: rank.label } : {}),
            ratio,
            percent: ratio * 100,
            attributeLabels: Object.freeze(profile.attributes.map(attribute =>
                AttributeType.fromKey(attribute)?.label ?? attribute)),
        });
    }));
}

/** source를 먼저 지운 뒤 현재 최고 해금 rank 하나만 적용해 재로그인·재평가 중복을 막는다. */
export function refreshCodexBonuses(player: Player): readonly CodexBonusSnapshot[] {
    if (refreshingPlayers.has(player)) return getCodexBonusSnapshots(player);
    refreshingPlayers.add(player);
    try {
        const snapshots = getCodexBonusSnapshots(player);
        for (const snapshot of snapshots) {
            player.attribute.removeBySource(snapshot.source);
            if (snapshot.ratio <= 0) continue;
            const modifiers: AttributeModifier[] = getBonusProfile(
                CodexCategory.fromKey(snapshot.categoryKey)!,
            ).attributes.map(attribute => ({
                attribute,
                op: 'multiply',
                value: 1 + snapshot.ratio,
                source: snapshot.source,
            }));
            player.attribute.addModifiers(modifiers);
        }
        player.clampVitals();
        return snapshots;
    } finally {
        refreshingPlayers.delete(player);
    }
}

function isCodexProgressId(id: string): boolean {
    return id.startsWith('codex-entry:') || id.startsWith('codex-rank:');
}

/** 로그인 시 기존 장소 방문 flag만 정확히 0→1로 소급하고 영구 보너스를 복원한다. */
export function initializePlayerCodex(player: Player): void {
    for (const locationId of getVisitedLocationIds(player)) {
        player.codex.record(createCodexEntryId(CodexCategory.EXPLORATION, locationId));
    }
    refreshCodexBonuses(player);
    if (boundPlayers.has(player)) return;
    boundPlayers.add(player);
    player.progress.subscribeChanges(id => {
        if (isCodexProgressId(id)) refreshCodexBonuses(player);
    });
}

function formatBonus(snapshot: CodexBonusSnapshot): string {
    if (!snapshot.rankLabel || snapshot.percent <= 0) return '보너스 없음';
    return `${snapshot.attributeLabels.join('·')} +${snapshot.percent.toFixed(2).replace(/\.00$/, '')}%`;
}

function notifyRankUnlock(player: Player, result: Extract<CodexRecordResult, { recorded: true }>): void {
    const highest = result.newlyUnlockedRanks.at(-1);
    if (!highest) return;
    const bonus = getCodexBonusSnapshots(player)
        .find(snapshot => snapshot.categoryKey === result.category.key)!;
    const unlockedLabels = result.newlyUnlockedRanks.map(rank => rank.label).join('·');
    const message = `${result.category.label} 도감 ${unlockedLabels} 등급 해금! ${formatBonus(bonus)}`;
    sendBotMessageToUser(player.userId, chat()
        .color('gold', builder => builder.weight('bold', nested => nested.text(`📖 ${message}`)))
        .build());
    sendNotificationToUser(player.userId, {
        key: `codex-rank:${result.category.key}:${highest.key}`,
        message,
        length: 5_000,
    });
}

/** 확정된 콘텐츠 결과를 기록하고 새 분류 rank가 있을 때 한 번만 알린다. */
export function recordCodexProgress(
    player: Player,
    category: CodexCategory,
    sourceId: string,
    amount = 1,
    notify = true,
): CodexRecordResult {
    const result = player.codex.record(createCodexEntryId(category, sourceId), amount);
    if (notify && result.recorded && result.newlyUnlockedRanks.length > 0) {
        notifyRankUnlock(player, result);
    }
    return result;
}

function resolvePlayerOwner(event: GameEvent): Player | undefined {
    const owner = event.actor?.attackOwner;
    return owner?.isPlayer && 'codex' in owner ? owner as Player : undefined;
}

function recordMonsterDefeat(event: GameEvent): void {
    const player = resolvePlayerOwner(event);
    if (!player || !(event.subject instanceof Monster)) return;
    recordCodexProgress(
        player,
        event.subject.hasTag(GameTags.ENTITY_BOSS) ? CodexCategory.BOSS : CodexCategory.MONSTER,
        event.subject.monsterDataId,
    );
}

function recordOreDestroyed(event: GameEvent): void {
    const player = resolvePlayerOwner(event);
    if (!player || !(event.subject instanceof Resource)
        || !event.subject.hasTag(GameTags.RESOURCE_ORE)) return;
    recordCodexProgress(player, CodexCategory.ORE, event.subject.resourceDataId);
}

function recordLocationChanged(event: GameEvent): void {
    const player = resolvePlayerOwner(event);
    const locationId = event.data.toLocationId;
    if (!player || typeof locationId !== 'string') return;
    recordCodexProgress(player, CodexCategory.EXPLORATION, locationId);
}

function recordCookingCompleted(event: GameEvent): void {
    const player = resolvePlayerOwner(event);
    const recipeId = event.data.recipeId;
    if (!player || typeof recipeId !== 'string') return;
    const quantity = event.data.quantity;
    const amount = typeof quantity === 'number' && Number.isSafeInteger(quantity) && quantity > 0
        ? quantity
        : 1;
    recordCodexProgress(player, CodexCategory.COOKING, recipeId, amount);
}

/** 확정 GameEvent 네 종류를 한 번만 구독한다. */
export function initCodexEventTracking(): void {
    if (eventUnsubscribers.length > 0) return;
    eventUnsubscribers = [
        subscribeGameEvent(GameEventIds.ENTITY_DEFEATED, recordMonsterDefeat),
        subscribeGameEvent(GameEventIds.RESOURCE_DESTROYED, recordOreDestroyed),
        subscribeGameEvent(GameEventIds.LOCATION_CHANGED, recordLocationChanged),
        subscribeGameEvent(GameEventIds.ITEM_CRAFTED, recordCookingCompleted),
    ];
}

/** 테스트·명시적 재초기화 경계에서만 사용한다. */
export function resetCodexEventTracking(): void {
    for (const unsubscribe of eventUnsubscribers) unsubscribe();
    eventUnsubscribers = [];
}
