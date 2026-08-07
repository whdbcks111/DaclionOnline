import type Entity from '../../models/core/Entity.js';
import type Inventory from '../../models/economy/Inventory.js';
import { ItemMetadataKeys } from '../../models/economy/Item.js';
import type { Item } from '../../models/economy/Item.js';
import {
    parseProjectileReference,
    removeProjectile,
    spawnProjectileFromData,
} from '../../models/combat/Projectile.js';
import type { ProjectileReference } from '../../models/combat/Projectile.js';
import { GameTags, isPropertyTag } from '../../../../shared/tags.js';

export interface ItemAttackOverrideContext {
    attacker: Entity;
    target: Entity;
    weapon: Item;
    inventory?: Inventory;
}

export type ItemAttackOverride = (context: ItemAttackOverrideContext) => boolean;

export const ItemAttackOverrideKeys = Object.freeze({
    PROJECTILE: 'projectile',
    BURST_FIREARM: 'burst_firearm',
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

/**
 * 일반 물리 화살의 재료 속성은 아이템 제작·검색용 정보다.
 * 과거 저장된 단조 화살 metadata도 공격 전체의 속성 상성으로 승격하지 않는다.
 */
function normalizeAmmunitionProjectileReference(reference: ProjectileReference): ProjectileReference {
    if (reference.dataId !== 'basic_arrow' || !reference.overrides?.tags) return reference;
    return {
        ...reference,
        overrides: {
            ...reference.overrides,
            tags: reference.overrides.tags.filter(tag => !isPropertyTag(tag)),
        },
    };
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

    const parsedReference = parseProjectileReference(
        ammunition
            ? ammunition.getMetadata(ItemMetadataKeys.PROJECTILE)
            : config.projectile,
    );
    if (!parsedReference) return false;
    const reference = ammunition
        ? normalizeAmmunitionProjectileReference(parsedReference)
        : parsedReference;
    if (!context.attacker.canAttack(context.target)) return true;

    const projectile = spawnProjectileFromData({
        owner: context.attacker,
        target: context.target,
        dataId: reference.dataId,
        overrides: reference.overrides,
        damageScale: context.weapon.rollInstanceAttackDamageMultiplier(),
        onHit: (_projectile, result) => {
            if (!result.evaded && result.finalDamage > 0) {
                context.weapon.data?.onBasicAttackHit?.({
                    attacker: context.attacker,
                    target: context.target,
                    weapon: context.weapon,
                    result,
                });
                context.weapon.triggerInstanceAttackEffects({
                    attacker: context.attacker,
                    target: context.target,
                    result,
                });
            }
        },
    });
    if (!projectile) return false;

    if (ammunition && !context.inventory?.removeItemInstance(ammunition, 1)) {
        removeProjectile(projectile);
        return false;
    }

    context.attacker.commitAttack(true);
    return true;
}

/** 긴 기본 공격 주기 대신 회피 불가 탄환 세 발을 시간차로 발사하는 총포 공격. */
export function executeBurstFirearmAttack(context: ItemAttackOverrideContext): boolean {
    if (!context.attacker.canAttack(context.target)) return true;
    const travelTimes = [0.16, 0.3, 0.44] as const;
    const projectiles = travelTimes.map((travelTime, index) => spawnProjectileFromData({
        owner: context.attacker,
        target: context.target,
        dataId: 'basic_arrow',
        overrides: {
            name: `삼연철포 탄환 ${index + 1}`,
            damageType: 'physical',
            damageMultiplier: 0.72,
            damageBonus: 0,
            travelTime,
            unavoidable: true,
            tags: [GameTags.PROPERTY_METAL],
        },
        damageScale: context.weapon.rollInstanceAttackDamageMultiplier(),
        onHit: (_projectile, result) => {
            if (result.evaded || result.finalDamage <= 0) return;
            context.weapon.data?.onBasicAttackHit?.({
                attacker: context.attacker,
                target: context.target,
                weapon: context.weapon,
                result,
            });
            context.weapon.triggerInstanceAttackEffects({
                attacker: context.attacker,
                target: context.target,
                result,
            });
        },
    }));
    if (projectiles.some(projectile => !projectile)) {
        for (const projectile of projectiles) {
            if (projectile) removeProjectile(projectile);
        }
        return false;
    }
    context.attacker.commitAttack(true);
    return true;
}
