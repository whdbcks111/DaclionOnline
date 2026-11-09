import type { Socket } from 'socket.io';
import { getIO } from '../infrastructure/socket.js';
import { getSession } from '../portal/login.js';
import { SeedWalkWorld } from '../../models/seed-walk/SeedWalkWorld.js';
import { normalizeSeedWalkChat, SEED_WALK_WORLD_SEED, isSeedWalkInput, type SeedWalkJoinResult } from '../../../../shared/seedWalk.js';
import { FixedWindowRateLimiter } from '../../utils/rateLimit.js';

const worlds = new Map<string, SeedWalkWorld>();
const members = new Map<string, { socket: Socket; userId: number; seed: string }>();
const joinLimiter = new FixedWindowRateLimiter(12, 60_000, 20_000);
const inputLimiter = new FixedWindowRateLimiter(60, 1_000, 20_000);
const chatLimiter = new FixedWindowRateLimiter(3, 3000, 20_000);
let accumulated = 0;
const roomName = (seed: string) => `seed-walk:${seed}`;

function leave(socket: Socket): void {
    const member = members.get(socket.id);
    socket.data.seedWalkActive = false;
    if (!member) return;
    const world = worlds.get(member.seed);
    world?.leave(member.userId, socket.id);
    socket.leave(roomName(member.seed));
    members.delete(socket.id);
    if (!world?.size) worlds.delete(member.seed);
}

export function initSeedWalk(): void {
    getIO().on('connection', socket => {
        socket.on('seedWalkJoin', () => {
            const reply = (result: SeedWalkJoinResult) => socket.emit('seedWalkJoined', result);
            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            if (!session) { reply({ ok: false, error: 'GAME BOX 로그인이 필요합니다.' }); return; }
            if (!joinLimiter.consume(socket.id).allowed) { reply({ ok: false, error: '접속 요청이 많습니다. 잠시 후 다시 시도해주세요.' }); return; }
            if (socket.data.onlineUserId !== undefined || socket.data.test2Active) { reply({ ok: false, error: '기존 게임에서 나온 뒤 접속해주세요.' }); return; }
            const seed = SEED_WALK_WORLD_SEED;
            let world = worlds.get(seed);
            if (world && !world.hasPlayer(session.userId) && world.size >= 32) { reply({ ok: false, error: '이 맵은 가득 찼습니다. 잠시 후 다시 접속해주세요.' }); return; }
            leave(socket);
            world = worlds.get(seed) ?? new SeedWalkWorld(seed);
            world.join(session.userId, session.nickname, socket.id);
            worlds.set(seed, world);
            members.set(socket.id, { socket, userId: session.userId, seed });
            socket.data.seedWalkActive = true;
            socket.join(roomName(seed));
            reply({ ok: true, selfId: session.userId, state: world.snapshot() });
        });
        socket.on('seedWalkInput', (input: unknown) => {
            const member = members.get(socket.id);
            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            if (!member || session?.userId !== member.userId || !isSeedWalkInput(input) || !inputLimiter.consume(socket.id).allowed) return;
            worlds.get(member.seed)?.input(member.userId, socket.id, input, performance.now());
        });
        socket.on('seedWalkChat', (input: unknown) => {
            const member = members.get(socket.id);
            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            const text = normalizeSeedWalkChat(input);
            if (!member || session?.userId !== member.userId || text === undefined || !chatLimiter.consume(String(member.userId)).allowed) return;
            worlds.get(member.seed)?.say(member.userId, socket.id, text, performance.now());
        });
        socket.on('seedWalkLeave', () => leave(socket));
        socket.on('disconnect', () => leave(socket));
        socket.on('logout', () => leave(socket));
    });
}

/** Called by the existing 20 Hz server loop; no independent game timers or DB state. */
export function updateSeedWalk(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    const now = performance.now();
    for (const { socket, userId } of [...members.values()]) {
        const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
        if (session?.userId !== userId) leave(socket);
    }
    accumulated += Math.max(0, Math.min(seconds, .2));
    if (accumulated < .05) return;
    while (accumulated >= .05) {
        for (const world of worlds.values()) world.update(.05, now);
        accumulated -= .05;
    }
    for (const world of worlds.values()) getIO().to(roomName(world.seed)).volatile.emit('seedWalkState', world.snapshot());
}
