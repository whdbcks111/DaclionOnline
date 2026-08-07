import type { Socket } from 'socket.io';
import type {
    ConsumableBundleSkippedItem,
    ConsumableBundleUseRequest,
    ConsumableBundleUseResult,
} from '../../../../shared/types.js';
import { MAX_CONSUMABLE_BUNDLE_ITEMS } from '../../../../shared/hudPresets.js';
import { ActionType } from '../../models/core/Action.js';
import { emitGameEvent, GameEventIds } from '../../models/core/GameEvent.js';
import type Player from '../../models/actors/Player.js';
import logger from '../../utils/logger.js';
import { getSession } from '../auth/login.js';
import { sendNotificationToUser } from '../communication/message.js';
import { getPlayerByUserId } from './player.js';
import { getIO } from '../infrastructure/socket.js';

const REQUEST_ID_PATTERN = /^[a-z0-9:_-]{1,64}$/i;
const ITEM_DATA_ID_PATTERN = /^[a-z0-9:_-]{1,100}$/i;
const activeUsers = new Set<number>();

export function normalizeConsumableBundleUseRequest(value: unknown): ConsumableBundleUseRequest | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const request = value as Partial<ConsumableBundleUseRequest>;
    if (typeof request.requestId !== 'string' || !REQUEST_ID_PATTERN.test(request.requestId)
        || !Array.isArray(request.itemDataIds)
        || request.itemDataIds.length < 1
        || request.itemDataIds.length > MAX_CONSUMABLE_BUNDLE_ITEMS) return undefined;
    const itemDataIds = request.itemDataIds.filter((itemDataId): itemDataId is string =>
        typeof itemDataId === 'string' && ITEM_DATA_ID_PATTERN.test(itemDataId));
    if (itemDataIds.length !== request.itemDataIds.length || new Set(itemDataIds).size !== itemDataIds.length) {
        return undefined;
    }
    return { requestId: request.requestId, itemDataIds };
}

interface ConsumableBundleExecutionResult {
    readonly usedItemDataIds: string[];
    readonly skipped: ConsumableBundleSkippedItem[];
    readonly stoppedReason?: string;
}

/** 등록 순서를 지키며 매 단계에 서버의 현재 인벤토리·행동·요구조건을 다시 검사한다. */
export async function executeConsumableBundle(
    player: Player,
    itemDataIds: readonly string[],
    isStillOnline: () => boolean = () => true,
): Promise<ConsumableBundleExecutionResult> {
    const usedItemDataIds: string[] = [];
    const skipped: ConsumableBundleSkippedItem[] = [];
    let stoppedReason: string | undefined;

    for (const itemDataId of itemDataIds) {
        if (!isStillOnline()) {
            stoppedReason = '연결이 종료되어 남은 아이템 사용을 중단했습니다.';
            break;
        }
        if (player.isDead) {
            stoppedReason = '사망 상태가 되어 남은 아이템 사용을 중단했습니다.';
            break;
        }
        if (!player.canPerformAction(ActionType.ITEM_USE)) {
            stoppedReason = '현재 아이템을 사용할 수 없는 상태가 되어 중단했습니다.';
            break;
        }
        if (player.inventory.isUsingItem) {
            stoppedReason = '다른 아이템을 사용 중이어서 묶음 사용을 중단했습니다.';
            break;
        }

        const item = player.inventory.getFirstQuickBundleItemByData(itemDataId);
        if (!item) {
            skipped.push({ itemDataId, reason: '보유 수량이 없거나 묶음 사용 불가' });
            continue;
        }
        const requirementDenied = player.getItemRequirementDeniedReason(item);
        if (requirementDenied) {
            skipped.push({ itemDataId, reason: requirementDenied });
            continue;
        }

        const totalBefore = player.inventory.getCount(itemDataId);
        const completion = player.inventory.useItemInstance(item);
        if (!completion) {
            skipped.push({ itemDataId, reason: '사용 시작 실패' });
            continue;
        }
        await completion;
        if (player.inventory.getCount(itemDataId) < totalBefore) {
            usedItemDataIds.push(itemDataId);
            emitGameEvent(GameEventIds.ITEM_USED, {
                actor: player,
                data: { itemDataId },
            });
        } else {
            skipped.push({ itemDataId, reason: '효과 조건을 충족하지 않아 소비하지 않음' });
        }
    }

    return { usedItemDataIds, skipped, ...(stoppedReason ? { stoppedReason } : {}) };
}

function playerForSocket(socket: Socket): Player | undefined {
    const token = typeof socket.data.sessionToken === 'string' ? socket.data.sessionToken : '';
    const session = token ? getSession(token) : undefined;
    return session ? getPlayerByUserId(session.userId) : undefined;
}

function emitResult(socket: Socket, result: ConsumableBundleUseResult): void {
    socket.emit('consumableBundleUseResult', result);
}

/** 서버 권위의 직렬 소모품 묶음 사용 socket 경계. */
export function initConsumableBundle(): void {
    getIO().on('connection', socket => {
        socket.on('useConsumableBundle', async rawRequest => {
            const request = normalizeConsumableBundleUseRequest(rawRequest);
            if (!request) return emitResult(socket, {
                requestId: typeof rawRequest?.requestId === 'string' ? rawRequest.requestId.slice(0, 64) : 'invalid',
                usedItemDataIds: [],
                skipped: [],
                stoppedReason: '소모품 묶음 요청이 올바르지 않습니다.',
            });
            const player = playerForSocket(socket);
            if (!player) return emitResult(socket, {
                requestId: request.requestId,
                usedItemDataIds: [],
                skipped: [],
                stoppedReason: '로그인한 플레이어를 찾을 수 없습니다.',
            });
            if (activeUsers.has(player.userId)) return emitResult(socket, {
                requestId: request.requestId,
                usedItemDataIds: [],
                skipped: [],
                stoppedReason: '이미 소모품 묶음을 사용 중입니다.',
            });

            activeUsers.add(player.userId);
            try {
                const execution = await executeConsumableBundle(
                    player,
                    request.itemDataIds,
                    () => getPlayerByUserId(player.userId) === player && socket.connected,
                );
                const result = { requestId: request.requestId, ...execution };
                emitResult(socket, result);
                const usedCount = execution.usedItemDataIds.length;
                const skippedCount = execution.skipped.length;
                sendNotificationToUser(player.userId, {
                    key: `item:bundle:${request.requestId}`,
                    message: execution.stoppedReason
                        ? `소모품 묶음: ${usedCount}개 사용, ${skippedCount}개 건너뜀 · ${execution.stoppedReason}`
                        : `소모품 묶음: ${usedCount}개 사용, ${skippedCount}개 건너뜀`,
                    length: 4_000,
                });
            } catch (error) {
                logger.error(`소모품 묶음 사용 실패: UID ${player.userId}`, error);
                emitResult(socket, {
                    requestId: request.requestId,
                    usedItemDataIds: [],
                    skipped: [],
                    stoppedReason: '소모품 묶음 사용 중 오류가 발생했습니다.',
                });
            } finally {
                activeUsers.delete(player.userId);
            }
        });
    });
}
