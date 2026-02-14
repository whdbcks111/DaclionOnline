import { pbkdf2Sync } from "crypto";
import logger from "../utils/logger.js";
import { getIO } from "./socket.js"
import { loadTemplate, sendMail } from "./mail.js";
import { randomDigits, randomHex } from "../utils/random.js";
import { isValidPayload, validateId, validatePassword, validateEmail, validateNickname } from "../utils/validators.js";
import prisma from "../config/prisma.js";
import { createSession } from "./login.js";
import type { RegisterRequest } from "../shared/types.js";
import type { VerifyEntry } from "../types/index.js";

const verifyMap: { [key: string]: VerifyEntry } = {}
const expiryMinute = 5;

export const initRegister = () => {
    const io = getIO();

    io.on('connection', socket => {

        socket.on('register', async (data: RegisterRequest) => {
            if (!isValidPayload(data, { id: 'string', pw: 'string', email: 'string', nickname: 'string' })) {
                socket.emit('registerResult', { error: '잘못된 요청입니다.' });
                return;
            }

            if(!(socket.id in verifyMap)) {
                socket.emit('registerResult', { error: '인증번호를 보내지 않았습니다.' });
                return;
            }

            if(!verifyMap[socket.id].verified) {
                socket.emit('registerResult', { error: '인증이 완료되지 않았습니다.' });
                return;
            }

            let id = data.id;
            let pw = data.pw;
            let email = data.email;
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
            const hash = pbkdf2Sync(pw, salt, 10000, 64, 'sha512').toString('hex');

            const newUser = await prisma.user.create({
                data: {
                    username: id,
                    email,
                    passwordHash: hash,
                    passwordSalt: salt,
                    nickname,
                },
            });

            delete verifyMap[socket.id!];
            
            const sessionToken = createSession({ id: newUser.id, username: id, nickname });
            socket.emit('registerResult', { ok: true, sessionToken });
        });

        socket.on('sendVerifyCode', (email: unknown) => {
            if (typeof email !== 'string') return;
            try {
                const verifyCode = randomDigits(6);
                const verifyHtmlTemplate = loadTemplate('verify-code', { code: verifyCode, expiry: `${expiryMinute}분` });

                sendMail({
                    to: email,
                    subject: '[Daclion Online] 회원가입 인증번호 안내',
                    html: verifyHtmlTemplate
                });

                verifyMap[socket.id] = { code: verifyCode, expirationDate: new Date(Date.now() + expiryMinute * 60 * 1000) }
                socket.emit('verifyCodeSendResult', { ok: true });
            }
            catch(e) {
                socket.emit('verifyCodeSendResult', { error: String(e) });
            }
        });

        socket.on('verifyCode', (code: unknown) => {
            if (typeof code !== 'string') return;
            if(!(socket.id in verifyMap)) {
                socket.emit('verifyCodeResult', { error: '인증번호를 보내지 않았습니다.' });
                return;
            }

            if(verifyMap[socket.id].expirationDate.getTime() < Date.now()) {
                socket.emit('verifyCodeResult', { error: '인증번호가 만료되었습니다.' });
                return;
            }

            if(verifyMap[socket.id].code !== code) {
                socket.emit('verifyCodeResult', { error: '인증번호가 일치하지 않습니다.' });
                return;
            }

            verifyMap[socket.id].verified = true;
            socket.emit('verifyCodeResult', { ok: true });
            return;
        });

    });

    logger.success('회원가입 모듈 초기화 완료');
}