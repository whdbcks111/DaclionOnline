import logger from "../utils/logger.js";
import { getIO } from "./socket.js"
import { loadTemplate, sendMail } from "./mail.js";
import { randomDigits, randomHex } from "../utils/random.js";
import { isValidPayload, validateId, validatePassword, validateEmail, validateNickname } from "../utils/validators.js";
import { derivePasswordHash } from "../utils/password.js";
import { FixedWindowRateLimiter } from "../utils/rateLimit.js";
import prisma from "../config/prisma.js";
import { createSession } from "./login.js";
import type { RegisterRequest } from "../../../shared/types.js";
import type { VerifyEntry } from "../types/index.js";

const verifyMap: { [key: string]: VerifyEntry } = {}
const expiryMinute = 5;
const cooldownSeconds = 60;
const MAX_VERIFY_ATTEMPTS = 5;
const registerAttemptLimiter = new FixedWindowRateLimiter(8, 10 * 60_000, 20_000);
const verificationMailLimiter = new FixedWindowRateLimiter(5, 10 * 60_000, 20_000);
const verificationCheckLimiter = new FixedWindowRateLimiter(12, 60_000, 20_000);

function getSocketIp(socket: { handshake: { address?: string } }): string {
    return socket.handshake.address?.trim() || 'unknown';
}

export function normalizeRegistrationEmail(email: string): string {
    return email.trim().toLowerCase();
}

export function isVerifiedRegistrationEmail(
    entry: VerifyEntry | undefined,
    email: string,
    now = Date.now(),
): boolean {
    return entry?.verified === true
        && entry.expirationDate.getTime() >= now
        && entry.email === normalizeRegistrationEmail(email);
}

export type RegistrationCodeCheckResult =
    | 'verified'
    | 'already-verified'
    | 'expired'
    | 'incorrect'
    | 'attempts-exhausted';

/** 발급 코드별 오답 횟수를 소유하고 5회 이후 같은 코드를 폐기한다. */
export function checkRegistrationVerificationCode(
    entry: VerifyEntry,
    code: string,
    now = Date.now(),
): RegistrationCodeCheckResult {
    if (entry.expirationDate.getTime() < now) return 'expired';
    if (entry.verified) return 'already-verified';
    if (entry.attempts >= MAX_VERIFY_ATTEMPTS) return 'attempts-exhausted';
    if (entry.code !== code) {
        entry.attempts += 1;
        if (entry.attempts >= MAX_VERIFY_ATTEMPTS) {
            entry.expirationDate = new Date(0);
            return 'attempts-exhausted';
        }
        return 'incorrect';
    }
    entry.verified = true;
    return 'verified';
}

export const initRegister = () => {
    const io = getIO();

    io.on('connection', socket => {

        socket.on('register', async (data: RegisterRequest) => {
            try {
                if (!isValidPayload(data, { id: 'string', pw: 'string', email: 'string', nickname: 'string' })) {
                    socket.emit('registerResult', { error: '잘못된 요청입니다.' });
                    return;
                }

                const rateLimit = registerAttemptLimiter.consume(getSocketIp(socket));
                if (!rateLimit.allowed) {
                    socket.emit('registerResult', {
                        error: `가입 요청이 너무 많습니다. ${Math.ceil(rateLimit.retryAfterMs / 1000)}초 후 다시 시도해 주세요.`,
                    });
                    return;
                }

                let id = data.id;
                let pw = data.pw;
                let email = normalizeRegistrationEmail(data.email);
                let nickname = data.nickname;

                let idValidateResult = validateId(id);
                if(idValidateResult) {
                    socket.emit('registerResult', { error: idValidateResult });
                    return;
                }

                let pwValidateResult = validatePassword(pw);
                if(pwValidateResult) {
                    socket.emit('registerResult', { error: pwValidateResult });
                    return;
                }

                let emailValidateResult = validateEmail(email);
                if(emailValidateResult) {
                    socket.emit('registerResult', { error: emailValidateResult });
                    return;
                }

                const verification = verifyMap[socket.id];
                if (!verification) {
                    socket.emit('registerResult', { error: '인증번호를 보내지 않았습니다.' });
                    return;
                }
                if (!verification.verified) {
                    socket.emit('registerResult', { error: '인증이 완료되지 않았습니다.' });
                    return;
                }
                if (verification.expirationDate.getTime() < Date.now()) {
                    socket.emit('registerResult', { error: '이메일 인증이 만료되었습니다. 다시 인증해 주세요.' });
                    return;
                }
                if (!isVerifiedRegistrationEmail(verification, email)) {
                    socket.emit('registerResult', { error: '인증한 이메일과 가입 이메일이 일치하지 않습니다.' });
                    return;
                }

                let nicknameValidateResult = validateNickname(nickname);
                if(nicknameValidateResult) {
                    socket.emit('registerResult', { error: nicknameValidateResult });
                    return;
                }

                const existing = await prisma.user.findFirst({
                    where: {
                        OR: [
                            { username: id },
                            { email },
                            { nickname },
                        ],
                    },
                    select: { username: true, email: true, nickname: true },
                });

                if(existing) {
                    if(existing.username === id) {
                        socket.emit('registerResult', { error: '이미 사용 중인 아이디입니다.' });
                    } else if(existing.email === email) {
                        socket.emit('registerResult', { error: '이미 사용 중인 이메일입니다.' });
                    } else {
                        socket.emit('registerResult', { error: '이미 사용 중인 닉네임입니다.' });
                    }
                    return;
                }

                const salt = randomHex(32);
                const hash = await derivePasswordHash(pw, salt);

                const newUser = await prisma.user.create({
                    data: {
                        username: id,
                        email,
                        passwordHash: hash,
                        passwordSalt: salt,
                        nickname,
                        player: { create: {} },
                    },
                });

                delete verifyMap[socket.id!];

                const sessionToken = createSession({ id: newUser.id, username: id, nickname });
                socket.emit('registerResult', { ok: true, sessionToken });
            } catch(e) {
                logger.error('register 처리 중 오류:', e);
                socket.emit('registerResult', { error: '서버 오류가 발생했습니다.' });
            }
        });

        socket.on('sendVerifyCode', async (email: unknown) => {
            if (typeof email !== 'string') return;
            try {
                const normalizedEmail = normalizeRegistrationEmail(email);
                const emailValidation = validateEmail(normalizedEmail);
                if (emailValidation) {
                    socket.emit('verifyCodeSendResult', { error: emailValidation });
                    return;
                }
                const existing = verifyMap[socket.id];
                if (existing) {
                    const elapsed = (Date.now() - existing.sentAt.getTime()) / 1000;
                    if (elapsed < cooldownSeconds) {
                        const remaining = Math.ceil(cooldownSeconds - elapsed);
                        socket.emit('verifyCodeSendResult', { error: `${remaining}초 후에 다시 시도해 주세요.` });
                        return;
                    }
                }
                const mailRateLimit = verificationMailLimiter.consume(getSocketIp(socket));
                if (!mailRateLimit.allowed) {
                    socket.emit('verifyCodeSendResult', {
                        error: `인증 메일 요청이 너무 많습니다. ${Math.ceil(mailRateLimit.retryAfterMs / 1000)}초 후 다시 시도해 주세요.`,
                    });
                    return;
                }

                const verifyCode = randomDigits(6);
                const verifyHtmlTemplate = loadTemplate('verify-code', { code: verifyCode, expiry: `${expiryMinute}분` });

                await sendMail({
                    to: normalizedEmail,
                    subject: '[Daclion Online] 회원가입 인증번호 안내',
                    html: verifyHtmlTemplate
                });

                verifyMap[socket.id] = {
                    email: normalizedEmail,
                    code: verifyCode,
                    expirationDate: new Date(Date.now() + expiryMinute * 60 * 1000),
                    sentAt: new Date(),
                    attempts: 0,
                }
                verificationCheckLimiter.reset(`${getSocketIp(socket)}:${socket.id}`);
                socket.emit('verifyCodeSendResult', { ok: true });
            }
            catch(e) {
                logger.warn('이메일 인증번호 발송 실패:', e);
                socket.emit('verifyCodeSendResult', { error: '인증 메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
            }
        });

        socket.on('verifyCode', (code: unknown) => {
            if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
                socket.emit('verifyCodeResult', { error: '6자리 인증번호를 입력해 주세요.' });
                return;
            }
            const limiterKey = `${getSocketIp(socket)}:${socket.id}`;
            const rateLimit = verificationCheckLimiter.consume(limiterKey);
            if (!rateLimit.allowed) {
                socket.emit('verifyCodeResult', {
                    error: `인증 확인 요청이 너무 많습니다. ${Math.ceil(rateLimit.retryAfterMs / 1000)}초 후 다시 시도해 주세요.`,
                });
                return;
            }
            const entry = verifyMap[socket.id];
            if (!entry) {
                socket.emit('verifyCodeResult', { error: '인증번호를 보내지 않았습니다.' });
                return;
            }

            const result = checkRegistrationVerificationCode(entry, code);
            if (result === 'verified' || result === 'already-verified') {
                verificationCheckLimiter.reset(limiterKey);
                socket.emit('verifyCodeResult', { ok: true });
            } else if (result === 'expired') {
                delete verifyMap[socket.id];
                socket.emit('verifyCodeResult', { error: '인증번호가 만료되었습니다.' });
            } else if (result === 'attempts-exhausted') {
                delete verifyMap[socket.id];
                socket.emit('verifyCodeResult', { error: '인증 시도 횟수를 초과했습니다. 인증번호를 다시 받아주세요.' });
            } else {
                socket.emit('verifyCodeResult', { error: '인증번호가 일치하지 않습니다.' });
            }
            return;
        });

        socket.on('disconnect', () => {
            delete verifyMap[socket.id];
            verificationCheckLimiter.reset(`${getSocketIp(socket)}:${socket.id}`);
        });
    });

    logger.success('회원가입 모듈 초기화 완료');
}
