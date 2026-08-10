import type Player from '../actors/Player.js';
import { ActionType } from '../core/Action.js';
import { defineProgress, ProgressType } from '../progression/Progress.js';
import { getLocation, getRespawnLocation, normalizeLocationInput } from './Location.js';

export const RESIDENCE_LOCATION_PROGRESS_ID = 'world:residence-location';

defineProgress({
    id: RESIDENCE_LOCATION_PROGRESS_ID,
    type: ProgressType.STATE,
    label: '거주점',
    description: '사망 후 돌아올 해금된 이동 중계소 위치입니다.',
    visible: false,
    tags: ['world:travel-hub'],
});

export interface TravelHubDefinition {
    readonly locationId: string;
    readonly unlockFee: number;
    readonly useFee: number;
    readonly prerequisiteQuestId?: string;
    readonly prerequisiteLabel?: string;
    readonly unlockedByDefault?: boolean;
    readonly canSetResidence?: boolean;
}

export interface TravelHubSnapshot {
    readonly locationId: string;
    readonly name: string;
    readonly unlockFee: number;
    readonly useFee: number;
    readonly unlocked: boolean;
    readonly current: boolean;
    readonly residence: boolean;
    readonly prerequisiteMet: boolean;
    readonly prerequisiteLabel?: string;
    readonly canSetResidence: boolean;
}

export interface TravelHubOperationResult {
    readonly success: boolean;
    readonly code:
        | 'unlocked'
        | 'travelled'
        | 'residence-set'
        | 'not-hub'
        | 'already-unlocked'
        | 'quest-required'
        | 'gold-required'
        | 'destination-not-found'
        | 'destination-locked'
        | 'same-location'
        | 'action-denied'
        | 'residence-unavailable';
    readonly reason?: string;
    readonly snapshot?: TravelHubSnapshot;
    readonly goldSpent?: number;
}

const definitions = new Map<string, Readonly<TravelHubDefinition>>();

function unlockProgressId(locationId: string): string {
    return `world:travel-hub/${locationId}`;
}

function validateFee(value: number, label: string, locationId: string): number {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`Invalid travel hub ${label}: ${locationId}/${value}`);
    }
    return value;
}

export function defineTravelHub(data: TravelHubDefinition): void {
    const locationId = data.locationId.trim();
    if (!locationId) throw new Error('Travel hub location ID must not be empty.');
    const definition = Object.freeze({
        ...data,
        locationId,
        unlockFee: validateFee(data.unlockFee, 'unlock fee', locationId),
        useFee: validateFee(data.useFee, 'use fee', locationId),
        canSetResidence: data.canSetResidence !== false,
    });
    definitions.set(locationId, definition);
    defineProgress({
        id: unlockProgressId(locationId),
        type: ProgressType.FLAG,
        label: `${locationId} 이동 중계소 해금`,
        description: '큰 비용과 지역 퀘스트 조건을 충족해 영구 해금한 이동 중계소입니다.',
        visible: false,
        tags: ['world:travel-hub'],
    });
}

export function getTravelHubDefinition(locationId: string): Readonly<TravelHubDefinition> | undefined {
    return definitions.get(locationId);
}

export function isTravelHubLocation(locationId: string): boolean {
    return definitions.has(locationId);
}

export function isTravelHubUnlocked(player: Player, locationId: string): boolean {
    const definition = definitions.get(locationId);
    return Boolean(definition && (
        definition.unlockedByDefault || player.progress.getFlag(unlockProgressId(locationId))
    ));
}

function prerequisiteMet(player: Player, definition: Readonly<TravelHubDefinition>): boolean {
    return !definition.prerequisiteQuestId || player.quests.isCompleted(definition.prerequisiteQuestId);
}

function createSnapshot(player: Player, definition: Readonly<TravelHubDefinition>): TravelHubSnapshot {
    const residenceId = player.progress.getState(RESIDENCE_LOCATION_PROGRESS_ID);
    return {
        locationId: definition.locationId,
        name: getLocation(definition.locationId)?.data.name ?? definition.locationId,
        unlockFee: definition.unlockFee,
        useFee: definition.useFee,
        unlocked: isTravelHubUnlocked(player, definition.locationId),
        current: player.locationId === definition.locationId,
        residence: residenceId === definition.locationId,
        prerequisiteMet: prerequisiteMet(player, definition),
        ...(definition.prerequisiteLabel ? { prerequisiteLabel: definition.prerequisiteLabel } : {}),
        canSetResidence: definition.canSetResidence !== false,
    };
}

export function getTravelHubSnapshots(player: Player): TravelHubSnapshot[] {
    return [...definitions.values()].map(definition => createSnapshot(player, definition));
}

export function findTravelHubSnapshot(player: Player, input: string): TravelHubSnapshot | undefined {
    const normalized = normalizeLocationInput(input);
    if (!normalized) return undefined;
    const snapshots = getTravelHubSnapshots(player);
    const exact = snapshots.find(snapshot => (
        normalizeLocationInput(snapshot.locationId) === normalized
        || normalizeLocationInput(snapshot.name) === normalized
    ));
    if (exact) return exact;
    const partial = snapshots.filter(snapshot => normalizeLocationInput(snapshot.name).includes(normalized));
    return partial.length === 1 ? partial[0] : undefined;
}

export function unlockCurrentTravelHub(player: Player): TravelHubOperationResult {
    if (player.isDead || player.moving) {
        return { success: false, code: 'action-denied', reason: '현재는 이동 중계소를 해금할 수 없습니다.' };
    }
    const definition = definitions.get(player.locationId);
    if (!definition) {
        return { success: false, code: 'not-hub', reason: '현재 장소에는 이동 중계소가 없습니다.' };
    }
    const snapshot = createSnapshot(player, definition);
    if (snapshot.unlocked) {
        return { success: false, code: 'already-unlocked', reason: '이미 해금한 이동 중계소입니다.', snapshot };
    }
    if (!snapshot.prerequisiteMet) {
        return {
            success: false,
            code: 'quest-required',
            reason: `먼저 지역 퀘스트 [ ${snapshot.prerequisiteLabel ?? definition.prerequisiteQuestId} ]을 완료해야 합니다.`,
            snapshot,
        };
    }
    if (player.gold < definition.unlockFee) {
        return {
            success: false,
            code: 'gold-required',
            reason: `중계소 해금에 ${definition.unlockFee.toLocaleString()}G가 필요합니다. (보유 ${player.gold.toLocaleString()}G)`,
            snapshot,
        };
    }

    player.progress.setFlag(unlockProgressId(definition.locationId));
    player.gold -= definition.unlockFee;
    return {
        success: true,
        code: 'unlocked',
        snapshot: createSnapshot(player, definition),
        goldSpent: definition.unlockFee,
    };
}

export function travelToHub(player: Player, input: string): TravelHubOperationResult {
    const currentDefinition = definitions.get(player.locationId);
    if (!currentDefinition) {
        return { success: false, code: 'not-hub', reason: '이동 중계소가 있는 장소에서만 사용할 수 있습니다.' };
    }
    if (player.isDead || player.moving || !player.canPerformAction(ActionType.LOCATION_TRAVEL)) {
        return { success: false, code: 'action-denied', reason: '현재는 이동 중계소를 사용할 수 없습니다.' };
    }
    if (!isTravelHubUnlocked(player, currentDefinition.locationId)) {
        return { success: false, code: 'action-denied', reason: '현재 장소의 이동 중계소를 먼저 해금해야 합니다.' };
    }
    const destination = findTravelHubSnapshot(player, input);
    if (!destination) {
        return { success: false, code: 'destination-not-found', reason: '조건에 맞는 중계소 목적지를 찾지 못했습니다.' };
    }
    if (!destination.unlocked) {
        return { success: false, code: 'destination-locked', reason: '아직 해금하지 않은 중계소입니다.', snapshot: destination };
    }
    if (destination.current) {
        return { success: false, code: 'same-location', reason: '이미 해당 중계소에 있습니다.', snapshot: destination };
    }
    if (player.gold < destination.useFee) {
        return {
            success: false,
            code: 'gold-required',
            reason: `중계소 사용료 ${destination.useFee.toLocaleString()}G가 필요합니다. (보유 ${player.gold.toLocaleString()}G)`,
            snapshot: destination,
        };
    }

    player.gold -= destination.useFee;
    player.currentTarget = null;
    player.locationId = destination.locationId;
    return {
        success: true,
        code: 'travelled',
        snapshot: createSnapshot(player, definitions.get(destination.locationId)!),
        goldSpent: destination.useFee,
    };
}

export function setCurrentTravelHubAsResidence(player: Player): TravelHubOperationResult {
    if (player.isDead || player.moving) {
        return { success: false, code: 'action-denied', reason: '현재는 거주점을 지정할 수 없습니다.' };
    }
    const definition = definitions.get(player.locationId);
    if (!definition || !isTravelHubUnlocked(player, definition.locationId)) {
        return {
            success: false,
            code: 'residence-unavailable',
            reason: '현재 장소의 이동 중계소를 먼저 해금해야 거주점으로 지정할 수 있습니다.',
        };
    }
    if (definition.canSetResidence === false) {
        return { success: false, code: 'residence-unavailable', reason: '이 중계소는 거주점으로 지정할 수 없습니다.' };
    }
    player.progress.setState(RESIDENCE_LOCATION_PROGRESS_ID, definition.locationId);
    return { success: true, code: 'residence-set', snapshot: createSnapshot(player, definition) };
}

/** 저장된 거주점이 유효하지 않으면 기존 기본 부활 장소를 사용한다. */
export function getPlayerRespawnLocation(player: Player) {
    const residenceId = player.progress.getState(RESIDENCE_LOCATION_PROGRESS_ID);
    if (residenceId && isTravelHubUnlocked(player, residenceId)) {
        const residence = getLocation(residenceId);
        if (residence) return residence;
    }
    return getRespawnLocation();
}
