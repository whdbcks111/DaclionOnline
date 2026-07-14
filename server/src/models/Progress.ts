import prisma from '../config/prisma.js';
import type Player from './Player.js';
import type { GameEvent } from './GameEvent.js';
import { subscribeGameEvent } from './GameEvent.js';
import { normalizeTag, normalizeTags } from '../../../shared/tags.js';
import type { TagId } from '../../../shared/tags.js';
import logger from '../utils/logger.js';

export type ProgressTypeKey = 'counter' | 'flag' | 'state';
export type ProgressValue = bigint | boolean | string;

/** DB kind 문자열 경계와 표시명을 함께 소유하는 클래스형 enum. */
export class ProgressType {
    private static readonly all: ProgressType[] = [];

    static readonly COUNTER = new ProgressType('counter', '통계');
    static readonly FLAG = new ProgressType('flag', '플래그');
    static readonly STATE = new ProgressType('state', '상태');

    private constructor(readonly key: ProgressTypeKey, readonly label: string) {
        ProgressType.all.push(this);
    }

    static values(): readonly ProgressType[] { return ProgressType.all; }
    static fromKey(key: string): ProgressType | undefined {
        return ProgressType.all.find(type => type.key === key);
    }
}

export interface ProgressDefinition {
    id: string;
    type: ProgressType;
    label: string;
    description: string;
    visible?: boolean;
    format?: (value: ProgressValue) => string;
    tags?: readonly TagId[];
}

export interface StatisticDefinition extends Omit<ProgressDefinition, 'type'> {
    eventId: string;
    amount?: (event: GameEvent) => number | bigint;
}

export interface ProgressSnapshot {
    id: string;
    type: ProgressType;
    label: string;
    description: string;
    value: ProgressValue;
    formattedValue: string;
    tags: readonly TagId[];
}

interface StoredProgressValue {
    type: ProgressType;
    value: ProgressValue;
}

const definitions = new Map<string, Readonly<ProgressDefinition>>();
const statisticUnsubscribers = new Map<string, () => void>();

export class PlayerProgress {
    readonly playerId: number;
    private readonly values = new Map<string, StoredProgressValue>();
    private readonly dirtyVersions = new Map<string, number>();
    private readonly changeHandlers = new Set<(id: string) => void>();
    private version = 0;

    private constructor(playerId: number) {
        this.playerId = playerId;
    }

    static createEmpty(playerId: number): PlayerProgress {
        return new PlayerProgress(playerId);
    }

    static async load(playerId: number): Promise<PlayerProgress> {
        const progress = new PlayerProgress(playerId);
        const rows = await prisma.playerProgress.findMany({ where: { playerId } });
        for (const row of rows) {
            const type = ProgressType.fromKey(row.kind);
            if (!type) {
                logger.warn(`알 수 없는 progress kind 무시: ${row.key}/${row.kind}`);
                continue;
            }
            const value = fromPersistence(type, row.intValue, row.textValue);
            if (value !== undefined) progress.values.set(row.key, { type, value });
        }
        return progress;
    }

    get dirty(): boolean { return this.dirtyVersions.size > 0; }

    subscribeChanges(handler: (id: string) => void): () => void {
        this.changeHandlers.add(handler);
        return () => { this.changeHandlers.delete(handler); };
    }

    getCounter(id: string): bigint {
        const normalized = requireDefinition(id, ProgressType.COUNTER).id;
        const stored = this.values.get(normalized);
        return typeof stored?.value === 'bigint' ? stored.value : 0n;
    }

    getCounterNumber(id: string): number {
        const value = this.getCounter(id);
        const numberValue = Number(value);
        if (!Number.isSafeInteger(numberValue)) {
            throw new Error(`Progress counter exceeds safe number range: ${id}`);
        }
        return numberValue;
    }

    setCounter(id: string, value: number | bigint): bigint {
        const definition = requireDefinition(id, ProgressType.COUNTER);
        const normalized = normalizeCounter(value);
        this.setValue(definition, normalized);
        return normalized;
    }

    increment(id: string, amount: number | bigint = 1): bigint {
        const delta = normalizeCounter(amount);
        if (delta === 0n) return this.getCounter(id);
        return this.setCounter(id, this.getCounter(id) + delta);
    }

    getFlag(id: string): boolean {
        const normalized = requireDefinition(id, ProgressType.FLAG).id;
        return this.values.get(normalized)?.value === true;
    }

    setFlag(id: string, value = true): boolean {
        const definition = requireDefinition(id, ProgressType.FLAG);
        this.setValue(definition, value);
        return value;
    }

    getState(id: string): string {
        const normalized = requireDefinition(id, ProgressType.STATE).id;
        const value = this.values.get(normalized)?.value;
        return typeof value === 'string' ? value : '';
    }

    setState(id: string, value: string): string {
        const definition = requireDefinition(id, ProgressType.STATE);
        const normalized = value.trim();
        if (normalized.length > 255) throw new Error(`Progress state is too long: ${id}`);
        this.setValue(definition, normalized);
        return normalized;
    }

    reset(id: string): boolean {
        const normalized = normalizeTag(id);
        requireDefinition(normalized);
        if (!this.values.delete(normalized)) return false;
        this.markDirty(normalized);
        return true;
    }

    getSnapshots(visibleOnly = false): ProgressSnapshot[] {
        return [...definitions.values()]
            .filter(definition => !visibleOnly || definition.visible === true)
            .map(definition => {
                const value = this.getValue(definition);
                return {
                    id: definition.id,
                    type: definition.type,
                    label: definition.label,
                    description: definition.description,
                    value,
                    formattedValue: definition.format?.(value) ?? String(value),
                    tags: [...(definition.tags ?? [])],
                };
            });
    }

    async save(): Promise<void> {
        if (!this.dirty) return;
        const snapshots = [...this.dirtyVersions].map(([id, version]) => ({
            id,
            version,
            stored: this.values.get(id),
        }));
        const operations = snapshots.map(snapshot => {
            if (!snapshot.stored) {
                return prisma.playerProgress.deleteMany({
                    where: { playerId: this.playerId, key: snapshot.id },
                });
            }
            const persisted = toPersistence(snapshot.stored);
            return prisma.playerProgress.upsert({
                where: { playerId_key: { playerId: this.playerId, key: snapshot.id } },
                create: {
                    playerId: this.playerId,
                    key: snapshot.id,
                    kind: snapshot.stored.type.key,
                    ...persisted,
                },
                update: {
                    kind: snapshot.stored.type.key,
                    ...persisted,
                },
            });
        });
        if (operations.length > 0) await prisma.$transaction(operations);
        for (const snapshot of snapshots) {
            if (this.dirtyVersions.get(snapshot.id) === snapshot.version) {
                this.dirtyVersions.delete(snapshot.id);
            }
        }
    }

    private getValue(definition: Readonly<ProgressDefinition>): ProgressValue {
        const value = this.values.get(definition.id)?.value;
        if (value !== undefined) return value;
        if (definition.type === ProgressType.COUNTER) return 0n;
        if (definition.type === ProgressType.FLAG) return false;
        return '';
    }

    private setValue(definition: Readonly<ProgressDefinition>, value: ProgressValue): void {
        const isDefault = value === 0n || value === false || value === '';
        const previous = this.values.get(definition.id)?.value;
        if (previous === value || (previous === undefined && isDefault)) return;
        if (isDefault) this.values.delete(definition.id);
        else this.values.set(definition.id, { type: definition.type, value });
        this.markDirty(definition.id);
    }

    private markDirty(id: string): void {
        this.dirtyVersions.set(id, ++this.version);
        for (const handler of [...this.changeHandlers]) {
            try {
                handler(id);
            } catch (error) {
                logger.error(`Progress change handler 실패: ${id}`, error);
            }
        }
    }
}

export function defineProgress(data: ProgressDefinition): void {
    const id = normalizeTag(data.id);
    if (!data.label.trim()) throw new Error(`Progress label must not be empty: ${id}`);
    definitions.set(id, Object.freeze({
        ...data,
        id,
        tags: Object.freeze(normalizeTags(data.tags ?? [])),
    }));
}

export function defineStatistic(data: StatisticDefinition): void {
    const id = normalizeTag(data.id);
    statisticUnsubscribers.get(id)?.();
    defineProgress({ ...data, id, type: ProgressType.COUNTER });
    statisticUnsubscribers.set(id, subscribeGameEvent(data.eventId, event => {
        const owner = event.actor?.attackOwner;
        if (!owner?.isPlayer) return;
        const amount = data.amount?.(event) ?? 1;
        (owner as Player).progress.increment(id, amount);
    }));
}

export function getProgressDefinition(id: string): Readonly<ProgressDefinition> | undefined {
    return definitions.get(normalizeTag(id));
}

export function getAllProgressDefinitions(): ReadonlyArray<Readonly<ProgressDefinition>> {
    return [...definitions.values()];
}

function requireDefinition(id: string, expectedType?: ProgressType): Readonly<ProgressDefinition> {
    const normalized = normalizeTag(id);
    const definition = definitions.get(normalized);
    if (!definition) throw new Error(`Progress definition not found: ${normalized}`);
    if (expectedType && definition.type !== expectedType) {
        throw new Error(`Progress type mismatch: ${normalized} (${definition.type.key})`);
    }
    return definition;
}

function normalizeCounter(value: number | bigint): bigint {
    if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) {
        throw new Error(`Progress counter must be a non-negative safe integer: ${value}`);
    }
    const normalized = BigInt(value);
    if (normalized < 0n) throw new Error(`Progress counter must not be negative: ${value}`);
    return normalized;
}

function fromPersistence(
    type: ProgressType,
    intValue: bigint | null,
    textValue: string | null,
): ProgressValue | undefined {
    if (type === ProgressType.COUNTER) return intValue !== null && intValue >= 0n ? intValue : undefined;
    if (type === ProgressType.FLAG) return intValue === 1n;
    return textValue ?? '';
}

function toPersistence(stored: StoredProgressValue): {
    intValue: bigint | null;
    textValue: string | null;
} {
    if (stored.type === ProgressType.COUNTER) {
        return { intValue: stored.value as bigint, textValue: null };
    }
    if (stored.type === ProgressType.FLAG) {
        return { intValue: stored.value === true ? 1n : 0n, textValue: null };
    }
    return { intValue: null, textValue: stored.value as string };
}
