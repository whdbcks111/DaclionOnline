import type Player from '../models/Player.js';

const onlinePlayers = new Map<number, Player>();

/** 온라인 Player를 메모리 레지스트리에 등록한다. */
export function registerOnlinePlayer(player: Player): void {
    onlinePlayers.set(player.userId, player);
}

/** userId의 온라인 Player를 반환한다. */
export function getOnlinePlayer(userId: number): Player | undefined {
    return onlinePlayers.get(userId);
}

/** 온라인 Player를 제거하고 제거된 인스턴스를 반환한다. */
export function unregisterOnlinePlayer(userId: number): Player | undefined {
    const player = onlinePlayers.get(userId);
    if (player) onlinePlayers.delete(userId);
    return player;
}

/** 호출자가 내부 Map을 변경할 수 없는 온라인 Player 스냅샷을 반환한다. */
export function getOnlinePlayerSnapshot(): Player[] {
    return [...onlinePlayers.values()];
}

/** 특정 온라인 유저가 주어진 위치에 있는지 확인한다. */
export function isOnlinePlayerAtLocation(userId: number, locationId: string): boolean {
    return onlinePlayers.get(userId)?.locationId === locationId;
}
