import type { Socket } from 'socket.io';
import type { HudPresetSaveRequest } from '../../../../shared/hudPresets.js';
import { getSession } from '../auth/login.js';
import { getPlayerByUserId } from './player.js';
import { getIO } from '../infrastructure/socket.js';
import logger from '../../utils/logger.js';

function playerForSocket(socket: Socket) {
    const token = typeof socket.data.sessionToken === 'string' ? socket.data.sessionToken : '';
    const session = token ? getSession(token) : undefined;
    return session ? getPlayerByUserId(session.userId) : undefined;
}

function emitList(socket: Socket): void {
    const player = playerForSocket(socket);
    socket.emit('hudPresetList', player ? player.hudPresets.getSummaries() : []);
}

function emitFailure(socket: Socket, action: 'save' | 'load' | 'delete', error: string): void {
    socket.emit('hudPresetResult', { ok: false, action, error });
}

/** 계정별 이름 있는 HUD 프리셋의 명시적 저장·불러오기·삭제 소켓 경계. */
export function initHudPreset(): void {
    getIO().on('connection', socket => {
        socket.on('requestHudPresets', () => emitList(socket));

        socket.on('saveHudPreset', async (request: HudPresetSaveRequest) => {
            const player = playerForSocket(socket);
            if (!player) return emitFailure(socket, 'save', '로그인한 플레이어를 찾을 수 없습니다.');
            const result = player.hudPresets.save(request?.name, request?.preset);
            if (!result.success || !result.name) {
                return emitFailure(socket, 'save', result.error ?? 'HUD 프리셋을 저장하지 못했습니다.');
            }
            try {
                await player.save();
                socket.emit('hudPresetResult', { ok: true, action: 'save', name: result.name });
                emitList(socket);
            } catch (error) {
                logger.error(`HUD 프리셋 저장 실패: UID ${player.userId}`, error);
                emitFailure(socket, 'save', '서버에 HUD 프리셋을 저장하지 못했습니다.');
            }
        });

        socket.on('loadHudPreset', (name: string) => {
            const player = playerForSocket(socket);
            if (!player) return emitFailure(socket, 'load', '로그인한 플레이어를 찾을 수 없습니다.');
            const preset = player.hudPresets.get(name);
            const requestedName = typeof name === 'string' ? name.trim().toLocaleLowerCase() : '';
            const summary = player.hudPresets.getSummaries().find(candidate =>
                candidate.name.toLocaleLowerCase() === requestedName);
            if (!preset || !summary) return emitFailure(socket, 'load', '저장된 HUD 프리셋을 찾을 수 없습니다.');
            socket.emit('hudPresetLoaded', { name: summary.name, preset });
            socket.emit('hudPresetResult', { ok: true, action: 'load', name: summary.name });
        });

        socket.on('deleteHudPreset', async (name: string) => {
            const player = playerForSocket(socket);
            if (!player) return emitFailure(socket, 'delete', '로그인한 플레이어를 찾을 수 없습니다.');
            const result = player.hudPresets.delete(name);
            if (!result.success || !result.name) {
                return emitFailure(socket, 'delete', result.error ?? 'HUD 프리셋을 삭제하지 못했습니다.');
            }
            try {
                await player.save();
                socket.emit('hudPresetResult', { ok: true, action: 'delete', name: result.name });
                emitList(socket);
            } catch (error) {
                logger.error(`HUD 프리셋 삭제 실패: UID ${player.userId}`, error);
                emitFailure(socket, 'delete', '서버의 HUD 프리셋을 삭제하지 못했습니다.');
            }
        });
    });
}
