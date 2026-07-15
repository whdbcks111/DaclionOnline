import { isDeepStrictEqual } from 'node:util';
import prisma from '../config/prisma.js';
import { sendBotMessageToUser, sendNotificationToUser } from '../modules/message.js';
import { chat } from '../utils/chatBuilder.js';
import logger from '../utils/logger.js';
import { TagCollection } from '../../../shared/tags.js';
import type { TagId, TagReadable } from '../../../shared/tags.js';
import type Player from './Player.js';
import {
    cloneMetadata,
    cloneMetadataValue,
    decodeMetadataDelta,
    encodeMetadataDelta,
} from './Metadata.js';
import type { MetadataRecord, MetadataValue } from './Metadata.js';
import {
    getAllQuestData,
    getQuestData,
    QuestData,
    QuestMarker,
    QuestStatus,
} from './Quest.js';
import type { QuestObjective, QuestStage } from './Quest.js';
import {
    emitGameEvent,
    GameEventIds,
    subscribeAllGameEvents,
} from './GameEvent.js';
import type { GameEvent } from './GameEvent.js';

const METADATA_STORAGE_KEY = '__daclionQuestMetadata';
const METADATA_STORAGE_VERSION = 1;

export interface QuestObjectiveSnapshot {
    id: string;
    label: string;
    progress: number;
    required: number;
    completed: boolean;
}

export interface QuestDisplaySnapshot {
    id: string;
    name: string;
    description: string;
    status: QuestStatus;
    stageId: string;
    stageDescription: string;
    objectives: readonly QuestObjectiveSnapshot[];
    rewards: readonly string[];
    completionCount: number;
    abandonable: boolean;
}

export interface QuestOperationResult {
    success: boolean;
    reason?: string;
}

interface QuestPersistenceOptions {
    playerId: number;
    questDataId: string;
    status: QuestStatus;
    stageId: string;
    objectiveProgress?: Readonly<Record<string, number>>;
    metadataDelta?: MetadataRecord | null;
    persistentTags?: readonly TagId[];
    completionCount?: number;
    acceptedAt?: Date;
    readyAt?: Date | null;
    completedAt?: Date | null;
    repeatAvailableAt?: Date | null;
}

/** 코드 QuestData와 플레이어별 진행 delta를 합성하는 퀘스트 인스턴스. */
export class Quest implements TagReadable {
    readonly playerId: number;
    readonly questDataId: string;
    readonly tags: TagCollection;
    private _status: QuestStatus;
    private _stageId: string;
    private readonly objectiveProgress = new Map<string, number>();
    private _metadataDelta: MetadataRecord;
    private _completionCount: number;
    private _acceptedAt: Date;
    private _readyAt: Date | null;
    private _completedAt: Date | null;
    private _repeatAvailableAt: Date | null;
    private persistentChangeHandler?: () => void;

    constructor(options: QuestPersistenceOptions) {
        const data = getQuestData(options.questDataId);
        if (!data) throw new Error(`QuestData not found: ${options.questDataId}`);
        const stage = data.stages.find(value => value.id === options.stageId) ?? data.stages[0];
        this.playerId = options.playerId;
        this.questDataId = data.id;
        this._status = options.status;
        this._stageId = stage.id;
        for (const [key, value] of Object.entries(options.objectiveProgress ?? {})) {
            if (Number.isSafeInteger(value) && value >= 0) this.objectiveProgress.set(key, value);
        }
        this._metadataDelta = cloneMetadata(options.metadataDelta ?? {});
        this._completionCount = Math.max(0, Math.trunc(options.completionCount ?? 0));
        this._acceptedAt = options.acceptedAt ?? new Date();
        this._readyAt = options.readyAt ?? null;
        this._completedAt = options.completedAt ?? null;
        this._repeatAvailableAt = options.repeatAvailableAt ?? null;
        this.tags = new TagCollection({
            definition: data.tags,
            persistent: options.persistentTags,
            onPersistentChange: () => this.persistentChangeHandler?.(),
        });
    }

    get data(): QuestData {
        const data = getQuestData(this.questDataId);
        if (!data) throw new Error(`QuestData not found: ${this.questDataId}`);
        return data;
    }

    get status(): QuestStatus { return this._status; }
    get stageId(): string { return this._stageId; }
    get stage(): QuestStage {
        return this.data.stages.find(stage => stage.id === this._stageId) ?? this.data.stages[0];
    }
    get completionCount(): number { return this._completionCount; }
    get acceptedAt(): Date { return new Date(this._acceptedAt); }
    get readyAt(): Date | null { return this._readyAt ? new Date(this._readyAt) : null; }
    get completedAt(): Date | null { return this._completedAt ? new Date(this._completedAt) : null; }
    get repeatAvailableAt(): Date | null {
        return this._repeatAvailableAt ? new Date(this._repeatAvailableAt) : null;
    }

    hasTag(tag: TagId): boolean { return this.tags.hasTag(tag); }

    setPersistentChangeHandler(handler?: () => void): void {
        this.persistentChangeHandler = handler;
    }

    getProgress(objective: QuestObjective): number {
        return Math.min(objective.required, this.objectiveProgress.get(progressKey(this.stage, objective)) ?? 0);
    }

    setProgress(objective: QuestObjective, value: number): boolean {
        const normalized = Math.max(0, Math.min(objective.required, Math.floor(value)));
        const key = progressKey(this.stage, objective);
        if ((this.objectiveProgress.get(key) ?? 0) === normalized) return false;
        if (normalized === 0) this.objectiveProgress.delete(key);
        else this.objectiveProgress.set(key, normalized);
        this.persistentChangeHandler?.();
        return true;
    }

    incrementProgress(objective: QuestObjective, amount: number): boolean {
        return this.setProgress(objective, this.getProgress(objective) + amount);
    }

    isCurrentStageComplete(): boolean {
        return this.stage.objectives.every(objective => this.getProgress(objective) >= objective.required);
    }

    advanceStage(): boolean {
        const index = this.data.stages.findIndex(stage => stage.id === this._stageId);
        const next = this.data.stages[index + 1];
        if (!next) return false;
        this._stageId = next.id;
        this.persistentChangeHandler?.();
        return true;
    }

    markReady(now = new Date()): void {
        this._status = QuestStatus.READY;
        this._readyAt = now;
        this.persistentChangeHandler?.();
    }

    markCompleted(now = new Date()): void {
        this._status = QuestStatus.COMPLETED;
        this._completedAt = now;
        this._completionCount++;
        this._repeatAvailableAt = this.data.repeat
            ? new Date(now.getTime() + this.data.repeat.cooldownSeconds * 1000)
            : null;
        this.persistentChangeHandler?.();
    }

    markAbandoned(): void {
        this._status = QuestStatus.ABANDONED;
        this.persistentChangeHandler?.();
    }

    resetForAcceptance(now = new Date()): void {
        this._status = QuestStatus.ACTIVE;
        this._stageId = this.data.stages[0].id;
        this.objectiveProgress.clear();
        this._acceptedAt = now;
        this._readyAt = null;
        this._completedAt = null;
        this._repeatAvailableAt = null;
        this.persistentChangeHandler?.();
    }

    getMetadata<T extends MetadataValue = MetadataValue>(key: string): T | undefined {
        if (Object.hasOwn(this._metadataDelta, key)) {
            return cloneMetadataValue(this._metadataDelta[key]) as T;
        }
        const value = this.data.baseMetadata?.[key];
        return value === undefined ? undefined : cloneMetadataValue(value) as T;
    }

    setMetadata(key: string, value: unknown): void {
        if (!key.trim()) throw new Error('Quest metadata key must not be empty');
        if (value === undefined) {
            this.resetMetadata(key);
            return;
        }
        const normalized = cloneMetadataValue(value);
        if (isDeepStrictEqual(normalized, this.data.baseMetadata?.[key])) {
            this.resetMetadata(key);
            return;
        }
        if (isDeepStrictEqual(this._metadataDelta[key], normalized)) return;
        this._metadataDelta[key] = normalized;
        this.persistentChangeHandler?.();
    }

    resetMetadata(key: string): boolean {
        if (!Object.hasOwn(this._metadataDelta, key)) return false;
        delete this._metadataDelta[key];
        this.persistentChangeHandler?.();
        return true;
    }

    getProgressRecord(): Record<string, number> {
        return Object.fromEntries(this.objectiveProgress);
    }

    getPersistedMetadata(): MetadataRecord {
        return encodeMetadataDelta(METADATA_STORAGE_KEY, METADATA_STORAGE_VERSION, this._metadataDelta);
    }
}

/** 플레이어별 퀘스트 수명주기와 versioned dirty 저장을 소유한다. */
export default class QuestBook {
    readonly playerId: number;
    private readonly quests = new Map<string, Quest>();
    private readonly dirtyVersions = new Map<string, number>();
    private version = 0;
    private owner: Player | null = null;
    private refreshing = false;

    private constructor(playerId: number) {
        this.playerId = playerId;
    }

    static createEmpty(playerId: number): QuestBook { return new QuestBook(playerId); }

    static async load(playerId: number): Promise<QuestBook> {
        const book = new QuestBook(playerId);
        const rows = await prisma.playerQuest.findMany({ where: { playerId } });
        for (const row of rows) {
            const data = getQuestData(row.questDataId);
            const status = QuestStatus.fromKey(row.status);
            if (!data || !status) {
                logger.warn(`알 수 없는 플레이어 퀘스트 무시: ${row.questDataId}/${row.status}`);
                continue;
            }
            const quest = new Quest({
                playerId,
                questDataId: row.questDataId,
                status,
                stageId: row.currentStageId,
                objectiveProgress: parseProgressRecord(row.objectiveProgress),
                metadataDelta: decodeMetadataDelta(
                    METADATA_STORAGE_KEY,
                    METADATA_STORAGE_VERSION,
                    data.baseMetadata,
                    row.metadata,
                ),
                persistentTags: (row.tags as TagId[] | null) ?? [],
                completionCount: row.completionCount,
                acceptedAt: row.acceptedAt,
                readyAt: row.readyAt,
                completedAt: row.completedAt,
                repeatAvailableAt: row.repeatAvailableAt,
            });
            book.attach(quest);
        }
        return book;
    }

    get dirty(): boolean { return this.dirtyVersions.size > 0; }

    bindOwner(player: Player): void {
        if (player.userId !== this.playerId) throw new Error('QuestBook owner mismatch');
        this.owner = player;
        this.refreshSnapshotObjectives();
    }

    get(id: string): Quest | undefined { return this.quests.get(getQuestData(id)?.id ?? id); }

    getByInput(input: string): Quest | undefined {
        const normalized = input.trim().toLowerCase();
        return [...this.quests.values()].find(quest => quest.data.matchesInput(normalized));
    }

    getStatus(id: string): QuestStatus | undefined { return this.get(id)?.status; }
    isActive(id: string): boolean { return this.getStatus(id) === QuestStatus.ACTIVE; }

    isCompleted(id: string): boolean {
        const quest = this.get(id);
        return Boolean(quest && quest.completionCount > 0);
    }

    canAccept(id: string, npcId?: string): boolean {
        const player = this.owner;
        const data = getQuestData(id);
        if (!player || !data || !data.isVisible(player)) return false;
        if (npcId && !data.giverNpcIds.includes(npcId)) return false;
        const current = this.quests.get(data.id);
        if (current?.status === QuestStatus.ACTIVE || current?.status === QuestStatus.READY) return false;
        if (current?.completionCount && !data.repeat) return false;
        if (current?.repeatAvailableAt && current.repeatAvailableAt.getTime() > Date.now()) return false;
        if (data.prerequisiteQuestIds.some(required => !this.isCompleted(required))) return false;
        try {
            return data.canAcceptHandler?.(player) ?? true;
        } catch (error) {
            logger.error(`퀘스트 수락 조건 실패: ${data.id}`, error);
            return false;
        }
    }

    accept(id: string, sourceNpcId?: string): QuestOperationResult {
        const player = this.owner;
        const data = getQuestData(id);
        if (!player || !data) return { success: false, reason: '존재하지 않는 퀘스트입니다.' };
        if (!this.canAccept(data.id, sourceNpcId)) {
            return { success: false, reason: '현재 이 퀘스트를 수락할 수 없습니다.' };
        }
        let quest = this.quests.get(data.id);
        if (quest) quest.resetForAcceptance();
        else {
            quest = new Quest({
                playerId: this.playerId,
                questDataId: data.id,
                status: QuestStatus.ACTIVE,
                stageId: data.stages[0].id,
            });
            this.attach(quest);
            this.markDirty(quest.questDataId);
        }
        try {
            data.onAccept?.(player);
        } catch (error) {
            logger.error(`퀘스트 수락 callback 실패: ${data.id}`, error);
        }
        const message = `퀘스트 [ ${data.name} ] 를 수락했습니다!`;
        sendBotMessageToUser(player.userId, chat().color('gold', b => b.weight('bold', b2 => b2.text(message))).build());
        sendNotificationToUser(player.userId, { key: `quest:accepted:${data.id}`, message });
        emitGameEvent(GameEventIds.QUEST_ACCEPTED, {
            actor: player,
            data: { questId: data.id, npcId: sourceNpcId ?? null },
        });
        this.refreshSnapshotObjectives();
        return { success: true };
    }

    canTurnIn(id: string, npcId?: string): boolean {
        const quest = this.get(id);
        if (!quest || quest.status !== QuestStatus.READY) return false;
        return !npcId || quest.data.turnInNpcIds.includes(npcId);
    }

    turnIn(id: string, npcId?: string): QuestOperationResult {
        const player = this.owner;
        const quest = this.get(id);
        if (!player || !quest) return { success: false, reason: '보유한 퀘스트가 아닙니다.' };
        if (!this.canTurnIn(quest.questDataId, npcId)) {
            return { success: false, reason: '아직 완료할 수 없거나 이 NPC에게 보고할 수 없는 퀘스트입니다.' };
        }

        const requirements = quest.stage.objectives
            .map(objective => objective.getSubmissionRequirement())
            .filter((value): value is NonNullable<typeof value> => value !== undefined);
        const selections = requirements.length > 0 ? player.inventory.selectItems(requirements) : [];
        if (!selections) return { success: false, reason: '제출해야 할 아이템이 부족합니다.' };
        if (quest.data.rewards.some(reward => !reward.canGrant(player))) {
            return { success: false, reason: '현재 받을 수 없는 퀘스트 보상이 있습니다.' };
        }
        const itemRewards = quest.data.rewards
            .map(reward => reward.getItemSnapshot())
            .filter((value): value is NonNullable<typeof value> => value !== undefined);
        if (!player.inventory.replaceSelectedItems(selections, itemRewards)) {
            return { success: false, reason: '인벤토리 공간이 부족하거나 제출 아이템이 변경되었습니다.' };
        }
        for (const reward of quest.data.rewards) reward.grant(player);
        quest.markCompleted();
        try {
            quest.data.onComplete?.(player);
        } catch (error) {
            logger.error(`퀘스트 완료 callback 실패: ${quest.questDataId}`, error);
        }
        const message = `퀘스트 [ ${quest.data.name} ] 를 완료했습니다!`;
        sendBotMessageToUser(player.userId, chat().color('gold', b => b.weight('bold', b2 => b2.text(message))).build());
        sendNotificationToUser(player.userId, { key: `quest:completed:${quest.questDataId}`, message });
        emitGameEvent(GameEventIds.QUEST_COMPLETED, {
            actor: player,
            data: { questId: quest.questDataId, npcId: npcId ?? null },
        });
        // 보상 수령은 중요도가 높으므로 일반 30초 flush를 기다리지 않고 aggregate 저장을 요청한다.
        void player.save().catch(error => logger.error(`퀘스트 완료 즉시 저장 실패: ${quest.questDataId}`, error));
        return { success: true };
    }

    abandon(id: string): QuestOperationResult {
        const player = this.owner;
        const quest = this.get(id);
        if (!player || !quest || quest.status !== QuestStatus.ACTIVE) {
            return { success: false, reason: '진행 중인 퀘스트가 아닙니다.' };
        }
        if (!quest.data.abandonable) return { success: false, reason: '포기할 수 없는 퀘스트입니다.' };
        quest.markAbandoned();
        const message = `퀘스트 [ ${quest.data.name} ] 를 포기했습니다.`;
        sendBotMessageToUser(player.userId, message);
        emitGameEvent(GameEventIds.QUEST_ABANDONED, {
            actor: player,
            data: { questId: quest.questDataId },
        });
        return { success: true };
    }

    getSnapshots(includeCompleted = true): QuestDisplaySnapshot[] {
        this.refreshSnapshotObjectives();
        return [...this.quests.values()]
            .filter(quest => includeCompleted || quest.status !== QuestStatus.COMPLETED)
            .map(quest => this.createSnapshot(quest));
    }

    getSnapshot(id: string): QuestDisplaySnapshot | undefined {
        this.refreshSnapshotObjectives();
        const quest = this.get(id);
        return quest ? this.createSnapshot(quest) : undefined;
    }

    getNpcMarker(npcId: string): QuestMarker | undefined {
        if ([...this.quests.values()].some(quest => quest.status === QuestStatus.READY
            && quest.data.turnInNpcIds.includes(npcId))) return QuestMarker.READY;
        if (getAllQuestData().some(data => data.giverNpcIds.includes(npcId) && this.canAccept(data.id, npcId))) {
            return QuestMarker.AVAILABLE;
        }
        if ([...this.quests.values()].some(quest => quest.status === QuestStatus.ACTIVE
            && (quest.data.giverNpcIds.includes(npcId) || quest.data.turnInNpcIds.includes(npcId)))) {
            return QuestMarker.ACTIVE;
        }
        return undefined;
    }

    handleGameEvent(event: GameEvent): void {
        const player = this.owner;
        if (!player) return;
        for (const quest of [...this.quests.values()]) {
            if (quest.status !== QuestStatus.ACTIVE) continue;
            for (const objective of quest.stage.objectives) {
                const increment = objective.getEventIncrement(event, player);
                if (increment <= 0 || !quest.incrementProgress(objective, increment)) continue;
                this.notifyObjectiveUpdate(quest, objective);
            }
            this.advanceCompletedStages(quest);
        }
    }

    refreshSnapshotObjectives(): void {
        const player = this.owner;
        if (!player || this.refreshing) return;
        this.refreshing = true;
        try {
            for (const quest of [...this.quests.values()]) {
                if (quest.status !== QuestStatus.ACTIVE) continue;
                for (const objective of quest.stage.objectives) {
                    const current = objective.getCurrent(player);
                    if (current !== undefined && quest.setProgress(objective, current)) {
                        this.notifyObjectiveUpdate(quest, objective);
                    }
                }
                this.advanceCompletedStages(quest);
            }
        } finally {
            this.refreshing = false;
        }
    }

    async save(): Promise<void> {
        if (!this.dirty) return;
        const snapshots = [...this.dirtyVersions].flatMap(([id, version]) => {
            const quest = this.quests.get(id);
            return quest ? [{ id, version, quest }] : [];
        });
        await Promise.all(snapshots.map(({ quest }) => prisma.playerQuest.upsert({
            where: { playerId_questDataId: { playerId: this.playerId, questDataId: quest.questDataId } },
            create: serializeQuest(this.playerId, quest),
            update: serializeQuestUpdate(quest),
        })));
        for (const snapshot of snapshots) {
            if (this.dirtyVersions.get(snapshot.id) === snapshot.version) this.dirtyVersions.delete(snapshot.id);
        }
    }

    private attach(quest: Quest): void {
        this.quests.set(quest.questDataId, quest);
        quest.setPersistentChangeHandler(() => this.markDirty(quest.questDataId));
    }

    private markDirty(id: string): void {
        this.dirtyVersions.set(id, ++this.version);
    }

    private advanceCompletedStages(quest: Quest): void {
        const player = this.owner;
        if (!player || quest.status !== QuestStatus.ACTIVE || !quest.isCurrentStageComplete()) return;
        if (quest.advanceStage()) {
            sendNotificationToUser(player.userId, {
                key: `quest:stage:${quest.questDataId}`,
                message: `퀘스트 [ ${quest.data.name} ] 의 다음 단계가 시작되었습니다.`,
            });
            this.refreshSnapshotObjectives();
            return;
        }
        quest.markReady();
        const message = quest.data.completionMode === 'automatic'
            ? `퀘스트 [ ${quest.data.name} ] 의 목표를 달성했습니다.`
            : `퀘스트 [ ${quest.data.name} ] 의 목표를 달성했습니다. NPC에게 보고하세요.`;
        sendBotMessageToUser(player.userId, chat().color('lime', b => b.text(message)).build());
        sendNotificationToUser(player.userId, { key: `quest:ready:${quest.questDataId}`, message });
        emitGameEvent(GameEventIds.QUEST_READY, {
            actor: player,
            data: { questId: quest.questDataId },
        });
        if (quest.data.completionMode === 'automatic') this.turnIn(quest.questDataId);
    }

    private notifyObjectiveUpdate(quest: Quest, objective: QuestObjective): void {
        const player = this.owner;
        if (!player) return;
        const progress = quest.getProgress(objective);
        sendNotificationToUser(player.userId, {
            key: `quest:objective:${quest.questDataId}:${quest.stageId}:${objective.id}`,
            message: `${quest.data.name} · ${objective.label} ${progress}/${objective.required}`,
            editExists: true,
        });
        emitGameEvent(GameEventIds.QUEST_OBJECTIVE_UPDATED, {
            actor: player,
            data: {
                questId: quest.questDataId,
                stageId: quest.stageId,
                objectiveId: objective.id,
                progress,
                required: objective.required,
            },
        });
    }

    private createSnapshot(quest: Quest): QuestDisplaySnapshot {
        return {
            id: quest.questDataId,
            name: quest.data.name,
            description: quest.data.description,
            status: quest.status,
            stageId: quest.stageId,
            stageDescription: quest.stage.description,
            objectives: quest.stage.objectives.map(objective => ({
                id: objective.id,
                label: objective.label,
                progress: quest.getProgress(objective),
                required: objective.required,
                completed: quest.getProgress(objective) >= objective.required,
            })),
            rewards: quest.data.rewards.map(reward => reward.label),
            completionCount: quest.completionCount,
            abandonable: quest.data.abandonable,
        };
    }
}

subscribeAllGameEvents(event => {
    const owner = event.actor?.attackOwner;
    if (!owner?.isPlayer) return;
    (owner as Player).quests?.handleGameEvent(event);
});

function progressKey(stage: QuestStage, objective: QuestObjective): string {
    return `${stage.id}/${objective.id}`;
}

function parseProgressRecord(value: unknown): Record<string, number> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    const result: Record<string, number> = {};
    for (const [key, entry] of Object.entries(value)) {
        if (Number.isSafeInteger(entry) && (entry as number) >= 0) result[key] = entry as number;
    }
    return result;
}

function serializeQuest(playerId: number, quest: Quest) {
    return {
        playerId,
        questDataId: quest.questDataId,
        ...serializeQuestUpdate(quest),
    };
}

function serializeQuestUpdate(quest: Quest) {
    return {
        status: quest.status.key,
        currentStageId: quest.stageId,
        objectiveProgress: quest.getProgressRecord(),
        metadata: quest.getPersistedMetadata(),
        tags: quest.tags.persistentValues(),
        completionCount: quest.completionCount,
        acceptedAt: quest.acceptedAt,
        readyAt: quest.readyAt,
        completedAt: quest.completedAt,
        repeatAvailableAt: quest.repeatAvailableAt,
    };
}
