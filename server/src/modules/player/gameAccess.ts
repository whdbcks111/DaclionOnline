import type { Socket } from 'socket.io';
import { getIO } from '../infrastructure/socket.js';
import { getSession, setUserOnline, setUserOffline, isUserOnline } from '../portal/login.js';
import { createDaclionProfile, getDaclionProfile } from '../portal/gameProfile.js';
import { getChannelRoomKey, getUserChannel } from '../communication/channel.js';
import { loadPlayerByUserId, unloadPlayerByUserId } from './player.js';
import logger from '../../utils/logger.js';
import { FixedWindowRateLimiter } from '../../utils/rateLimit.js';

const entryLimiter = new FixedWindowRateLimiter(20, 60_000, 20_000);
import type { EnterGameRequest, GameEntryResult } from '../../../../shared/types.js';

/** 게임을 나가도 공통 포털 세션은 유지한다. 다른 게임 탭이 있으면 캐릭터는 유지한다. */
async function leaveGame(socket: Socket): Promise<void> {
    const userId: number | undefined = socket.data.onlineUserId;
    socket.data.gameActive = false;
    socket.data.onlineUserId = undefined;
    socket.data.gameNickname = undefined;
    if (userId === undefined) return;
    await socket.leave(getChannelRoomKey(getUserChannel(userId)));
    setUserOffline(userId, socket.id);
    if (!isUserOnline(userId)) await unloadPlayerByUserId(userId, true);
}

export function initGameAccess(): void {
    getIO().on('connection', socket => {
        // 같은 연결의 입장/나가기 요청을 직렬화해 늦은 DB 응답이 포털 복귀를 뒤집지 못하게 한다.
        let pending: Promise<void> = Promise.resolve();
        let entryGeneration = 0;
        socket.on('enterGame', (request: EnterGameRequest) => {
            if (!entryLimiter.consume(socket.id).allowed) {
                socket.emit('gameEntryResult', { error: '접속 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
                return;
            }
            const generation = ++entryGeneration;
            pending = pending.then(async () => {
                const reply = (result: GameEntryResult) => socket.emit('gameEntryResult', result);
                const token = socket.data.sessionToken;
                const session = token ? getSession(token) : undefined;
                if (!session) { reply({ error: '포털 로그인이 필요합니다.' }); return; }
                if (socket.data.seedWalkActive || socket.data.test2Active) { reply({ error: '다른 게임에서 나온 뒤 접속해주세요.' }); return; }
                if (request?.gameId !== 'daclion') { reply({ error: '지원하지 않는 게임입니다.' }); return; }
                let profile = await getDaclionProfile(session.userId);
                if (generation !== entryGeneration || !socket.connected || socket.data.sessionToken !== token || getSession(token)?.userId !== session.userId) return;
                if (!profile) {
                    if (request.nickname === undefined) { reply({ needsProfile: true }); return; }
                    try {
                        profile = await createDaclionProfile(session.userId, request.nickname);
                    } catch (error) {
                        // 동일 계정의 다른 탭이 먼저 만든 프로필은 그대로 재사용한다.
                        profile = await getDaclionProfile(session.userId);
                        if (!profile) {
                            const code = (error as { code?: string }).code;
                            reply({ needsProfile: true, error: code === 'P2002' ? '이미 사용 중인 캐릭터 이름입니다.' : error instanceof Error && !code ? error.message : '캐릭터 정보를 저장하지 못했습니다.' });
                            return;
                        }
                    }
                }
                if (generation !== entryGeneration || !socket.connected || socket.data.sessionToken !== token || getSession(token)?.userId !== session.userId) return;
                if (socket.data.seedWalkActive || socket.data.test2Active) { reply({ error: '다른 게임에서 나온 뒤 접속해주세요.' }); return; }
                socket.data.onlineUserId = session.userId;
                socket.data.gameNickname = profile.nickname;
                setUserOnline(session.userId, socket.id);
                await socket.join(getChannelRoomKey(getUserChannel(session.userId)));
                try {
                    await loadPlayerByUserId(session.userId);
                    if (generation !== entryGeneration || !socket.connected || socket.data.sessionToken !== token || getSession(token)?.userId !== session.userId) {
                        await leaveGame(socket);
                        return;
                    }
                    socket.data.gameActive = true;
                    reply({ ok: true, nickname: profile.nickname });
                } catch (error) {
                    await leaveGame(socket);
                    throw error;
                }
            }).catch(error => {
                logger.error('게임 입장 실패:', error);
                socket.emit('gameEntryResult', { error: '게임 접속 중 오류가 발생했습니다. 다시 시도해주세요.' });
            });
        });
        socket.on('leaveGame', () => {
            entryGeneration++;
            socket.data.gameActive = false;
            pending = pending.then(() => leaveGame(socket)).catch(error => logger.error('게임 종료 저장 실패:', error));
        });
    });
}
