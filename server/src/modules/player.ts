import logger from "../utils/logger.js";
import Player from "../models/Player.js";
import { registerCommand } from "./bot.js";
import { sendBotMessageToChannel, sendBotMessageFiltered, sendBotMessageToUser } from "./message.js";
import { getUserChannel } from "./channel.js";
import { chat } from "../utils/chatBuilder.js";
import prisma from "../config/prisma.js";
import { getLocation } from "../models/Location.js";
import { getItemData } from "../models/Item.js";
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

/** 특정 유저의 Life/Mentality 상태를 해당 유저 소켓에 전송 */
export function sendPlayerStats(userId: number): void {
    const player = onlinePlayers.get(userId);
    if (!player) return;

    const data = {
        life:         player.attribute.getBase('life'),
        maxLife:      player.attribute.get('life'),
        mentality:    player.attribute.getBase('mentality'),
        maxMentality: player.attribute.get('mentality'),
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

    // 주기적 Life/Mentality 브로드캐스트
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

                const expRatio = Math.min(1, player.exp / player.maxExp);
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
                        .text(`  ${player.exp} / ${player.maxExp}\n`)
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
                        .tab(L, b2 => b2.color('yellow', b3 => b3.text('마법력'))).text(`${fmt(attr.magicForce)}\n`)
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

    registerCommand({
        name: '레벨설정',
        description: '플레이어의 레벨을 설정합니다.',
        permission: 10,
        showCommandUse: 'hide',
        args: [
            { name: '대상', description: '플레이어 userId 또는 me', required: true },
            { name: '레벨', description: '설정할 레벨 (1 이상 정수)', required: true },
        ],
        async handler(userId, args) {
            try {
                const targetId = args[0] === 'me' ? userId : parseInt(args[0], 10);
                if (isNaN(targetId)) {
                    sendBotMessageToUser(userId, '유효한 플레이어 ID를 입력해주세요.');
                    return;
                }
                const level = parseInt(args[1], 10);
                if (!Number.isInteger(level) || level < 1) {
                    sendBotMessageToUser(userId, '유효한 레벨을 입력해주세요. (1 이상 정수)');
                    return;
                }
                const player = await fetchPlayer(targetId);
                if (!player) {
                    sendBotMessageToUser(userId, '플레이어를 찾을 수 없습니다.');
                    return;
                }
                player.level = level;
                await player.save();
                sendBotMessageToUser(userId, `${player.name}의 레벨을 ${level}로 설정했습니다.`);
                if (targetId !== userId) {
                    sendBotMessageToUser(targetId, `관리자에 의해 레벨이 ${level}로 변경되었습니다.`);
                }
            } catch(e) {
                logger.error('레벨설정 명령어 처리 중 오류:', e);
                sendBotMessageToUser(userId, '레벨 설정 중 오류가 발생했습니다.');
            }
        },
    });

    registerCommand({
        name: '아이템추가',
        description: '플레이어에게 아이템을 추가합니다.',
        permission: 10,
        showCommandUse: 'hide',
        args: [
            { name: '대상', description: '플레이어 userId 또는 me', required: true },
            { name: '아이템id', description: '아이템 데이터 ID', required: true },
            { name: '개수', description: '추가할 개수 (1 이상 정수)', required: true },
        ],
        async handler(userId, args) {
            try {
                const targetId = args[0] === 'me' ? userId : parseInt(args[0], 10);
                if (isNaN(targetId)) {
                    sendBotMessageToUser(userId, '유효한 플레이어 ID를 입력해주세요.');
                    return;
                }
                const itemDataId = args[1];
                const count = parseInt(args[2], 10);
                if (!Number.isInteger(count) || count < 1) {
                    sendBotMessageToUser(userId, '유효한 개수를 입력해주세요. (1 이상 정수)');
                    return;
                }
                const itemData = getItemData(itemDataId);
                if (!itemData) {
                    sendBotMessageToUser(userId, `아이템 ID '${itemDataId}'를 찾을 수 없습니다.`);
                    return;
                }
                const player = await fetchPlayer(targetId);
                if (!player) {
                    sendBotMessageToUser(userId, '플레이어를 찾을 수 없습니다.');
                    return;
                }
                const ok = player.inventory.addItem(itemDataId, count);
                if (!ok) {
                    sendBotMessageToUser(userId, `아이템 추가에 실패했습니다. (무게 초과 등)`);
                    return;
                }
                await player.save();
                sendBotMessageToUser(userId, `${player.name}에게 ${itemData.name} x${count} 추가 완료.`);
                if (targetId !== userId) {
                    sendBotMessageToUser(targetId, `관리자에 의해 ${itemData.name} x${count}가 추가되었습니다.`);
                }
            } catch(e) {
                logger.error('아이템추가 명령어 처리 중 오류:', e);
                sendBotMessageToUser(userId, '아이템 추가 중 오류가 발생했습니다.');
            }
        },
    });

    logger.success('플레이어 모듈 초기화 완료');
}
