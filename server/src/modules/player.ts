import logger from "../utils/logger.js";
import Player from "../models/Player.js";
import { registerCommand } from "./bot.js";
import { sendBotMessage } from "./message.js";
import { chat } from "../utils/chatBuilder.js";
import prisma from "../config/prisma.js";

const SAVE_INTERVAL = 30_000; // 30초

const onlinePlayers = new Map<number, Player>(); // userId → Player

/** 로그인 시 호출: DB에서 로드하여 메모리에 올림 */
export async function loadPlayer(userId: number): Promise<Player> {
    const existing = onlinePlayers.get(userId);
    if (existing) return existing;

    let player = await Player.load(userId);
    if (!player) {
        player = await Player.create(userId);
    }

    onlinePlayers.set(userId, player);
    return player;
}

/** 로그아웃/연결끊김 시 호출: 저장 후 메모리에서 제거 */
export async function unloadPlayer(userId: number): Promise<void> {
    const player = onlinePlayers.get(userId);
    if (!player) return;
    await player.save();
    onlinePlayers.delete(userId);
}

/** 온라인 플레이어 조회 (메모리) */
export function getPlayer(userId: number): Player | undefined {
    return onlinePlayers.get(userId);
}

/** 온라인 플레이어 목록 반환 */
export function getOnlinePlayers(): Player[] {
    return Array.from(onlinePlayers.values());
}

/** 오프라인 플레이어 조회 (DB에서 직접 로드, 메모리에 올리지 않음) */
export async function fetchPlayer(userId: number): Promise<Player | null> {
    const online = onlinePlayers.get(userId);
    if (online) return online;
    return Player.load(userId);
}

/** 모든 온라인 플레이어 저장 */
export async function saveAllPlayers(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const player of onlinePlayers.values()) {
        promises.push(player.save());
    }
    await Promise.all(promises);
}

/** 플레이어 모듈 초기화 */
export function initPlayer(): void {
    // 주기적 저장
    setInterval(async () => {
        await saveAllPlayers();
    }, SAVE_INTERVAL);

    registerCommand({
        name: '상태창',
        aliases: ['status', 's'],
        description: '플레이어 정보를 확인합니다.',
        async handler(userId, args, raw) {
            const player = getPlayer(userId);
            if(!player) return;

            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { nickname: true, permission: true },
            });
            if(!user) return;
            
            sendBotMessage(
                chat()
                    .text('[ 상태창 ]\n')
                    .hide('보기', b => 
                        b.color('yellow', b => b.text('유저 아이디'))
                        .text(` ${userId}\n`)
                        .color('yellow', b => b.text('닉네임'))
                        .text(` ${user.nickname}\n`)
                        .color('yellow', b => b.text('레벨'))
                        .text(` ${player.level}\n`)
                        .color('yellow', b => b.text('경험치'))
                        .text(` ${player.exp}\n`)
                    )
                    .build()
            )
        },
    })

    logger.success('플레이어 모듈 초기화 완료');
}
