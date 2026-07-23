import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { initSocket } from './socket.js';
import { executeAdminPanelAction, getAdminPanelBootstrap } from './adminPanel.js';
import { defineTitle } from '../models/Title.js';

initSocket(createServer(), '*');

defineTitle({
    id: 'test:admin-panel-title',
    name: '관리자 패널 시험 칭호',
    description: '관리자 칭호 선택 항목을 검증합니다.',
    acquisitionDescription: '관리자 시험에서만 사용합니다.',
    canAcquire: () => false,
});

test('관리자 패널 bootstrap은 검색 가능한 칭호 마스터 목록을 제공한다', () => {
    const title = getAdminPanelBootstrap().titles.find(option => option.value === 'test:admin-panel-title');
    assert.equal(title?.label, '관리자 패널 시험 칭호');
    assert.match(title?.description ?? '', /관리자 시험에서만 사용/);
});

test('관리자 패널은 전체 채팅과 전체 알림 공지를 서버에서 검증해 발송한다', async () => {
    const chat = await executeAdminPanelAction(1, {
        action: 'broadcast_chat_notice',
        values: { message: '서버 점검 안내' },
    });
    assert.equal(chat.ok, true);
    assert.equal(chat.message, '전체 채팅 공지를 발송했습니다.');

    const notification = await executeAdminPanelAction(1, {
        action: 'broadcast_notification',
        values: { message: '곧 서버가 재시작됩니다.', duration: 7 },
    });
    assert.equal(notification.ok, true);
    assert.equal(notification.message, '전체 알림 공지를 발송했습니다.');
});

test('관리자 공지는 빈 내용과 허용 범위를 넘는 시간을 거부한다', async () => {
    const empty = await executeAdminPanelAction(1, {
        action: 'broadcast_chat_notice',
        values: { message: '   ' },
    });
    assert.equal(empty.ok, undefined);
    assert.match(empty.error ?? '', /message 값이 필요/);

    const duration = await executeAdminPanelAction(1, {
        action: 'broadcast_notification',
        values: { message: '공지', duration: 61 },
    });
    assert.equal(duration.ok, undefined);
    assert.match(duration.error ?? '', /duration 값이 올바르지/);
});
