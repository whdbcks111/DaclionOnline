import assert from 'node:assert/strict';
import test from 'node:test';
import {
    canUserJoinChannel,
    getAvailableChannels,
    isAvailablePublicChannel,
} from './channel.js';

test('채널 참가 경계는 마스터 공개 채널과 자기 개인 채널만 허용한다', () => {
    assert.equal(isAvailablePublicChannel(null), true);
    assert.equal(isAvailablePublicChannel('거래'), true);
    assert.equal(isAvailablePublicChannel('attacker-created-channel'), false);
    assert.equal(canUserJoinChannel(31, 'private_31'), true);
    assert.equal(canUserJoinChannel(31, 'private_32'), false);
    assert.equal(canUserJoinChannel(31, 'attacker-created-channel'), false);
});

test('채널 목록은 내부 마스터 배열을 노출하지 않는 snapshot이다', () => {
    const channels = getAvailableChannels();
    channels[0].name = '변조';
    assert.equal(getAvailableChannels()[0].name, '메인');
});
