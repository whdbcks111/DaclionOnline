import {
    DACLEVIS_REVELATION_FLAG,
    ORIGINBOUNDARY_SOVEREIGN_DEFEATED_FLAG,
} from '../../data/progression/ascension.js';
import Monster from '../../models/actors/Monster.js';
import type Player from '../../models/actors/Player.js';
import { GameEventIds, subscribeGameEvent, type GameEvent } from '../../models/core/GameEvent.js';
import {
    ASCENSION_ARTIFACT_ITEM_ID,
    ASCENSION_BONUS_STAT_POINTS,
    ASCENSION_LEVEL,
    ASCENSION_PASSIVE_SKILL_ID,
    ASCENSION_RANK_COUNTER,
    isAscended,
} from '../../models/progression/Ascension.js';
import logger from '../../utils/logger.js';
import { getOnlinePlayer } from '../player/playerRegistry.js';

export const ORIGINBOUNDARY_SOVEREIGN_MONSTER_ID = 'originboundary_sovereign';

let unsubscribeDefeat: (() => void) | undefined;

export interface AscensionOperationResult {
    readonly success: boolean;
    readonly reason?: string;
    readonly previousLevel?: number;
}

export function getAscensionDeniedReason(player: Player): string | undefined {
    if (isAscended(player.progress)) return '이미 초월을 마친 영혼입니다.';
    if (!player.progress.getFlag(ORIGINBOUNDARY_SOVEREIGN_DEFEATED_FLAG)) {
        return '기원종언체 아르케를 직접 제압한 기록이 필요합니다.';
    }
    if (!player.progress.getFlag(DACLEVIS_REVELATION_FLAG)) {
        return '기원종언의 잔재에게 다클레비스와 초월의 진실을 먼저 들어야 합니다.';
    }
    if (player.level < ASCENSION_LEVEL) return `초월에는 Lv.${ASCENSION_LEVEL} 이상의 완성된 생이 필요합니다.`;
    if (player.isDefeated) return '사망하거나 파괴된 상태에서는 초월할 수 없습니다.';
    return undefined;
}

/** NPC의 최종 재확인 뒤 한 번만 실행하는 초월 환생 진입점. */
export function ascendPlayer(player: Player): AscensionOperationResult {
    const deniedReason = getAscensionDeniedReason(player);
    if (deniedReason) return { success: false, reason: deniedReason };

    const reset = player.resetForAscension(ASCENSION_BONUS_STAT_POINTS);
    player.progress.increment(ASCENSION_RANK_COUNTER);
    player.skills.grant(ASCENSION_PASSIVE_SKILL_ID, 'ascension:reincarnation');
    if (!player.inventory.addItem(ASCENSION_ARTIFACT_ITEM_ID, 1)) {
        throw new Error('초월자의 나침반을 인벤토리에 지급하지 못했습니다.');
    }
    void player.save().catch(error => logger.error(`초월 환생 즉시 저장 실패: user=${player.userId}`, error));
    return { success: true, previousLevel: reset.previousLevel };
}

/** 처치 원장에 양수 기여가 남은 온라인 참가자에게 아르케 제압 자격을 부여한다. */
export function grantOriginboundaryDefeatProgress(players: readonly Player[]): number {
    let granted = 0;
    for (const player of players) {
        if (player.progress.getFlag(ORIGINBOUNDARY_SOVEREIGN_DEFEATED_FLAG)) continue;
        player.progress.setFlag(ORIGINBOUNDARY_SOVEREIGN_DEFEATED_FLAG, true);
        granted++;
    }
    return granted;
}

export function recordOriginboundarySovereignDefeat(event: GameEvent): number {
    if (!(event.subject instanceof Monster)
        || event.subject.monsterDataId !== ORIGINBOUNDARY_SOVEREIGN_MONSTER_ID) return 0;
    const creditedUserIds = event.subject.getDefeatCreditUserIds();
    const fallbackUserId = event.actor?.attackOwner.playerUserId;
    const userIds = creditedUserIds.length > 0
        ? creditedUserIds
        : fallbackUserId === undefined ? [] : [fallbackUserId];
    const players = [...new Set(userIds)]
        .map(userId => getOnlinePlayer(userId))
        .filter((player): player is Player => player !== undefined);
    return grantOriginboundaryDefeatProgress(players);
}

export function initAscensionDiscovery(): void {
    if (unsubscribeDefeat) return;
    unsubscribeDefeat = subscribeGameEvent(GameEventIds.ENTITY_DEFEATED, recordOriginboundarySovereignDefeat);
}

/** 테스트와 명시적 종료 경계에서만 구독을 해제한다. */
export function resetAscensionDiscovery(): void {
    unsubscribeDefeat?.();
    unsubscribeDefeat = undefined;
}
