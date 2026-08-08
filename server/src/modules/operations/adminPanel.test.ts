import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import '../../data/economy/items.js';
import '../../data/combat/skills.js';
import { initSocket } from '../infrastructure/socket.js';
import { executeAdminPanelAction, getAdminPanelBootstrap } from './adminPanel.js';
import { defineTitle } from '../../models/progression/Title.js';
import type Player from '../../models/actors/Player.js';
import { PlayerProgress } from '../../models/progression/Progress.js';
import { getCosmeticFrameSnapshots } from '../../models/progression/PlayerCosmetics.js';
import { registerOnlinePlayer, unregisterOnlinePlayer } from '../player/playerRegistry.js';
import prisma from '../../config/prisma.js';

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

test('관리자 패널 bootstrap은 프레임과 감정표현 지급 목록을 제공한다', () => {
    const bootstrap = getAdminPanelBootstrap();
    assert.equal(bootstrap.cosmeticFrames.find(option => option.value === 'aurora')?.label, '오로라');
    assert.match(bootstrap.chatEmotes.find(option => option.value === 'heart')?.label ?? '', /하트/);
});

test('관리자 패널은 선택한 플레이어의 프레임을 조건 없이 지급하고 삭제한다', async () => {
    const userId = 984_001;
    const player = {
        userId,
        name: '관리자 꾸미기 시험자',
        level: 1,
        progress: PlayerProgress.createEmpty(userId),
        async save() {},
    } as unknown as Player;
    registerOnlinePlayer(player);
    try {
        const granted = await executeAdminPanelAction(1, {
            action: 'grant_cosmetic_frame',
            targetUserId: userId,
            values: { frameKey: 'aurora' },
        });
        assert.equal(granted.ok, true);
        assert.equal(getCosmeticFrameSnapshots(player).find(frame => frame.key === 'aurora')?.adminGranted, true);

        const removed = await executeAdminPanelAction(1, {
            action: 'remove_cosmetic_frame',
            targetUserId: userId,
            values: { frameKey: 'aurora' },
        });
        assert.equal(removed.ok, true);
        const snapshot = getCosmeticFrameSnapshots(player).find(frame => frame.key === 'aurora');
        assert.equal(snapshot?.unlocked, false);
        assert.equal(snapshot?.revoked, true);
    } finally {
        unregisterOnlinePlayer(userId);
    }
});

test('관리자 패널은 특정 유저에게 복합 보상 우편을 발송하고 우편을 삭제한다', async context => {
    const userId = 984_002;
    const player = { userId, name: '관리자 우편 시험자' } as unknown as Player;
    registerOnlinePlayer(player);
    const playerDelegate = prisma.player as unknown as { findUnique(args: unknown): Promise<unknown> };
    const mailboxDelegate = prisma.mailboxMessage as unknown as {
        create(args: unknown): Promise<Record<string, unknown>>;
        findFirst(args: unknown): Promise<unknown>;
        deleteMany(args: unknown): Promise<{ count: number }>;
    };
    const originalPlayerFindUnique = playerDelegate.findUnique;
    const originalCreate = mailboxDelegate.create;
    const originalFindFirst = mailboxDelegate.findFirst;
    const originalDeleteMany = mailboxDelegate.deleteMany;
    let createdData: Record<string, unknown> | undefined;
    playerDelegate.findUnique = context.mock.fn(async () => ({ userId }));
    mailboxDelegate.create = context.mock.fn(async args => {
        createdData = (args as { data: Record<string, unknown> }).data;
        return {
            id: 771,
            ...createdData,
            createdAt: new Date(),
            readAt: null,
            claimedAt: null,
            expiresAt: null,
            archivedAt: null,
        };
    });
    mailboxDelegate.findFirst = context.mock.fn(async () => ({ subject: '복합 지급', sourceKey: null }));
    mailboxDelegate.deleteMany = context.mock.fn(async () => ({ count: 1 }));
    try {
        const sent = await executeAdminPanelAction(1, {
            action: 'send_mail',
            targetUserId: userId,
            values: {
                senderLabel: '운영팀',
                subject: '복합 지급',
                body: '테스트 보상을 수령해 주세요.',
                expiresInHours: 0,
                rewardBundle: JSON.stringify({
                    items: [
                        { itemDataId: 'health_potion', count: 3 },
                        { itemDataId: 'mana_potion', count: 5 },
                    ],
                    gold: 12_345,
                    titleIds: ['test:admin-panel-title'],
                    skills: [{ skillDataId: 'power_strike', level: 2 }],
                }),
            },
        });
        assert.equal(sent.ok, true);
        assert.match(sent.message ?? '', /우편 #771/);
        const attachments = createdData?.attachments as { version?: number; items?: unknown[]; gold?: number };
        assert.equal(attachments.version, 2);
        assert.equal(attachments.items?.length, 2);
        assert.equal(attachments.gold, 12_345);

        const removed = await executeAdminPanelAction(1, {
            action: 'remove_mail',
            targetUserId: userId,
            values: { mailId: 771 },
        });
        assert.equal(removed.ok, true);
        assert.match(removed.message ?? '', /우편 #771/);
    } finally {
        playerDelegate.findUnique = originalPlayerFindUnique;
        mailboxDelegate.create = originalCreate;
        mailboxDelegate.findFirst = originalFindFirst;
        mailboxDelegate.deleteMany = originalDeleteMany;
        unregisterOnlinePlayer(userId);
    }
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
