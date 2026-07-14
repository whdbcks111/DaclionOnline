import type Entity from '../models/Entity.js';
import type Inventory from '../models/Inventory.js';
import { ItemMetadataKeys } from '../models/Item.js';
import type { Item } from '../models/Item.js';
import {
    parseProjectileReference,
    removeProjectile,
    spawnProjectileFromData,
} from '../models/Projectile.js';

export interface ItemAttackOverrideContext {
    attacker: Entity;
    target: Entity;
    weapon: Item;
    inventory?: Inventory;
}

export type ItemAttackOverride = (context: ItemAttackOverrideContext) => boolean;

export const ItemAttackOverrideKeys = Object.freeze({
    PROJECTILE: 'projectile',
} as const);

const attackOverrides = new Map<string, ItemAttackOverride>();

/** metadata key와 기본 공격 함수를 연결한다. */
export function registerItemAttackOverride(key: string, handler: ItemAttackOverride): void {
    if (!key.trim()) throw new Error('아이템 공격 오버라이드 key는 비어 있을 수 없습니다.');
    attackOverrides.set(key, handler);
}

/** 등록된 오버라이드를 실행한다. false이면 호출자가 근접 기본 공격으로 폴백한다. */
export function executeItemAttackOverride(key: string, context: ItemAttackOverrideContext): boolean {
    return attackOverrides.get(key)?.(context) ?? false;
}

export function hasItemAttackOverride(key: string): boolean {
    return attackOverrides.has(key);
}

interface ProjectileAttackMetadata {
    ammunitionItemId?: string;
    projectile?: unknown;
}

function parseProjectileAttackMetadata(value: unknown): ProjectileAttackMetadata | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    const record = value as Record<string, unknown>;
    const ammunitionItemId = typeof record.ammunitionItemId === 'string' && record.ammunitionItemId.trim()
        ? record.ammunitionItemId
        : undefined;
    if (!ammunitionItemId && record.projectile === undefined) return undefined;
    return { ammunitionItemId, projectile: record.projectile };
}

/** 탄약 아이템 또는 무기 자체의 metadata를 읽어 투사체 기본 공격을 수행한다. */
export function executeProjectileItemAttack(context: ItemAttackOverrideContext): boolean {
    const config = parseProjectileAttackMetadata(
        context.weapon.getMetadata(ItemMetadataKeys.PROJECTILE_ATTACK),
    );
    if (!config) return false;

    const ammunition = config.ammunitionItemId
        ? context.inventory?.getFirstItemByData(config.ammunitionItemId)
        : undefined;
    if (config.ammunitionItemId && !ammunition) return false;

    const reference = parseProjectileReference(
        ammunition
            ? ammunition.getMetadata(ItemMetadataKeys.PROJECTILE)
            : config.projectile,
    );
    if (!reference) return false;
    if (!context.attacker.canAttack(context.target)) return true;

    const projectile = spawnProjectileFromData({
        owner: context.attacker,
        target: context.target,
        dataId: reference.dataId,
        overrides: reference.overrides,
    });
    if (!projectile) return false;

    if (ammunition && !context.inventory?.removeItemInstance(ammunition, 1)) {
        removeProjectile(projectile);
        return false;
    }

    context.attacker.commitAttack(true);
    return true;
}
