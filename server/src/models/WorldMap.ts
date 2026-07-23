import type { WorldMapConnectionData, WorldMapData, WorldMapLocationData } from '../../../shared/types.js';
import { GameTags } from '../../../shared/tags.js';
import type Player from './Player.js';
import { RegionRiskPolicy } from './RegionRisk.js';
import { ProgressType, defineProgress } from './Progress.js';
import {
    distanceBetween,
    getAllLocationData,
    getAllLocations,
    getLocation,
    normalizeLocationInput,
} from './Location.js';

const VISIT_PREFIX = 'world:visited/';

function getVisitProgressId(locationId: string): string {
    return `${VISIT_PREFIX}${locationId.trim().toLowerCase()}`;
}

function ensureVisitProgress(locationId: string): string {
    const id = getVisitProgressId(locationId);
    defineProgress({
        id,
        type: ProgressType.FLAG,
        label: '장소 방문',
        description: `${locationId} 방문 여부`,
    });
    return id;
}

/** 현재 장소를 플레이어별 방문 기록에 남긴다. 기록은 PlayerProgress dirty flush로 저장된다. */
export function markLocationVisited(player: Player, locationId: string): boolean {
    if (!getLocation(locationId)) return false;
    const id = ensureVisitProgress(locationId);
    if (player.progress.getFlag(id)) return false;
    player.progress.setFlag(id);
    return true;
}

export function hasVisitedLocation(player: Player, locationId: string): boolean {
    return player.progress.getFlag(ensureVisitProgress(locationId));
}

export function getVisitedLocationIds(player: Player): string[] {
    return getAllLocations()
        .filter(location => hasVisitedLocation(player, location.id))
        .map(location => location.id);
}

export interface VisitedLocationMatch {
    locationId: string;
    name: string;
}

function longestCommonSubsequenceLength(left: string, right: string): number {
    if (!left || !right) return 0;
    let previous = new Uint16Array(right.length + 1);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
        const current = new Uint16Array(right.length + 1);
        for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
            current[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
                ? previous[rightIndex - 1] + 1
                : Math.max(previous[rightIndex], current[rightIndex - 1]);
        }
        previous = current;
    }
    return previous[right.length];
}

function locationSearchValues(location: VisitedLocationMatch): string[] {
    return [
        normalizeLocationInput(location.name),
        normalizeLocationInput(location.locationId),
    ];
}

/** 자동이동 검색용으로 지도에 표시 가능한 방문 장소만 반환한다. */
export function getVisitedLocationMatches(player: Player, input = ''): VisitedLocationMatch[] {
    const normalizedInput = normalizeLocationInput(input);
    const visited = getAllLocations()
        .filter(location => hasVisitedLocation(player, location.id))
        .filter(location => !location.hasTag(GameTags.LOCATION_HIDDEN))
        .map(location => ({
            locationId: location.id,
            name: location.data.name,
        }));

    if (!normalizedInput) return visited.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    const exact = visited.filter(location =>
        locationSearchValues(location).some(value => value === normalizedInput));
    if (exact.length > 0) return exact;

    const startsWith = visited.filter(location =>
        locationSearchValues(location).some(value => value.startsWith(normalizedInput)));
    if (startsWith.length > 0) {
        return startsWith.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name, 'ko'));
    }

    const includes = visited.filter(location =>
        locationSearchValues(location).some(value => value.includes(normalizedInput)));
    if (includes.length > 0) {
        return includes.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name, 'ko'));
    }

    // 한두 글자는 우연히 겹칠 가능성이 커서 오타 보정을 적용하지 않는다.
    if (normalizedInput.length < 3) return [];

    const scored = visited.map(location => {
        const score = Math.max(...locationSearchValues(location).map(value => {
            const common = longestCommonSubsequenceLength(normalizedInput, value);
            const queryCoverage = common / normalizedInput.length;
            const lengthPrecision = common / value.length;
            return queryCoverage * 0.8 + lengthPrecision * 0.2;
        }));
        return { location, score };
    });
    const bestScore = Math.max(0, ...scored.map(entry => entry.score));
    if (bestScore < 0.58) return [];

    return scored
        .filter(entry => entry.score >= 0.58 && entry.score >= bestScore - 0.08)
        .sort((a, b) => b.score - a.score
            || a.location.name.length - b.location.name.length
            || a.location.name.localeCompare(b.location.name, 'ko'))
        .slice(0, 20)
        .map(entry => entry.location);
}

function reconstructRoute(cameFrom: ReadonlyMap<string, string>, destinationId: string): string[] {
    const route = [destinationId];
    let current = destinationId;
    while (cameFrom.has(current)) {
        current = cameFrom.get(current)!;
        route.push(current);
    }
    return route.reverse();
}

/**
 * 현재 공개되어 있고 잠기지 않은 연결만 사용해 방문 장소 사이의 최단 이동 거리 경로를 구한다.
 * 휴리스틱과 간선 비용 모두 실제 좌표 거리를 사용하므로 이동 시간 기준 최단 경로와 같다.
 */
export function findShortestVisitedRoute(
    player: Player,
    fromLocationId: string,
    destinationId: string,
): string[] | undefined {
    const from = getLocation(fromLocationId);
    const destination = getLocation(destinationId);
    if (!from || !destination) return undefined;

    const visitedIds = new Set(getVisitedLocationIds(player));
    if (!visitedIds.has(from.id) || !visitedIds.has(destination.id)) return undefined;
    if (destination.hasTag(GameTags.LOCATION_HIDDEN)) return undefined;
    if (from.id === destination.id) return [from.id];

    const open = new Set([from.id]);
    const cameFrom = new Map<string, string>();
    const distanceFromStart = new Map<string, number>([[from.id, 0]]);
    const estimatedTotal = new Map<string, number>([[
        from.id,
        distanceBetween(from.data, destination.data),
    ]]);

    while (open.size > 0) {
        let currentId: string | undefined;
        let currentEstimate = Number.POSITIVE_INFINITY;
        for (const locationId of open) {
            const estimate = estimatedTotal.get(locationId) ?? Number.POSITIVE_INFINITY;
            if (estimate < currentEstimate) {
                currentId = locationId;
                currentEstimate = estimate;
            }
        }
        if (!currentId) break;
        if (currentId === destination.id) return reconstructRoute(cameFrom, destination.id);

        open.delete(currentId);
        const current = getLocation(currentId);
        if (!current) continue;

        for (const connection of current.getAvailableConnections(player)) {
            if (connection.status !== 'visible' || !visitedIds.has(connection.locationId)) continue;
            const next = getLocation(connection.locationId);
            if (!next || next.hasTag(GameTags.LOCATION_HIDDEN)) continue;

            const candidateDistance = (distanceFromStart.get(currentId) ?? Number.POSITIVE_INFINITY)
                + distanceBetween(current.data, next.data);
            if (candidateDistance >= (distanceFromStart.get(next.id) ?? Number.POSITIVE_INFINITY)) continue;

            cameFrom.set(next.id, currentId);
            distanceFromStart.set(next.id, candidateDistance);
            estimatedTotal.set(
                next.id,
                candidateDistance + distanceBetween(next.data, destination.data),
            );
            open.add(next.id);
        }
    }

    return undefined;
}

/** 관리자·운영 도구에서 모든 장소를 방문 처리한다. hidden 장소도 기록되지만 일반 지도에는 노출되지 않는다. */
export function markAllLocationsVisited(player: Player): number {
    let changed = 0;
    for (const location of getAllLocations()) {
        if (markLocationVisited(player, location.id)) changed++;
    }
    return changed;
}

function getZoneLabel(zoneType: WorldMapLocationData['zoneType']): string {
    return RegionRiskPolicy.require(zoneType).label;
}

function createLocationSnapshot(player: Player, locationId: string, visited: boolean): WorldMapLocationData | undefined {
    const location = getLocation(locationId);
    if (!location || location.hasTag(GameTags.LOCATION_HIDDEN)) return undefined;
    return {
        id: location.id,
        name: location.data.name,
        zoneType: location.data.zoneType,
        zoneLabel: getZoneLabel(location.data.zoneType),
        x: location.data.x,
        y: location.data.y,
        z: location.data.z,
        visited,
        current: location.id === player.locationId,
        ...(location.data.mapIcon ? { mapIcon: location.data.mapIcon } : {}),
        ...(visited && location.data.mapColor ? { mapColor: location.data.mapColor } : {}),
    };
}

/** 방문 장소와 그 장소에서 공개된 한 단계 인접 미방문 장소만 반환한다. */
export function getWorldMapSnapshot(player: Player): WorldMapData {
    const visitedIds = new Set(getVisitedLocationIds(player));
    const locations = new Map<string, WorldMapLocationData>();
    const connections = new Map<string, WorldMapConnectionData>();

    for (const locationId of visitedIds) {
        const location = getLocation(locationId);
        const snapshot = createLocationSnapshot(player, locationId, true);
        if (!location || !snapshot) continue;
        locations.set(locationId, snapshot);

        for (const connection of location.getAvailableConnections(player)) {
            const target = createLocationSnapshot(player, connection.locationId, visitedIds.has(connection.locationId));
            if (!target) continue;
            locations.set(target.id, target);

            const [from, to] = [locationId, target.id].sort();
            connections.set(`${from}:${to}`, {
                from,
                to,
                discovered: visitedIds.has(from) && visitedIds.has(to),
            });
        }
    }

    return {
        locations: [...locations.values()],
        connections: [...connections.values()],
    };
}

/** 관리자 도구용으로 hidden을 포함한 전체 장소와 정적 연결을 반환한다. */
export function getFullWorldMapSnapshot(player: Player): WorldMapData {
    const locationData = getAllLocationData();
    const ids = new Set(locationData.map(location => location.id));
    const connections = new Map<string, WorldMapConnectionData>();
    for (const location of locationData) {
        for (const connection of location.connections) {
            if (!ids.has(connection.locationId)) continue;
            const [from, to] = [location.id, connection.locationId].sort();
            connections.set(`${from}:${to}`, { from, to, discovered: true });
        }
    }
    return {
        locations: locationData.map(location => ({
            id: location.id,
            name: location.name,
            zoneType: location.zoneType,
            zoneLabel: getZoneLabel(location.zoneType),
            x: location.x,
            y: location.y,
            z: location.z,
            visited: true,
            current: location.id === player.locationId,
            ...(location.mapIcon ? { mapIcon: location.mapIcon } : {}),
            ...(location.mapColor ? { mapColor: location.mapColor } : {}),
        })),
        connections: [...connections.values()],
    };
}
