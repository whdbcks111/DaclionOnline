import assert from 'node:assert/strict';
import test from 'node:test';
import '../data/items.js';
import {
    ADMIN_MAILBOX_BODY,
    ADMIN_MAILBOX_DEFAULT_SUBJECT,
    ADMIN_MAILBOX_OPERATIONAL_COUNT_CAP,
    initAdminCommands,
    prepareAdminMailboxSend,
    type AdminMailboxPreparationResult,
} from './admin.js';
import { getCommandList, getCommandListFiltered } from '../modules/bot.js';
import { Item } from '../models/Item.js';

function expectPrepared(result: AdminMailboxPreparationResult) {
    if (!result.success) throw new Error(result.reason);
    assert.equal(result.success, true);
    return result.prepared;
}

function expectRejected(result: AdminMailboxPreparationResult, pattern: RegExp): void {
    if (result.success) throw new Error('expected preparation rejection');
    assert.equal(result.success, false);
    assert.match(result.reason, pattern);
}

test('관리자 우편 준비는 me와 기본 제목을 안전한 단일 ItemSnapshot으로 만든다', () => {
    const prepared = expectPrepared(prepareAdminMailboxSend(41, ['me', 'health_potion', '25']));

    assert.equal(prepared.recipientId, 41);
    assert.equal(prepared.itemDataId, 'health_potion');
    assert.equal(prepared.itemName, '체력 포션');
    assert.equal(prepared.count, 25);
    assert.equal(prepared.maxCount, ADMIN_MAILBOX_OPERATIONAL_COUNT_CAP);
    assert.equal(prepared.subject, ADMIN_MAILBOX_DEFAULT_SUBJECT);
    assert.equal(prepared.mail.recipientId, 41);
    assert.equal(prepared.mail.senderLabel, '관리자');
    assert.equal(prepared.mail.subject, ADMIN_MAILBOX_DEFAULT_SUBJECT);
    assert.equal(prepared.mail.body, ADMIN_MAILBOX_BODY);
    assert.equal(Object.hasOwn(prepared.mail, 'sourceKey'), false);
    assert.deepEqual(
        prepared.mail.items,
        [new Item('health_potion', 25, null, null).snapshot(25)],
    );
});

test('관리자 우편 준비는 접속 여부를 조회하지 않고 숫자 Player ID와 공백 포함 제목을 보존한다', () => {
    const prepared = expectPrepared(prepareAdminMailboxSend(
        7,
        ['987654', 'health_potion', '3', '  여름 이벤트 보상  '],
    ));

    assert.equal(prepared.recipientId, 987654);
    assert.equal(prepared.subject, '여름 이벤트 보상');
    assert.equal(prepared.mail.subject, '여름 이벤트 보상');
    assert.equal(Object.hasOwn(prepared.mail, 'sourceKey'), false);
});

test('내구도 아이템 우편은 실제 Item 생성자가 복원한 기본 내구도를 snapshot에 담는다', () => {
    const prepared = expectPrepared(prepareAdminMailboxSend(
        7,
        ['123456', 'old_sword', '100', '장비 지급'],
    ));
    const expected = new Item('old_sword', 100, null, null).snapshot(100);

    assert.equal(prepared.maxCount, 100);
    assert.deepEqual(prepared.mail.items, [expected]);
    assert.equal(prepared.mail.items?.[0]?.durability, 75);
    assert.equal(prepared.mail.items?.[0]?.count, 100);
});

test('관리자 우편 준비는 잘못된 대상·정확하지 않은 아이템 ID·정수가 아닌 수량을 거부한다', () => {
    for (const target of ['', '0', '-1', '1.5', '1admin', '9007199254740992']) {
        expectRejected(prepareAdminMailboxSend(7, [target, 'health_potion', '1']), /플레이어 ID/);
    }
    expectRejected(prepareAdminMailboxSend(0, ['me', 'health_potion', '1']), /플레이어 ID/);
    expectRejected(prepareAdminMailboxSend(7, ['me', 'HEALTH_POTION', '1']), /정확한 아이템 ID/);
    expectRejected(prepareAdminMailboxSend(7, ['me', 'missing_item', '1']), /정확한 아이템 ID/);

    for (const count of ['', '0', '-1', '1.5', '1개', '+1', '9007199254740992']) {
        expectRejected(prepareAdminMailboxSend(7, ['me', 'health_potion', count]), /1 이상의 정수/);
    }
});

test('관리자 우편 수량은 운영 10000개와 아이템 maxStack × 우편 100행 중 작은 상한을 따른다', () => {
    assert.equal(
        expectPrepared(prepareAdminMailboxSend(7, ['me', 'health_potion', '10000'])).maxCount,
        10_000,
    );
    expectRejected(prepareAdminMailboxSend(7, ['me', 'health_potion', '10001']), /최대 10,000개/);

    assert.equal(expectPrepared(prepareAdminMailboxSend(7, ['me', 'old_sword', '100'])).maxCount, 100);
    expectRejected(prepareAdminMailboxSend(7, ['me', 'old_sword', '101']), /최대 100개/);
});

test('관리자 우편 제목은 기본값과 120자 사용자 제목만 허용한다', () => {
    assert.equal(
        expectPrepared(prepareAdminMailboxSend(7, ['me', 'health_potion', '1', ''])).subject,
        ADMIN_MAILBOX_DEFAULT_SUBJECT,
    );
    assert.equal(
        expectPrepared(prepareAdminMailboxSend(7, ['me', 'health_potion', '1', '가'.repeat(120)])).subject.length,
        120,
    );
    expectRejected(prepareAdminMailboxSend(7, ['me', 'health_potion', '1', '   ']), /1~120자/);
    expectRejected(prepareAdminMailboxSend(7, ['me', 'health_potion', '1', '가'.repeat(121)]), /1~120자/);
    expectRejected(prepareAdminMailboxSend(7, ['me', 'health_potion', '1', '보상\n위조']), /제어 문자/);
});

test('우편발송 명령은 권한 10과 대상·아이템 자동완성 metadata를 등록한다', () => {
    initAdminCommands();

    assert.equal(getCommandListFiltered(9).some(command => command.name === '우편발송'), false);
    const command = getCommandListFiltered(10).find(candidate => candidate.name === '우편발송');
    assert.ok(command);
    assert.equal(command.permission, 10);
    assert.deepEqual(command.aliases, ['mailsend']);
    assert.deepEqual(command.args?.map(argument => [argument.name, argument.required, argument.isText]), [
        ['대상', true, undefined],
        ['아이템ID', true, undefined],
        ['수량', true, undefined],
        ['제목', undefined, true],
    ]);

    const targetSource = command.args?.[0]?.completions;
    assert.equal(typeof targetSource, 'function');
    const targetCompletions = typeof targetSource === 'function'
        ? targetSource(7, [], '/우편발송 ')
        : targetSource ?? [];
    assert.deepEqual(targetCompletions[0], { value: 'me', description: '나 자신' });

    const itemSource = command.args?.[1]?.completions;
    assert.equal(typeof itemSource, 'function');
    const itemCompletions = typeof itemSource === 'function'
        ? itemSource(7, ['me'], '/우편발송 me ')
        : itemSource ?? [];
    assert.ok(itemCompletions.some(completion => typeof completion !== 'string'
        && completion.value === 'health_potion'
        && completion.description === '체력 포션'));

    const publicMetadata = getCommandList().find(candidate => candidate.name === '우편발송');
    assert.equal(publicMetadata?.args?.[0]?.dynamicCompletions, true);
    assert.equal(publicMetadata?.args?.[1]?.dynamicCompletions, true);
    assert.equal(publicMetadata?.args?.[3]?.isText, true);
});
