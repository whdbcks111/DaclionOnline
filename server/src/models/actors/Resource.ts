import Entity from '../core/Entity.js';
import type { DamageCause, DamageResult, DamageType } from '../core/Entity.js';
import { AttributeType } from '../core/Attribute.js';
import type { AttributeRecord } from '../core/Attribute.js';
import Equipment from '../economy/Equipment.js';
import type Player from './Player.js';
import { getItemData } from '../economy/Item.js';
import { chat } from '../../utils/chatBuilder.js';
import { sendBotMessageToUser, sendNotificationToUser } from '../../modules/communication/message.js';
import { GameTags, normalizeTags } from '../../../../shared/tags.js';
import type { TagId } from '../../../../shared/tags.js';
import { emitGameEvent, GameEventIds } from '../core/GameEvent.js';

export interface WeightedResourceDrop {
    itemDataId: string;
    weight: number;
    minCount: number;
    maxCount: number;
}

export interface ResourceData {
    id: string;
    name: string;
    level: number;
    baseAttribute: Partial<AttributeRecord>;
    /** 공격 피해에 적용할 자원 경도. 0이면 일반 엔티티와 같은 피해를 받는다. */
    hardness: number;
    drops: WeightedResourceDrop[];
    expReward: { min: number; max: number };
    interaction?: string;
    attackable?: boolean;
    interactionCooldown?: number | { min: number; max: number };
    tags: TagId[];
}

export type ResourceDefinition = Omit<ResourceData, 'hardness'> & {
    /** 광맥에만 지정하며 생략하면 0이다. */
    hardness?: number;
};

export interface MiningImpactSnapshot {
    miningPower: number;
    hardness: number;
    multiplier: number;
}

export type ResourceInteraction = (resource: Resource, player: Player) => boolean | void;

const resourceDataRegistry = new Map<string, ResourceData>();
const interactionRegistry = new Map<string, ResourceInteraction>();

/** 초반 광맥의 빠른 리젠은 유지하되 후반 광맥도 이 시간을 넘기지 않는다. */
export const MAX_ORE_RESPAWN_SECONDS = 3 * 60;

export function resolveResourceRespawnTime(resourceDataId: string, configuredTime: number): number {
    const normalized = Math.max(0, configuredTime);
    return getResourceData(resourceDataId)?.tags.includes(GameTags.RESOURCE_ORE)
        ? Math.min(normalized, MAX_ORE_RESPAWN_SECONDS)
        : normalized;
}

/** 일반 공격도 광맥을 손상시킬 수 있지만 마법과 채굴력은 경도 손실을 더 잘 극복한다. */
export function calculateMiningDamageMultiplier(
    hardness: number,
    miningPower: number,
    damageType: DamageType,
): number {
    const normalizedHardness = Math.max(0, Number.isFinite(hardness) ? hardness : 0);
    if (normalizedHardness === 0) return 1;
    const normalizedPower = Math.max(0, Number.isFinite(miningPower) ? miningPower : 0);
    const baseEfficiency = damageType === 'magic' ? 0.65 : damageType === 'absolute' ? 0.8 : 0.2;
    return Math.min(1.5, baseEfficiency + normalizedPower / normalizedHardness);
}

export default class Resource extends Entity {
    readonly resourceDataId: string;
    override readonly name: string;
    private readonly hardness: number;
    private readonly drops: readonly Readonly<WeightedResourceDrop>[];
    private readonly expReward: Readonly<{ min: number; max: number }>;
    private readonly interaction?: string;
    private readonly respawnTime: number;
    private readonly attackable: boolean;
    private readonly interactionCooldown?: number | Readonly<{ min: number; max: number }>;
    private _interactionCooldownRemaining = 0;

    override get deathDuration(): number { return this.respawnTime; }
    override get defeatLabel(): string { return '파괴됨'; }
    override get isInteractable(): boolean {
        return !this.isDefeated && this.interaction !== undefined && interactionRegistry.has(this.interaction);
    }
    get interactionCooldownRemaining(): number { return this._interactionCooldownRemaining; }

    /** 관리자 월드 도구에서 상호작용 대기시간을 즉시 초기화한다. */
    resetInteractionCooldown(): boolean {
        if (this._interactionCooldownRemaining <= 0) return false;
        this._interactionCooldownRemaining = 0;
        return true;
    }

    constructor(resourceDataId: string, locationId = '', respawnTime = 30) {
        const data = getResourceData(resourceDataId);
        if (!data) throw new Error(`ResourceData not found: ${resourceDataId}`);
        super(
            data.level,
            0,
            locationId,
            data.baseAttribute,
            Equipment.createEmpty(),
            undefined,
            [GameTags.ENTITY_RESOURCE, ...data.tags],
        );
        this.resourceDataId = resourceDataId;
        this.name = data.name;
        this.hardness = data.hardness;
        this.drops = data.drops;
        this.expReward = data.expReward;
        this.interaction = data.interaction;
        this.respawnTime = resolveResourceRespawnTime(resourceDataId, respawnTime);
        this.attackable = data.attackable ?? true;
        this.interactionCooldown = typeof data.interactionCooldown === 'object'
            ? { ...data.interactionCooldown }
            : data.interactionCooldown;
    }

    override getAttackDeniedReason(attacker: Entity): string | undefined {
        const commonReason = super.getAttackDeniedReason(attacker);
        if (commonReason) return commonReason;
        if (!this.attackable) return '이 오브젝트는 공격할 수 없습니다.';
        return undefined;
    }

    get miningHardness(): number { return this.hardness; }

    /** 장비·스킬이 제공한 채굴력과 자원 경도로 이번 공격의 피해 효율을 계산한다. */
    evaluateMiningImpact(
        attacker: Entity | null,
        damageType: DamageType,
        miningPowerOverride?: number,
    ): MiningImpactSnapshot {
        const miningPower = Number.isFinite(miningPowerOverride)
            ? Math.max(0, miningPowerOverride ?? 0)
            : Math.max(0, attacker?.attribute.get(AttributeType.MINING_POWER) ?? 0);
        return {
            miningPower,
            hardness: this.hardness,
            multiplier: calculateMiningDamageMultiplier(this.hardness, miningPower, damageType),
        };
    }

    override damage(
        rawAmount: number,
        type: DamageType = 'physical',
        cause: DamageCause | null = null,
    ): DamageResult {
        if (cause?.type !== 'attack' || cause.fixedDamage === true || this.hardness <= 0) {
            return super.damage(rawAmount, type, cause);
        }
        const impact = this.evaluateMiningImpact(cause.causeEntity, type, cause.miningPower);
        const result = super.damage(rawAmount * impact.multiplier, type, cause);
        return {
            ...result,
            rawAmount,
            miningModifier: impact.multiplier,
            miningPower: impact.miningPower,
            resourceHardness: impact.hardness,
        };
    }

    override interact(player: Player): boolean {
        if (!this.isInteractable || !this.interaction) return false;
        if (this._interactionCooldownRemaining > 0) {
            const minutes = Math.ceil(this._interactionCooldownRemaining / 60);
            sendNotificationToUser(player.userId, {
                key: `resource-cooldown:${this.locationId}:${this.resourceDataId}`,
                message: `아직 다시 상호작용할 수 없습니다. (약 ${minutes}분 후 가능)`,
            });
            return true;
        }
        const handled = interactionRegistry.get(this.interaction)?.(this, player);
        if (handled !== false) {
            this._interactionCooldownRemaining = this.rollInteractionCooldown();
            emitGameEvent(GameEventIds.RESOURCE_INTERACTED, {
                actor: player,
                subject: this,
                data: {
                    resourceDataId: this.resourceDataId,
                    locationId: this.locationId,
                },
            });
        }
        return true;
    }

    override update(dt: number): void {
        super.update(dt);
        this._interactionCooldownRemaining = Math.max(0, this._interactionCooldownRemaining - dt);
    }

    rollInteractionCooldown(random = Math.random): number {
        const cooldown = this.interactionCooldown;
        if (cooldown === undefined) return 0;
        if (typeof cooldown === 'number') return cooldown;
        return cooldown.min + random() * (cooldown.max - cooldown.min);
    }

    override onDeath(): void {
        super.onDeath();
        emitGameEvent(GameEventIds.RESOURCE_DESTROYED, {
            actor: this.lastDamageCause?.causeEntity ?? undefined,
            subject: this,
            data: { resourceDataId: this.resourceDataId },
        });
        const attackOwner = this.lastDamageCause?.causeEntity?.attackOwner;
        if (!attackOwner?.isPlayer) return;
        const player = attackOwner as Player;
        attackOwner.currentTarget = null;
        player.titles?.refreshPassiveEffects();

        const drop = this.rollDrop();
        const dropDestination = drop ? player.receiveLoot(drop.itemDataId, drop.count) : null;
        const exp = this.rollExp();
        const levelsGained = player.gainExp(exp);

        const message = chat()
            .color('gold', b => b.text(`${this.name} 파괴 완료!\n`))
            .weight('bold', b => b.text('[ 보상 ]'))
            .text(`\nEXP +${exp}`);
        if (drop) {
            message.text(`\n${getItemData(drop.itemDataId)?.name ?? drop.itemDataId} x${drop.count}`);
            if (dropDestination === 'ground') {
                message.color('red', b => b.text('\n인벤토리 공간이 부족해 전리품이 바닥에 떨어졌습니다.'));
            }
        }
        if (levelsGained.length > 0) {
            message.text('\n').color('aqua', b => b.text(
                `레벨 업! Lv.${levelsGained[levelsGained.length - 1]}`,
            ));
        }
        sendBotMessageToUser(player.userId, message.build());
    }

    rollDrop(random = Math.random): { itemDataId: string; count: number } | null {
        const totalWeight = this.drops.reduce((sum, drop) => sum + drop.weight, 0);
        if (totalWeight <= 0) return null;
        let cursor = random() * totalWeight;
        const selected = this.drops.find(drop => (cursor -= drop.weight) < 0) ?? this.drops.at(-1);
        if (!selected) return null;
        const count = Math.floor(random() * (selected.maxCount - selected.minCount + 1)) + selected.minCount;
        return { itemDataId: selected.itemDataId, count };
    }

    rollExp(random = Math.random): number {
        return Math.floor(random() * (this.expReward.max - this.expReward.min + 1)) + this.expReward.min;
    }
}

export function defineResource(data: ResourceDefinition): void {
    if (!data.id.trim()) throw new Error('ResourceData id must not be empty');
    if (!Number.isInteger(data.level) || data.level < 1) {
        throw new Error(`Invalid resource level: ${data.id}`);
    }
    if (!Number.isInteger(data.expReward.min) || !Number.isInteger(data.expReward.max)
        || data.expReward.min < 0 || data.expReward.max < data.expReward.min) {
        throw new Error(`Invalid resource exp range: ${data.id}`);
    }
    const hardness = data.hardness ?? 0;
    if (!Number.isFinite(hardness) || hardness < 0) {
        throw new Error(`Invalid resource hardness: ${data.id}`);
    }
    const cooldown = data.interactionCooldown;
    if (cooldown !== undefined) {
        const valid = typeof cooldown === 'number'
            ? Number.isFinite(cooldown) && cooldown >= 0
            : Number.isFinite(cooldown.min) && Number.isFinite(cooldown.max)
                && cooldown.min >= 0 && cooldown.max >= cooldown.min;
        if (!valid) throw new Error(`Invalid resource interaction cooldown: ${data.id}`);
    }
    for (const drop of data.drops) {
        if (!Number.isFinite(drop.weight) || drop.weight <= 0
            || !Number.isInteger(drop.minCount) || !Number.isInteger(drop.maxCount)
            || drop.minCount < 1 || drop.maxCount < drop.minCount) {
            throw new Error(`Invalid resource drop: ${data.id}/${drop.itemDataId}`);
        }
    }
    resourceDataRegistry.set(data.id, {
        ...data,
        baseAttribute: { ...data.baseAttribute },
        hardness,
        tags: normalizeTags(data.tags),
        drops: data.drops.map(drop => ({ ...drop })),
        expReward: { ...data.expReward },
        interactionCooldown: typeof cooldown === 'object' ? { ...cooldown } : cooldown,
    });
}

export function getResourceData(id: string): ResourceData | undefined {
    const data = resourceDataRegistry.get(id);
    return data ? cloneResourceData(data) : undefined;
}

export function getAllResourceData(): ResourceData[] {
    return [...resourceDataRegistry.values()].map(cloneResourceData);
}

export function registerResourceInteraction(id: string, handler: ResourceInteraction): void {
    if (!id.trim()) throw new Error('Resource interaction id must not be empty');
    interactionRegistry.set(id, handler);
}

function cloneResourceData(data: ResourceData): ResourceData {
    return {
        ...data,
        baseAttribute: { ...data.baseAttribute },
        drops: data.drops.map(drop => ({ ...drop })),
        expReward: { ...data.expReward },
        interactionCooldown: typeof data.interactionCooldown === 'object'
            ? { ...data.interactionCooldown }
            : data.interactionCooldown,
        tags: [...data.tags],
    };
}
