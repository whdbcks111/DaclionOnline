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
import { cancelFishing } from './fishing.js';
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

const SAVE_INTERVAL = 30_000;   // 30초
const STATS_INTERVAL = 500;  // 0.5초 (쿨타임 표시 정확도)
const unloadingPlayers = new Map<number, Promise<void>>();

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
    const existing = getOnlinePlayer(userId);
    if (existing) {
        initializeTutorialSession(existing, { newPlayer: false, showCard: false });
        return existing;
    }

    let player = await Player.loadByUserId(userId);
    const newPlayer = player === null;
    if (!player) {
        player = await Player.create(userId);
    }

    if (migrateLegacyBlacksmithProfession(player)) await player.save();

    registerOnlinePlayer(player);
    initializeTutorialSession(player, { newPlayer, showCard: !newPlayer });
    initializeHumanVerification(player);
    return player;
}

/** 로그아웃/연결끊김 시 호출: 저장 후 메모리에서 제거. 연결 종료 경로는 재접속 시 제거를 취소한다. */
export async function unloadPlayerByUserId(userId: number, requireOffline = false): Promise<void> {
    const inProgress = unloadingPlayers.get(userId);
    if (inProgress) return inProgress;
    if (requireOffline && isUserOnline(userId)) return;
    const player = getOnlinePlayer(userId);
    if (!player) return;
    const operation = (async () => {
        endNpcDialogue(player, DialogueEndReason.UNLOADED, false);
        cancelCrafting(player);
        cancelFishing(userId, '접속 종료로 낚시가 취소되었습니다.');
        cancelNavigation(player, false);
        const { clearAlchemyDraft } = await import('./alchemy.js');
        clearAlchemyDraft(userId, '접속이 종료되어 연금술 준비가 취소되었습니다.');
        detachHumanVerification(player);
        clearDungeonPuzzleSession(userId);
        tradeManager.cancelForPlayer(player, '접속이 종료되어 거래가 취소되었습니다.');
        player.skills.finishAll();
        partyManager.removeDisconnectedPlayer(player);
        clearInformationMode(userId);
        clearUserSnapshotStreams(userId);
        await player.save();
        if (requireOffline && isUserOnline(userId)) return;
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
    const player = await Player.loadByUserId(userId);
    if (player && migrateLegacyBlacksmithProfession(player)) await player.save();
    return player;
}

/** 모든 온라인 플레이어 저장 */
export async function saveAllPlayers(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const player of getOnlinePlayerSnapshot()) {
        if (tradeManager.hasActiveSession(player.userId)) continue;
        promises.push(player.save());
    }
    await Promise.all(promises);
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
