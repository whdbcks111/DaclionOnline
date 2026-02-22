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

const onlinePlayersFromUserId = new Map<number, Player>(); // userId → Player
const onlinePlayers = new Map<number, Player>(); // playerId → Player

/** 로그인 시 호출: DB에서 로드하여 메모리에 올림 */
export async function loadPlayerByUserId(userId: number): Promise<Player> {
    const existing = onlinePlayersFromUserId.get(userId);
    if (existing) return existing;

    let player = await Player.loadByUserId(userId);
    if (!player) {
        player = await Player.create(userId);
    }

    onlinePlayersFromUserId.set(player.userId, player);
    onlinePlayers.set(player.id, player);
    return player;
}

/** 로그인 시 호출: DB에서 로드하여 메모리에 올림 */
export async function loadPlayer(id: number): Promise<Player | null> {
    const existing = onlinePlayers.get(id);
    if (existing) return existing;

    let player = await Player.load(id);
    if (!player) {
        return null;
    }

    onlinePlayersFromUserId.set(player.userId, player);
    onlinePlayers.set(player.id, player);
    return player;
}

/** 로그아웃/연결끊김 시 호출: 저장 후 메모리에서 제거 */
export async function unloadPlayerByUserId(userId: number): Promise<void> {
    const player = onlinePlayersFromUserId.get(userId);
    if (!player) return;
    await player.save();
    onlinePlayersFromUserId.delete(player.userId);
    onlinePlayers.delete(player.id);
}

/** 로그아웃/연결끊김 시 호출: 저장 후 메모리에서 제거 */
export async function unloadPlayer(id: number): Promise<void> {
    const player = onlinePlayers.get(id);
    if (!player) return;
    await player.save();
    onlinePlayersFromUserId.delete(player.userId);
    onlinePlayers.delete(player.id);
}

/** 온라인 플레이어 조회 (메모리) */
export function getPlayerByUserId(userId: number): Player | undefined {
    return onlinePlayersFromUserId.get(userId);
}

/** 온라인 플레이어 조회 (메모리) */
export function getPlayer(id: number): Player | undefined {
    return onlinePlayers.get(id);
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

/** 오프라인 플레이어 조회 (DB에서 직접 로드, 메모리에 올리지 않음) */
export async function fetchPlayer(id: number): Promise<Player | null> {
    const online = onlinePlayers.get(id);
    if (online) return online;
    return Player.load(id);
}

/** 모든 온라인 플레이어 저장 */
export async function saveAllPlayers(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const player of onlinePlayersFromUserId.values()) {
        promises.push(player.save());
    }
    await Promise.all(promises);
}

/** 특정 유저의 Life/Mentality 상태를 해당 유저 소켓에 전송 */
export function sendPlayerStats(userId: number): void {
    const player = onlinePlayersFromUserId.get(userId);
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
        for (const userId of onlinePlayersFromUserId.keys()) {
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
                const player = getPlayerByUserId(userId);
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
        showCommandUse: 'private',
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
                const player = await fetchPlayerByUserId(targetId);
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
        showCommandUse: 'private',
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
                const player = await fetchPlayerByUserId(targetId);
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

    registerCommand({
        name: '인벤토리',
        aliases: ['inv', 'i'],
        description: '인벤토리를 확인합니다.',
        args: [
            { name: '공개/비공개', description: '공개 여부를 결정합니다.' },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;

            const inv = player.inventory;
            const items = inv.items;
            const fmtW = (w: number) => Number.isInteger(w) ? String(w) : w.toFixed(1);

            const b = chat()
                .text(`[ 인벤토리 (${fmtW(inv.currentWeight)} / ${fmtW(inv.maxWeight)}) ]`);

            if (items.length === 0) {
                sendBotMessageToUser(userId, b.text('\n인벤토리가 비어 있습니다.').build());
                return;
            }

            const SLOT = 35;
            const CAT  = 90;
            const NAME = 170;
            const CNT  = 55;

            b.text('\n').hide('목록 보기', inner => {
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    inner.tab(SLOT, b2 => b2.color('gray', b3 => b3.text(`[${i + 1}]`)))
                         .tab(CAT,  b2 => b2.color('gray', b3 => b3.text(`[${item.category}]`)))
                         .tab(NAME, b2 => b2.text(item.name))
                         .tab(CNT,  b2 => b2.text(`x${item.count}`));

                    if (item.data?.onUse) {
                        inner.closeButton(`/사용 ${i}`, b2 => b2.text('사용')).text(' ');
                    }

                    inner.closeButton(`/버리기 ${i}`, b2 => b2.text('버리기')).text('\n');
                }
                return inner;
            });

            const channel = getUserChannel(userId);
            if (args[0] === '공개') {
                sendBotMessageToChannel(channel, b.build());
            } else {
                sendBotMessageToUser(userId, b.build());
                sendBotMessageFiltered(uid => uid !== userId, channel, chat().text('[ 인벤토리 ]  비공개 정보입니다.').build(), false);
            }
        },
    });

    registerCommand({
        name: '사용',
        aliases: ['use'],
        description: '아이템을 1개 사용합니다.',
        showCommandUse: 'show',
        args: [
            { name: '슬롯ID', description: '사용할 아이템 인벤토리 슬롯 ID', required: true },
        ],
        async handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;

            const idx = parseInt(args[0], 10);
            if (isNaN(idx)) return;

            const item = player.inventory.getItemByIndex(idx);
            if (!item) {
                sendBotMessageToUser(userId, '인벤토리에 해당 아이템이 없습니다.');
                return;
            }

            if (player.inventory.isUsingItem) {
                sendBotMessageToUser(userId, '이미 아이템을 사용 중입니다.');
                return;
            }

            const result = player.inventory.useItem(item.id);
            if (!result) {
                sendBotMessageToUser(userId, `${item.name}은(는) 사용할 수 없습니다.`);
                return;
            }

            await result;
        },
    });

    registerCommand({
        name: '버리기',
        aliases: ['drop'],
        description: '아이템을 1개 현재 장소에 버립니다.',
        showCommandUse: 'show',
        args: [
            { name: '슬롯ID', description: '버릴 아이템 인벤토리 슬롯 ID', required: true },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;

            const idx = parseInt(args[0], 10);
            if (isNaN(idx)) return;

            const item = player.inventory.getItemByIndex(idx);
            if (!item) {
                sendBotMessageToUser(userId, '인벤토리에 해당 아이템이 없습니다.');
                return;
            }

            const location = getLocation(player.locationId);
            if (!location) {
                sendBotMessageToUser(userId, '현재 위치를 찾을 수 없습니다.');
                return;
            }

            const itemName = item.name;
            const itemDataId = item.itemDataId;

            player.inventory.removeItem(item.id, 1);
            location.addDroppedItem(itemDataId, 1);

            sendBotMessageToUser(userId, `${itemName}을(를) 버렸습니다.`);
        },
    });

    registerCommand({
        name: '순간이동',
        aliases: ['tp', 'teleport'],
        description: '플레이어를 지정한 장소로 순간이동시킵니다.',
        permission: 10,
        showCommandUse: 'private',
        args: [
            { name: '대상', description: '플레이어 userId 또는 me', required: true },
            { name: '장소id', description: '이동할 장소 ID', required: true },
        ],
        async handler(userId, args) {
            try {
                const targetId = args[0] === 'me' ? userId : parseInt(args[0], 10);
                if (isNaN(targetId)) {
                    sendBotMessageToUser(userId, '유효한 플레이어 ID를 입력해주세요.');
                    return;
                }

                const locationId = args[1];
                const location = getLocation(locationId);
                if (!location) {
                    sendBotMessageToUser(userId, `장소 ID '${locationId}'를 찾을 수 없습니다.`);
                    return;
                }

                const player = await fetchPlayerByUserId(targetId);
                if (!player) {
                    sendBotMessageToUser(userId, '플레이어를 찾을 수 없습니다.');
                    return;
                }

                if (player.moving) {
                    player.moving = false;
                }

                player.locationId = locationId;
                await player.save();

                sendBotMessageToUser(userId, `${player.name}을(를) ${location.data.name}(으)로 순간이동시켰습니다.`);
                if (targetId !== userId) {
                    sendBotMessageToUser(targetId, `관리자에 의해 ${location.data.name}(으)로 이동되었습니다.`);
                }
            } catch (e) {
                logger.error('순간이동 명령어 처리 중 오류:', e);
                sendBotMessageToUser(userId, '순간이동 중 오류가 발생했습니다.');
            }
        },
    });

    logger.success('플레이어 모듈 초기화 완료');
}
