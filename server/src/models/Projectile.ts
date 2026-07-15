import { AttributeType } from './Attribute.js';
import type { AttributeRecord } from './Attribute.js';
import Entity from './Entity.js';
import type { DamageResult, DamageType } from './Entity.js';
import Equipment from './Equipment.js';
import { GameTags } from '../../../shared/tags.js';
import { normalizeTags } from '../../../shared/tags.js';
import type { TagId } from '../../../shared/tags.js';

export interface ProjectileData {
    readonly id: string;
    readonly name: string;
    readonly damageType: DamageType;
    readonly travelTime: number;
    readonly damageMultiplier: number;
    readonly damageBonus: number;
    readonly tags: readonly TagId[];
    readonly baseAttribute: Readonly<Partial<AttributeRecord>>;
}

/** 아이템 metadata에도 저장할 수 있는 JSON 호환 투사체 오버라이드. */
export interface ProjectileDataOverrides {
    name?: string;
    damage?: number;
    damageType?: DamageType;
    travelTime?: number;
    damageMultiplier?: number;
    damageBonus?: number;
    tags?: TagId[];
    attributeOverrides?: Partial<AttributeRecord>;
}

export interface ProjectileReference {
    dataId: string;
    overrides?: ProjectileDataOverrides;
}

export interface ProjectileOptions {
    owner: Entity;
    target: Entity;
    name?: string;
    damage: number;
    damageType?: DamageType;
    travelTime?: number;
    tags?: readonly TagId[];
    baseAttribute?: Partial<AttributeRecord>;
    onHit?: (projectile: Projectile, result: DamageResult) => void;
}

export interface SpawnProjectileDataOptions {
    owner: Entity;
    target: Entity;
    dataId: string;
    overrides?: ProjectileDataOverrides;
    onHit?: ProjectileOptions['onHit'];
}

/** 좌표가 없는 현재 월드에서 비행 시간 뒤 지정 대상을 공격하는 런타임 엔티티. */
export default class Projectile extends Entity {
    readonly owner: Entity;
    readonly target: Entity;
    override readonly name: string;
    readonly damageAmount: number;
    readonly damageType: DamageType;

    private _remainingTravelTime: number;
    private _active = true;
    private readonly onHit?: ProjectileOptions['onHit'];

    constructor(options: ProjectileOptions) {
        if (!Number.isFinite(options.damage) || options.damage < 0) {
            throw new Error(`투사체 피해량은 0 이상의 유한한 값이어야 합니다: ${options.damage}`);
        }
        const travelTime = options.travelTime ?? 0;
        if (!Number.isFinite(travelTime) || travelTime < 0) {
            throw new Error(`투사체 비행 시간은 0 이상의 유한한 값이어야 합니다: ${travelTime}`);
        }

        super(
            1,
            0,
            options.owner.locationId,
            {
                maxLife: 1,
                atk: options.damage,
                magicForce: options.damage,
                critRate: 0,
                ...options.baseAttribute,
            },
            Equipment.createEmpty(),
            undefined,
            [GameTags.ENTITY_PROJECTILE, ...(options.tags ?? [])],
        );

        this.owner = options.owner;
        this.target = options.target;
        this.name = options.name ?? `${options.owner.name}의 투사체`;
        this.damageAmount = options.damage;
        this.damageType = options.damageType ?? 'physical';
        this._remainingTravelTime = travelTime;
        this.onHit = options.onHit;
    }

    /** 알림은 소유 플레이어에게 전달하되 투사체 자체는 Player로 취급하지 않는다. */
    override get playerUserId(): number | undefined {
        return this.attackOwner.playerUserId;
    }

    /** 중첩 소유 관계에서도 보상과 어그로는 최종 발사자에게 귀속한다. */
    override get attackOwner(): Entity {
        return this.owner.attackOwner;
    }

    get active(): boolean { return this._active; }
    get remainingTravelTime(): number { return this._remainingTravelTime; }

    /** 상성 공격원은 owner나 장비가 아니라 투사체 본체 태그만 사용한다. */
    override hasEffectSourceTag(tag: TagId): boolean {
        return this.tags.hasTag(tag);
    }

    override update(dt: number): void {
        if (!this._active) return;
        this._remainingTravelTime = Math.max(0, this._remainingTravelTime - Math.max(0, dt));
        if (this._remainingTravelTime > 0) return;

        if (this.target.isDefeated || this.target.locationId !== this.locationId) {
            this.despawn();
            return;
        }

        const result = this.attack(this.target, this.damageType, this.damageAmount);
        this.despawn();
        if (result) this.onHit?.(this, result);
    }

    despawn(): void {
        this._active = false;
    }
}

const activeProjectiles = new Set<Projectile>();
const projectileDataRegistry = new Map<string, ProjectileData>();

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDamageType(value: unknown): value is DamageType {
    return value === 'physical' || value === 'magic' || value === 'absolute';
}

function isFiniteNonNegative(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function parseAttributeOverrides(value: unknown): Partial<AttributeRecord> | undefined {
    if (value === undefined) return undefined;
    if (!isRecord(value)) return undefined;
    const result: Partial<AttributeRecord> = {};
    for (const [key, raw] of Object.entries(value)) {
        const type = AttributeType.fromKey(key);
        if (!type || typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
        result[type.key] = raw;
    }
    return result;
}

/** 신뢰할 수 없는 아이템 metadata를 검증된 투사체 참조로 변환한다. */
export function parseProjectileReference(value: unknown): ProjectileReference | undefined {
    if (!isRecord(value) || typeof value.dataId !== 'string' || !value.dataId.trim()) return undefined;
    if (value.overrides === undefined) return { dataId: value.dataId };
    if (!isRecord(value.overrides)) return undefined;

    const raw = value.overrides;
    const overrides: ProjectileDataOverrides = {};
    if (raw.name !== undefined) {
        if (typeof raw.name !== 'string' || !raw.name.trim()) return undefined;
        overrides.name = raw.name;
    }
    if (raw.damage !== undefined) {
        if (!isFiniteNonNegative(raw.damage)) return undefined;
        overrides.damage = raw.damage;
    }
    if (raw.damageType !== undefined) {
        if (!isDamageType(raw.damageType)) return undefined;
        overrides.damageType = raw.damageType;
    }
    for (const key of ['travelTime', 'damageMultiplier'] as const) {
        if (raw[key] === undefined) continue;
        if (!isFiniteNonNegative(raw[key])) return undefined;
        overrides[key] = raw[key];
    }
    if (raw.damageBonus !== undefined) {
        if (!isFiniteNumber(raw.damageBonus)) return undefined;
        overrides.damageBonus = raw.damageBonus;
    }
    if (raw.tags !== undefined) {
        if (!Array.isArray(raw.tags) || !raw.tags.every(tag => typeof tag === 'string')) return undefined;
        try {
            overrides.tags = normalizeTags(raw.tags as string[]);
        } catch {
            return undefined;
        }
    }
    if (raw.attributeOverrides !== undefined) {
        const attributes = parseAttributeOverrides(raw.attributeOverrides);
        if (!attributes) return undefined;
        overrides.attributeOverrides = attributes;
    }
    return { dataId: value.dataId, overrides };
}

/** 코드에서 투사체 마스터 데이터를 등록한다. */
export function defineProjectileData(data: ProjectileData): void {
    if (!data.id.trim()) throw new Error('투사체 데이터 ID는 비어 있을 수 없습니다.');
    if (!data.name.trim()) throw new Error(`투사체 이름은 비어 있을 수 없습니다: ${data.id}`);
    if (!isDamageType(data.damageType)) throw new Error(`잘못된 투사체 피해 타입: ${data.damageType}`);
    for (const [key, value] of Object.entries({
        travelTime: data.travelTime,
        damageMultiplier: data.damageMultiplier,
    })) {
        if (!isFiniteNonNegative(value)) throw new Error(`잘못된 투사체 ${key}: ${value}`);
    }
    if (!isFiniteNumber(data.damageBonus)) throw new Error(`잘못된 투사체 damageBonus: ${data.damageBonus}`);
    const attributes = parseAttributeOverrides(data.baseAttribute);
    if (!attributes) throw new Error(`잘못된 투사체 능력치: ${data.id}`);
    projectileDataRegistry.set(data.id, Object.freeze({
        ...data,
        tags: Object.freeze(normalizeTags(data.tags)),
        baseAttribute: Object.freeze(attributes),
    }));
}

export function getProjectileData(id: string): ProjectileData | undefined {
    return projectileDataRegistry.get(id);
}

export function getAllProjectileData(): ProjectileData[] {
    return [...projectileDataRegistry.values()];
}

/** 투사체를 생성하고 게임 루프 관리 대상으로 등록한다. */
export function spawnProjectile(options: ProjectileOptions): Projectile {
    const projectile = new Projectile(options);
    activeProjectiles.add(projectile);
    return projectile;
}

/** 마스터 데이터와 JSON 오버라이드를 합쳐 투사체를 생성한다. */
export function spawnProjectileFromData(options: SpawnProjectileDataOptions): Projectile | undefined {
    const data = getProjectileData(options.dataId);
    if (!data) return undefined;
    const overrides = options.overrides ?? {};
    const damageType = overrides.damageType ?? data.damageType;
    const powerAttribute = damageType === 'magic' ? AttributeType.MAGIC_FORCE : AttributeType.ATK;
    const damage = overrides.damage ?? Math.max(0,
        options.owner.attribute.get(powerAttribute) * (overrides.damageMultiplier ?? data.damageMultiplier)
        + (overrides.damageBonus ?? data.damageBonus)
    );

    return spawnProjectile({
        owner: options.owner,
        target: options.target,
        name: overrides.name ?? data.name,
        damage,
        damageType,
        travelTime: overrides.travelTime ?? data.travelTime,
        tags: overrides.tags ?? data.tags,
        baseAttribute: {
            ...data.baseAttribute,
            ...overrides.attributeOverrides,
        },
        onHit: options.onHit,
    });
}

/** 활성 투사체의 불변 용도 스냅샷을 반환한다. */
export function getActiveProjectiles(): readonly Projectile[] {
    return [...activeProjectiles].filter(projectile => projectile.active);
}

/** 투사체를 즉시 비활성화하고 레지스트리에서 제거한다. */
export function removeProjectile(projectile: Projectile): boolean {
    projectile.despawn();
    return activeProjectiles.delete(projectile);
}

/** 게임 프레임에서 비행 시간을 갱신하고 적중·소멸을 처리한다. */
export function updateProjectiles(dt: number): void {
    for (const projectile of [...activeProjectiles]) {
        projectile.earlyUpdate(dt);
        projectile.update(dt);
        projectile.lateUpdate(dt);
        if (!projectile.active) activeProjectiles.delete(projectile);
    }
}
