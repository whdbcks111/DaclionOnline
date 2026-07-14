import assert from 'node:assert/strict';
import test from 'node:test';
import { handleCommand, isCommandAliasInput, registerCommand } from './bot.js';
import { parseCommandInput } from '../../../shared/commandInput.js';

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
