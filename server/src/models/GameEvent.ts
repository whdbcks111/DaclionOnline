import type Entity from './Entity.js';
import { normalizeTag } from '../../../shared/tags.js';
import logger from '../utils/logger.js';

export type GameEventValue = string | number | boolean | null;
export type GameEventData = Readonly<Record<string, GameEventValue>>;

export interface GameEvent<TData extends GameEventData = GameEventData> {
    readonly id: string;
    readonly occurredAt: number;
    readonly actor?: Entity;
    readonly subject?: Entity;
    readonly data: TData;
}

export interface GameEventTrace {
    id: string;
    occurredAt: number;
    actorUserId?: number;
    actorName?: string;
    subjectUserId?: number;
    subjectName?: string;
    data: Record<string, GameEventValue>;
}

export const GameEventIds = Object.freeze({
    CRITICAL_HIT: 'combat:critical_hit',
    ATTACK_EVADED: 'combat:attack_evaded',
    ENTITY_DEFEATED: 'combat:entity_defeated',
    RESOURCE_DESTROYED: 'resource:destroyed',
    SKILL_ACQUIRED: 'skill:acquired',
    SKILL_STARTED: 'skill:started',
    SKILL_FINISHED: 'skill:finished',
    CRAFTING_RECIPE_DISCOVERED: 'crafting:recipe_discovered',
    ITEM_CRAFTED: 'crafting:item_crafted',
    NPC_DIALOGUE_STARTED: 'npc:dialogue_started',
    NPC_DIALOGUE_CHOICE: 'npc:dialogue_choice',
    NPC_DIALOGUE_ENDED: 'npc:dialogue_ended',
    STATUS_EFFECT_APPLIED: 'status_effect:applied',
    STATUS_EFFECT_UPDATED: 'status_effect:updated',
    STATUS_EFFECT_REMOVED: 'status_effect:removed',
} as const);

export type GameEventHandler = (event: GameEvent) => void;

const TRACE_LIMIT = 500;
const handlers = new Map<string, Set<GameEventHandler>>();
const anyHandlers = new Set<GameEventHandler>();
const traces: GameEventTrace[] = [];

/** 동기식 게임 이벤트 발행. handler에서는 DB I/O를 수행하지 않는다. */
export function emitGameEvent<TData extends GameEventData>(
    id: string,
    options: { actor?: Entity; subject?: Entity; data?: TData } = {},
): GameEvent<TData> {
    const event: GameEvent<TData> = {
        id: normalizeTag(id),
        occurredAt: Date.now(),
        actor: options.actor,
        subject: options.subject,
        data: Object.freeze({ ...(options.data ?? {}) }) as TData,
    };

    traces.push({
        id: event.id,
        occurredAt: event.occurredAt,
        actorUserId: event.actor?.attackOwner.playerUserId,
        actorName: event.actor?.name,
        subjectUserId: event.subject?.playerUserId,
        subjectName: event.subject?.name,
        data: { ...event.data },
    });
    if (traces.length > TRACE_LIMIT) traces.splice(0, traces.length - TRACE_LIMIT);

    dispatch(handlers.get(event.id), event);
    dispatch(anyHandlers, event);
    return event;
}

/** 특정 event ID를 구독하고 해제 함수를 반환한다. */
export function subscribeGameEvent(id: string, handler: GameEventHandler): () => void {
    const normalized = normalizeTag(id);
    const listeners = handlers.get(normalized) ?? new Set<GameEventHandler>();
    listeners.add(handler);
    handlers.set(normalized, listeners);
    return () => {
        listeners.delete(handler);
        if (listeners.size === 0) handlers.delete(normalized);
    };
}

export function subscribeAllGameEvents(handler: GameEventHandler): () => void {
    anyHandlers.add(handler);
    return () => { anyHandlers.delete(handler); };
}

/** 운영/테스트용 최근 이벤트 불변 스냅샷. 원시 Entity 참조는 노출하지 않는다. */
export function getRecentGameEvents(options: {
    id?: string;
    actorUserId?: number;
    limit?: number;
} = {}): GameEventTrace[] {
    const id = options.id ? normalizeTag(options.id) : undefined;
    const limit = Math.max(0, Math.trunc(options.limit ?? 100));
    if (limit === 0) return [];
    return traces
        .filter(trace => (!id || trace.id === id)
            && (options.actorUserId === undefined || trace.actorUserId === options.actorUserId))
        .slice(-limit)
        .map(trace => ({ ...trace, data: { ...trace.data } }));
}

export function clearRecentGameEvents(): void {
    traces.length = 0;
}

function dispatch(listeners: ReadonlySet<GameEventHandler> | undefined, event: GameEvent): void {
    if (!listeners) return;
    for (const handler of [...listeners]) {
        try {
            handler(event);
        } catch (error) {
            logger.error(`게임 이벤트 handler 실패: ${event.id}`, error);
        }
    }
}
