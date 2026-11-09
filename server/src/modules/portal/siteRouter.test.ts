import { request as httpRequest } from 'node:http';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import test from 'node:test';
import { createSession, removeSession } from './login.js';
import { siteRouter, PORTAL_HOST, GAME_HOST } from './siteRouter.js';

function requestSite(origin: string, path: string, host: string, cookie = ''): Promise<Response> {
    return new Promise((resolve, reject) => {
        const request = httpRequest(new URL(path, origin), { headers: { host, cookie } }, response => {
            const headers = new Headers();
            for (const [key, value] of Object.entries(response.headers)) {
                for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) headers.append(key, item);
            }
            response.resume();
            resolve(new Response(null, { status: response.statusCode, headers }));
        });
        request.on('error', reject);
        request.end();
    });
}

test('게임 도메인의 공통 인증은 포털로 보내고 포털 게임 링크는 인증 연결로 보낸다', async () => {
    const server = express().use(siteRouter).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
        const login = await requestSite(origin, '/login', GAME_HOST);
        assert.equal(login.headers.get('location'), `http://${PORTAL_HOST}/login?next=daclion`);
        const game = await requestSite(origin, '/games/daclion/', PORTAL_HOST);
        assert.equal(game.headers.get('location'), '/auth/daclion');
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('포털 세션은 대상 브라우저의 state 쿠키와 일회용 코드로만 게임에 연결된다', async () => {
    const server = express().use(siteRouter).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const token = createSession({ id: 99504, username: 'domain-test', nickname: '연결시험' });
    const request = (path: string, host: string, cookie = '') => requestSite(origin, path, host, cookie);
    try {
        const start = await request('/auth/start', GAME_HOST);
        const stateCookie = start.headers.getSetCookie()[0];
        assert.match(stateCookie, /HttpOnly/);
        assert.ok(!stateCookie.includes('Domain='));
        const authorize = new URL(start.headers.get('location')!);
        const issued = await request(authorize.pathname + authorize.search, PORTAL_HOST, `sessionToken=${token}`);
        const callback = new URL(issued.headers.get('location')!);
        assert.equal(callback.hostname, GAME_HOST);
        assert.ok(!callback.href.includes(token));
        assert.equal(issued.headers.get('cache-control'), 'no-store');
        const path = callback.pathname + callback.search;
        const invalid = await request(path, GAME_HOST);
        assert.equal(invalid.headers.get('location'), `http://${PORTAL_HOST}/login?next=daclion`);
        const connected = await request(path, GAME_HOST, stateCookie.split(';')[0]);
        assert.equal(connected.headers.get('location'), '/');
        const sessionCookie = connected.headers.getSetCookie().find(cookie => cookie.startsWith('sessionToken='));
        assert.ok(sessionCookie?.startsWith(`sessionToken=${token};`));
        assert.ok(!sessionCookie?.includes('Domain='));
        const replay = await request(path, GAME_HOST, stateCookie.split(';')[0]);
        assert.equal(replay.headers.get('location'), `http://${PORTAL_HOST}/login?next=daclion`);
        const wrongHost = await request('/auth/start', PORTAL_HOST);
        assert.equal(wrongHost.status, 404);
        const signedOut = await request(authorize.pathname + authorize.search, PORTAL_HOST);
        assert.equal(signedOut.headers.get('location'), '/login?next=daclion');
    } finally {
        removeSession(token);
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
});
