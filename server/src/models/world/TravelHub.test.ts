import assert from 'node:assert/strict';
import test from 'node:test';
import type Player from '../actors/Player.js';
import { PlayerProgress } from '../progression/Progress.js';
import { defineLocation } from './Location.js';
import {
    defineTravelHub,
    getPlayerRespawnLocation,
    getTravelHubSnapshots,
    RESIDENCE_LOCATION_PROGRESS_ID,
    setCurrentTravelHubAsResidence,
    travelToHub,
    unlockCurrentTravelHub,
} from './TravelHub.js';

const START_LOCATION_ID = 'test_travel_hub_start';
const DESTINATION_LOCATION_ID = 'test_travel_hub_destination';
const REQUIRED_QUEST_ID = 'test:travel-hub-quest';

for (const location of [
    { id: START_LOCATION_ID, name: '시험 시작 거점', isRespawnLocation: true },
    { id: DESTINATION_LOCATION_ID, name: '시험 목적 거점', isRespawnLocation: false },
]) defineLocation({
    ...location,
    zoneType: 'safe',
    x: 0, y: 0, z: 0,
    npcIds: [], objects: [], connections: [], tags: [],
});

defineTravelHub({
    locationId: START_LOCATION_ID,
    unlockFee: 0,
    useFee: 100,
    unlockedByDefault: true,
});
defineTravelHub({
    locationId: DESTINATION_LOCATION_ID,
    unlockFee: 10_000,
    useFee: 500,
    prerequisiteQuestId: REQUIRED_QUEST_ID,
    prerequisiteLabel: '시험 중계소 복구',
});

function createPlayer(options: { gold?: number; completedQuest?: boolean } = {}): Player {
    const completed = new Set(options.completedQuest ? [REQUIRED_QUEST_ID] : []);
    return {
        userId: 1,
        locationId: DESTINATION_LOCATION_ID,
        gold: options.gold ?? 0,
        progress: PlayerProgress.createEmpty(1),
        quests: { isCompleted: (id: string) => completed.has(id) },
        isDead: false,
        moving: false,
        currentTarget: {},
        canPerformAction: () => true,
    } as unknown as Player;
}

test('지역 퀘스트와 큰 해금 비용을 모두 충족해야 중계소가 영구 해금된다', () => {
    const player = createPlayer({ gold: 20_000 });

    const questDenied = unlockCurrentTravelHub(player);
    assert.equal(questDenied.code, 'quest-required');
    assert.equal(player.gold, 20_000);

    const qualified = createPlayer({ gold: 9_999, completedQuest: true });
    const goldDenied = unlockCurrentTravelHub(qualified);
    assert.equal(goldDenied.code, 'gold-required');
    assert.equal(qualified.gold, 9_999);

    qualified.gold = 20_000;
    const result = unlockCurrentTravelHub(qualified);
    assert.equal(result.success, true);
    assert.equal(result.goldSpent, 10_000);
    assert.equal(qualified.gold, 10_000);
    assert.equal(getTravelHubSnapshots(qualified).find(hub => hub.locationId === DESTINATION_LOCATION_ID)?.unlocked, true);
});

test('해금한 중계소끼리만 목적지 사용료를 내고 순간이동한다', () => {
    const locked = createPlayer({ gold: 20_000, completedQuest: true });
    const lockedResult = travelToHub(locked, '시험 시작 거점');
    assert.equal(lockedResult.success, false);
    assert.match(lockedResult.reason ?? '', /현재 장소.*먼저 해금/);

    const player = createPlayer({ gold: 20_000, completedQuest: true });
    assert.equal(unlockCurrentTravelHub(player).success, true);
    player.locationId = START_LOCATION_ID;
    const originalTarget = player.currentTarget;

    const result = travelToHub(player, '시험 목적 거점');

    assert.equal(result.success, true);
    assert.equal(result.goldSpent, 500);
    assert.equal(player.gold, 9_500);
    assert.equal(player.locationId, DESTINATION_LOCATION_ID);
    assert.notEqual(originalTarget, null);
    assert.equal(player.currentTarget, null);
});

test('해금한 다른 마을 중계소를 거주점으로 지정하면 사망 부활 위치가 바뀐다', () => {
    const player = createPlayer({ gold: 20_000, completedQuest: true });
    assert.equal(unlockCurrentTravelHub(player).success, true);

    const result = setCurrentTravelHubAsResidence(player);

    assert.equal(result.success, true);
    assert.equal(player.progress.getState(RESIDENCE_LOCATION_PROGRESS_ID), DESTINATION_LOCATION_ID);
    assert.equal(getPlayerRespawnLocation(player)?.id, DESTINATION_LOCATION_ID);
});
