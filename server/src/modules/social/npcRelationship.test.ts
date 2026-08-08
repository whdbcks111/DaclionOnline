import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import type Player from '../../models/actors/Player.js';
import NPC, { Dialogue, DialogueScenario } from '../../models/actors/NPC.js';
import Entity from '../../models/core/Entity.js';
import Equipment from '../../models/economy/Equipment.js';
import { emitGameEvent, GameEventIds } from '../../models/core/GameEvent.js';
import { PlayerProgress } from '../../models/progression/Progress.js';
import {
    getNpcFavorSnapshot,
    initializeNpcRelationshipProgress,
} from '../../models/progression/NpcRelationship.js';
import { initSocket } from '../infrastructure/socket.js';
import {
    initNpcRelationshipEventTracking,
    resetNpcRelationshipEventTracking,
} from './npcRelationship.js';

initSocket(createServer(), '*');

const NPC_ID = 'test_relationship_event_npc';
NPC.define({
    id: NPC_ID,
    name: '관계 이벤트 시험 NPC',
    entryScenario: () => 'hello',
    scenarios: [new DialogueScenario('hello', function* () {
        yield Dialogue.say('시험');
        yield Dialogue.end();
    })],
});
initializeNpcRelationshipProgress();

class RelationshipEventPlayer extends Entity {
    readonly userId: number;
    readonly progress: PlayerProgress;

    constructor(userId: number) {
        super(1, 0, 'test', { maxLife: 100 }, Equipment.createEmpty());
        this.userId = userId;
        this.progress = PlayerProgress.createEmpty(userId);
    }

    override get name(): string { return '관계 이벤트 시험 플레이어'; }
    override get isPlayer(): boolean { return true; }
    override get playerUserId(): number { return this.userId; }
}

test.after(() => resetNpcRelationshipEventTracking());

test('대화 시작과 실제 선택 이벤트는 중복 구독 없이 NPC 호감도 +2/+1을 지급한다', () => {
    resetNpcRelationshipEventTracking();
    initNpcRelationshipEventTracking();
    initNpcRelationshipEventTracking();
    const actual = new RelationshipEventPlayer(982_101);
    const player = actual as unknown as Player;

    emitGameEvent(GameEventIds.NPC_DIALOGUE_STARTED, { actor: player, data: { npcId: NPC_ID } });
    emitGameEvent(GameEventIds.NPC_DIALOGUE_CHOICE, { actor: player, data: { npcId: NPC_ID } });

    assert.equal(getNpcFavorSnapshot(player, NPC_ID).favor, 3);
});
