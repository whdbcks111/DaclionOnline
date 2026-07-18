import assert from 'node:assert/strict';
import test from 'node:test';
import { setUserChannel } from './channel.js';
import {
    getUserCountData,
    isUserOnline,
    setUserOffline,
    setUserOnline,
} from './login.js';
import { getOnlinePlayers } from './player.js';
import { registerOnlinePlayer, unregisterOnlinePlayer } from './playerRegistry.js';
import type Player from '../models/Player.js';

test('접속 인원은 다중 탭을 소켓 수가 아닌 사용자 수로 집계한다', () => {
    const mainUserId = 9811;
    const tradeUserId = 9812;
    setUserChannel(mainUserId, null);
    setUserChannel(tradeUserId, '거래');

    try {
        setUserOnline(mainUserId, 'main-tab-1');
        setUserOnline(mainUserId, 'main-tab-1');
        setUserOnline(mainUserId, 'main-tab-2');
        setUserOnline(tradeUserId, 'trade-tab-1');

        assert.deepEqual(getUserCountData(), {
            total: 2,
            channelCounts: {
                'channel:main': 1,
                'channel:공지': 0,
                'channel:잡담': 0,
                'channel:거래': 1,
                'channel:파티': 0,
            },
        });

        setUserOffline(mainUserId, 'main-tab-1');
        assert.equal(isUserOnline(mainUserId), true);
        assert.equal(getUserCountData().total, 2);

        setUserOffline(mainUserId, 'main-tab-2');
        assert.equal(isUserOnline(mainUserId), false);
        assert.equal(getUserCountData().total, 1);
        assert.equal(getUserCountData().channelCounts['channel:main'], 0);
    } finally {
        setUserOffline(mainUserId, 'main-tab-1');
        setUserOffline(mainUserId, 'main-tab-2');
        setUserOffline(tradeUserId, 'trade-tab-1');
    }
});

test('위치 HUD용 온라인 플레이어 목록은 연결이 끝난 메모리 인스턴스를 제외한다', () => {
    const userId = 9821;
    registerOnlinePlayer({ userId } as Player);
    try {
        assert.equal(getOnlinePlayers().some(player => player.userId === userId), false);
        setUserOnline(userId, 'location-tab');
        assert.equal(getOnlinePlayers().some(player => player.userId === userId), true);
        setUserOffline(userId, 'location-tab');
        assert.equal(getOnlinePlayers().some(player => player.userId === userId), false);
    } finally {
        setUserOffline(userId, 'location-tab');
        unregisterOnlinePlayer(userId);
    }
});
