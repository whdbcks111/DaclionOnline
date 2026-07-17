import type { WorldMapConnectionData, WorldMapData, WorldMapLocationData } from '../../../shared/types.js';
import { GameTags } from '../../../shared/tags.js';
import type Player from './Player.js';
import { ProgressType, defineProgress } from './Progress.js';
import { getAllLocationData, getAllLocations, getLocation } from './Location.js';

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

function getZoneLabel(zoneType: WorldMapLocationData['zoneType']): string {
    return zoneType === 'safe' ? '안전 구역' : '일반 구역';
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
