import assert from 'node:assert/strict';
import test from 'node:test';
import { getCommandListFiltered, handleCommand, isCommandAliasInput, registerCommand } from './bot.js';
import { parseCommandInput } from '../../../shared/commandInput.js';
import { initLocationCommands } from '../commands/location.js';

test('공용 명령 파서는 슬래시 유무와 첫 단어 이후 인자를 분리한다', () => {
    assert.deepEqual(parseCommandInput('/status 공개'), {
        token: 'status',
        remainder: '공개',
        hasSlash: true,
        hasSeparator: true,
    });
    assert.deepEqual(parseCommandInput('  S 공개'), {
        token: 's',
        remainder: '공개',
        hasSlash: false,
        hasSeparator: true,
    });
});

test('슬래시 없는 첫 단어는 등록된 별칭일 때만 명령으로 실행한다', () => {
    const calls: string[][] = [];
    registerCommand({
        name: 'test_bare_alias_command',
        aliases: ['tbac'],
        description: 'test',
        handler: (_userId, args) => { calls.push(args); },
    });

    assert.equal(isCommandAliasInput('tbac'), true);
    assert.equal(isCommandAliasInput('TBAC one two'), true);
    assert.equal(isCommandAliasInput('/tbac'), false);
    assert.equal(isCommandAliasInput('test_bare_alias_command'), false);

    handleCommand(1, 'tbac one two');
    handleCommand(1, '/test_bare_alias_command three');
    assert.deepEqual(calls, [['one', 'two'], ['three']]);
});

test('권한별 명령 스냅샷은 등록된 별칭을 복사해 제공한다', () => {
    registerCommand({
        name: 'test_alias_snapshot',
        aliases: ['tas', 'TAS2'],
        description: 'test',
        handler: () => undefined,
    });
    const snapshot = getCommandListFiltered(0).find(command => command.name === 'test_alias_snapshot');
    assert.deepEqual(snapshot?.aliases, ['tas', 'TAS2']);
});

test('이동 명령은 단일 키 v를 별칭과 단축키 목록 snapshot에 제공한다', () => {
    initLocationCommands();
    const movement = getCommandListFiltered(0).find(command => command.name === '이동');
    assert.equal(movement?.aliases.includes('v'), true);
    assert.equal(isCommandAliasInput('v 1'), true);

    const autoMovement = getCommandListFiltered(0).find(command => command.name === '자동이동');
    const cancellation = getCommandListFiltered(0).find(command => command.name === '이동취소');
    assert.deepEqual(autoMovement?.aliases, ['nav', 'ago', 'av', 'amv']);
    assert.deepEqual(cancellation?.aliases, ['vc', 'mvc', 'goc']);
    assert.equal(isCommandAliasInput('nav 피버릭 광장'), true);
    assert.equal(isCommandAliasInput('goc'), true);
});
