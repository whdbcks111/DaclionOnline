import Player from '../models/Player.js';
import {
    RankingCategory,
    type RankingMetricRecord,
    type RankingVisibilitySnapshot,
} from '../models/Ranking.js';
import { getOnlinePlayerSnapshot } from './playerRegistry.js';

export interface RankingEntrySnapshot {
    rank: number | null;
    userId: number;
    nickname: string;
    value: number | null;
    valuePublic: boolean;
}

export interface RankingPlayerSnapshot {
    userId: number;
    nickname: string;
    metrics: RankingMetricRecord;
    visibility: RankingVisibilitySnapshot;
}

const DATABASE_CACHE_MS = 10_000;
let databaseSnapshots: RankingPlayerSnapshot[] | undefined;
let databaseSnapshotsExpireAt = 0;
let databaseSnapshotPromise: Promise<RankingPlayerSnapshot[]> | undefined;

/**
 * 공개 참가자끼리만 값 내림차순·동점 공동 순위를 계산한다.
 * 비공개 참가자는 실제 값과 순위를 DTO에서 제거하고 userId 안정 정렬로 하단에 분리한다.
 */
export function rankPlayerSnapshots(
    category: RankingCategory,
    snapshots: readonly RankingPlayerSnapshot[],
): RankingEntrySnapshot[] {
    const isPublic = (snapshot: RankingPlayerSnapshot) =>
        snapshot.visibility.overrides[category.key] ?? snapshot.visibility.defaultPublic;
    const publicSnapshots = snapshots.filter(isPublic).sort((left, right) =>
        (right.metrics[category.key] ?? 0) - (left.metrics[category.key] ?? 0)
        || left.userId - right.userId);
    let previousValue: number | undefined;
    let previousRank = 0;
    const publicEntries = publicSnapshots.map((snapshot, index): RankingEntrySnapshot => {
        const value = snapshot.metrics[category.key] ?? 0;
        if (previousValue === undefined || value !== previousValue) previousRank = index + 1;
        previousValue = value;
        return {
            rank: previousRank,
            userId: snapshot.userId,
            nickname: snapshot.nickname,
            value,
            valuePublic: true,
        };
    });
    const privateEntries = snapshots
        .filter(snapshot => !isPublic(snapshot))
        .sort((left, right) => left.userId - right.userId)
        .map((snapshot): RankingEntrySnapshot => ({
            rank: null,
            userId: snapshot.userId,
            nickname: snapshot.nickname,
            value: null,
            valuePublic: false,
        }));
    return [...publicEntries, ...privateEntries];
}

/** DB의 마지막 저장 snapshot에 온라인 메모리 값을 덮어써 전체 플레이어 순위를 만든다. */
export async function getRankingEntries(category: RankingCategory): Promise<RankingEntrySnapshot[]> {
    const persisted = await getPersistedRankingSnapshots();
    const online = new Map(getOnlinePlayerSnapshot().map(player => [player.userId, player]));
    const includedUserIds = new Set<number>();
    const snapshots = persisted.map(snapshot => {
        includedUserIds.add(snapshot.userId);
        const player = online.get(snapshot.userId);
        return player ? {
            userId: player.userId,
            nickname: player.name,
            metrics: { ...player.getRankingMetricSnapshot() },
            visibility: player.rankingVisibility.snapshot(),
        } : snapshot;
    });
    for (const player of online.values()) {
        if (includedUserIds.has(player.userId)) continue;
        snapshots.push({
            userId: player.userId,
            nickname: player.name,
            metrics: { ...player.getRankingMetricSnapshot() },
            visibility: player.rankingVisibility.snapshot(),
        });
    }
    return rankPlayerSnapshots(category, snapshots);
}

async function getPersistedRankingSnapshots(): Promise<RankingPlayerSnapshot[]> {
    if (databaseSnapshots && Date.now() < databaseSnapshotsExpireAt) return databaseSnapshots;
    if (databaseSnapshotPromise) return databaseSnapshotPromise;
    databaseSnapshotPromise = loadPersistedRankingSnapshots();
    try {
        databaseSnapshots = await databaseSnapshotPromise;
        databaseSnapshotsExpireAt = Date.now() + DATABASE_CACHE_MS;
        return databaseSnapshots;
    } finally {
        databaseSnapshotPromise = undefined;
    }
}

async function loadPersistedRankingSnapshots(): Promise<RankingPlayerSnapshot[]> {
    return Player.getPersistedRankingSnapshots();
}
