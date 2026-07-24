import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import {
    getCommandListFiltered,
    handleCommand,
    isCommandAliasInput,
    registerCommand,
    subscribeCommandExecutions,
} from './bot.js';
import { parseCommandInput } from '../../../shared/commandInput.js';
import { initLocationCommands } from '../commands/location.js';
import {
    getChannelHistory,
    getFilteredHistoryForUser,
    setUserChannel,
} from './channel.js';
import { getIO, initSocket } from './socket.js';

const httpServer = createServer();
initSocket(httpServer, '*');
test.after(() => {
    getIO().close();
    httpServer.close();
});

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

test('명령 실행 구독은 버튼과 별칭 경로를 canonical 이름으로 통합한다', () => {
    registerCommand({
        name: 'test_execution_event',
        aliases: ['tee'],
        description: 'test',
        handler: () => undefined,
    });
    const events: Array<{ commandName: string; args: readonly string[] }> = [];
    const unsubscribe = subscribeCommandExecutions(event => {
        if (event.commandName === 'test_execution_event') events.push(event);
    });

    handleCommand(7, 'tee one');
    handleCommand(7, '/test_execution_event two');
    unsubscribe();
    handleCommand(7, 'tee three');

    assert.deepEqual(events.map(event => [event.commandName, ...event.args]), [
        ['test_execution_event', 'one'],
        ['test_execution_event', 'two'],
    ]);
});

test('일반 명령 입력은 기본적으로 본인에게만 보이고 명시적 show만 공개된다', () => {
    const userId = 91_001;
    const channel = 'command-visibility-test';
    setUserChannel(userId, channel);

    registerCommand({
        name: 'test_default_private_command',
        description: 'test',
        handler: () => undefined,
    });
    registerCommand({
        name: 'test_explicit_public_command',
        description: 'test',
        showCommandUse: 'show',
        handler: () => undefined,
    });

    handleCommand(userId, '/test_default_private_command', {
        userId,
        nickname: '테스터',
        content: [{ type: 'text', text: '/test_default_private_command' }],
        timestamp: Date.now(),
    });
    assert.equal(getChannelHistory(channel).length, 0);
    assert.equal(
        getFilteredHistoryForUser(userId, channel).at(-1)?.private,
        true,
    );

    handleCommand(userId, '/test_explicit_public_command', {
        userId,
        nickname: '테스터',
        content: [{ type: 'text', text: '/test_explicit_public_command' }],
        timestamp: Date.now(),
    });
    const publicContent = getChannelHistory(channel).at(-1)?.content;
    assert.equal(
        Array.isArray(publicContent) && publicContent[0]?.type === 'text'
            ? publicContent[0].text
            : undefined,
        '/test_explicit_public_command',
    );
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

test('줍기 명령은 바닥 번호와 선택 수량을 별도 인자로 제공한다', () => {
    initLocationCommands();
    const pickup = getCommandListFiltered(0).find(command => command.name === '줍기');

    assert.deepEqual(pickup?.args?.map(arg => [arg.name, arg.required ?? false]), [
        ['번호/전체', true],
        ['개수', false],
    ]);
});
