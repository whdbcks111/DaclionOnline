import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import Entity from '../core/Entity.js';
import Player, {
    HOSTILE_RETURN_SCROLL_ITEM_DATA_ID,
    PlayerRuntimeProgressIds,
} from './Player.js';
import { PlayerProgress } from '../progression/Progress.js';
import Inventory from '../economy/Inventory.js';
import Equipment from '../economy/Equipment.js';
import SkillBook from '../progression/SkillBook.js';
import QuestBook from '../progression/QuestBook.js';
import { reloadAllLocations } from '../world/Location.js';
import { getKarmaDeathPenalty } from '../player/Karma.js';
import { RegionRiskPolicy } from '../world/RegionRisk.js';
import {
    defineTravelHub,
    RESIDENCE_LOCATION_PROGRESS_ID,
} from '../world/TravelHub.js';
import { initSocket } from '../../modules/infrastructure/socket.js';
import { registerOnlinePlayer, unregisterOnlinePlayer } from '../../modules/player/playerRegistry.js';
import { GameEventIds, subscribeGameEvent, type GameEvent } from '../core/GameEvent.js';
import '../../data/economy/items.js';

initSocket(createServer(), '*');

reloadAllLocations([
    {
        id: 'death-test-safe', name: '사망 테스트 안전 구역', zoneType: 'safe',
        x: 0, y: 0, z: 0, isRespawnLocation: true,
        npcIds: [], objects: [], connections: [], tags: [],
    },
    {
        id: 'death-test-neutral', name: '사망 테스트 중립 구역', zoneType: 'neutral',
        x: 1, y: 0, z: 0,
        npcIds: [], objects: [], connections: [], tags: [],
    },
    {
        id: 'death-test-hostile', name: '사망 테스트 적대 구역', zoneType: 'hostile',
        x: 2, y: 0, z: 0,
        npcIds: [], objects: [], connections: [], tags: [],
    },
]);

defineTravelHub({
    locationId: 'death-test-neutral',
    unlockFee: 0,
    useFee: 0,
    unlockedByDefault: true,
});

let nextPlayerId = 20_000;

function createLivePlayer(
    locationId: string,
    options: { scrolls?: number; storedDeadline?: number; life?: number } = {},
): Player {
    const playerId = nextPlayerId++;
    const inventory = Inventory.createEmpty(playerId, 1_000);
    const scrollCount = options.scrolls ?? 0;
    if (scrollCount > 0) {
        assert.equal(inventory.addItem(HOSTILE_RETURN_SCROLL_ITEM_DATA_ID, scrollCount), true);
    }
    const progress = PlayerProgress.createEmpty(playerId);
    if (options.storedDeadline !== undefined) {
        progress.setState(PlayerRuntimeProgressIds.DEATH_EXPIRES_AT, String(options.storedDeadline));
    }
    return Reflect.construct(Player, [
        playerId,
        `사망테스트${playerId}`,
        50,
        0,
        locationId,
        1_000,
        inventory,
        Equipment.createEmpty(),
        progress,
        SkillBook.createEmpty(playerId),
        QuestBook.createEmpty(playerId),
        undefined,
        options.life,
    ]) as Player;
}

function countReturnScrolls(player: Player): number {
    return player.inventory.countMatching(item => item.itemDataId === HOSTILE_RETURN_SCROLL_ITEM_DATA_ID);
}

function createDeathShell(storedRemaining = '', storedDeadline = ''): Player {
    const player = Object.create(Player.prototype) as Player;
    const shell = player as unknown as Record<string, unknown>;
    shell._level = 20;
    shell._locationId = 'missing:test-location';
    shell._life = 0;
    player.isDead = false;
    player.deathTimer = 0;
    shell._deathExpiresAtMs = 0;
    shell._deathNotifTimer = 99;
    shell.progress = PlayerProgress.createEmpty(9_901);
    if (storedRemaining) {
        player.progress.setState(PlayerRuntimeProgressIds.DEATH_REMAINING, storedRemaining);
    }
    if (storedDeadline) {
        player.progress.setState(PlayerRuntimeProgressIds.DEATH_EXPIRES_AT, storedDeadline);
    }
    return player;
}

test('절대 부활 시각은 로그아웃 경과시간을 차감해 복원하고 onDeath를 반복하지 않는다', () => {
    const savedAt = 1_000_000;
    const player = createDeathShell('', String(savedAt + 17_250));
    let repeatedDeaths = 0;
    Object.defineProperty(player, 'onDeath', { value: () => { repeatedDeaths++; } });

    assert.equal(player.restorePersistedDeathState(savedAt + 7_250), true);
    assert.equal(player.isDead, true);
    assert.equal(player.deathTimer, 10);

    Entity.prototype.lateUpdate.call(player, 0.05);
    assert.equal(repeatedDeaths, 0);
});

test('구버전의 life=0 저장도 이미 처리된 사망으로 간주해 패널티 중복 경로를 막는다', () => {
    const player = createDeathShell();

    assert.equal(player.restorePersistedDeathState(5_000), true);
    assert.equal(player.isDead, true);
    assert.equal(player.deathTimer, 30);
    assert.equal(player.progress.getState(PlayerRuntimeProgressIds.DEATH_REMAINING), '');
    assert.equal(player.progress.getState(PlayerRuntimeProgressIds.DEATH_EXPIRES_AT), '35000');
});

test('로그아웃 중 부활 시각이 지나면 로그인 복원 단계에서 즉시 부활한다', () => {
    const player = createDeathShell('', '12000');
    let silentRespawns = 0;
    Object.defineProperty(player, 'completeRespawn', {
        value: (notify: boolean) => {
            assert.equal(notify, false);
            silentRespawns++;
            player.isDead = false;
            player.deathTimer = 0;
            player.progress.reset(PlayerRuntimeProgressIds.DEATH_EXPIRES_AT);
        },
    });

    assert.equal(player.restorePersistedDeathState(20_000), false);
    assert.equal(silentRespawns, 1);
    assert.equal(player.isDead, false);
    assert.equal(player.progress.getState(PlayerRuntimeProgressIds.DEATH_EXPIRES_AT), '');
});

test('살아 있는 플레이어에 남은 오래된 사망 상태는 제거한다', () => {
    const player = createDeathShell('12.000', '50000');
    (player as unknown as { _life: number })._life = 50;

    assert.equal(player.restorePersistedDeathState(), false);
    assert.equal(player.isDead, false);
    assert.equal(player.progress.getState(PlayerRuntimeProgressIds.DEATH_REMAINING), '');
    assert.equal(player.progress.getState(PlayerRuntimeProgressIds.DEATH_EXPIRES_AT), '');
});

test('적대 구역 사망은 두루마리 하나를 자동 소모하고 최종 부활 대기와 저장 만료 시각을 절반으로 줄인다', () => {
    const player = createLivePlayer('death-test-hostile', { scrolls: 2 });
    const originalDuration = RegionRiskPolicy.HOSTILE.calculateRespawnDuration(300);
    const before = Date.now();

    player.onDeath();

    const after = Date.now();
    assert.equal(player.deathTimer, originalDuration / 2);
    assert.equal(countReturnScrolls(player), 1);
    const deadline = Number(player.progress.getState(PlayerRuntimeProgressIds.DEATH_EXPIRES_AT));
    assert.ok(deadline >= before + originalDuration * 500);
    assert.ok(deadline <= after + originalDuration * 500);
});

test('적대 귀환 두루마리는 지역 배율과 악명 가산까지 끝난 총 부활 대기시간을 절반으로 줄인다', () => {
    const player = createLivePlayer('death-test-hostile', { scrolls: 1 });
    player.setKarma(100, 'test', Date.now());
    const originalDuration = RegionRiskPolicy.HOSTILE.calculateRespawnDuration(300)
        + getKarmaDeathPenalty(100).respawnSeconds;

    player.onDeath();

    assert.equal(player.deathTimer, originalDuration / 2);
    assert.equal(countReturnScrolls(player), 0);
});

test('안전·중립 구역이나 두루마리가 없는 적대 구역에서는 부활 대기와 인벤토리가 바뀌지 않는다', () => {
    for (const [locationId, policy] of [
        ['death-test-safe', RegionRiskPolicy.SAFE],
        ['death-test-neutral', RegionRiskPolicy.NEUTRAL],
    ] as const) {
        const player = createLivePlayer(locationId, { scrolls: 1 });
        player.onDeath();
        assert.equal(player.deathTimer, policy.calculateRespawnDuration(300), locationId);
        assert.equal(countReturnScrolls(player), 1, locationId);
    }

    const noItemPlayer = createLivePlayer('death-test-hostile');
    noItemPlayer.onDeath();
    assert.equal(noItemPlayer.deathTimer, RegionRiskPolicy.HOSTILE.calculateRespawnDuration(300));
    assert.equal(countReturnScrolls(noItemPlayer), 0);
});

test('중복 onDeath 호출과 저장된 사망 상태 복원은 적대 귀환 두루마리를 추가로 소모하지 않는다', () => {
    const player = createLivePlayer('death-test-hostile', { scrolls: 2 });
    player.onDeath();
    const firstDeadline = player.progress.getState(PlayerRuntimeProgressIds.DEATH_EXPIRES_AT);

    player.onDeath();

    assert.equal(countReturnScrolls(player), 1);
    assert.equal(player.progress.getState(PlayerRuntimeProgressIds.DEATH_EXPIRES_AT), firstDeadline);

    const reconnectDeadline = Date.now() + 90_000;
    const restored = createLivePlayer('death-test-hostile', {
        scrolls: 2,
        storedDeadline: reconnectDeadline,
        life: 0,
    });
    assert.equal(restored.isDead, true);
    assert.equal(countReturnScrolls(restored), 2);
    assert.ok(restored.deathTimer > 89 && restored.deathTimer <= 90);
});

test('선택한 다른 마을 거주점은 기본 광장 대신 실제 부활 위치로 사용된다', () => {
    const player = createLivePlayer('death-test-hostile');
    player.progress.setState(RESIDENCE_LOCATION_PROGRESS_ID, 'death-test-neutral');

    player.respawn();

    assert.equal(player.locationId, 'death-test-neutral');
});

test('복원된 DoT의 actorPlayerId는 온라인 공격자의 PVP 막타로 해석된다', () => {
    const killer = createLivePlayer('death-test-neutral');
    const victim = createLivePlayer('death-test-neutral');
    let pvpKillEvent: GameEvent | undefined;
    registerOnlinePlayer(killer);
    const unsubscribe = subscribeGameEvent(GameEventIds.PVP_KILL, event => {
        if (event.subject === victim) pvpKillEvent = event;
    });
    try {
        const result = victim.damage(victim.maxLife, 'absolute', {
            type: 'poison',
            causeEntity: null,
            actorPlayerId: killer.userId,
            fixedDamage: true,
        });
        assert.ok(result.lifeDamage > 0);
        victim.lateUpdate(0.05);

        assert.equal(victim.lastLethalDamageCause?.actorPlayerId, killer.userId);
        assert.equal(pvpKillEvent?.actor, killer);
        assert.equal(pvpKillEvent?.subject, victim);
    } finally {
        unsubscribe();
        unregisterOnlinePlayer(killer.userId);
    }
});
