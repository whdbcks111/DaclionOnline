import logger from "../utils/logger.js";
import Player from "../models/Player.js";
import { getSessionByUserId, isUserOnline } from "./login.js";
import { getLocation } from "../models/Location.js";
import type { LocationInfoData } from "../../../shared/types.js";
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

const SAVE_INTERVAL = 30_000;   // 30초
const STATS_INTERVAL = 500;  // 0.5초 (쿨타임 표시 정확도)

/** 로그인 시 호출: DB에서 로드하여 메모리에 올림 */
export async function loadPlayerByUserId(userId: number): Promise<Player> {
    const existing = getOnlinePlayer(userId);
    if (existing) return existing;

    let player = await Player.loadByUserId(userId);
    if (!player) {
        player = await Player.create(userId);
    }

    if (migrateLegacyBlacksmithProfession(player)) await player.save();

    registerOnlinePlayer(player);
    return player;
}

/** 로그아웃/연결끊김 시 호출: 저장 후 메모리에서 제거. 연결 종료 경로는 재접속 시 제거를 취소한다. */
export async function unloadPlayerByUserId(userId: number, requireOffline = false): Promise<void> {
    if (requireOffline && isUserOnline(userId)) return;
    const player = getOnlinePlayer(userId);
    if (!player) return;
    endNpcDialogue(player, DialogueEndReason.UNLOADED, false);
    cancelCrafting(player);
    cancelFishing(userId, '접속 종료로 낚시가 취소되었습니다.');
    clearDungeonPuzzleSession(userId);
    tradeManager.cancelForPlayer(player, '접속이 종료되어 거래가 취소되었습니다.');
    player.skills.finishAll();
    partyManager.removeDisconnectedPlayer(player);
    clearInformationMode(userId);
    clearUserSnapshotStreams(userId);
    await player.save();
    if (requireOffline && isUserOnline(userId)) return;
    unregisterOnlinePlayer(player.userId);
}

/** 온라인 플레이어 조회 (메모리) */
export function getPlayerByUserId(userId: number): Player | undefined {
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

    const data = {
        userId:            player.userId,
        nickname:          getSessionByUserId(userId)?.nickname ?? '',
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
        skills:             player.skills.getHudSnapshots(),
        statusEffects:     player.getStatusEffectDisplaySnapshots().map(effect => ({
            ...effect,
            description: parseChatMessage(effect.description),
        })),
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
        zoneType: location.data.zoneType,
        zoneLabel: location.riskPolicy.label,
        pvpAllowed: location.riskPolicy.pvpAllowed,
        x: location.data.x,
        y: location.data.y,
        z: location.data.z,
        objects: location.getObjects().map(object => ({
            name: object.name,
            level: object.level,
            life: object.life,
            maxLife: object.maxLife,
            shields: object.getShieldBarSegments(),
        })),
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
