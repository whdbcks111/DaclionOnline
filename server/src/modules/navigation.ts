import { ActionType } from '../models/Action.js';
import { AttributeType } from '../models/Attribute.js';
import { distanceBetween, getLocation } from '../models/Location.js';
import type Player from '../models/Player.js';
import { findShortestVisitedRoute } from '../models/WorldMap.js';
import { chat } from '../utils/chatBuilder.js';
import { startCoroutine, Wait } from './coroutine.js';
import type { CoroutineGenerator } from './coroutine.js';
import { sendNotificationToUser, sendPrivateBotMessageToUser } from './message.js';

interface NavigationSession {
    readonly id: number;
    readonly player: Player;
    readonly destinationId: string;
    readonly automatic: boolean;
}

export interface NavigationStartResult {
    ok: boolean;
    reason?: string;
    route?: readonly string[];
}

const activeSessions = new Map<number, NavigationSession>();
let nextSessionId = 1;

function isSessionActive(session: NavigationSession): boolean {
    return activeSessions.get(session.player.userId) === session && session.player.moving;
}

function finishSession(session: NavigationSession): void {
    if (activeSessions.get(session.player.userId) !== session) return;
    activeSessions.delete(session.player.userId);
    session.player.moving = false;
}

function failSession(session: NavigationSession, message: string): void {
    if (!isSessionActive(session)) return;
    sendPrivateBotMessageToUser(session.player.userId, message);
    finishSession(session);
}

function* travelSegment(
    session: NavigationSession,
    targetLocationId: string,
    segmentIndex: number,
    segmentCount: number,
): CoroutineGenerator {
    const player = session.player;
    const from = getLocation(player.locationId);
    const to = getLocation(targetLocationId);
    if (!from || !to) return;

    const distance = distanceBetween(from.data, to.data);
    const speed = player.attribute.get(AttributeType.SPEED);
    const totalTime = Math.max(1, distance / Math.max(0.01, speed) / 5);
    let elapsed = 0;

    if (!session.automatic) {
        sendPrivateBotMessageToUser(player.userId, `${to.data.name}(으)로 이동 시작... (${Math.ceil(totalTime)}초)`);
    }

    while (elapsed < totalTime) {
        const waitTime = Math.min(0.5, totalTime - elapsed);
        yield Wait(waitTime);
        if (!isSessionActive(session) || player.isDead) return;
        elapsed += waitTime;

        const progress = Math.min(100, Math.floor((elapsed / totalTime) * 100));
        const segmentLabel = session.automatic && segmentCount > 1
            ? ` (${segmentIndex}/${segmentCount})`
            : '';
        sendNotificationToUser(player.userId, {
            key: 'travel',
            message: chat()
                .text(`${to.data.name}(으)로 이동 중${segmentLabel}... \n`)
                .progress({ value: progress / 100, color: 'white', length: 200, thickness: 6 })
                .text(` ${progress.toFixed(1)}%`)
                .build(),
            editExists: true,
            showProgress: false,
        });
    }

    if (isSessionActive(session)) player.locationId = targetLocationId;
}

function* navigationCoroutine(session: NavigationSession, initialRoute: readonly string[]): CoroutineGenerator {
    const player = session.player;

    try {
        if (!session.automatic) {
            yield* travelSegment(session, initialRoute[1], 1, 1);
            if (isSessionActive(session) && player.locationId === session.destinationId) {
                const destination = getLocation(session.destinationId);
                sendPrivateBotMessageToUser(player.userId, `${destination?.data.name ?? '목적지'}에 도착했습니다.`);
            }
            return;
        }

        const destination = getLocation(session.destinationId);
        const routeNames = initialRoute
            .map(locationId => getLocation(locationId)?.data.name)
            .filter((name): name is string => Boolean(name));
        sendPrivateBotMessageToUser(
            player.userId,
            `${destination?.data.name ?? '목적지'}까지 자동이동을 시작합니다.\n경로: ${routeNames.join(' → ')}`,
        );

        let completedSegments = 0;
        while (isSessionActive(session) && player.locationId !== session.destinationId) {
            if (player.isDead) {
                failSession(session, '사망하여 자동이동이 중단되었습니다.');
                return;
            }
            if (!player.canPerformAction(ActionType.LOCATION_TRAVEL)) {
                failSession(session, '현재 장소 이동이 제한되어 자동이동이 중단되었습니다.');
                return;
            }

            const route = findShortestVisitedRoute(player, player.locationId, session.destinationId);
            if (!route || route.length < 2) {
                failSession(session, '목적지까지 이동 가능한 경로가 없어 자동이동이 중단되었습니다.');
                return;
            }

            const nextLocationId = route[1];
            const currentLocation = getLocation(player.locationId);
            const connection = currentLocation
                ?.getAvailableConnections(player)
                .find(candidate => candidate.locationId === nextLocationId && candidate.status === 'visible');
            if (!connection) {
                failSession(session, '이동 경로가 잠기거나 사라져 자동이동이 중단되었습니다.');
                return;
            }

            const remainingSegments = route.length - 1;
            yield* travelSegment(
                session,
                nextLocationId,
                completedSegments + 1,
                completedSegments + remainingSegments,
            );
            if (player.locationId === nextLocationId) completedSegments++;
        }

        if (isSessionActive(session) && player.locationId === session.destinationId) {
            sendPrivateBotMessageToUser(
                player.userId,
                `${destination?.data.name ?? '목적지'}에 자동이동으로 도착했습니다.`,
            );
        }
    } finally {
        finishSession(session);
    }
}

function beginNavigation(
    player: Player,
    destinationId: string,
    automatic: boolean,
    route: readonly string[],
): NavigationStartResult {
    cancelNavigation(player, false);
    const session: NavigationSession = {
        id: nextSessionId++,
        player,
        destinationId,
        automatic,
    };
    activeSessions.set(player.userId, session);
    player.moving = true;
    startCoroutine(navigationCoroutine(session, route));
    return { ok: true, route };
}

/** 인접 장소 한 칸 이동을 시작한다. 명령·HUD가 같은 취소 가능한 실행기를 사용한다. */
export function startLocationTravel(player: Player, targetLocationId: string): NavigationStartResult {
    if (player.isDead) return { ok: false, reason: '사망 상태에서는 행동할 수 없습니다.' };
    if (player.moving) return { ok: false, reason: '이동 중에는 다시 이동할 수 없습니다.' };
    if (!player.canPerformAction(ActionType.LOCATION_TRAVEL)) {
        return { ok: false, reason: '현재 다른 장소로 이동할 수 없는 상태입니다.' };
    }

    const current = getLocation(player.locationId);
    const target = current
        ?.getAvailableConnections(player)
        .find(connection => connection.locationId === targetLocationId && connection.status === 'visible');
    if (!current || !target) return { ok: false, reason: '현재 이동할 수 없는 장소입니다.' };
    return beginNavigation(player, target.locationId, false, [current.id, target.locationId]);
}

/** 방문한 공개 장소만 통과하는 최단 거리 경로로 자동이동을 시작한다. */
export function startAutoNavigation(player: Player, destinationId: string): NavigationStartResult {
    if (player.isDead) return { ok: false, reason: '사망 상태에서는 행동할 수 없습니다.' };
    if (player.moving) return { ok: false, reason: '이동 중에는 자동이동을 시작할 수 없습니다.' };
    if (!player.canPerformAction(ActionType.LOCATION_TRAVEL)) {
        return { ok: false, reason: '현재 다른 장소로 이동할 수 없는 상태입니다.' };
    }
    if (player.locationId === destinationId) {
        return { ok: false, reason: '이미 해당 장소에 있습니다.' };
    }

    const route = findShortestVisitedRoute(player, player.locationId, destinationId);
    if (!route || route.length < 2) {
        return { ok: false, reason: '방문한 장소만으로 이어지는 이동 가능한 경로가 없습니다.' };
    }
    return beginNavigation(player, destinationId, true, route);
}

/** 단일 이동과 자동이동을 모두 취소한다. 코루틴은 다음 tick에 세션 불일치를 확인하고 종료한다. */
export function cancelNavigation(player: Player, notify = true): boolean {
    const session = activeSessions.get(player.userId);
    if (!session) return false;
    activeSessions.delete(player.userId);
    player.moving = false;
    if (notify) {
        sendNotificationToUser(player.userId, {
            key: 'travel',
            message: session.automatic ? '자동이동을 취소했습니다.' : '이동을 취소했습니다.',
            editExists: true,
            showProgress: false,
            length: 2500,
        });
    }
    return true;
}
