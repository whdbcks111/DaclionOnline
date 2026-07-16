import Monster from "./Monster.js";
import Resource from "./Resource.js";
import type Entity from "./Entity.js";
import type Player from "./Player.js";
import type { LocationData, LocationObjectSpawnInfo, ConnectionInfo, ZoneType } from "../../../shared/types.js";
import logger from "../utils/logger.js";
import { TagCollection, normalizeTags } from "../../../shared/tags.js";
import type { TagReadable } from "../../../shared/tags.js";
import type { ItemSnapshot } from "./Item.js";
import NPC, { normalizeNpcId } from "./NPC.js";

export type { LocationData, LocationObjectSpawnInfo, ConnectionInfo, ZoneType };

/** 바닥 아이템 */
export interface DroppedItem extends ItemSnapshot {
    droppedAt: number;  // timestamp
}

/** 이동 조건 결과 */
export type ConnectionStatus = 'visible' | 'locked' | 'hidden';

/** 외부에 공개해도 되는 잠금 사유는 조건 handler가 명시적으로 제공한다. */
export interface ConnectionConditionResult {
    status: ConnectionStatus;
    publicReason?: string;
}

/** 이동 가능 장소 조회 결과 */
export interface AvailableConnection {
    locationId: string;
    name: string;
    status: ConnectionStatus;
    lockReason?: string;
}

// -- 조건 핸들러 레지스트리 --
type ConditionHandler = (player: Player) => ConnectionStatus | ConnectionConditionResult;
const conditionHandlers = new Map<string, ConditionHandler>();

/** 이동 조건 핸들러 등록 */
export function registerConnectionCondition(conditionId: string, handler: ConditionHandler): void {
    conditionHandlers.set(conditionId, handler);
    logger.debug('장소 연결 조건 추가 : ', conditionId);
}

// -- 패시브 콜백 레지스트리 --
type PassiveCallback = (location: Location, dt: number) => void;
const passiveCallbacks = new Map<string, PassiveCallback>();

/** 장소 패시브 함수 등록 */
export function registerLocationPassive(locationId: string, callback: PassiveCallback): void {
    passiveCallbacks.set(locationId, callback);
}

export default class Location implements TagReadable {
    readonly id: string;
    readonly data: LocationData;
    readonly tags: TagCollection;

    private _objects: Entity[] = [];
    private _droppedItems: DroppedItem[] = [];

    constructor(data: LocationData) {
        this.id = data.id;
        this.data = data;
        this.tags = new TagCollection({ definition: data.tags });

        // 서버 로드 시 즉시 전부 스폰
        for (const spawn of data.objects) {
            for (let i = 0; i < spawn.maxCount; i++) {
                let object: Entity;
                if (spawn.type === 'monster') {
                    object = new Monster(spawn.dataId, this.id, spawn.respawnTime);
                } else if (spawn.type === 'resource') {
                    object = new Resource(spawn.dataId, this.id, spawn.respawnTime);
                } else {
                    throw new Error(`Unsupported location object type: ${String(spawn.type)}`);
                }
                this._objects.push(object);
            }
        }
    }

    // -- 월드 오브젝트 관리 --

    getObjects(): readonly Entity[] { return [...this._objects]; }

    getObjectCount(): number { return this._objects.length; }

    getObject(index: number): Entity | undefined {
        return this._objects[index];
    }

    /** 다중 공격이 raw 오브젝트 배열을 순회하지 않도록 공격 가능한 생존 대상만 반환한다. */
    getAttackableObjects(attacker: Entity): readonly Entity[] {
        return this._objects.filter(object => !object.isDefeated && !object.getAttackDeniedReason(attacker.attackOwner));
    }

    hasObject(object: Entity): boolean {
        return this._objects.includes(object);
    }

    addObject(object: Entity): void {
        object.locationId = this.id;
        this._objects.push(object);
    }

    removeObject(object: Entity): void {
        const idx = this._objects.indexOf(object);
        if (idx !== -1) this._objects.splice(idx, 1);
    }

    // -- NPC 조회 --

    getNpcs(): readonly NPC[] {
        return this.data.npcIds.map(id => NPC.getNpc(id)).filter((npc): npc is NPC => npc !== undefined);
    }

    getNpc(index: number): NPC | undefined {
        const id = this.data.npcIds[index];
        return id ? NPC.getNpc(id) : undefined;
    }

    hasNpc(npc: NPC): boolean {
        return this.data.npcIds.includes(npc.id);
    }

    // -- 바닥 아이템 관리 --

    /** 내부 배열을 노출하지 않는 바닥 아이템 스냅샷 */
    getDroppedItems(): DroppedItem[] {
        return this._droppedItems.map(item => ({
            ...item,
            metadataDelta: item.metadataDelta ? { ...item.metadataDelta } : null,
            tags: [...item.tags],
        }));
    }

    hasTag(tag: string): boolean { return this.tags.hasTag(tag); }

    addDroppedItem(item: ItemSnapshot): void {
        this._droppedItems.push({
            ...item,
            metadataDelta: item.metadataDelta ? { ...item.metadataDelta } : null,
            tags: [...item.tags],
            droppedAt: Date.now(),
        });
    }

    pickupItem(index: number): DroppedItem | null {
        if (index < 0 || index >= this._droppedItems.length) return null;
        return this._droppedItems.splice(index, 1)[0];
    }

    pickupAllItems(): DroppedItem[] {
        return this._droppedItems.splice(0);
    }

    // -- 이동 가능 장소 조회 --

    getAvailableConnections(player: Player): AvailableConnection[] {
        const result: AvailableConnection[] = [];

        for (const conn of this.data.connections) {
            const target = getLocation(conn.locationId);
            if (!target) continue;

            let status: ConnectionStatus = 'visible';
            let lockReason: string | undefined;
            if (conn.condition) {
                const handler = conditionHandlers.get(conn.condition);
                if (handler) {
                    const condition = handler(player);
                    status = typeof condition === 'string' ? condition : condition.status;
                    const publicReason = typeof condition === 'string'
                        ? undefined
                        : condition.publicReason?.trim();
                    lockReason = status === 'locked' && publicReason ? publicReason : undefined;
                }
            }

            if (status === 'hidden') continue;

            result.push({
                locationId: conn.locationId,
                name: target.data.name,
                status,
                ...(lockReason ? { lockReason } : {}),
            });
        }

        return result;
    }

    /** 구분 기호·공백 차이와 location ID를 허용하고, 부분 이름은 유일할 때만 찾는다. */
    findAvailableConnection(player: Player, input: string): AvailableConnection | undefined {
        const normalizedInput = normalizeLocationInput(input);
        if (!normalizedInput) return undefined;
        const connections = this.getAvailableConnections(player);
        const exact = connections.find(connection =>
            normalizeLocationInput(connection.name) === normalizedInput
            || normalizeLocationInput(connection.locationId) === normalizedInput,
        );
        if (exact) return exact;

        const partial = connections.filter(connection =>
            normalizeLocationInput(connection.name).includes(normalizedInput),
        );
        return partial.length === 1 ? partial[0] : undefined;
    }

    // -- 게임 루프 --

    update(dt: number): void {
        // 모든 월드 오브젝트 업데이트 (스냅샷으로 순회 — 도중 제거 방지)
        for (const object of [...this._objects]) {
            object.earlyUpdate(dt);
            object.update(dt);
            object.lateUpdate(dt);
        }

        // 패시브 콜백
        const passive = passiveCallbacks.get(this.id);
        if (passive) passive(this, dt);
    }
}

// -- LocationData 캐시 + Location 런타임 인스턴스 --

const locationDataCache = new Map<string, LocationData>();
const locationInstances = new Map<string, Location>();

/** 외부 LocationData를 검증하고 내부 보관용 복사본으로 정규화 */
export function normalizeLocationData(data: LocationData): LocationData {
    if (!Array.isArray(data.objects)) {
        throw new Error(`Location objects must be an array: ${data.id}`);
    }
    const npcIds = [...new Set((data.npcIds ?? []).map(normalizeNpcId))];
    for (const npcId of npcIds) {
        if (!NPC.getNpc(npcId)) throw new Error(`Location NPC definition not found: ${data.id}/${npcId}`);
    }
    const mapIcon = data.mapIcon?.trim();
    if (mapIcon && !/^[a-z0-9][a-z0-9_-]*$/.test(mapIcon)) {
        throw new Error(`Invalid location map icon key: ${data.id}/${mapIcon}`);
    }
    return {
        ...data,
        ...(mapIcon ? { mapIcon } : { mapIcon: undefined }),
        npcIds,
        objects: data.objects.map(object => {
            if (object.type !== 'monster' && object.type !== 'resource') {
                throw new Error(`Invalid location object type: ${object.type}`);
            }
            if (!object.dataId.trim() || !Number.isInteger(object.maxCount) || object.maxCount < 0
                || !Number.isFinite(object.respawnTime) || object.respawnTime < 0) {
                throw new Error(`Invalid location object spawn: ${data.id}/${object.dataId}`);
            }
            return { ...object };
        }),
        connections: data.connections.map(connection => ({ ...connection })),
        tags: normalizeTags(data.tags ?? []),
    };
}

function registerNormalizedLocation(data: LocationData): void {
    locationDataCache.set(data.id, data);
    locationInstances.set(data.id, new Location(data));
}

/** 장소 정의 등록 */
export function defineLocation(data: LocationData): void {
    registerNormalizedLocation(normalizeLocationData(data));
}

/** 모든 LocationData 반환 (JSON 직렬화용) */
export function getAllLocationData(): LocationData[] {
    return Array.from(locationDataCache.values(), data => ({
        ...data,
        npcIds: [...data.npcIds],
        objects: data.objects.map(object => ({ ...object })),
        connections: data.connections.map(connection => ({ ...connection })),
        tags: [...data.tags],
    }));
}

/** 전체 장소 레지스트리를 초기화하고 새 데이터로 재로드 */
export function reloadAllLocations(locations: LocationData[]): void {
    const normalizedLocations = locations.map(normalizeLocationData);
    locationDataCache.clear();
    locationInstances.clear();
    for (const data of normalizedLocations) {
        registerNormalizedLocation(data);
    }
}

/** 런타임 Location 인스턴스 조회 */
export function getLocation(id: string): Location | undefined {
    return locationInstances.get(id);
}

/** 모든 Location 인스턴스 반환 */
export function getAllLocations(): Location[] {
    return Array.from(locationInstances.values());
}

/** isRespawnLocation이 true인 첫 번째 장소 반환 */
export function getRespawnLocation(): Location | undefined {
    for (const loc of locationInstances.values()) {
        if (loc.data.isRespawnLocation) return loc;
    }
    return undefined;
}

/** 두 장소 간 거리 계산 */
export function distanceBetween(a: LocationData, b: LocationData): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function normalizeLocationInput(input: string): string {
    return input
        .normalize('NFKC')
        .toLocaleLowerCase('ko-KR')
        .replace(/[\s·ㆍ•‧・._-]+/gu, '');
}
