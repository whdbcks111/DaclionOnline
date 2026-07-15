import type Entity from './Entity.js';
import type Player from './Player.js';
import type { GameEvent } from './GameEvent.js';
import { GameEventIds } from './GameEvent.js';
import { getItemData } from './Item.js';
import type { Item, ItemSnapshot } from './Item.js';
import type { InventoryItemRequirement } from './Inventory.js';
import { normalizeTag, normalizeTags } from '../../../shared/tags.js';
import type { TagId } from '../../../shared/tags.js';
import type { MetadataRecord } from './Metadata.js';

const LOCAL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

export class QuestStatus {
    private static readonly all: QuestStatus[] = [];

    static readonly ACTIVE = new QuestStatus('active', '진행 중', 'yellow');
    static readonly READY = new QuestStatus('ready', '보고 가능', 'lime');
    static readonly COMPLETED = new QuestStatus('completed', '완료', 'gold');
    static readonly FAILED = new QuestStatus('failed', '실패', 'red');
    static readonly ABANDONED = new QuestStatus('abandoned', '포기', 'gray');

    private constructor(
        readonly key: string,
        readonly label: string,
        readonly color: string,
    ) {
        QuestStatus.all.push(this);
    }

    static values(): readonly QuestStatus[] { return QuestStatus.all; }
    static fromKey(key: string): QuestStatus | undefined {
        return QuestStatus.all.find(status => status.key === key);
    }
}

export class QuestMarker {
    private static readonly all: QuestMarker[] = [];

    static readonly READY = new QuestMarker('ready', '?', 'lime', '완료 보고 가능');
    static readonly AVAILABLE = new QuestMarker('available', '!', 'gold', '수락 가능');
    static readonly ACTIVE = new QuestMarker('active', '·', 'gray', '진행 중');

    private constructor(
        readonly key: string,
        readonly symbol: string,
        readonly color: string,
        readonly label: string,
    ) {
        QuestMarker.all.push(this);
    }

    static values(): readonly QuestMarker[] { return QuestMarker.all; }
    static fromKey(key: string): QuestMarker | undefined {
        return QuestMarker.all.find(marker => marker.key === key);
    }
}

export interface QuestObjectiveEventData {
    id: string;
    label: string;
    required: number;
    eventId: string;
    matches?: (event: GameEvent, player: Player) => boolean;
    amount?: (event: GameEvent, player: Player) => number;
}

export interface QuestObjectiveSnapshotData {
    id: string;
    label: string;
    required: number;
    current: (player: Player) => number;
    submission?: (item: Item) => boolean;
}

/** 이벤트 누적 또는 현재 상태 판정 하나를 캡슐화한 퀘스트 목표. */
export class QuestObjective {
    readonly id: string;
    readonly label: string;
    readonly required: number;
    readonly eventId?: string;
    private readonly eventMatches?: QuestObjectiveEventData['matches'];
    private readonly eventAmount?: QuestObjectiveEventData['amount'];
    private readonly currentValue?: QuestObjectiveSnapshotData['current'];
    private readonly submissionPredicate?: QuestObjectiveSnapshotData['submission'];

    private constructor(data: QuestObjectiveEventData | QuestObjectiveSnapshotData) {
        this.id = normalizeLocalId(data.id, '퀘스트 목표');
        this.label = data.label.trim();
        if (!this.label) throw new Error(`퀘스트 목표 이름은 비어 있을 수 없습니다: ${this.id}`);
        if (!Number.isSafeInteger(data.required) || data.required <= 0) {
            throw new Error(`퀘스트 목표 요구량은 양의 안전한 정수여야 합니다: ${this.id}/${data.required}`);
        }
        this.required = data.required;
        if ('eventId' in data) {
            this.eventId = normalizeTag(data.eventId);
            this.eventMatches = data.matches;
            this.eventAmount = data.amount;
        } else {
            this.currentValue = data.current;
            this.submissionPredicate = data.submission;
        }
    }

    static event(data: QuestObjectiveEventData): QuestObjective {
        return new QuestObjective(data);
    }

    static kill(
        id: string,
        label: string,
        required: number,
        matches: (target: Entity) => boolean,
    ): QuestObjective {
        return QuestObjective.event({
            id,
            label,
            required,
            eventId: GameEventIds.ENTITY_DEFEATED,
            matches: event => Boolean(event.subject && matches(event.subject)),
        });
    }

    static destroy(
        id: string,
        label: string,
        required: number,
        matches: (target: Entity) => boolean,
    ): QuestObjective {
        return QuestObjective.event({
            id,
            label,
            required,
            eventId: GameEventIds.RESOURCE_DESTROYED,
            matches: event => Boolean(event.subject && matches(event.subject)),
        });
    }

    static talk(id: string, label: string, npcId: string): QuestObjective {
        const normalizedNpcId = normalizeLocalId(npcId, 'NPC');
        return QuestObjective.event({
            id,
            label,
            required: 1,
            eventId: GameEventIds.NPC_DIALOGUE_STARTED,
            matches: event => event.data.npcId === normalizedNpcId,
        });
    }

    static craft(id: string, label: string, required: number, recipeId: string): QuestObjective {
        const normalizedRecipeId = normalizeTag(recipeId);
        return QuestObjective.event({
            id,
            label,
            required,
            eventId: GameEventIds.ITEM_CRAFTED,
            matches: event => event.data.recipeId === normalizedRecipeId,
            amount: event => Number(event.data.quantity ?? 1),
        });
    }

    static possess(
        id: string,
        label: string,
        required: number,
        matches: (item: Item) => boolean,
        consumeOnTurnIn = false,
    ): QuestObjective {
        return new QuestObjective({
            id,
            label,
            required,
            current: player => player.inventory.countMatching(matches),
            submission: consumeOnTurnIn ? matches : undefined,
        });
    }

    static item(
        id: string,
        label: string,
        required: number,
        itemDataId: string,
        consumeOnTurnIn = false,
    ): QuestObjective {
        return QuestObjective.possess(
            id,
            label,
            required,
            item => item.itemDataId === itemDataId,
            consumeOnTurnIn,
        );
    }

    static visit(id: string, label: string, locationId: string): QuestObjective {
        const normalizedLocationId = normalizeLocalId(locationId, '장소');
        return new QuestObjective({
            id,
            label,
            required: 1,
            current: player => player.locationId === normalizedLocationId ? 1 : 0,
        });
    }

    static custom(
        id: string,
        label: string,
        required: number,
        current: (player: Player) => number,
    ): QuestObjective {
        return new QuestObjective({ id, label, required, current });
    }

    get isEventBased(): boolean { return this.eventId !== undefined; }
    get consumesOnTurnIn(): boolean { return this.submissionPredicate !== undefined; }

    getEventIncrement(event: GameEvent, player: Player): number {
        if (!this.eventId || event.id !== this.eventId) return 0;
        if (this.eventMatches && !this.eventMatches(event, player)) return 0;
        const amount = Math.floor(this.eventAmount?.(event, player) ?? 1);
        return Number.isSafeInteger(amount) && amount > 0 ? amount : 0;
    }

    getCurrent(player: Player): number | undefined {
        if (!this.currentValue) return undefined;
        const value = Math.floor(this.currentValue(player));
        return Number.isFinite(value) ? Math.max(0, Math.min(this.required, value)) : 0;
    }

    getSubmissionRequirement(): InventoryItemRequirement | undefined {
        return this.submissionPredicate
            ? { count: this.required, matches: this.submissionPredicate }
            : undefined;
    }
}

export class QuestStage {
    readonly id: string;
    readonly description: string;
    readonly objectives: readonly QuestObjective[];

    constructor(data: { id: string; description?: string; objectives: readonly QuestObjective[] }) {
        this.id = normalizeLocalId(data.id, '퀘스트 단계');
        this.description = data.description?.trim() ?? '';
        if (data.objectives.length === 0) throw new Error(`퀘스트 단계 목표가 없습니다: ${this.id}`);
        const ids = new Set<string>();
        for (const objective of data.objectives) {
            if (ids.has(objective.id)) throw new Error(`중복 퀘스트 목표 ID: ${this.id}/${objective.id}`);
            ids.add(objective.id);
        }
        this.objectives = Object.freeze([...data.objectives]);
    }
}

export interface QuestRewardData {
    label: string;
    item?: ItemSnapshot;
    canGrant?: (player: Player) => boolean;
    grant?: (player: Player) => void;
}

/** 보상 표기·사전 검사·지급을 한 객체에 묶는다. */
export class QuestReward {
    readonly label: string;
    private readonly item?: ItemSnapshot;
    private readonly canGrantHandler?: QuestRewardData['canGrant'];
    private readonly grantHandler?: QuestRewardData['grant'];

    private constructor(data: QuestRewardData) {
        this.label = data.label.trim();
        if (!this.label) throw new Error('퀘스트 보상 이름은 비어 있을 수 없습니다.');
        this.item = data.item ? cloneItemSnapshot(data.item) : undefined;
        this.canGrantHandler = data.canGrant;
        this.grantHandler = data.grant;
    }

    static exp(amount: number): QuestReward {
        requirePositiveInteger(amount, '퀘스트 경험치');
        return new QuestReward({
            label: `경험치 ${amount}`,
            grant: player => { player.gainExp(amount); },
        });
    }

    static gold(amount: number): QuestReward {
        requirePositiveInteger(amount, '퀘스트 골드');
        return new QuestReward({
            label: `골드 ${amount}`,
            grant: player => { player.gold += amount; },
        });
    }

    static item(itemDataId: string, count = 1, label?: string): QuestReward {
        requirePositiveInteger(count, '퀘스트 아이템 수량');
        const data = getItemData(itemDataId);
        return new QuestReward({
            label: `${label?.trim() || data?.name || itemDataId} x${count}`,
            item: {
                itemDataId,
                count,
                durability: data?.baseDurability ?? null,
                metadataDelta: null,
                tags: [],
            },
        });
    }

    static skill(skillDataId: string, level = 1): QuestReward {
        requirePositiveInteger(level, '퀘스트 스킬 레벨');
        return new QuestReward({
            label: `스킬 ${skillDataId} Lv.${level}`,
            grant: player => { player.skills.grant(skillDataId, 'quest', level); },
        });
    }

    static flag(progressId: string, label: string): QuestReward {
        return new QuestReward({
            label,
            grant: player => { player.progress.setFlag(progressId, true); },
        });
    }

    static custom(data: Omit<QuestRewardData, 'item'>): QuestReward {
        return new QuestReward(data);
    }

    canGrant(player: Player): boolean { return this.canGrantHandler?.(player) ?? true; }
    grant(player: Player): void { this.grantHandler?.(player); }
    getItemSnapshot(): ItemSnapshot | undefined {
        return this.item ? cloneItemSnapshot(this.item) : undefined;
    }
}

export interface QuestRepeatPolicy {
    cooldownSeconds: number;
}

export interface QuestDataDefinition {
    id: string;
    name: string;
    aliases?: readonly string[];
    description: string;
    tags?: readonly TagId[];
    baseMetadata?: MetadataRecord | null;
    giverNpcIds: readonly string[];
    turnInNpcIds?: readonly string[];
    stages: readonly QuestStage[];
    rewards: readonly QuestReward[];
    prerequisiteQuestIds?: readonly string[];
    canAccept?: (player: Player) => boolean;
    visible?: (player: Player) => boolean;
    repeat?: QuestRepeatPolicy | false;
    abandonable?: boolean;
    completionMode?: 'turnIn' | 'automatic';
    onAccept?: (player: Player) => void;
    onComplete?: (player: Player) => void;
}

export class QuestData {
    readonly id: string;
    readonly name: string;
    readonly aliases: readonly string[];
    readonly description: string;
    readonly tags: readonly TagId[];
    readonly baseMetadata: Readonly<MetadataRecord> | null;
    readonly giverNpcIds: readonly string[];
    readonly turnInNpcIds: readonly string[];
    readonly stages: readonly QuestStage[];
    readonly rewards: readonly QuestReward[];
    readonly prerequisiteQuestIds: readonly string[];
    readonly repeat: QuestRepeatPolicy | false;
    readonly abandonable: boolean;
    readonly completionMode: 'turnIn' | 'automatic';
    readonly canAcceptHandler?: QuestDataDefinition['canAccept'];
    readonly visibleHandler?: QuestDataDefinition['visible'];
    readonly onAccept?: QuestDataDefinition['onAccept'];
    readonly onComplete?: QuestDataDefinition['onComplete'];

    constructor(data: QuestDataDefinition) {
        this.id = normalizeTag(data.id);
        this.name = data.name.trim();
        this.description = data.description.trim();
        if (!this.name) throw new Error(`퀘스트 이름은 비어 있을 수 없습니다: ${this.id}`);
        this.aliases = Object.freeze([...(data.aliases ?? [])].map(value => value.trim()).filter(Boolean));
        this.tags = Object.freeze(normalizeTags(data.tags ?? []));
        this.baseMetadata = data.baseMetadata ? Object.freeze({ ...data.baseMetadata }) : null;
        this.giverNpcIds = normalizeNpcIds(data.giverNpcIds);
        if (this.giverNpcIds.length === 0) throw new Error(`퀘스트 제공 NPC가 없습니다: ${this.id}`);
        this.turnInNpcIds = normalizeNpcIds(data.turnInNpcIds ?? data.giverNpcIds);
        if (this.turnInNpcIds.length === 0) throw new Error(`퀘스트 완료 NPC가 없습니다: ${this.id}`);
        if (data.stages.length === 0) throw new Error(`퀘스트 단계가 없습니다: ${this.id}`);
        const stageIds = new Set<string>();
        for (const stage of data.stages) {
            if (stageIds.has(stage.id)) throw new Error(`중복 퀘스트 단계 ID: ${this.id}/${stage.id}`);
            stageIds.add(stage.id);
        }
        this.stages = Object.freeze([...data.stages]);
        this.rewards = Object.freeze([...data.rewards]);
        this.prerequisiteQuestIds = Object.freeze((data.prerequisiteQuestIds ?? []).map(normalizeTag));
        const repeat = data.repeat ?? false;
        if (repeat && (!Number.isFinite(repeat.cooldownSeconds) || repeat.cooldownSeconds < 0)) {
            throw new Error(`퀘스트 반복 대기시간이 잘못되었습니다: ${this.id}`);
        }
        this.repeat = repeat ? Object.freeze({ cooldownSeconds: repeat.cooldownSeconds }) : false;
        this.abandonable = data.abandonable ?? true;
        this.completionMode = data.completionMode ?? 'turnIn';
        this.canAcceptHandler = data.canAccept;
        this.visibleHandler = data.visible;
        this.onAccept = data.onAccept;
        this.onComplete = data.onComplete;
    }

    matchesInput(input: string): boolean {
        const normalized = input.trim().toLowerCase();
        return this.id === normalized
            || this.name.toLowerCase() === normalized
            || this.aliases.some(alias => alias.toLowerCase() === normalized);
    }

    isVisible(player: Player): boolean { return this.visibleHandler?.(player) ?? true; }
}

const questRegistry = new Map<string, QuestData>();

export function defineQuest(data: QuestDataDefinition): QuestData {
    const quest = new QuestData(data);
    questRegistry.set(quest.id, quest);
    return quest;
}

export function getQuestData(id: string): QuestData | undefined {
    return questRegistry.get(normalizeTag(id));
}

export function getAllQuestData(): readonly QuestData[] {
    return [...questRegistry.values()];
}

export function findQuestDataByInput(input: string): QuestData | undefined {
    return getAllQuestData().find(quest => quest.matchesInput(input));
}

function normalizeLocalId(id: string, label: string): string {
    const normalized = id.trim().toLowerCase();
    if (!LOCAL_ID_PATTERN.test(normalized)) throw new Error(`잘못된 ${label} ID입니다: ${id}`);
    return normalized;
}

function normalizeNpcIds(ids: readonly string[]): readonly string[] {
    return Object.freeze([...new Set(ids.map(id => normalizeLocalId(id, 'NPC'))) ]);
}

function requirePositiveInteger(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label}은 양의 안전한 정수여야 합니다: ${value}`);
}

function cloneItemSnapshot(snapshot: ItemSnapshot): ItemSnapshot {
    return {
        itemDataId: snapshot.itemDataId,
        count: snapshot.count,
        durability: snapshot.durability,
        metadataDelta: snapshot.metadataDelta ? { ...snapshot.metadataDelta } : null,
        tags: [...snapshot.tags],
    };
}
