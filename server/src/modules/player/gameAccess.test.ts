import '../../data/progression/progress.js';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { initSocket } from '../infrastructure/socket.js';
import { createSession, getSession, initLogin, isUserOnline, removeSession, setUserOnline, setUserOffline } from '../portal/login.js';
import { canUseSocketEvent } from '../portal/socketPolicy.js';
import prisma from '../../config/prisma.js';
import Player from '../../models/actors/Player.js';
import { initGameAccess } from './gameAccess.js';
import type { GameEntryResult } from '../../../../shared/types.js';
import { PlayerProgress } from '../../models/progression/Progress.js';
import { registerOnlinePlayer, unregisterOnlinePlayer } from './playerRegistry.js';

// 실제 connection handler를 구동하되 네트워크/운영 DB에 의존하지 않는다.
class TestSocket {
    id = 'portal-access-test';
    connected = true;
    data: Record<string, any> = {};
    handshake = { address: '127.0.0.1' };
    handlers = new Map<string, (...args: any[]) => unknown>();
    sent: Array<[string, any]> = [];
    resolveEntry?: (result: GameEntryResult) => void;
    on(event: string, handler: (...args: any[]) => unknown) { this.handlers.set(event, handler); }
    use() {}
    join() {}
    leave() {}
    emit(event: string, data: any) {
        this.sent.push([event, data]);
        if (event === 'gameEntryResult') this.resolveEntry?.(data);
    }
    enter(payload: unknown): Promise<GameEntryResult> {
        return new Promise(resolve => {
            this.resolveEntry = resolve;
            this.handlers.get('enterGame')!(payload);
        });
    }
}

test('포털 인증과 게임 입장은 독립이며 프로필 없는 계정은 캐릭터를 자동 생성하지 않는다', async t => {
    const io = initSocket(createServer(), '*');
    initLogin();
    initGameAccess();
    const userId = 99501;
    const token = createSession({ id: userId, username: 'portal-test', nickname: '포털이름' });
    const socket = new TestSocket();
    socket.data.sessionToken = token;
    const originalFind = prisma.gameProfile.findUnique;
    const originalCreate = prisma.gameProfile.create;
    const find = t.mock.fn(async () => null);
    prisma.gameProfile.findUnique = find as unknown as typeof originalFind;
    const createPlayer = t.mock.method(Player, 'create', async () => { throw new Error('자동 캐릭터 생성 금지'); });
    const createProfile = t.mock.fn(async () => { throw new Error('비인증 생성 금지'); });
    prisma.gameProfile.create = createProfile as unknown as typeof originalCreate;
    try {
        for (const listener of io.sockets.listeners('connection')) listener(socket as never);
        assert.equal(socket.sent[0][0], 'sessionRestore');
        assert.equal(isUserOnline(userId), false);
        assert.equal(find.mock.callCount(), 0);
        assert.equal(createPlayer.mock.callCount(), 0);
        assert.deepEqual(await socket.enter({ gameId: 'unknown' }), { error: '지원하지 않는 게임입니다.' });
        assert.equal(find.mock.callCount(), 0);
        assert.deepEqual(await socket.enter({ gameId: 'daclion' }), { needsProfile: true });
        assert.equal(createPlayer.mock.callCount(), 0);
        assert.equal(createProfile.mock.callCount(), 0);
        const invalid = await socket.enter({ gameId: 'daclion', nickname: '<script>' });
        assert.equal(invalid.needsProfile, true);
        assert.match(invalid.error!, /닉네임/);
        assert.equal(createProfile.mock.callCount(), 0);
        assert.equal(isUserOnline(userId), false);
        assert.equal(getSession(token)?.nickname, '포털이름');
        removeSession(token);
        assert.deepEqual(await socket.enter({ gameId: 'daclion', nickname: '모험가' }), { error: '포털 로그인이 필요합니다.' });
        assert.equal(createPlayer.mock.callCount(), 0);
    } finally {
        removeSession(token);
        prisma.gameProfile.findUnique = originalFind;
        prisma.gameProfile.create = originalCreate;
        io.close();
    }
});

test('게임 입장 전에는 포털 인증 이벤트만 허용한다', () => {
    for (const event of ['sendMessage', 'chatButtonClick', 'changeNickname', 'adminAction', 'useChatEmote', 'saveHudPreset']) {
        assert.equal(canUseSocketEvent(event, false), false, event);
        assert.equal(canUseSocketEvent(event, true), true, event);
    }
    for (const event of ['login', 'logout', 'register', 'enterGame', 'leaveGame', 'sendPasswordResetCode']) {
        assert.equal(canUseSocketEvent(event, false), true, event);
    }
});

test('기존 게임 프로필은 재가입 없이 재사용하며 포털 복귀가 다른 게임 탭과 계정 세션을 유지한다', async t => {
    const io = initSocket(createServer(), '*');
    initLogin();
    initGameAccess();
    const userId = 99502;
    const token = createSession({ id: userId, username: 'linked-test', nickname: '포털닉네임' });
    const socket = new TestSocket();
    socket.id = 'linked-access-test';
    socket.data.sessionToken = token;
    const originalFind = prisma.gameProfile.findUnique;
    const originalCreate = prisma.gameProfile.create;
    prisma.gameProfile.findUnique = t.mock.fn(async () => ({ userId, nickname: '기존캐릭터', nicknameChangedAt: null })) as unknown as typeof originalFind;
    const create = t.mock.fn(async () => { throw new Error('기존 프로필 재생성 금지'); });
    prisma.gameProfile.create = create as unknown as typeof originalCreate;
    registerOnlinePlayer({ userId, name: '기존캐릭터', progress: PlayerProgress.createEmpty(userId) } as Player);
    setUserOnline(userId, 'other-game-tab');
    try {
        for (const listener of io.sockets.listeners('connection')) listener(socket as never);
        assert.deepEqual(await socket.enter({ gameId: 'daclion', nickname: '바꾸려는이름' }), { ok: true, nickname: '기존캐릭터' });
        assert.equal(create.mock.callCount(), 0);
        assert.equal(socket.data.gameActive, true);
        assert.equal(getSession(token)?.nickname, '포털닉네임');
        socket.handlers.get('leaveGame')!();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(socket.data.gameActive, false);
        assert.equal(socket.data.onlineUserId, undefined);
        assert.equal(isUserOnline(userId), true);
        assert.ok(getSession(token));
    } finally {
        setUserOffline(userId, socket.id);
        setUserOffline(userId, 'other-game-tab');
        unregisterOnlinePlayer(userId);
        removeSession(token);
        prisma.gameProfile.findUnique = originalFind;
        prisma.gameProfile.create = originalCreate;
        io.close();
    }
});
