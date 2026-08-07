import {
    ORIGINBOUNDARY_SOVEREIGN_DEFEATED_FLAG,
} from '../../data/progression/ascension.js';
import Monster from '../../models/actors/Monster.js';
import type Player from '../../models/actors/Player.js';
import { GameEventIds, subscribeGameEvent, type GameEvent } from '../../models/core/GameEvent.js';
import { getOnlinePlayer } from '../player/playerRegistry.js';

export const ORIGINBOUNDARY_SOVEREIGN_MONSTER_ID = 'originboundary_sovereign';

let unsubscribeDefeat: (() => void) | undefined;

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
