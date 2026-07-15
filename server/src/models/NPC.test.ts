import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { initSocket } from '../modules/socket.js';
import { registerOnlinePlayer, unregisterOnlinePlayer } from '../modules/playerRegistry.js';
import Equipment from './Equipment.js';
import Entity from './Entity.js';
import { defineLocation } from './Location.js';
import NPC, { Dialogue, DialogueScenario } from './NPC.js';
import {
    DialogueEndReason,
    endNpcDialogue,
    getActiveNpcDialogue,
    startNpcDialogue,
    chooseNpcDialogue,
    updateNpcDialogues,
} from './NpcDialogue.js';
import type Player from './Player.js';
import { defineProgress, PlayerProgress, ProgressType } from './Progress.js';

initSocket(createServer(), '*');

const TEST_FLAG = 'test:npc-dialogue-flag';
defineProgress({
    id: TEST_FLAG,
    type: ProgressType.FLAG,
    label: 'NPC 대화 시험 플래그',
    description: 'NPC 대화 테스트용입니다.',
});

let eventRuns = 0;
const testNpc = NPC.define({
    id: 'test_dialogue_npc',
    name: '시험 안내인',
    entryScenario: ({ player }) => player.progress.getFlag(TEST_FLAG) ? 'returning' : 'first',
    scenarios: [
        new DialogueScenario('first', function* () {
            yield Dialogue.say('처음 만났군요.');
            yield Dialogue.event(() => { eventRuns++; });
            yield Dialogue.choice([{ label: '플래그 지정', target: 'set_flag' }]);
        }),
        new DialogueScenario('set_flag', function* () {
            yield Dialogue.setFlag(TEST_FLAG);
            yield Dialogue.goto('finished');
        }),
        new DialogueScenario('finished', function* () {
            yield Dialogue.say('완료했습니다.');
            yield Dialogue.end();
        }),
        new DialogueScenario('returning', function* () {
            yield Dialogue.say('다시 만났군요.');
            yield Dialogue.choice([{ label: '종료', target: 'finished' }]);
        }),
    ],
});

defineLocation({
    id: 'test_dialogue_location',
    name: '대화 시험 장소',
    zoneType: 'safe',
    x: 0,
    y: 0,
    z: 0,
    npcIds: [testNpc.id],
    objects: [],
    connections: [],
    tags: [],
});

class TestDialoguePlayer extends Entity {
    override readonly name = '대화 시험 플레이어';
    readonly userId: number;
    readonly progress: PlayerProgress;
    moving = false;

    constructor(userId: number) {
        super(1, 0, 'test_dialogue_location', { maxLife: 100 }, Equipment.createEmpty());
        this.userId = userId;
        this.progress = PlayerProgress.createEmpty(userId);
    }

    override get isPlayer(): boolean { return true; }
    override get playerUserId(): number { return this.userId; }
}

function registerTestPlayer(userId: number): { actual: TestDialoguePlayer; player: Player } {
    const actual = new TestDialoguePlayer(userId);
    const player = actual as unknown as Player;
    registerOnlinePlayer(player);
    return { actual, player };
}

test('generator 대화는 이벤트·선택지·플래그·장면 이동을 순서대로 처리한다', () => {
    const { player } = registerTestPlayer(91001);
    eventRuns = 0;

    assert.equal(startNpcDialogue(player, testNpc).success, true);
    const active = getActiveNpcDialogue(player);
    assert.equal(active?.scenarioKey, 'first');
    assert.equal(active?.choices[0]?.label, '플래그 지정');
    assert.equal(eventRuns, 1);

    assert.equal(chooseNpcDialogue(player, active!.sessionId, 1).success, true);
    assert.equal(player.progress.getFlag(TEST_FLAG), true);
    assert.equal(getActiveNpcDialogue(player), undefined);

    assert.equal(startNpcDialogue(player, testNpc).success, true);
    assert.equal(getActiveNpcDialogue(player)?.scenarioKey, 'returning');
    endNpcDialogue(player, DialogueEndReason.USER, false);
    unregisterOnlinePlayer(player.userId);
});

test('이동·사망·온라인 레지스트리 이탈은 진행 중인 대화를 자동 종료한다', () => {
    const first = registerTestPlayer(91002);
    assert.equal(startNpcDialogue(first.player, testNpc).success, true);
    first.actual.moving = true;
    updateNpcDialogues();
    assert.equal(getActiveNpcDialogue(first.player), undefined);
    unregisterOnlinePlayer(first.player.userId);

    const second = registerTestPlayer(91003);
    assert.equal(startNpcDialogue(second.player, testNpc).success, true);
    second.actual.isDead = true;
    updateNpcDialogues();
    assert.equal(getActiveNpcDialogue(second.player), undefined);
    unregisterOnlinePlayer(second.player.userId);

    const third = registerTestPlayer(91004);
    assert.equal(startNpcDialogue(third.player, testNpc).success, true);
    unregisterOnlinePlayer(third.player.userId);
    updateNpcDialogues();
    assert.equal(getActiveNpcDialogue(third.player), undefined);
});
