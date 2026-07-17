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

/** 고유번호 또는 대소문자를 무시한 정확한 닉네임으로 온라인 Player를 찾는다. */
export function findOnlinePlayerByIdentity(input: string): Player | undefined {
    const normalized = input.trim();
    if (!normalized) return undefined;
    const userId = Number(normalized.replace(/^#/, ''));
    if (Number.isSafeInteger(userId) && userId > 0) return onlinePlayers.get(userId);
    const nickname = normalized.toLocaleLowerCase('ko-KR');
    return [...onlinePlayers.values()].find(player => player.name.toLocaleLowerCase('ko-KR') === nickname);
}

/** 파티 초대 등 사용자 선택 UI에 쓸 온라인 신원 DTO를 반환한다. */
export function getOnlinePlayerIdentitySnapshots(excludeUserId?: number): { userId: number; nickname: string; level: number }[] {
    return [...onlinePlayers.values()]
        .filter(player => player.userId !== excludeUserId)
        .map(player => ({ userId: player.userId, nickname: player.name, level: player.level }));
}

/** @귓속말 등 온라인 사용자 검색 UI용 prefix 일치 신원 DTO를 반환한다. */
export function searchOnlinePlayerIdentitySnapshots(
    query: string,
    excludeUserId?: number,
    limit = 20,
): { userId: number; nickname: string; level: number }[] {
    const normalized = query.trim().toLocaleLowerCase('ko-KR');
    return getOnlinePlayerIdentitySnapshots(excludeUserId)
        .filter(player => !normalized || player.nickname.toLocaleLowerCase('ko-KR').startsWith(normalized))
        .sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko-KR'))
        .slice(0, Math.max(0, Math.trunc(limit)));
}

/** 특정 온라인 유저가 주어진 위치에 있는지 확인한다. */
export function isOnlinePlayerAtLocation(userId: number, locationId: string): boolean {
    return onlinePlayers.get(userId)?.locationId === locationId;
}
