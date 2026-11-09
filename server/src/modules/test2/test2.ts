import type { Socket } from 'socket.io';
import { getIO } from '../infrastructure/socket.js';
import { getSession } from '../portal/login.js';
import { Test2World } from '../../models/test2/Test2World.js';
import { validTest2Input, type Test2JoinResult } from '../../../../shared/test2.js';
import { normalizeSeedWalkChat } from '../../../../shared/seedWalk.js';
import { FixedWindowRateLimiter } from '../../utils/rateLimit.js';

const worlds = new Map<string, Test2World>();
const members = new Map<string, { socket: Socket; userId: number; seed: string }>();
const joinLimiter = new FixedWindowRateLimiter(12, 60_000, 20_000);
const inputLimiter = new FixedWindowRateLimiter(60, 1_000, 20_000);
const chatLimiter = new FixedWindowRateLimiter(3, 3000, 20_000);
let accumulated = 0;
const roomName = (seed: string) => `test2:${seed}`;

function leave(socket: Socket): void {
    const member = members.get(socket.id);
    socket.data.test2Active = false;
    if (!member) return;
    const world = worlds.get(member.seed);
    world?.leave(member.userId, socket.id);
    socket.leave(roomName(member.seed));
    members.delete(socket.id);
    if (!world?.size) worlds.delete(member.seed);
}

export function initTest2(): void {
    getIO().on('connection', socket => {
        socket.on('test2Join', () => {
            const reply = (result: Test2JoinResult) => socket.emit('test2Joined', result);
            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            if (!session) { reply({ ok: false, error: 'GAME BOX 로그인이 필요합니다.' }); return; }
            if (!joinLimiter.consume(socket.id).allowed) { reply({ ok: false, error: '접속 요청이 많습니다. 잠시 후 다시 시도해주세요.' }); return; }
            if (socket.data.onlineUserId !== undefined || socket.data.seedWalkActive) { reply({ ok: false, error: '기존 게임에서 나온 뒤 접속해주세요.' }); return; }
            const seed = 'test2';
            let world = worlds.get(seed);
            if (world && !world.hasPlayer(session.userId) && world.size >= 32) { reply({ ok: false, error: '이 맵은 가득 찼습니다. 잠시 후 다시 접속해주세요.' }); return; }
            leave(socket);
            world = worlds.get(seed) ?? new Test2World();
            world.join(session.userId, session.nickname, socket.id);
            worlds.set(seed, world);
            members.set(socket.id, { socket, userId: session.userId, seed });
            socket.data.test2Active = true;
            socket.join(roomName(seed));
            reply({ ok: true, selfId: session.userId, state: world.snapshot() });
        });
        socket.on('test2Input', (input: unknown) => {
            const member = members.get(socket.id);
            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            if (!member || session?.userId !== member.userId || !validTest2Input(input) || !inputLimiter.consume(socket.id).allowed) return;
            worlds.get(member.seed)?.input(member.userId, socket.id, input, performance.now());
        });
        socket.on('test2Chat', (input: unknown) => {
            const member = members.get(socket.id);
            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            const text = normalizeSeedWalkChat(input);
            if (!member || session?.userId !== member.userId || text === undefined || !chatLimiter.consume(String(member.userId)).allowed) return;
            worlds.get(member.seed)?.say(member.userId, socket.id, text, performance.now());
        });
        socket.on('test2Respawn', () => {
            const member = members.get(socket.id);
            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            if (member && session?.userId === member.userId && joinLimiter.consume(socket.id).allowed) worlds.get(member.seed)?.respawn(member.userId, socket.id);
        });
        socket.on('test2Leave', () => leave(socket));
        socket.on('disconnect', () => leave(socket));
        socket.on('logout', () => leave(socket));
    });
}

/** Called by the existing 20 Hz server loop; no independent game timers or DB state. */
export function updateTest2(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    const now = performance.now();
    for (const { socket, userId } of [...members.values()]) {
        const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
        if (session?.userId !== userId) leave(socket);
    }
    accumulated += Math.max(0, Math.min(seconds, .2));
    if (accumulated < .05) return;
    while (accumulated >= 1 / 60) {
        for (const world of worlds.values()) world.update(1 / 60, now);
        accumulated -= 1 / 60;
    }
    for (const world of worlds.values()) getIO().to(roomName('test2')).volatile.emit('test2State', world.snapshot());
}
