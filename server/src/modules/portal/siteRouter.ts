import { randomHex } from '../../utils/random.js';
import { Router } from 'express';
import { getSession } from './login.js';
import { LoginHandoff } from './loginHandoff.js';

export const PORTAL_HOST = 'gamebox.mcv.kr';
export const GAME_HOST = 'daclion.mcv.kr';
const handoff = new LoginHandoff();
export const siteRouter = Router();

siteRouter.use((req, res, next) => {
    // 인증 코드와 세션별 redirect가 캐시·Referer에 남지 않게 한다.
    if (req.path.startsWith('/auth/')) {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Referrer-Policy', 'no-referrer');
    }
    if (req.hostname === GAME_HOST && ['/login', '/register', '/password-reset'].includes(req.path)) {
        res.redirect(302, `${req.protocol}://${PORTAL_HOST}${req.path}?next=daclion`);
        return;
    }
    if (req.hostname === PORTAL_HOST && (req.path === '/games/daclion' || req.path.startsWith('/games/daclion/'))) {
        res.redirect(302, '/auth/daclion');
        return;
    }
    next();
});

siteRouter.get('/auth/start', (req, res) => {
    if (req.hostname !== GAME_HOST) { res.status(404).end(); return; }
    const state = randomHex(32);
    res.cookie('gameboxLoginState', state, { path: '/auth', maxAge: 120_000, httpOnly: true, sameSite: 'lax', secure: req.secure });
    res.redirect(302, `${req.protocol}://${PORTAL_HOST}/auth/daclion?state=${state}`);
});

siteRouter.get('/auth/daclion', (req, res) => {
    if (req.hostname !== PORTAL_HOST) { res.status(404).end(); return; }
    const state = typeof req.query.state === 'string' && /^[0-9a-f]{64}$/.test(req.query.state) ? req.query.state : undefined;
    if (!state) { res.redirect(302, `${req.protocol}://${GAME_HOST}/auth/start`); return; }
    const token = req.headers.cookie?.match(/(?:^|;\s*)sessionToken=([^;]+)/)?.[1];
    if (!token || !getSession(token)) { res.redirect(302, '/login?next=daclion'); return; }
    try {
        const code = handoff.issue(token, state);
        res.redirect(302, `${req.protocol}://${GAME_HOST}/auth/portal?code=${code}&state=${state}`);
    } catch {
        res.status(429).send('접속 요청이 많습니다. 잠시 후 다시 시도해주세요.');
    }
});

siteRouter.get('/auth/portal', (req, res) => {
    if (req.hostname !== GAME_HOST) { res.status(404).end(); return; }
    const state = req.headers.cookie?.match(/(?:^|;\s*)gameboxLoginState=([^;]+)/)?.[1];
    const token = state && req.query.state === state && typeof req.query.code === 'string'
        ? handoff.consume(req.query.code, state) : undefined;
    res.clearCookie('gameboxLoginState', { path: '/auth', httpOnly: true, sameSite: 'lax', secure: req.secure });
    if (!token || !getSession(token)) {
        res.redirect(302, `${req.protocol}://${PORTAL_HOST}/login?next=daclion`);
        return;
    }
    res.cookie('sessionToken', token, { path: '/', maxAge: 7 * 24 * 60 * 60 * 1_000, sameSite: 'lax', secure: req.secure });
    res.redirect(302, '/');
});
