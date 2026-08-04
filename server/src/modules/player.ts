import logger from "../utils/logger.js";
import Player from "../models/Player.js";
import { getSessionByUserId, isUserOnline } from "./login.js";
import { getLocation } from "../models/Location.js";
import type Location from "../models/Location.js";
import type {
    LocationCapabilityData,
    LocationInfoData,
    LocationObjectAction,
} from "../../../shared/types.js";
import { cancelCrafting } from "../models/Crafting.js";
import {
    getOnlinePlayer,
    getOnlinePlayerSnapshot,
    registerOnlinePlayer,
    unregisterOnlinePlayer,
} from "./playerRegistry.js";
import { DialogueEndReason, endNpcDialogue } from "../models/NpcDialogue.js";
import { parseChatMessage } from "../utils/chatParser.js";
import { partyManager } from './party.js';
import { clearInformationMode } from './informationVisibility.js';
import { cancelFishing, isFishing } from './fishing.js';
import { clearUserSnapshotStreams, publishUserSnapshot } from './stateSync.js';
import { clearDungeonPuzzleSession } from '../models/DungeonPuzzle.js';
import { migrateLegacyBlacksmithProfession } from './forging.js';
import { tradeManager } from './trade.js';
import { cancelNavigation } from './navigation.js';
import { initializeTutorialSession } from './tutorial.js';
import { detachHumanVerification, initializeHumanVerification } from './humanVerification.js';
import Monster from '../models/Monster.js';
import { StatType } from '../models/Stat.js';
import { createMonsterTargetAnalysis } from '../models/Inspection.js';
import { GameTags } from '../../../shared/tags.js';
import { getShop } from '../models/Shop.js';
import { cancelGameTask, scheduleGameTask } from './scheduler.js';
import { cancelMiniGame } from './minigame.js';
import { StatusEffectRemovalReason } from '../models/StatusEffect.js';
import { sendBotMessageToUser } from './message.js';

const SAVE_INTERVAL = 30_000;   // 30초
const STATS_INTERVAL = 500;  // 0.5초 (쿨타임 표시 정확도)
export const PLAYER_RECONNECT_GRACE_SECONDS = 10;
const unloadingPlayers = new Map<number, Promise<void>>();
const loadingPlayers = new Map<number, Promise<Player>>();
const reconnectGracePlayers = new Map<number, { player: Player; disconnectedAtMs: number }>();
const pendingReconnectGraceStartedAt = new Map<number, number>();

function reconnectGraceTaskKey(userId: number): string {
    return `player:reconnect-grace:${userId}`;
}

function elapseRetainedPlayerTo(
    retained: { player: Player; disconnectedAtMs: number },
    nowMs: number,
): void {
    retained.player.elapseWallClockStatusEffects(
        Math.max(0, nowMs - retained.disconnectedAtMs) / 1_000,
    );
    // unload 저장 중 실제 연결이 돌아오면 그 대기 시간만 이어서 차감하고,
    // 이미 반영한 유예 구간을 resume에서 다시 차감하지 않는다.
    retained.disconnectedAtMs = nowMs;
}

function scheduleReconnectGraceExpiry(userId: number, disconnectedAtMs: number, nowMs: number): void {
    const elapsedSeconds = Math.max(0, nowMs - disconnectedAtMs) / 1_000;
    scheduleGameTask(
        reconnectGraceTaskKey(userId),
        Math.max(0, PLAYER_RECONNECT_GRACE_SECONDS - elapsedSeconds),
        () => {
            pendingReconnectGraceStartedAt.delete(userId);
            void unloadPlayerByUserId(userId, true)
                .catch(error => logger.error(`재접속 유예 만료 Player 정리 실패: UID ${userId}`, error));
            return false;
        },
    );
}

/** 연결이 끝난 순간 중단해야 하는 상호작용만 정리하고 영속 Player aggregate는 보존한다. */
function suspendPlayerRuntime(player: Player, cancelAnyMiniGame: boolean): void {
    player.suspendWorldActivity();
    // 보호막은 비영속 전투 상태다. 마력 보호막처럼 상태효과와 한 덩어리인 효과가
    // 새로고침 뒤 절반만 남지 않도록 둘 다 같은 경계에서 제거한다.
    player.clearShields();
    endNpcDialogue(player, DialogueEndReason.UNLOADED, false);
    cancelCrafting(player);
    if (isFishing(player.userId)) cancelFishing(player.userId, '접속 종료로 낚시가 취소되었습니다.');
    else if (cancelAnyMiniGame) cancelMiniGame(player.userId, '접속 종료로 미니게임이 취소되었습니다.');
    cancelNavigation(player, false);
    void import('./alchemy.js').then(({ clearAlchemyDraft }) => {
        clearAlchemyDraft(player.userId, '접속이 종료되어 연금술 준비가 취소되었습니다.');
    });
    detachHumanVerification(player);
    clearDungeonPuzzleSession(player.userId);
    tradeManager.cancelForPlayer(player, '접속이 종료되어 거래가 취소되었습니다.');
    player.skills.finishAll();
    player.removeNonPersistentStatusEffects(StatusEffectRemovalReason.DISCONNECTED);
    player.markStatusEffectPersistenceDirty();
    clearUserSnapshotStreams(player.userId);
}

function retainPlayerForReconnectGrace(player: Player, disconnectedAtMs: number, nowMs: number): void {
    suspendPlayerRuntime(player, false);
    unregisterOnlinePlayer(player.userId);
    reconnectGracePlayers.set(player.userId, { player, disconnectedAtMs });
    scheduleReconnectGraceExpiry(player.userId, disconnectedAtMs, nowMs);
}

/** 같은 세션의 짧은 새로고침을 위해 Player 인스턴스를 월드 밖에 보관한다. */
export function beginPlayerReconnectGrace(userId: number, nowMs = Date.now()): boolean {
    if (isUserOnline(userId)) return false;
    const disconnectedAtMs = pendingReconnectGraceStartedAt.get(userId) ?? nowMs;
    pendingReconnectGraceStartedAt.set(userId, disconnectedAtMs);
    if (reconnectGracePlayers.has(userId)) return true;
    const player = getOnlinePlayer(userId);
    if (!player) {
        scheduleReconnectGraceExpiry(userId, disconnectedAtMs, nowMs);
        return true;
    }
    retainPlayerForReconnectGrace(player, disconnectedAtMs, nowMs);
    return true;
}

/** 유예 중 돌아온 연결에 동일 Player를 다시 붙이고 오프라인 경과 시간만 차감한다. */
export function resumePlayerFromReconnectGrace(userId: number, nowMs = Date.now()): Player | undefined {
    pendingReconnectGraceStartedAt.delete(userId);
    const retained = reconnectGracePlayers.get(userId);
    cancelGameTask(reconnectGraceTaskKey(userId));
    if (!retained) return undefined;
    elapseRetainedPlayerTo(retained, nowMs);
    reconnectGracePlayers.delete(userId);
    retained.player.resumeWorldActivity();
    registerOnlinePlayer(retained.player);
    return retained.player;
}

export function isPlayerInReconnectGrace(userId: number): boolean {
    return reconnectGracePlayers.has(userId) || pendingReconnectGraceStartedAt.has(userId);
}

/** 현재 장소에서 실제 사용할 수 있는 생활·시설 기능의 HUD 표시 단일 원본. */
class LocationCapability {
    private static readonly all: LocationCapability[] = [];

    static readonly FISHING = new LocationCapability(
        'fishing',
        '낚시 가능',
        'map/fishing-spot',
        location => location.hasTag(GameTags.LOCATION_FISHING),
    );

    static readonly SHOP = new LocationCapability(
        'shop',
        '상점 이용 가능',
        'map/general-shop',
        (location, player) => {
            const shop = location.data.shopId ? getShop(location.data.shopId) : undefined;
            return Boolean(shop && !shop.getAccessDeniedReason(player));
        },
    );

    private constructor(
        readonly key: LocationCapabilityData['key'],
        readonly label: string,
        readonly icon: string,
        readonly isAvailable: (location: Location, player: Player) => boolean,
    ) {
        LocationCapability.all.push(this);
    }

    static values(): readonly LocationCapability[] {
        return [...LocationCapability.all];
    }

    static fromKey(key: string): LocationCapability | undefined {
        return LocationCapability.all.find(capability => capability.key === key.trim().toLowerCase());
    }

    static getAvailable(location: Location, player: Player): LocationCapabilityData[] {
        return LocationCapability.values()
            .filter(capability => capability.isAvailable(location, player))
            .map(({ key, label, icon }) => ({ key, label, icon }));
    }
}

/** 로그인 시 호출: DB에서 로드하여 메모리에 올림 */
export async function loadPlayerByUserId(userId: number): Promise<Player> {
    const unloading = unloadingPlayers.get(userId);
    if (unloading) await unloading;
    const existing = (isUserOnline(userId) ? resumePlayerFromReconnectGrace(userId) : undefined)
        ?? getOnlinePlayer(userId);
    if (existing) {
        initializeTutorialSession(existing, { newPlayer: false, showCard: false });
        initializeHumanVerification(existing);
        return existing;
    }

    let operation = loadingPlayers.get(userId);
    if (!operation) {
        operation = (async () => {
            let player = await Player.loadByUserId(userId);
            const newPlayer = player === null;
            if (!player) player = await Player.create(userId);

            if (migrateLegacyBlacksmithProfession(player)) await player.save();

            registerOnlinePlayer(player);
            initializeTutorialSession(player, { newPlayer, showCard: !newPlayer });
            initializeHumanVerification(player);
            // DB 로드 중 마지막 socket이 먼저 끝난 경우에도 완료된 Player를 월드에 유령으로 남기지 않는다.
            if (!isUserOnline(userId)) {
                const nowMs = Date.now();
                const disconnectedAtMs = pendingReconnectGraceStartedAt.get(userId);
                if (disconnectedAtMs !== undefined
                    && nowMs - disconnectedAtMs < PLAYER_RECONNECT_GRACE_SECONDS * 1_000) {
                    retainPlayerForReconnectGrace(player, disconnectedAtMs, nowMs);
                } else {
                    pendingReconnectGraceStartedAt.delete(userId);
                    cancelGameTask(reconnectGraceTaskKey(userId));
                    suspendPlayerRuntime(player, true);
                    unregisterOnlinePlayer(userId);
                    await player.save();
                }
            }
            return player;
        })();
        loadingPlayers.set(userId, operation);
    }
    let loaded: Player;
    try {
        loaded = await operation;
    } finally {
        if (loadingPlayers.get(userId) === operation) loadingPlayers.delete(userId);
    }
    if (!isUserOnline(userId)) return loaded;
    const resumed = resumePlayerFromReconnectGrace(userId) ?? getOnlinePlayer(userId);
    if (resumed) return resumed;
    loaded.resumeWorldActivity();
    registerOnlinePlayer(loaded);
    initializeTutorialSession(loaded, { newPlayer: false, showCard: false });
    initializeHumanVerification(loaded);
    return loaded;
}

/** 명시적 로그아웃·보안 폐기·유예 만료·종료 시 저장 후 메모리에서 제거한다. */
export async function unloadPlayerByUserId(userId: number, requireOffline = false): Promise<void> {
    const inProgress = unloadingPlayers.get(userId);
    if (inProgress) return inProgress;
    if (requireOffline && isUserOnline(userId)) return;
    const loading = loadingPlayers.get(userId);
    if (loading) await loading;
    const startedWhileLoading = unloadingPlayers.get(userId);
    if (startedWhileLoading) return startedWhileLoading;
    if (requireOffline && isUserOnline(userId)) return;
    const retained = reconnectGracePlayers.get(userId);
    const player = getOnlinePlayer(userId) ?? retained?.player;
    if (!player) {
        pendingReconnectGraceStartedAt.delete(userId);
        cancelGameTask(reconnectGraceTaskKey(userId));
        return;
    }
    cancelGameTask(reconnectGraceTaskKey(userId));
    const operation = (async () => {
        if (retained) elapseRetainedPlayerTo(retained, Date.now());
        suspendPlayerRuntime(player, true);
        const partyResult = partyManager.removeDisconnectedPlayer(player);
        for (const affectedUserId of partyResult?.affectedUserIds ?? []) {
            if (affectedUserId === userId || !isUserOnline(affectedUserId)) continue;
            sendBotMessageToUser(
                affectedUserId,
                `${player.name}님이 접속을 종료해 파티에서 나갔습니다.`,
            );
        }
        clearInformationMode(userId);
        await player.save();
        if (requireOffline && isUserOnline(userId)) return;
        pendingReconnectGraceStartedAt.delete(userId);
        reconnectGracePlayers.delete(userId);
        unregisterOnlinePlayer(player.userId);
    })();
    unloadingPlayers.set(userId, operation);
    try {
        await operation;
    } finally {
        if (unloadingPlayers.get(userId) === operation) unloadingPlayers.delete(userId);
    }
}

/** 온라인 플레이어 조회 (메모리) */
export function getPlayerByUserId(userId: number): Player | undefined {
    if (unloadingPlayers.has(userId)) return undefined;
    return getOnlinePlayer(userId);
}

/** 온라인 플레이어 목록 반환 */
export function getOnlinePlayers(): Player[] {
    return getOnlinePlayerSnapshot().filter(player => isUserOnline(player.userId));
}

/** 오프라인 플레이어 조회 (DB에서 직접 로드, 메모리에 올리지 않음) */
export async function fetchPlayerByUserId(userId: number): Promise<Player | null> {
    const online = getOnlinePlayer(userId);
    if (online) return online;
    const retained = reconnectGracePlayers.get(userId);
    if (retained) {
        elapseRetainedPlayerTo(retained, Date.now());
        return retained.player;
    }
    const player = await Player.loadByUserId(userId);
    if (player && migrateLegacyBlacksmithProfession(player)) await player.save();
    return player;
}

/** 모든 온라인 플레이어 저장 */
export async function saveAllPlayers(): Promise<void> {
    const promises: Promise<void>[] = [];
    const players = new Map<number, Player>();
    for (const player of getOnlinePlayerSnapshot()) players.set(player.userId, player);
    const nowMs = Date.now();
    for (const retained of reconnectGracePlayers.values()) {
        elapseRetainedPlayerTo(retained, nowMs);
        players.set(retained.player.userId, retained.player);
    }
    for (const player of players.values()) {
        if (tradeManager.hasActiveSession(player.userId)) continue;
        promises.push(player.save());
    }
    await Promise.all(promises);
}

/** 서버 종료는 재접속 유예를 기다리지 않고 모든 보존 Player를 정리·저장한다. */
export async function shutdownAllPlayers(): Promise<void> {
    await Promise.allSettled([...loadingPlayers.values()]);
    const userIds = new Set<number>([
        ...getOnlinePlayerSnapshot().map(player => player.userId),
        ...reconnectGracePlayers.keys(),
    ]);
    await Promise.all([...userIds].map(userId => unloadPlayerByUserId(userId, false)));
}

/** 특정 유저의 플레이어 HUD 데이터를 해당 유저 소켓에 전송 */
export function sendPlayerStats(userId: number): void {
    const player = getOnlinePlayer(userId);
    if (!player) return;
    const targetEntity = player.getCurrentTarget();
    const rawTarget = player.getCurrentTargetDisplaySnapshot();
    const target = rawTarget?.userId !== undefined && !getOnlinePlayer(rawTarget.userId)
        ? null
        : rawTarget
            ? {
                ...rawTarget,
                kind: targetEntity instanceof Monster
                    ? 'monster' as const
                    : targetEntity?.isPlayer
                        ? 'player' as const
                        : 'object' as const,
                statusEffects: rawTarget.statusEffects.map(effect => ({
                    ...effect,
                    description: parseChatMessage(effect.description),
                })),
                ...(targetEntity instanceof Monster ? {
                    monsterAnalysis: createMonsterTargetAnalysis(
                        targetEntity,
                        player.stat.get(StatType.SENSIBILITY),
                    ),
                } : {}),
            }
            : null;

    const data = {
        userId:            player.userId,
        nickname:          getSessionByUserId(userId)?.nickname ?? '',
        musicCombatState:  player.musicCombatState.key,
        equippedTitle:     player.titles.equippedName || undefined,
        level:             player.level,
        exp:               player.exp,
        maxExp:            player.maxExp,
        life:              player.life,
        maxLife:           player.maxLife,
        shields:           player.getShieldBarSegments(),
        mentality:         player.mentality,
        maxMentality:      player.maxMentality,
        thirsty:           player.thirsty,
        maxThirsty:        player.maxThirsty,
        hungry:            player.hungry,
        maxHungry:         player.maxHungry,
        attackCooldown:    player.attackCooldown,
        maxAttackCooldown: player.maxAttackCooldown,
        autoAttackEnabled: player.autoAttackEnabled,
        skills:             player.skills.getHudSnapshots(),
        usableItems:        player.inventory.getUsableItemHudSnapshots(),
        equipmentDurability: player.equipment.getDurabilityHudSnapshots(),
        statusEffects:     player.getStatusEffectDisplaySnapshots().map(effect => ({
            ...effect,
            description: parseChatMessage(effect.description),
        })),
        target,
        party:             partyManager.getHudData(player),
    };

    publishUserSnapshot(userId, 'playerStats', data, (socket, payload) => socket.emit('playerStats', payload));
}

/** 특정 유저의 위치 정보(몬스터·플레이어 목록)를 해당 유저 소켓에 전송 */
export function sendLocationInfo(userId: number): void {
    const player = getOnlinePlayer(userId);
    if (!player) return;

    const location = getLocation(player.locationId);
    if (!location) return;

    const locationId = player.locationId;

    const adjacentLocations = location.getAvailableConnections(player)
        .map(connection => {
            const adj = getLocation(connection.locationId);
            if (!adj) return null;
            return {
                locationId: adj.id,
                name: adj.data.name,
                x: adj.data.x,
                y: adj.data.y,
                z: adj.data.z,
                status: connection.status,
                ...(connection.lockReason ? { lockReason: connection.lockReason } : {}),
            };
        })
        .filter((v): v is NonNullable<typeof v> => v !== null);

    const data: Omit<LocationInfoData, 'revision' | 'syncId'> = {
        locationId,
        name: location.data.name,
        ...(location.data.mapColor ? { mapColor: location.data.mapColor } : {}),
        zoneType: location.data.zoneType,
        zoneLabel: location.riskPolicy.label,
        pvpAllowed: location.riskPolicy.pvpAllowed,
        capabilities: LocationCapability.getAvailable(location, player),
        x: location.data.x,
        y: location.data.y,
        z: location.data.z,
        objects: location.getObjects().map(object => {
            const respawn = object instanceof Monster
                ? object.getRespawnDisplaySnapshot()
                : undefined;
            const icon = object.getDisplayIcon();
            const actions: LocationObjectAction[] = object.isDefeated
                ? []
                : [
                    ...(object.isInteractable ? ['interact' as const] : []),
                    ...(object.getAttackDeniedReason(player) === undefined
                        ? ['attack' as const, 'target' as const]
                        : []),
                ];
            return {
                ...(icon ? { icon } : {}),
                ...(object.hasTag(GameTags.ENTITY_BOSS) ? { isBoss: true } : {}),
                name: object.name,
                level: object.level,
                life: object.life,
                maxLife: object.maxLife,
                shields: object.getShieldBarSegments(),
                ...(respawn ? { respawn } : {}),
                actions,
            };
        }),
        npcs: location.getNpcs().map(npc => {
            const marker = player.quests.getNpcMarker(npc.id);
            return {
                name: npc.name,
                ...(npc.description ? { description: npc.description } : {}),
                ...(marker ? {
                    questMarker: {
                        key: marker.key,
                        symbol: marker.symbol,
                        label: marker.label,
                    },
                } : {}),
            };
        }),
        players: getOnlinePlayers()
            .filter(p => p.locationId === locationId)
            .map(p => ({
                name: getSessionByUserId(p.userId)?.nickname ?? '',
                level: p.level,
                life: p.life,
                maxLife: p.maxLife,
                shields: p.getShieldBarSegments(),
                userId: p.userId,
            })),
        adjacentLocations,
    };

    publishUserSnapshot(userId, 'locationInfo', data, (socket, payload) => socket.emit('locationInfo', payload));
}

/** 플레이어 모듈 초기화 */
export function initPlayer(): void {
    // 주기적 저장
    setInterval(async () => {
        try {
            await saveAllPlayers();
        } catch(e) {
            logger.error('자동 저장 중 오류:', e);
        }
    }, SAVE_INTERVAL);

    // 주기적 스탯/위치 브로드캐스트
    setInterval(() => {
        for (const player of getOnlinePlayerSnapshot()) {
            sendPlayerStats(player.userId);
            sendLocationInfo(player.userId);
        }
    }, STATS_INTERVAL);

    logger.success('플레이어 모듈 초기화 완료');
}
