import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import '../data/items.js';
import Inventory from '../models/Inventory.js';
import { defineItem, getItemData, type ItemSnapshot } from '../models/Item.js';
import {
    MAILBOX_ATTACHMENT_VERSION,
    MAILBOX_SOURCE_KEY_PATTERN,
    decodeMailboxAttachments,
    encodeMailboxAttachments,
} from './mailbox.js';

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

test('sourceKey 보상은 수령·정리 뒤에도 unique tombstone을 남기는 구조다', () => {
    const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
    const service = readFileSync(new URL('./mailbox.ts', import.meta.url), 'utf8');
    assert.match(schema, /@@unique\(\[recipientId, sourceKey\]\)/);
    assert.match(schema, /archivedAt\s+DateTime\?/);
    assert.match(service, /mailboxMessage\.upsert/);
    assert.match(service, /MAILBOX_SOURCE_KEY_PATTERN\.test\(sourceKey\)/);
    assert.match(service, /sourceKey: \{ not: null \}[\s\S]*data: \{ archivedAt: now \}/);
    assert.match(service, /mailboxMessage\.deleteMany\([\s\S]*sourceKey: null/);
});
