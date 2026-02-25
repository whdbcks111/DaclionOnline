import logger from "../utils/logger.js";
import Player from "../models/Player.js";
import { getIO } from "./socket.js";
import { getSession, getSessionByUserId } from "./login.js";
import { getLocation } from "../models/Location.js";
import type { LocationInfoData } from "../../../shared/types.js";

const SAVE_INTERVAL = 30_000;   // 30초
const STATS_INTERVAL = 500;  // 0.5초 (쿨타임 표시 정확도)

const onlinePlayersFromUserId = new Map<number, Player>(); // userId → Player

/** 로그인 시 호출: DB에서 로드하여 메모리에 올림 */
export async function loadPlayerByUserId(userId: number): Promise<Player> {
    const existing = onlinePlayersFromUserId.get(userId);
    if (existing) return existing;

    let player = await Player.loadByUserId(userId);
    if (!player) {
        player = await Player.create(userId);
    }

    onlinePlayersFromUserId.set(player.userId, player);
    return player;
}

/** 로그아웃/연결끊김 시 호출: 저장 후 메모리에서 제거 */
export async function unloadPlayerByUserId(userId: number): Promise<void> {
    const player = onlinePlayersFromUserId.get(userId);
    if (!player) return;
    await player.save();
    onlinePlayersFromUserId.delete(player.userId);
}

/** 온라인 플레이어 조회 (메모리) */
export function getPlayerByUserId(userId: number): Player | undefined {
    return onlinePlayersFromUserId.get(userId);
}

/** 온라인 플레이어 목록 반환 */
export function getOnlinePlayers(): Player[] {
    return Array.from(onlinePlayersFromUserId.values());
}

/** 오프라인 플레이어 조회 (DB에서 직접 로드, 메모리에 올리지 않음) */
export async function fetchPlayerByUserId(userId: number): Promise<Player | null> {
    const online = onlinePlayersFromUserId.get(userId);
    if (online) return online;
    return Player.loadByUserId(userId);
}

/** 모든 온라인 플레이어 저장 */
export async function saveAllPlayers(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const player of onlinePlayersFromUserId.values()) {
        promises.push(player.save());
    }
    await Promise.all(promises);
}

/** 특정 유저의 플레이어 HUD 데이터를 해당 유저 소켓에 전송 */
export function sendPlayerStats(userId: number): void {
    const player = onlinePlayersFromUserId.get(userId);
    if (!player) return;

    const data = {
        userId:            player.userId,
        nickname:          getSessionByUserId(userId)?.nickname ?? '',
        life:              player.life,
        maxLife:           player.maxLife,
        mentality:         player.mentality,
        maxMentality:      player.maxMentality,
        thirsty:           player.thirsty,
        maxThirsty:        player.maxThirsty,
        hungry:            player.hungry,
        maxHungry:         player.maxHungry,
        attackCooldown:    player.attackCooldown,
        maxAttackCooldown: player.maxAttackCooldown,
    };

    const io = getIO();
    for (const [, socket] of io.sockets.sockets) {
        if (socket.data.sessionToken && getSession(socket.data.sessionToken)?.userId === userId) {
            socket.emit('playerStats', data);
        }
    }
}

/** 특정 유저의 위치 정보(몬스터·플레이어 목록)를 해당 유저 소켓에 전송 */
export function sendLocationInfo(userId: number): void {
    const player = onlinePlayersFromUserId.get(userId);
    if (!player) return;

    const location = getLocation(player.locationId);
    if (!location) return;

    const locationId = player.locationId;
    const data: LocationInfoData = {
        locationId,
        name: location.data.name,
        x: location.data.x,
        y: location.data.y,
        z: location.data.z,
        monsters: location.monsters.map(m => ({
            name: m.name,
            level: m.level,
            life: m.life,
            maxLife: m.maxLife,
        })),
        players: getOnlinePlayers()
            .filter(p => p.locationId === locationId)
            .map(p => ({
                name: getSessionByUserId(p.userId)?.nickname ?? '',
                level: p.level,
                life: p.life,
                maxLife: p.maxLife,
                userId: p.userId,
            })),
    };

    const io = getIO();
    for (const [, socket] of io.sockets.sockets) {
        if (socket.data.sessionToken && getSession(socket.data.sessionToken)?.userId === userId) {
            socket.emit('locationInfo', data);
        }
    }
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
        for (const userId of onlinePlayersFromUserId.keys()) {
            sendPlayerStats(userId);
            sendLocationInfo(userId);
        }
    }, STATS_INTERVAL);

    logger.success('플레이어 모듈 초기화 완료');
}
