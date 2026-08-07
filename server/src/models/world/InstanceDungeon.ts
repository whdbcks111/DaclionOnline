import type { LocationData, LocationObjectSpawnInfo } from '../../../../shared/types.js';
import { GameTags, normalizeTags } from '../../../../shared/tags.js';

export const INSTANCE_ROOM_CLEAR_CONDITION = 'instance_dungeon:room_clear';

export interface InstanceDungeonRoomDefinition {
    readonly key: string;
    readonly name: string;
    readonly objects: readonly LocationObjectSpawnInfo[];
}

export interface InstanceDungeonDefinition {
    readonly id: string;
    readonly name: string;
    readonly recommendedLevel: number;
    readonly gateOpenSeconds?: number;
    readonly durationSeconds: number;
    readonly maxPlayers?: number;
    readonly rooms: readonly InstanceDungeonRoomDefinition[];
    readonly tags?: readonly string[];
}

export interface NormalizedInstanceDungeonDefinition extends InstanceDungeonDefinition {
    readonly gateOpenSeconds: number;
    readonly maxPlayers: number;
    readonly rooms: readonly InstanceDungeonRoomDefinition[];
    readonly tags: readonly string[];
}

const definitions = new Map<string, NormalizedInstanceDungeonDefinition>();

export function defineInstanceDungeon(
    definition: InstanceDungeonDefinition,
): NormalizedInstanceDungeonDefinition {
    const id = definition.id.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) throw new Error(`Invalid instance dungeon ID: ${definition.id}`);
    if (definitions.has(id)) throw new Error(`Duplicate instance dungeon ID: ${id}`);
    if (!Number.isInteger(definition.recommendedLevel) || definition.recommendedLevel < 1) {
        throw new Error(`Invalid instance dungeon level: ${id}`);
    }
    const gateOpenSeconds = definition.gateOpenSeconds ?? 10;
    const maxPlayers = definition.maxPlayers ?? 5;
    if (!Number.isFinite(gateOpenSeconds) || gateOpenSeconds <= 0
        || !Number.isFinite(definition.durationSeconds) || definition.durationSeconds <= 5
        || !Number.isInteger(maxPlayers) || maxPlayers < 1) {
        throw new Error(`Invalid instance dungeon timing or capacity: ${id}`);
    }
    if (definition.rooms.length < 2) throw new Error(`Instance dungeon needs at least two rooms: ${id}`);

    const roomKeys = new Set<string>();
    const rooms = definition.rooms.map(room => {
        const key = room.key.trim().toLowerCase();
        if (!/^[a-z0-9][a-z0-9_-]*$/.test(key) || roomKeys.has(key) || !room.name.trim()) {
            throw new Error(`Invalid instance dungeon room: ${id}/${room.key}`);
        }
        roomKeys.add(key);
        return Object.freeze({
            key,
            name: room.name.trim(),
            objects: Object.freeze(room.objects.map(object => Object.freeze({ ...object, respawnTime: 0 }))),
        });
    });
    const normalized = Object.freeze({
        ...definition,
        id,
        name: definition.name.trim(),
        gateOpenSeconds,
        durationSeconds: definition.durationSeconds,
        maxPlayers,
        rooms: Object.freeze(rooms),
        tags: Object.freeze(normalizeTags(definition.tags ?? [])),
    });
    definitions.set(id, normalized);
    return normalized;
}

export function getInstanceDungeonDefinition(id: string): NormalizedInstanceDungeonDefinition | undefined {
    return definitions.get(id.trim().toLowerCase());
}

/** 등록된 인스턴스 원본을 registry 내부 Map 노출 없이 조회한다. */
export function getAllInstanceDungeonDefinitions(): readonly NormalizedInstanceDungeonDefinition[] {
    return [...definitions.values()];
}

/** 한 원정이 소유할 선형 동적 Location 원본을 만든다. */
export function buildInstanceDungeonLocations(
    definition: NormalizedInstanceDungeonDefinition,
    runId: string,
): readonly LocationData[] {
    return definition.rooms.map((room, index) => ({
        id: `instance_${definition.id}_${runId}_${room.key}`,
        name: `${definition.name} · ${room.name}`,
        zoneType: 'safe',
        x: index * 10,
        y: 0,
        z: -1000,
        npcIds: [],
        objects: room.objects.map(object => ({ ...object })),
        connections: [
            ...(index > 0 ? [{ locationId: `instance_${definition.id}_${runId}_${definition.rooms[index - 1].key}` }] : []),
            ...(index < definition.rooms.length - 1 ? [{
                locationId: `instance_${definition.id}_${runId}_${definition.rooms[index + 1].key}`,
                condition: INSTANCE_ROOM_CLEAR_CONDITION,
            }] : []),
        ],
        tags: normalizeTags([
            GameTags.LOCATION_DUNGEON,
            GameTags.LOCATION_INSTANCE_DUNGEON,
            GameTags.LOCATION_HIDDEN,
            ...(index === definition.rooms.length - 1 ? [GameTags.LOCATION_BOSS_ROOM] : []),
            ...definition.tags,
        ]),
    }));
}
