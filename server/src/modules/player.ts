import logger from "../utils/logger.js";
import Player from "../models/Player.js";
import { registerCommand } from "./bot.js";
import { sendBotMessageToChannel, sendBotMessageFiltered, sendBotMessageToUser } from "./message.js";
import { getUserChannel } from "./channel.js";
import { chat } from "../utils/chatBuilder.js";
import prisma from "../config/prisma.js";
import { getLocation } from "../models/Location.js";
import { getIO } from "./socket.js";
import { getSession } from "./login.js";

const SAVE_INTERVAL = 30_000;   // 30초
const STATS_INTERVAL = 3_000;  // 3초

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

/** 특정 유저의 HP/MP 상태를 해당 유저 소켓에 전송 */
export function sendPlayerStats(userId: number): void {
    const player = onlinePlayers.get(userId);
    if (!player) return;

    const data = {
        hp: player.attribute.getBase('hp'),
        maxHp: player.attribute.get('hp'),
        mp: player.attribute.getBase('mp'),
        maxMp: player.attribute.get('mp'),
    };

    const io = getIO();
    for (const [, socket] of io.sockets.sockets) {
        const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
        if (session?.userId === userId) {
            socket.emit('playerStats', data);
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

    // 주기적 HP/MP 브로드캐스트
    setInterval(() => {
        for (const userId of onlinePlayers.keys()) {
            sendPlayerStats(userId);
        }
    }, STATS_INTERVAL);

    registerCommand({
        name: '상태창',
        aliases: ['status', 's'],
        args: [
            { name: '공개/비공개', description: '공개 여부를 결정합니다.' }
        ],
        description: '플레이어 정보를 확인합니다.',
        async handler(userId, args) {
            try {
                const player = getPlayer(userId);
                if (!player) return;

                const user = await prisma.user.findUnique({
                    where: { id: userId },
                    select: { nickname: true, permission: true },
                });
                if (!user) return;

                const location = getLocation(player.locationId);
                const attr = player.attribute.computed;
                const stats = player.stat.points;

                const EXP_TO_NEXT = player.level * 100;
                const expRatio = Math.min(1, player.exp / EXP_TO_NEXT);
                const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(2);

                const L = 80;  // 라벨 너비
                const V = 50;  // 값 너비

                const chatNode = chat()
                    .text('[ 상태창 ]  ')
                    .color('yellow', b => b.text(user.nickname))
                    .text('  Lv.')
                    .color('lime', b => b.text(String(player.level)))
                    .text('\n')
                    .hide('상세 보기', b =>
                        b
                        // ── 기본 정보 ──
                        .color('gray', b2 => b2.text('─── 기본 정보 ───\n'))
                        .color('yellow', b => b.text(user.nickname))
                        .text('  Lv.')
                        .color('lime', b => b.text(String(player.level)))
                        .text('\n')
                        .color('yellow', b2 => b2.text('위치'))
                        .text(` ${location?.data.name ?? '???'}  `)
                        .color(player.moving ? 'gold' : 'gray', b2 => b2.text(player.moving ? '이동 중' : '대기 중'))
                        .text('\n')
                        // ── 경험치 ──
                        .color('gray', b2 => b2.text('─── 경험치 ───\n'))
                        .color('yellow', b2 => b2.text('EXP'))
                        .text('  ')
                        .progress({ value: expRatio, length: 120, color: '#a855f7', thickness: 8 })
                        .text(`  ${player.exp} / ${EXP_TO_NEXT}\n`)
                        // ── 스탯 ──
                        .color('gray', b2 => b2.text('─── 스탯 ───\n'))
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('근력'))).tab(V, b2 => b2.text(String(stats.strength)))
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('민첩'))).tab(V, b2 => b2.text(String(stats.agility)))
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('체력'))).text(`${stats.vitality}\n`)
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('감각'))).tab(V, b2 => b2.text(String(stats.sensibility)))
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('정신력'))).text(`${stats.mentality}\n`)
                        // ── 능력치 ──
                        .color('gray', b2 => b2.text('─── 능력치 ───\n'))
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('공격력'))).tab(V, b2 => b2.text(fmt(attr.atk)))
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('마법력'))).text(`${fmt(attr.mentality)}\n`)
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('방어력'))).tab(V, b2 => b2.text(fmt(attr.def)))
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('마법저항'))).text(`${fmt(attr.magicDef)}\n`)
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('방어관통'))).tab(V, b2 => b2.text(fmt(attr.armorPen)))
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('마법관통'))).text(`${fmt(attr.magicPen)}\n`)
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('이동속도'))).tab(V, b2 => b2.text(fmt(attr.speed)))
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('공격속도'))).text(`${fmt(attr.attackSpeed)}\n`)
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('치명타율'))).tab(V, b2 => b2.text(`${(attr.critRate * 100).toFixed(1)}%`))
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('치명타피해'))).text(`${(attr.critDmg * 100).toFixed(0)}%\n`)
                    )
                    .build();

                const channel = getUserChannel(userId);
                if(args[0] === '공개') {
                    sendBotMessageToChannel(channel, chatNode);
                }
                else {
                    sendBotMessageToUser(userId, chatNode);
                    sendBotMessageFiltered(uid => uid !== userId, channel, chat().text('[ 상태창 ]  비공개 정보입니다.').build(), false);
                }
            } catch(e) {
                logger.error('상태창 명령어 처리 중 오류:', e);
                sendBotMessageToUser(userId, '상태창을 불러오는 중 오류가 발생했습니다.');
            }
        },
    });

    logger.success('플레이어 모듈 초기화 완료');
}
