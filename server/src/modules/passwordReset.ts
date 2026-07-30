import logger from '../utils/logger.js';
import prisma from '../config/prisma.js';
import { getIO } from './socket.js';
import { loadTemplate, sendMail } from './mail.js';
import { randomDigits, randomHex } from '../utils/random.js';
import { derivePasswordHash } from '../utils/password.js';
import { isValidPayload, validateEmail, validatePassword } from '../utils/validators.js';
import { FixedWindowRateLimiter } from '../utils/rateLimit.js';
import { revokeUserSessions } from './login.js';
import type { PasswordResetRequest } from '../../../shared/types.js';

const EXPIRY_MS = 5 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;
const MAX_CODE_ATTEMPTS = 5;
const mailLimiter = new FixedWindowRateLimiter(5, 10 * 60_000, 20_000);
const resetLimiter = new FixedWindowRateLimiter(12, 60_000, 20_000);

export interface PasswordResetEntry {
    userId: number;
    email: string;
    code: string;
    expiresAt: number;
    sentAt: number;
    attempts: number;
}

export type PasswordResetCodeResult = 'valid' | 'expired' | 'incorrect' | 'attempts-exhausted';

const entries = new Map<string, PasswordResetEntry>();
const requestTimes = new Map<string, number>();

function socketIp(socket: { handshake: { address?: string } }): string {
    return socket.handshake.address?.trim() || 'unknown';
}

export function normalizePasswordResetEmail(email: string): string {
    return email.trim().toLowerCase();
}

/** 발급 건별 오답 횟수를 올리고 5회째에는 같은 코드를 폐기한다. */
export function checkPasswordResetCode(
    entry: PasswordResetEntry,
    code: string,
    now = Date.now(),
): PasswordResetCodeResult {
    if (entry.expiresAt < now) return 'expired';
    if (entry.attempts >= MAX_CODE_ATTEMPTS) return 'attempts-exhausted';
    if (entry.code === code) return 'valid';
    entry.attempts += 1;
    if (entry.attempts >= MAX_CODE_ATTEMPTS) {
        entry.expiresAt = 0;
        return 'attempts-exhausted';
    }
    return 'incorrect';
}

export function initPasswordReset(): void {
    const io = getIO();

    io.on('connection', socket => {
        socket.on('sendPasswordResetCode', async (rawEmail: unknown) => {
            if (typeof rawEmail !== 'string') return;
            const email = normalizePasswordResetEmail(rawEmail);
            const validationError = validateEmail(email);
            if (validationError) {
                socket.emit('passwordResetCodeSendResult', { error: validationError });
                return;
            }

            const now = Date.now();
            const lastRequestAt = requestTimes.get(socket.id);
            if (lastRequestAt !== undefined && now - lastRequestAt < RESEND_COOLDOWN_MS) {
                const remaining = Math.ceil((RESEND_COOLDOWN_MS - (now - lastRequestAt)) / 1000);
                socket.emit('passwordResetCodeSendResult', { error: `${remaining}초 후에 다시 시도해 주세요.` });
                return;
            }
            const rateLimit = mailLimiter.consume(socketIp(socket));
            if (!rateLimit.allowed) {
                socket.emit('passwordResetCodeSendResult', {
                    error: `재설정 메일 요청이 너무 많습니다. ${Math.ceil(rateLimit.retryAfterMs / 1000)}초 후 다시 시도해 주세요.`,
                });
                return;
            }
            requestTimes.set(socket.id, now);
            // 새 요청은 계정 존재 여부와 무관하게 이전 발급 건을 폐기한다.
            entries.delete(socket.id);

            try {
                const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
                if (user) {
                    const code = randomDigits(6);
                    await sendMail({
                        to: email,
                        subject: '[Daclion Online] 비밀번호 재설정 인증번호 안내',
                        html: loadTemplate('verify-code', {
                            purpose: '비밀번호 재설정',
                            code,
                            expiry: '5분',
                        }),
                    });
                    entries.set(socket.id, {
                        userId: user.id,
                        email,
                        code,
                        expiresAt: Date.now() + EXPIRY_MS,
                        sentAt: Date.now(),
                        attempts: 0,
                    });
                }
                // 계정 존재 여부가 응답으로 노출되지 않게 같은 성공 문구를 사용한다.
                socket.emit('passwordResetCodeSendResult', { ok: true });
            } catch (error) {
                logger.warn('비밀번호 재설정 메일 발송 실패:', error);
                socket.emit('passwordResetCodeSendResult', {
                    error: '재설정 메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.',
                });
            }
        });

        socket.on('resetPassword', async (data: PasswordResetRequest) => {
            if (!isValidPayload(data, { code: 'string', pw: 'string' })) {
                socket.emit('passwordResetResult', { error: '잘못된 요청입니다.' });
                return;
            }
            const passwordError = validatePassword(data.pw);
            if (passwordError) {
                socket.emit('passwordResetResult', { error: passwordError });
                return;
            }
            if (!/^\d{6}$/.test(data.code)) {
                socket.emit('passwordResetResult', { error: '6자리 인증번호를 입력해 주세요.' });
                return;
            }
            const limiterKey = `${socketIp(socket)}:${socket.id}`;
            const rateLimit = resetLimiter.consume(limiterKey);
            if (!rateLimit.allowed) {
                socket.emit('passwordResetResult', {
                    error: `재설정 요청이 너무 많습니다. ${Math.ceil(rateLimit.retryAfterMs / 1000)}초 후 다시 시도해 주세요.`,
                });
                return;
            }

            const entry = entries.get(socket.id);
            if (!entry) {
                socket.emit('passwordResetResult', { error: '인증번호가 없거나 만료되었습니다. 다시 받아주세요.' });
                return;
            }
            const result = checkPasswordResetCode(entry, data.code);
            if (result !== 'valid') {
                if (result === 'expired' || result === 'attempts-exhausted') entries.delete(socket.id);
                socket.emit('passwordResetResult', {
                    error: result === 'incorrect'
                        ? '인증번호가 일치하지 않습니다.'
                        : result === 'attempts-exhausted'
                            ? '인증 시도 횟수를 초과했습니다. 인증번호를 다시 받아주세요.'
                            : '인증번호가 만료되었습니다. 다시 받아주세요.',
                });
                return;
            }

            try {
                const salt = randomHex(32);
                const passwordHash = await derivePasswordHash(data.pw, salt);
                await prisma.user.update({
                    where: { id: entry.userId },
                    data: { passwordSalt: salt, passwordHash },
                });
                entries.delete(socket.id);
                resetLimiter.reset(limiterKey);
                await revokeUserSessions(entry.userId);
                socket.emit('passwordResetResult', { ok: true });
            } catch (error) {
                logger.error('비밀번호 재설정 실패:', error);
                socket.emit('passwordResetResult', { error: '서버 오류가 발생했습니다.' });
            }
        });

        socket.on('disconnect', () => {
            entries.delete(socket.id);
            requestTimes.delete(socket.id);
            resetLimiter.reset(`${socketIp(socket)}:${socket.id}`);
        });
    });

    logger.success('비밀번호 재설정 모듈 초기화 완료');
}
