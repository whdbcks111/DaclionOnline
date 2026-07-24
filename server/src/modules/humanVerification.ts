import { randomInt } from 'node:crypto';
import sharp from 'sharp';
import type {
    HumanVerificationResultData,
    HumanVerificationStartData,
    HumanVerificationSubmitRequest,
} from '../../../shared/types.js';
import { GameTags } from '../../../shared/tags.js';
import { ActionType } from '../models/Action.js';
import { GameEventIds, subscribeGameEvent, type GameEvent } from '../models/GameEvent.js';
import type Player from '../models/Player.js';
import logger from '../utils/logger.js';
import { randomHex } from '../utils/random.js';
import { getSession } from './login.js';
import { sendNotificationToUser } from './message.js';
import { cancelNavigation } from './navigation.js';
import { getOnlinePlayer } from './playerRegistry.js';
import { cancelGameTask, scheduleGameTask } from './scheduler.js';
import { getIO } from './socket.js';

export const HUMAN_VERIFICATION_REQUIRED_PROGRESS_ID = 'security:human_verification_required';
export const HUMAN_VERIFICATION_FAILURE_PROGRESS_ID = 'security:human_verification_failures';

const VERIFICATION_SOURCE = 'security:human-verification';
const VERIFICATION_DURATION_MS = 120_000;
const HUNTING_WINDOW_MS = 2 * 60 * 60 * 1_000;
const HUNTING_MIN_SAMPLES = 36;
const HUNTING_MIN_DURATION_MS = 30 * 60 * 1_000;
const HUNTING_MAX_IDLE_MS = 8 * 60 * 1_000;
const HUNTING_SCORE_THRESHOLD = 0.68;
const VERIFICATION_ACTIONS = Object.freeze([
    ActionType.SKILL,
    ActionType.ITEM_USE,
    ActionType.COMMAND,
    ActionType.ATTACK,
    ActionType.MOVEMENT,
    ActionType.EVASION,
    ActionType.LOCATION_TRAVEL,
]);
const CAPTCHA_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface HuntingActivitySample {
    readonly occurredAt: number;
    readonly locationId: string;
    readonly targetKey: string;
}

export interface HuntingPatternAnalysis {
    readonly sampleCount: number;
    readonly durationMs: number;
    readonly routeRepetition: number;
    readonly timingRegularity: number;
    readonly score: number;
    readonly suspicious: boolean;
}

interface HuntingTracker {
    samples: HuntingActivitySample[];
    totalDefeats: number;
    verificationAtDefeat?: number;
    graceUntil: number;
}

interface ActiveHumanVerification {
    readonly userId: number;
    readonly sessionId: string;
    readonly answer: string;
    readonly payload: HumanVerificationStartData;
    readonly timeoutKey: string;
}

const huntingByUser = new Map<number, HuntingTracker>();
const activeByUser = new Map<number, ActiveHumanVerification>();
const issuingByUser = new Map<number, Promise<void>>();
let initialized = false;

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function calculateRouteRepetition(samples: readonly HuntingActivitySample[]): number {
    const tokens = samples.slice(-60).map(sample => `${sample.locationId}\u0000${sample.targetKey}`);
    if (tokens.length < 2) return 0;
    const counts = new Map<string, number>();
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    let best = Math.max(...counts.values()) / tokens.length;
    for (let period = 1; period <= Math.min(12, Math.floor(tokens.length / 3)); period++) {
        let matches = 0;
        for (let index = period; index < tokens.length; index++) {
            if (tokens[index] === tokens[index - period]) matches++;
        }
        best = Math.max(best, matches / (tokens.length - period));
    }
    return clamp01(best);
}

function calculateTimingRegularity(samples: readonly HuntingActivitySample[]): number {
    if (samples.length < 3) return 0;
    const intervals = samples.slice(1).map((sample, index) =>
        Math.max(1, sample.occurredAt - samples[index].occurredAt));
    const mean = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
    const variance = intervals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / intervals.length;
    const coefficientOfVariation = Math.sqrt(variance) / Math.max(1, mean);
    return 1 - clamp01(coefficientOfVariation / 0.75);
}

/** 서버 이벤트만으로 장시간 반복 사냥의 유사도를 계산하는 순수 분석 API. */
export function analyzeHuntingPattern(samples: readonly HuntingActivitySample[]): HuntingPatternAnalysis {
    const ordered = [...samples].sort((left, right) => left.occurredAt - right.occurredAt);
    const durationMs = ordered.length > 1
        ? Math.max(0, ordered.at(-1)!.occurredAt - ordered[0].occurredAt)
        : 0;
    const maximumIdleMs = ordered.slice(1).reduce((maximum, sample, index) =>
        Math.max(maximum, sample.occurredAt - ordered[index].occurredAt), 0);
    const routeRepetition = calculateRouteRepetition(ordered);
    const timingRegularity = calculateTimingRegularity(ordered);
    const durationScore = clamp01(durationMs / (60 * 60 * 1_000));
    const score = clamp01(routeRepetition * 0.5 + timingRegularity * 0.2 + durationScore * 0.3);
    return {
        sampleCount: ordered.length,
        durationMs,
        routeRepetition,
        timingRegularity,
        score,
        suspicious: ordered.length >= HUNTING_MIN_SAMPLES
            && durationMs >= HUNTING_MIN_DURATION_MS
            && maximumIdleMs <= HUNTING_MAX_IDLE_MS
            && score >= HUNTING_SCORE_THRESHOLD,
    };
}

function getTracker(userId: number): HuntingTracker {
    const tracker = huntingByUser.get(userId) ?? {
        samples: [],
        totalDefeats: 0,
        graceUntil: 0,
    };
    huntingByUser.set(userId, tracker);
    return tracker;
}

function emitToUser(
    userId: number,
    event: 'humanVerificationStart' | 'humanVerificationResult',
    payload: HumanVerificationStartData | HumanVerificationResultData,
): void {
    for (const [, socket] of getIO().sockets.sockets) {
        const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
        if (session?.userId !== userId) continue;
        if (event === 'humanVerificationStart') {
            socket.emit(event, payload as HumanVerificationStartData);
        } else {
            socket.emit(event, payload as HumanVerificationResultData);
        }
    }
}

function applyVerificationLock(player: Player): void {
    player.disableActions(VERIFICATION_ACTIONS, VERIFICATION_SOURCE);
    player.setDamageReceivedModifier(VERIFICATION_SOURCE, 0);
    player.currentTarget = null;
    player.skills.finishAll();
    cancelNavigation(player, false);
}

function releaseVerificationLock(player: Player): void {
    player.releaseActionDisableSource(VERIFICATION_SOURCE);
    player.removeDamageReceivedModifier(VERIFICATION_SOURCE);
}

function createCaptchaAnswer(length = 5): string {
    let answer = '';
    for (let index = 0; index < length; index++) {
        answer += CAPTCHA_ALPHABET[randomInt(0, CAPTCHA_ALPHABET.length)];
    }
    return answer;
}

async function renderCaptchaDataUrl(answer: string): Promise<string> {
    const width = 440;
    const height = 170;
    const colors = ['#d8e7e4', '#e6d7b8', '#cfd9ee', '#e7cbd1'];
    const glyphs = [...answer].map((glyph, index) => {
        const x = 62 + index * 79 + randomInt(-7, 8);
        const y = 108 + randomInt(-8, 9);
        const rotate = randomInt(-16, 17);
        const color = colors[randomInt(0, colors.length)];
        return `<text x="${x}" y="${y}" fill="${color}" font-size="58" font-weight="800" `
            + `font-family="DejaVu Sans,Arial,sans-serif" text-anchor="middle" `
            + `transform="rotate(${rotate} ${x} ${y})">${glyph}</text>`;
    }).join('');
    const lines = Array.from({ length: 12 }, () => {
        const x1 = randomInt(8, width - 8);
        const y1 = randomInt(12, height - 12);
        const x2 = randomInt(8, width - 8);
        const y2 = randomInt(12, height - 12);
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" `
            + `stroke="#7f9297" stroke-opacity="${randomInt(18, 42) / 100}" stroke-width="${randomInt(1, 4)}"/>`;
    }).join('');
    const dots = Array.from({ length: 70 }, () =>
        `<circle cx="${randomInt(5, width - 5)}" cy="${randomInt(5, height - 5)}" `
        + `r="${randomInt(1, 4)}" fill="#9aabad" fill-opacity="${randomInt(12, 36) / 100}"/>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
        + '<rect width="100%" height="100%" rx="14" fill="#20282d"/>'
        + '<rect x="8" y="8" width="424" height="154" rx="10" fill="none" stroke="#53636a" stroke-width="2"/>'
        + dots + lines + glyphs + '</svg>';
    const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
}

function removeActiveChallenge(userId: number): ActiveHumanVerification | undefined {
    const active = activeByUser.get(userId);
    if (!active) return undefined;
    cancelGameTask(active.timeoutKey);
    activeByUser.delete(userId);
    return active;
}

async function createAndEmitChallenge(player: Player): Promise<void> {
    if (!player.progress.getFlag(HUMAN_VERIFICATION_REQUIRED_PROGRESS_ID)) return;
    const existing = activeByUser.get(player.userId);
    if (existing) {
        emitToUser(player.userId, 'humanVerificationStart', existing.payload);
        return;
    }
    const answer = createCaptchaAnswer();
    const sessionId = randomHex(12);
    const expiresAt = Date.now() + VERIFICATION_DURATION_MS;
    const payload: HumanVerificationStartData = {
        sessionId,
        prompt: '이미지에 표시된 룬 문자 5개를 순서대로 입력해주세요.',
        imageDataUrl: await renderCaptchaDataUrl(answer),
        expiresAt,
    };
    if (!player.progress.getFlag(HUMAN_VERIFICATION_REQUIRED_PROGRESS_ID)
        || getOnlinePlayer(player.userId) !== player
        || activeByUser.has(player.userId)) return;
    const timeoutKey = `human-verification:${player.userId}:${sessionId}`;
    activeByUser.set(player.userId, {
        userId: player.userId,
        sessionId,
        answer,
        payload,
        timeoutKey,
    });
    scheduleGameTask(timeoutKey, VERIFICATION_DURATION_MS / 1_000, () => {
        const active = activeByUser.get(player.userId);
        if (active?.sessionId !== sessionId) return;
        activeByUser.delete(player.userId);
        emitToUser(player.userId, 'humanVerificationResult', {
            sessionId,
            passed: false,
            retryAllowed: true,
            message: '확인 시간이 만료되었습니다. 새 문제를 받아 다시 시도해주세요.',
        });
    });
    emitToUser(player.userId, 'humanVerificationStart', payload);
}

/** 현재 검사가 필요하면 기존 문제를 재전송하고, 없으면 새 문제를 한 번만 생성한다. */
export function requestHumanVerification(player: Player): void {
    if (!player.progress.getFlag(HUMAN_VERIFICATION_REQUIRED_PROGRESS_ID)) return;
    applyVerificationLock(player);
    const existing = activeByUser.get(player.userId);
    if (existing) {
        emitToUser(player.userId, 'humanVerificationStart', existing.payload);
        return;
    }
    if (issuingByUser.has(player.userId)) return;
    const pending = createAndEmitChallenge(player)
        .catch(error => logger.error(`사람 확인 문제 생성 실패: UID ${player.userId}`, error))
        .finally(() => { issuingByUser.delete(player.userId); });
    issuingByUser.set(player.userId, pending);
}

/** 반복 행동 감지나 관리자 도구가 호출하는 공개 검사 시작 API. */
export function requireHumanVerification(player: Player, reason = '반복 사냥 행동이 감지되었습니다.'): boolean {
    const alreadyRequired = player.progress.getFlag(HUMAN_VERIFICATION_REQUIRED_PROGRESS_ID);
    player.progress.setFlag(HUMAN_VERIFICATION_REQUIRED_PROGRESS_ID, true);
    applyVerificationLock(player);
    sendNotificationToUser(player.userId, {
        key: 'human-verification-required',
        message: `${reason} 사람 확인을 완료할 때까지 게임 행동이 제한됩니다.`,
        length: 6_000,
    });
    requestHumanVerification(player);
    return !alreadyRequired;
}

/** 관리자 해제와 정상 통과가 공유하는 공개 정리 API. */
export function clearHumanVerification(player: Player, grantGrace = true): boolean {
    const changed = player.progress.getFlag(HUMAN_VERIFICATION_REQUIRED_PROGRESS_ID);
    player.progress.setFlag(HUMAN_VERIFICATION_REQUIRED_PROGRESS_ID, false);
    removeActiveChallenge(player.userId);
    releaseVerificationLock(player);
    const tracker = getTracker(player.userId);
    tracker.samples = [];
    tracker.verificationAtDefeat = undefined;
    if (grantGrace) tracker.graceUntil = Date.now() + randomInt(60, 121) * 60 * 1_000;
    emitToUser(player.userId, 'humanVerificationResult', {
        passed: true,
        message: '사람 확인이 완료되었습니다. 게임 행동 제한이 해제되었습니다.',
    });
    return changed;
}

function submitHumanVerification(player: Player, request: HumanVerificationSubmitRequest): void {
    if (!request || typeof request !== 'object'
        || typeof request.sessionId !== 'string'
        || typeof request.answer !== 'string'
        || request.answer.length > 16) return;
    const active = activeByUser.get(player.userId);
    if (!active || active.sessionId !== request.sessionId) {
        emitToUser(player.userId, 'humanVerificationResult', {
            sessionId: request.sessionId,
            passed: false,
            retryAllowed: true,
            message: '이미 만료되었거나 유효하지 않은 문제입니다. 새 문제를 받아주세요.',
        });
        return;
    }
    removeActiveChallenge(player.userId);
    const answer = request.answer.trim().toUpperCase().replace(/\s+/g, '');
    if (answer === active.answer) {
        clearHumanVerification(player, true);
        sendNotificationToUser(player.userId, {
            key: 'human-verification-passed',
            message: '사람 확인이 완료되었습니다.',
            length: 3_000,
        });
        return;
    }
    player.progress.increment(HUMAN_VERIFICATION_FAILURE_PROGRESS_ID, 1);
    emitToUser(player.userId, 'humanVerificationResult', {
        sessionId: request.sessionId,
        passed: false,
        retryAllowed: true,
        message: '입력한 문자가 일치하지 않습니다. 새 문제를 받아 다시 시도해주세요.',
    });
}

function recordMonsterDefeat(event: GameEvent): void {
    if (event.id !== GameEventIds.ENTITY_DEFEATED || !event.subject?.hasTag(GameTags.ENTITY_MONSTER)) return;
    const owner = event.actor?.attackOwner;
    if (!owner?.isPlayer) return;
    const player = owner as Player;
    if (player.progress.getFlag(HUMAN_VERIFICATION_REQUIRED_PROGRESS_ID)) return;
    const tracker = getTracker(player.userId);
    const now = event.occurredAt;
    if (now < tracker.graceUntil) return;
    tracker.totalDefeats++;
    tracker.samples.push({
        occurredAt: now,
        locationId: event.subject.locationId,
        targetKey: event.subject.name,
    });
    tracker.samples = tracker.samples.filter(sample => sample.occurredAt >= now - HUNTING_WINDOW_MS);
    const analysis = analyzeHuntingPattern(tracker.samples);
    if (!analysis.suspicious) {
        tracker.verificationAtDefeat = undefined;
        return;
    }
    tracker.verificationAtDefeat ??= tracker.totalDefeats + randomInt(8, 25);
    if (tracker.totalDefeats < tracker.verificationAtDefeat) return;
    logger.warn(
        `반복 사냥 검사 시작: UID ${player.userId}`,
        `score=${analysis.score.toFixed(2)} repeat=${analysis.routeRepetition.toFixed(2)} timing=${analysis.timingRegularity.toFixed(2)}`,
    );
    requireHumanVerification(player);
}

/** Player 로드 시 영속 검사 플래그를 런타임 제한과 화면에 복원한다. */
export function initializeHumanVerification(player: Player): void {
    if (!player.progress.getFlag(HUMAN_VERIFICATION_REQUIRED_PROGRESS_ID)) return;
    applyVerificationLock(player);
    requestHumanVerification(player);
}

/** unload 시 문제 이미지만 정리하고 영속 required 플래그는 유지한다. */
export function detachHumanVerification(player: Player): void {
    removeActiveChallenge(player.userId);
    issuingByUser.delete(player.userId);
    huntingByUser.delete(player.userId);
    releaseVerificationLock(player);
}

export function initHumanVerification(): void {
    if (initialized) return;
    initialized = true;
    subscribeGameEvent(GameEventIds.ENTITY_DEFEATED, recordMonsterDefeat);
    getIO().on('connection', socket => {
        socket.on('requestHumanVerification', () => {
            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            const player = session ? getOnlinePlayer(session.userId) : undefined;
            if (player) requestHumanVerification(player);
        });
        socket.on('submitHumanVerification', (request: HumanVerificationSubmitRequest) => {
            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            const player = session ? getOnlinePlayer(session.userId) : undefined;
            if (player) submitHumanVerification(player, request);
        });
    });
    logger.success('반복 사냥 사람 확인 모듈 초기화 완료');
}
