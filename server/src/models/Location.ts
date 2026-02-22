import Monster from "./Monster.js";
import type Player from "./Player.js";

/** 몬스터 스폰 정보 */
export interface SpawnInfo {
    monsterDataId: string;
    maxCount: number;
    respawnTime: number;  // 초
}

/** 이동 가능 장소 연결 정보 */
export interface ConnectionInfo {
    locationId: string;
    condition?: string;  // 조건 ID (없으면 무조건 이동 가능)
}

export type ZoneType = 'safe' | 'normal';

/** 장소 정의 (마스터 데이터) */
export interface LocationData {
    id: string;
    name: string;
    zoneType: ZoneType,
    x: number;
    y: number;
    z: number;
    isRespawnLocation?: boolean,
    spawns: SpawnInfo[];
    connections: ConnectionInfo[];
}

/** 바닥 아이템 */
export interface DroppedItem {
    itemDataId: string;
    count: number;
    droppedAt: number;  // timestamp
}

/** 이동 조건 결과 */
export type ConnectionStatus = 'visible' | 'locked' | 'hidden';

/** 이동 가능 장소 조회 결과 */
export interface AvailableConnection {
    locationId: string;
    name: string;
    status: ConnectionStatus;
}

// -- 스폰 타이머 --
interface SpawnTimer {
    monsterDataId: string;
    maxCount: number;
    respawnTime: number;
    timer: number;  // 남은 리스폰 시간
}

// -- 조건 핸들러 레지스트리 --
type ConditionHandler = (player: Player) => ConnectionStatus;
const conditionHandlers = new Map<string, ConditionHandler>();

/** 이동 조건 핸들러 등록 */
export function registerConnectionCondition(conditionId: string, handler: ConditionHandler): void {
    conditionHandlers.set(conditionId, handler);
}

// -- 패시브 콜백 레지스트리 --
type PassiveCallback = (location: Location, dt: number) => void;
const passiveCallbacks = new Map<string, PassiveCallback>();

/** 장소 패시브 함수 등록 */
export function registerLocationPassive(locationId: string, callback: PassiveCallback): void {
    passiveCallbacks.set(locationId, callback);
}

export default class Location {
    readonly id: string;
    readonly data: LocationData;

    private _monsters: Monster[] = [];
    private _droppedItems: DroppedItem[] = [];
    private _spawnTimers: SpawnTimer[];

    constructor(data: LocationData) {
        this.id = data.id;
        this.data = data;

        // 스폰 타이머 초기화
        this._spawnTimers = data.spawns.map(s => ({
            monsterDataId: s.monsterDataId,
            maxCount: s.maxCount,
            respawnTime: s.respawnTime,
            timer: 0,
        }));
    }

    // -- 몬스터 관리 --

    get monsters(): ReadonlyArray<Monster> { return this._monsters; }

    addMonster(monster: Monster): void {
        monster.locationId = this.id;
        this._monsters.push(monster);
    }

    removeMonster(monster: Monster): void {
        const idx = this._monsters.indexOf(monster);
        if (idx !== -1) this._monsters.splice(idx, 1);
    }

    // -- 바닥 아이템 관리 --

    get droppedItems(): ReadonlyArray<DroppedItem> { return this._droppedItems; }

    addDroppedItem(itemDataId: string, count: number): void {
        this._droppedItems.push({ itemDataId, count, droppedAt: Date.now() });
    }

    pickupItem(index: number): DroppedItem | null {
        if (index < 0 || index >= this._droppedItems.length) return null;
        return this._droppedItems.splice(index, 1)[0];
    }

    // -- 이동 가능 장소 조회 --

    getAvailableConnections(player: Player): AvailableConnection[] {
        const result: AvailableConnection[] = [];

        for (const conn of this.data.connections) {
            const target = getLocation(conn.locationId);
            if (!target) continue;

            let status: ConnectionStatus = 'visible';
            if (conn.condition) {
                const handler = conditionHandlers.get(conn.condition);
                if (handler) {
                    status = handler(player);
                }
            }

            if (status === 'hidden') continue;

            result.push({
                locationId: conn.locationId,
                name: target.data.name,
                status,
            });
        }

        return result;
    }

    // -- 게임 루프 --

    update(dt: number): void {
        // 스폰 타이머
        for (const timer of this._spawnTimers) {
            const currentCount = this._monsters.filter(
                m => m.monsterDataId === timer.monsterDataId
            ).length;

            if (currentCount >= timer.maxCount) {
                timer.timer = timer.respawnTime;
                continue;
            }

            timer.timer -= dt;
            if (timer.timer <= 0) {
                timer.timer = timer.respawnTime;
                const monster = new Monster(timer.monsterDataId, this.id);
                this._monsters.push(monster);
            }
        }

        // 패시브 콜백
        const passive = passiveCallbacks.get(this.id);
        if (passive) passive(this, dt);
    }
}

// -- LocationData 캐시 + Location 런타임 인스턴스 --

const locationDataCache = new Map<string, LocationData>();
const locationInstances = new Map<string, Location>();

/** 장소 정의 등록 (data/locations.ts에서 호출) */
export function defineLocation(data: LocationData): void {
    locationDataCache.set(data.id, data);
    locationInstances.set(data.id, new Location(data));
}

/** 런타임 Location 인스턴스 조회 */
export function getLocation(id: string): Location | undefined {
    return locationInstances.get(id);
}

/** 모든 Location 인스턴스 반환 */
export function getAllLocations(): Location[] {
    return Array.from(locationInstances.values());
}

/** 두 장소 간 거리 계산 */
export function distanceBetween(a: LocationData, b: LocationData): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
