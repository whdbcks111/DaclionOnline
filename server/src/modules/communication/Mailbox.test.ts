import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { type TestContext } from 'node:test';
import '../../data/economy/items.js';
import prisma from '../../config/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import Inventory from '../../models/economy/Inventory.js';
import { defineItem, getItemData, type ItemSnapshot } from '../../models/economy/Item.js';
import {
    MAILBOX_ATTACHMENT_VERSION,
    MAILBOX_BULK_INSERT_BATCH_SIZE,
    MAILBOX_SOURCE_KEY_PATTERN,
    decodeMailboxAttachments,
    encodeMailboxAttachments,
    sendSystemMail,
    sendSystemMailToAllPlayers,
    sendSystemMailToRecipients,
    type SendBulkSystemMailInput,
} from './mailbox.js';

type PlayerFindManyArguments = {
    readonly where?: { readonly userId?: { readonly in?: readonly number[] } };
    readonly select?: { readonly userId?: boolean };
    readonly orderBy?: { readonly userId?: 'asc' | 'desc' };
};

type MailboxCreateManyArguments = {
    readonly data: Prisma.MailboxMessageCreateManyInput
        | readonly Prisma.MailboxMessageCreateManyInput[];
};

type TransactionRunnerHost = {
    $transaction<T>(
        action: (transaction: Prisma.TransactionClient) => Promise<T>,
        options?: unknown,
    ): Promise<T>;
};

interface FakeBulkTransactionOptions {
    readonly playerIds: readonly number[];
    readonly failCreateManyCall?: number;
}

interface FakeBulkTransactionState {
    readonly findManyArguments: PlayerFindManyArguments[];
    readonly createManyBatches: Prisma.MailboxMessageCreateManyInput[][];
    readonly committedRows: Prisma.MailboxMessageCreateManyInput[];
    readonly rolledBackRows: Prisma.MailboxMessageCreateManyInput[];
    readonly transactionOptions: unknown[];
    transactionCalls: number;
}

function installBulkTransactionMock(
    context: TestContext,
    options: FakeBulkTransactionOptions,
): FakeBulkTransactionState {
    const state: FakeBulkTransactionState = {
        findManyArguments: [],
        createManyBatches: [],
        committedRows: [],
        rolledBackRows: [],
        transactionOptions: [],
        transactionCalls: 0,
    };
    const transactionHost = prisma as unknown as TransactionRunnerHost;
    const originalTransaction = transactionHost.$transaction;
    const transactionReplacement = async <T>(
        action: (transaction: Prisma.TransactionClient) => Promise<T>,
        transactionOptions?: unknown,
    ): Promise<T> => {
        state.transactionCalls += 1;
        state.transactionOptions.push(transactionOptions);
        const stagedRows: Prisma.MailboxMessageCreateManyInput[] = [];
        const transaction = {
            player: {
                async findMany(args: PlayerFindManyArguments) {
                    state.findManyArguments.push(args);
                    const requestedIds = args.where?.userId?.in;
                    const playerIds = requestedIds
                        ? options.playerIds.filter(playerId => requestedIds.includes(playerId))
                        : options.playerIds;
                    return playerIds.map(userId => ({ userId }));
                },
            },
            mailboxMessage: {
                async createMany(args: MailboxCreateManyArguments) {
                    const rows = Array.isArray(args.data) ? [...args.data] : [args.data];
                    state.createManyBatches.push(rows);
                    if (state.createManyBatches.length === options.failCreateManyCall) {
                        throw new Error('시험용 두 번째 청크 실패');
                    }
                    stagedRows.push(...rows);
                    return { count: rows.length };
                },
            },
        } as unknown as Prisma.TransactionClient;

        try {
            const result = await action(transaction);
            state.committedRows.push(...stagedRows);
            return result;
        } catch (error) {
            state.rolledBackRows.push(...stagedRows);
            throw error;
        }
    };
    transactionHost.$transaction = context.mock.fn(transactionReplacement);
    context.after(() => {
        transactionHost.$transaction = originalTransaction;
    });
    return state;
}

const BULK_MAIL_INPUT: SendBulkSystemMailInput = Object.freeze({
    senderLabel: '  관리자  ',
    subject: '  공동 보상  ',
    body: '  우편함에서 수령해 주세요.  ',
    items: Object.freeze([snapshot('health_potion', 2)]),
});

function snapshot(itemDataId: string, count: number): ItemSnapshot {
    return {
        itemDataId,
        count,
        durability: getItemData(itemDataId)?.baseDurability ?? null,
        metadataDelta: null,
        tags: [],
    };
}

test('우편 첨부는 version 1 ItemSnapshot JSON으로 왕복하며 원본 배열을 복제한다', () => {
    const source = [snapshot('health_potion', 3)];
    const encoded = encodeMailboxAttachments(source);
    assert.equal(encoded?.version, MAILBOX_ATTACHMENT_VERSION);
    source[0].count = 99;

    const decoded = decodeMailboxAttachments(encoded);
    assert.equal(decoded?.[0].itemDataId, 'health_potion');
    assert.equal(decoded?.[0].count, 3);
});

test('손상·구버전·과도한 우편 첨부 payload는 지급 계획으로 해석하지 않는다', () => {
    assert.equal(decodeMailboxAttachments({ version: 0, items: [] }), undefined);
    assert.equal(decodeMailboxAttachments({
        version: 1,
        items: [{ ...snapshot('health_potion', 1), count: -1 }],
    }), undefined);
    assert.throws(() => encodeMailboxAttachments([snapshot('health_potion', 1_000_001)]));
});

test('우편 sourceKey는 DB collation과 무관한 소문자 ASCII 규격만 허용한다', () => {
    assert.equal(MAILBOX_SOURCE_KEY_PATTERN.test('daily:quest/2026-08-03.player_1'), true);
    assert.equal(MAILBOX_SOURCE_KEY_PATTERN.test('a'), true);
    assert.equal(MAILBOX_SOURCE_KEY_PATTERN.test('A:reward'), false);
    assert.equal(MAILBOX_SOURCE_KEY_PATTERN.test('보상:1'), false);
    assert.equal(MAILBOX_SOURCE_KEY_PATTERN.test('-reward'), false);
    assert.equal(MAILBOX_SOURCE_KEY_PATTERN.test(`a${'b'.repeat(150)}`), false);
});

test('영속 지급 계획은 비스택 장비 row 폭증을 100개에서 차단한다', () => {
    defineItem({
        id: 'mailbox_test_nonstackable',
        name: '우편 비스택 시험품',
        description: '',
        image: 'items/old_sword',
        category: '시험',
        weight: 0,
        stackable: false,
        maxStack: 1,
        baseMetadata: null,
        onUse: null,
        equipSlot: null,
        modifiers: null,
        baseDurability: null,
        tags: [],
    });
    const inventory = Inventory.createEmpty(51_001, 1_000);
    assert.equal(inventory.preparePersistedGrant([snapshot('mailbox_test_nonstackable', 100)])?.rows.length, 100);
    assert.equal(inventory.preparePersistedGrant([snapshot('mailbox_test_nonstackable', 101)]), null);
});

test('DB에서 생성된 지급 행은 Clean으로 흡수하고 기존 dirty 상태는 덮어쓰지 않는다', () => {
    const cleanInventory = Inventory.createEmpty(51_002, 1_000);
    assert.equal(cleanInventory.adoptPersistedGrant([{
        id: 9001,
        playerId: 51_002,
        itemDataId: 'health_potion',
        count: 2,
        durability: null,
        metadata: { version: 1, delta: {} },
        tags: [],
        sortOrder: 0,
    }]), true);
    assert.equal(cleanInventory.getItem(9001)?.count, 2);
    assert.equal(cleanInventory.dirty, false);
    assert.equal(cleanInventory.adoptPersistedGrant([{
        id: 9001,
        playerId: 51_002,
        itemDataId: 'health_potion',
        count: 2,
        durability: null,
        metadata: { version: 1, delta: {} },
        tags: [],
        sortOrder: 0,
    }]), true, '같은 DB id 재적용은 멱등이어야 한다.');
    assert.equal(cleanInventory.items.length, 1);

    const adopted = cleanInventory.getItem(9001);
    assert.ok(adopted);
    assert.equal(cleanInventory.removeItemInstance(adopted, adopted.count), true);
    assert.equal(cleanInventory.adoptPersistedGrant([{
        id: 9001,
        playerId: 51_002,
        itemDataId: 'health_potion',
        count: 2,
        durability: null,
        metadata: { version: 1, delta: {} },
        tags: [],
        sortOrder: 0,
    }]), true, '삭제 대기 중인 DB id도 다시 흡수하지 않아야 한다.');
    assert.equal(cleanInventory.items.length, 0);

    const dirtyInventory = Inventory.createEmpty(51_003, 1_000);
    assert.equal(dirtyInventory.addItem('mana_potion', 1), true);
    assert.equal(dirtyInventory.dirty, true);
    assert.equal(dirtyInventory.adoptPersistedGrant([{
        id: 9002,
        playerId: 51_003,
        itemDataId: 'health_potion',
        count: 1,
        durability: null,
        metadata: { version: 1, delta: {} },
        tags: [],
        sortOrder: 1,
    }]), true);
    assert.equal(dirtyInventory.dirty, true);
});

test('다른 플레이어의 DB 행은 온라인 인벤토리에 흡수하지 않는다', () => {
    const inventory = Inventory.createEmpty(51_004, 1_000);
    assert.equal(inventory.adoptPersistedGrant([{
        id: 9003,
        playerId: 99_999,
        itemDataId: 'health_potion',
        count: 1,
        durability: null,
        metadata: { version: 1, delta: {} },
        tags: [],
        sortOrder: 0,
    }]), false);
    assert.equal(inventory.items.length, 0);
});

test('공개 시스템 우편 발송 API는 대상 집합과 transaction 원자성을 보장한다', async context => {
    await context.test('지정 ID를 정렬·중복 제거하고 101명을 100+1개 createMany로 발송한다', async subcontext => {
        const playerIds = Array.from({ length: MAILBOX_BULK_INSERT_BATCH_SIZE + 1 }, (_, index) => index + 1);
        const requestedIds = [
            ...[...playerIds].reverse(),
            50,
            1,
            MAILBOX_BULK_INSERT_BATCH_SIZE + 1,
        ];
        const state = installBulkTransactionMock(subcontext, { playerIds: [...playerIds].reverse() });

        const result = await sendSystemMailToRecipients(requestedIds, BULK_MAIL_INPUT);

        assert.deepEqual(result, { recipientCount: MAILBOX_BULK_INSERT_BATCH_SIZE + 1 });
        assert.equal(state.transactionCalls, 1);
        assert.deepEqual(state.findManyArguments, [{
            where: { userId: { in: playerIds } },
            select: { userId: true },
        }]);
        assert.deepEqual(
            state.createManyBatches.map(batch => batch.length),
            [MAILBOX_BULK_INSERT_BATCH_SIZE, 1],
        );
        assert.deepEqual(
            state.committedRows.map(row => row.recipientId),
            playerIds,
        );
        assert.equal(state.committedRows[0]?.senderLabel, '관리자');
        assert.equal(state.committedRows[0]?.subject, '공동 보상');
        assert.equal(state.committedRows[0]?.body, '우편함에서 수령해 주세요.');
        assert.equal(state.committedRows[0]?.attachmentCount, 2);
        assert.equal(state.rolledBackRows.length, 0);
    });

    await context.test('대량 payload는 수신자 수와 무관하게 한 번만 정규화한다', async subcontext => {
        const state = installBulkTransactionMock(subcontext, { playerIds: [1, 2, 3] });
        let subjectReads = 0;
        let itemsReads = 0;
        const input: SendBulkSystemMailInput = {
            senderLabel: '관리자',
            get subject() {
                subjectReads += 1;
                return '한 번만 검증할 보상';
            },
            body: '우편함에서 수령해 주세요.',
            get items() {
                itemsReads += 1;
                return [snapshot('health_potion', 1)];
            },
        };

        const result = await sendSystemMailToRecipients([3, 2, 1], input);

        assert.deepEqual(result, { recipientCount: 3 });
        assert.equal(subjectReads, 1);
        assert.equal(itemsReads, 1);
        assert.equal(state.committedRows.length, 3);
    });

    await context.test('지정 대상 중 누락 Player가 있으면 쓰기를 시작하지 않는다', async subcontext => {
        const state = installBulkTransactionMock(subcontext, { playerIds: [1, 3] });

        await assert.rejects(
            sendSystemMailToRecipients([3, 1, 2], BULK_MAIL_INPUT),
            /우편을 받을 플레이어가 존재하지 않습니다/,
        );

        assert.equal(state.transactionCalls, 1);
        assert.equal(state.createManyBatches.length, 0);
        assert.equal(state.committedRows.length, 0);
    });

    await context.test('잘못된 ID와 payload는 transaction 전에 거부한다', async subcontext => {
        const state = installBulkTransactionMock(subcontext, { playerIds: [1] });

        await assert.rejects(
            sendSystemMailToRecipients([1, 0], BULK_MAIL_INPUT),
            /우편 수신자 ID가 올바르지 않습니다/,
        );
        await assert.rejects(
            sendSystemMailToRecipients([1], { ...BULK_MAIL_INPUT, subject: '   ' }),
            /우편 제목은\(는\) 1~120자여야 합니다/,
        );
        await assert.rejects(
            sendSystemMailToRecipients([1], {
                ...BULK_MAIL_INPUT,
                sourceKey: 'manual-repeat',
            } as unknown as SendBulkSystemMailInput),
            /대량 우편에는 개별 수신자 ID나 멱등 키를 지정할 수 없습니다/,
        );

        assert.equal(state.transactionCalls, 0);
        assert.equal(state.createManyBatches.length, 0);
    });

    await context.test('지정 대상이 0명이면 payload만 검증하고 transaction 없이 성공한다', async subcontext => {
        const state = installBulkTransactionMock(subcontext, { playerIds: [] });

        const result = await sendSystemMailToRecipients([], BULK_MAIL_INPUT);

        assert.deepEqual(result, { recipientCount: 0 });
        assert.equal(state.transactionCalls, 0);
        assert.equal(state.createManyBatches.length, 0);
    });

    await context.test('전체 발송은 transaction Player 전체를 조회하고 ID 순서까지 정규화한다', async subcontext => {
        const state = installBulkTransactionMock(subcontext, { playerIds: [9, 2, 5] });

        const result = await sendSystemMailToAllPlayers(BULK_MAIL_INPUT);

        assert.deepEqual(result, { recipientCount: 3 });
        assert.deepEqual(state.findManyArguments, [{
            select: { userId: true },
            orderBy: { userId: 'asc' },
        }]);
        assert.deepEqual(state.committedRows.map(row => row.recipientId), [2, 5, 9]);
    });

    await context.test('전체 Player가 0명이면 createMany 없이 성공한다', async subcontext => {
        const state = installBulkTransactionMock(subcontext, { playerIds: [] });

        const result = await sendSystemMailToAllPlayers(BULK_MAIL_INPUT);

        assert.deepEqual(result, { recipientCount: 0 });
        assert.equal(state.transactionCalls, 1);
        assert.equal(state.findManyArguments.length, 1);
        assert.equal(state.createManyBatches.length, 0);
        assert.equal(state.committedRows.length, 0);
    });

    await context.test('두 번째 createMany가 실패하면 첫 청크도 commit되지 않는다', async subcontext => {
        const playerIds = Array.from({ length: MAILBOX_BULK_INSERT_BATCH_SIZE + 1 }, (_, index) => index + 1);
        const state = installBulkTransactionMock(subcontext, {
            playerIds,
            failCreateManyCall: 2,
        });

        await assert.rejects(
            sendSystemMailToRecipients(playerIds, BULK_MAIL_INPUT),
            /시험용 두 번째 청크 실패/,
        );

        assert.deepEqual(
            state.createManyBatches.map(batch => batch.length),
            [MAILBOX_BULK_INSERT_BATCH_SIZE, 1],
        );
        assert.equal(state.rolledBackRows.length, MAILBOX_BULK_INSERT_BATCH_SIZE);
        assert.equal(state.committedRows.length, 0);
    });

    await context.test('기존 단일 발송은 Player 존재 확인 뒤 mailboxMessage.create를 사용한다', async subcontext => {
        let findUniqueArguments: unknown;
        let createArguments: unknown;
        let upsertCalls = 0;
        const playerDelegate = prisma.player as unknown as {
            findUnique(args: unknown): Promise<unknown>;
        };
        const mailboxDelegate = prisma.mailboxMessage as unknown as {
            create(args: unknown): Promise<unknown>;
            upsert(args: unknown): Promise<unknown>;
        };
        const originalFindUnique = playerDelegate.findUnique;
        const originalCreate = mailboxDelegate.create;
        const originalUpsert = mailboxDelegate.upsert;
        playerDelegate.findUnique = subcontext.mock.fn(async args => {
            findUniqueArguments = args;
            return { userId: 77 };
        });
        mailboxDelegate.create = subcontext.mock.fn(async args => {
            createArguments = args;
            return {
                id: 901,
                senderLabel: '관리자',
                subject: '단일 보상',
                body: '아이템을 수령해 주세요.',
                attachments: null,
                attachmentCount: 3,
                createdAt: new Date('2026-08-03T00:00:00.000Z'),
                readAt: null,
                claimedAt: null,
                expiresAt: null,
            };
        });
        mailboxDelegate.upsert = subcontext.mock.fn(async () => {
            upsertCalls += 1;
            throw new Error('sourceKey 없는 단일 우편은 upsert하면 안 됩니다.');
        });
        subcontext.after(() => {
            playerDelegate.findUnique = originalFindUnique;
            mailboxDelegate.create = originalCreate;
            mailboxDelegate.upsert = originalUpsert;
        });

        const result = await sendSystemMail({
            recipientId: 77,
            senderLabel: '  관리자  ',
            subject: '  단일 보상  ',
            body: '  아이템을 수령해 주세요.  ',
            items: [snapshot('health_potion', 3)],
        });

        assert.deepEqual(findUniqueArguments, {
            where: { userId: 77 },
            select: { userId: true },
        });
        const createData = (createArguments as { data: Prisma.MailboxMessageCreateManyInput }).data;
        assert.equal(createData.recipientId, 77);
        assert.equal(createData.senderLabel, '관리자');
        assert.equal(createData.subject, '단일 보상');
        assert.equal(createData.body, '아이템을 수령해 주세요.');
        assert.equal(createData.attachmentCount, 3);
        assert.equal(upsertCalls, 0);
        assert.equal(result.id, 901);
        assert.equal(result.attachmentCount, 3);
    });
});

test('sourceKey 보상은 수령·정리 뒤에도 unique tombstone을 남기는 구조다', () => {
    const schema = readFileSync(new URL('../../../prisma/schema.prisma', import.meta.url), 'utf8');
    const service = readFileSync(new URL('./mailbox.ts', import.meta.url), 'utf8');
    assert.match(schema, /@@unique\(\[recipientId, sourceKey\]\)/);
    assert.match(schema, /archivedAt\s+DateTime\?/);
    assert.match(service, /mailboxMessage\.upsert/);
    assert.match(service, /MAILBOX_SOURCE_KEY_PATTERN\.test\(sourceKey\)/);
    assert.match(service, /sourceKey: \{ not: null \}[\s\S]*data: \{ archivedAt: now \}/);
    assert.match(service, /mailboxMessage\.deleteMany\([\s\S]*sourceKey: null/);
});
