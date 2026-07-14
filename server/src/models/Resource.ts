import Entity from './Entity.js';
import type { AttributeRecord } from './Attribute.js';
import Equipment from './Equipment.js';
import type Player from './Player.js';
import { getItemData } from './Item.js';
import { chat } from '../utils/chatBuilder.js';
import { sendBotMessageToUser } from '../modules/message.js';
import { GameTags, normalizeTags } from '../../../shared/tags.js';
import type { TagId } from '../../../shared/tags.js';

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
    requiredToolTags: TagId[];
    drops: WeightedResourceDrop[];
    expReward: { min: number; max: number };
    interaction?: string;
    tags: TagId[];
}

export type ResourceInteraction = (resource: Resource, player: Player) => void;

const resourceDataRegistry = new Map<string, ResourceData>();
const interactionRegistry = new Map<string, ResourceInteraction>();

export default class Resource extends Entity {
    readonly resourceDataId: string;
    override readonly name: string;
    private readonly requiredToolTags: readonly TagId[];
    private readonly drops: readonly Readonly<WeightedResourceDrop>[];
    private readonly expReward: Readonly<{ min: number; max: number }>;
    private readonly interaction?: string;
    private readonly respawnTime: number;

    override get deathDuration(): number { return this.respawnTime; }
    override get defeatLabel(): string { return '파괴됨'; }
    override get isInteractable(): boolean {
        return !this.isDefeated && this.interaction !== undefined && interactionRegistry.has(this.interaction);
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
        this.requiredToolTags = data.requiredToolTags;
        this.drops = data.drops;
        this.expReward = data.expReward;
        this.interaction = data.interaction;
        this.respawnTime = respawnTime;
    }

    override getAttackDeniedReason(attacker: Entity): string | undefined {
        if (this.requiredToolTags.length === 0) return undefined;
        const usable = this.requiredToolTags.every(tag =>
            attacker.equipment.hasEquippedItemTag('mainHand', tag),
        );
        if (usable) return undefined;
        const requirements = this.requiredToolTags
            .map(tag => tag === GameTags.TOOL_MINING ? '채굴' : tag)
            .join(', ');
        return `이 오브젝트는 ${requirements} 속성을 가진 주무기 도구로만 공격할 수 있습니다.`;
    }

    override interact(player: Player): boolean {
        if (!this.isInteractable || !this.interaction) return false;
        interactionRegistry.get(this.interaction)?.(this, player);
        return true;
    }

    override onDeath(): void {
        super.onDeath();
        const attackOwner = this.lastDamageCause?.causeEntity?.attackOwner;
        if (!attackOwner?.isPlayer) return;
        const player = attackOwner as Player;
        attackOwner.currentTarget = null;

        const drop = this.rollDrop();
        if (drop) player.inventory.addItem(drop.itemDataId, drop.count);
        const exp = this.rollExp();
        const levelsGained = player.gainExp(exp);

        const message = chat()
            .color('gold', b => b.text(`${this.name} 파괴 완료!\n`))
            .weight('bold', b => b.text('[ 보상 ]'))
            .text(`\nEXP +${exp}`);
        if (drop) {
            message.text(`\n${getItemData(drop.itemDataId)?.name ?? drop.itemDataId} x${drop.count}`);
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

export function defineResource(data: ResourceData): void {
    if (!data.id.trim()) throw new Error('ResourceData id must not be empty');
    if (!Number.isInteger(data.level) || data.level < 1) {
        throw new Error(`Invalid resource level: ${data.id}`);
    }
    if (!Number.isInteger(data.expReward.min) || !Number.isInteger(data.expReward.max)
        || data.expReward.min < 0 || data.expReward.max < data.expReward.min) {
        throw new Error(`Invalid resource exp range: ${data.id}`);
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
        requiredToolTags: normalizeTags(data.requiredToolTags),
        tags: normalizeTags(data.tags),
        drops: data.drops.map(drop => ({ ...drop })),
        expReward: { ...data.expReward },
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
        requiredToolTags: [...data.requiredToolTags],
        drops: data.drops.map(drop => ({ ...drop })),
        expReward: { ...data.expReward },
        tags: [...data.tags],
    };
}
