import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { GameTags } from '../../../../shared/tags.js';
import { registerOnlinePlayer, unregisterOnlinePlayer } from '../../modules/player/playerRegistry.js';
import { initSocket } from '../../modules/infrastructure/socket.js';
import CareerProfile, { CareerProgressIds } from '../../models/progression/Career.js';
import Entity from '../../models/core/Entity.js';
import Equipment from '../../models/economy/Equipment.js';
import { emitGameEvent, GameEventIds } from '../../models/core/GameEvent.js';
import Inventory from '../../models/economy/Inventory.js';
import Monster from '../../models/actors/Monster.js';
import type Player from '../../models/actors/Player.js';
import { PlayerProgress } from '../../models/progression/Progress.js';
import { getQuestData, QuestStatus } from '../../models/progression/Quest.js';
import QuestBook from '../../models/progression/QuestBook.js';
import { ThreatAction } from '../../models/combat/Threat.js';
import '../economy/items.js';
import './jobs.js';
import '../world/monsters.js';
import '../combat/projectiles.js';
import '../combat/statusEffects.js';
import '../combat/skills.js';
import './quests.js';
import {
    THIRD_ADVANCEMENT_DEFINITIONS,
    THIRD_ADVANCEMENT_NPC_ID,
} from './quests.js';

initSocket(createServer(), '*');

const LINEAGES = [
    { lineage: 'warrior', main: 'career:warrior', sub: 'career:mage', elite: 'career:spellblade' },
    { lineage: 'archer', main: 'career:archer', sub: 'career:mage', elite: 'career:elemental_marksman' },
    { lineage: 'assassin', main: 'career:assassin', sub: 'career:mage', elite: 'career:arcane_reaper' },
    { lineage: 'mage', main: 'career:mage', sub: 'career:warrior', elite: 'career:battle_magus' },
    { lineage: 'blacksmith', main: 'career:blacksmith', sub: 'career:warrior', elite: 'career:battle_smith' },
    { lineage: 'cleric', main: 'career:cleric', sub: 'career:warrior', elite: 'career:saint_knight' },
] as const;

class ThirdAdvancementPlayer extends Entity {
    override readonly name = '3차 계승 시험 플레이어';
    readonly userId: number;
    readonly inventory: Inventory;
    readonly progress: PlayerProgress;
    readonly quests: QuestBook;
    readonly career: CareerProfile;
    readonly grantedSkills: string[] = [];
    readonly skills = {
        grant: (id: string) => {
            this.grantedSkills.push(id);
            return { acquired: true };
        },
    };
    saveCount = 0;

    constructor(userId: number, lineage: (typeof LINEAGES)[number]) {
        super(500, 0, 'job_hall', { maxLife: 100 }, Equipment.createEmpty());
        this.userId = userId;
        this.inventory = Inventory.createEmpty(userId, 100);
        this.progress = PlayerProgress.createEmpty(userId);
        this.progress.setState(CareerProgressIds.MAIN, lineage.main);
        this.progress.setState(CareerProgressIds.SUB, lineage.sub);
        this.progress.setState(CareerProgressIds.ELITE, lineage.elite);
        this.career = new CareerProfile(this as unknown as Player);
        this.quests = QuestBook.createEmpty(userId);
        this.quests.bindOwner(this as unknown as Player);
        this.career.initialize();
    }

    override get isPlayer(): boolean { return true; }
    override get playerUserId(): number { return this.userId; }
    gainExp(_amount: number): number[] { return []; }
    async save(): Promise<void> { this.saveCount++; }
}

class ThirdMasteryTarget extends Entity {
    override readonly name = '3차 숙련 표적';

    constructor(level: number, tags: readonly string[]) {
        super(level, 0, 'third-advancement-test', { maxLife: 100 }, Equipment.createEmpty(), undefined, tags);
    }
}

function emitRepeated(
    player: Player,
    eventId: string,
    count: number,
    subject?: Entity,
    data: Record<string, string | number | boolean | null> = {},
): void {
    for (let index = 0; index < count; index++) {
        emitGameEvent(eventId, { actor: player, subject, data });
    }
}

function finishMastery(player: Player, lineage: (typeof LINEAGES)[number]['lineage']): void {
    const normal380 = new ThirdMasteryTarget(380, [GameTags.ENTITY_MONSTER]);
    const normal420 = new ThirdMasteryTarget(420, [GameTags.ENTITY_MONSTER]);
    switch (lineage) {
        case 'warrior':
            emitRepeated(player, GameEventIds.ENTITY_DEFEATED, 80, normal380);
            break;
        case 'archer':
            emitRepeated(player, GameEventIds.CRITICAL_HIT, 120, normal380);
            break;
        case 'assassin':
            emitRepeated(player, GameEventIds.ENTITY_DEFEATED, 40, normal420);
            emitRepeated(player, GameEventIds.CRITICAL_HIT, 60, normal420);
            break;
        case 'mage':
            for (const tag of [
                GameTags.PROPERTY_FIRE,
                GameTags.PROPERTY_ICE,
                GameTags.PROPERTY_ELECTRIC,
                GameTags.PROPERTY_DARK,
            ]) {
                emitRepeated(
                    player,
                    GameEventIds.ENTITY_DEFEATED,
                    15,
                    new ThirdMasteryTarget(380, [GameTags.ENTITY_MONSTER, tag]),
                );
            }
            break;
        case 'blacksmith':
            emitRepeated(
                player,
                GameEventIds.RESOURCE_DESTROYED,
                30,
                new ThirdMasteryTarget(380, [GameTags.ENTITY_RESOURCE, GameTags.RESOURCE_ORE]),
            );
            emitRepeated(player, GameEventIds.ITEM_FORGED, 10, undefined, { itemLevel: 380 });
            break;
        case 'cleric':
            emitRepeated(player, GameEventIds.SKILL_FINISHED, 40, undefined, {
                skillDataId: 'dawn_covenant',
                reason: 'completed',
            });
            break;
    }
}

function advanceToThroneTrial(
    player: Player,
    lineage: (typeof LINEAGES)[number],
    questId: string,
): void {
    assert.equal(player.quests.accept(questId, THIRD_ADVANCEMENT_NPC_ID).success, true);
    for (const locationId of ['nebula_waystation', 'chronofrost_refuge', 'endstar_bastion']) {
        emitGameEvent(GameEventIds.LOCATION_CHANGED, {
            actor: player,
            data: { fromLocationId: 'test', toLocationId: locationId },
        });
    }
    finishMastery(player, lineage.lineage);
    assert.equal(player.quests.getSnapshot(questId)?.stageId, 'throne-trial');
}

test('6개 3차 퀘스트는 순례·직업별 숙련·세 왕좌·귀환의 4단계를 갖는다', () => {
    const masteryContracts = new Map([
        ['warrior', [[GameEventIds.ENTITY_DEFEATED, 80]]],
        ['archer', [[GameEventIds.CRITICAL_HIT, 120]]],
        ['assassin', [[GameEventIds.ENTITY_DEFEATED, 40], [GameEventIds.CRITICAL_HIT, 60]]],
        ['mage', Array.from({ length: 4 }, () => [GameEventIds.ENTITY_DEFEATED, 15])],
        ['blacksmith', [[GameEventIds.RESOURCE_DESTROYED, 30], [GameEventIds.ITEM_FORGED, 10]]],
        ['cleric', [[GameEventIds.SKILL_FINISHED, 40]]],
    ]);

    assert.equal(THIRD_ADVANCEMENT_DEFINITIONS.length, 6);
    for (const definition of THIRD_ADVANCEMENT_DEFINITIONS) {
        const quest = getQuestData(definition.questId)!;
        assert.deepEqual(quest.stages.map(stage => stage.id), [
            'pilgrimage', 'mastery', 'throne-trial', 'return-report',
        ]);
        assert.deepEqual(
            quest.stages[0].objectives.map(objective => [objective.eventId, objective.required]),
            Array.from({ length: 3 }, () => [GameEventIds.LOCATION_CHANGED, 1]),
        );
        assert.deepEqual(
            quest.stages[1].objectives.map(objective => [objective.eventId, objective.required]),
            masteryContracts.get(definition.lineage),
        );
        assert.deepEqual(
            quest.stages[2].objectives.map(objective => [objective.id, objective.eventId]),
            [
                ['nebula-sovereign', GameEventIds.ENTITY_DEFEATED],
                ['zero-hour-queen', GameEventIds.ENTITY_DEFEATED],
                ['last-constellation', GameEventIds.ENTITY_DEFEATED],
            ],
        );
        assert.deepEqual(
            quest.stages[3].objectives.map(objective => [objective.eventId, objective.required]),
            [[GameEventIds.NPC_DIALOGUE_STARTED, 1]],
        );
        assert.deepEqual(quest.giverNpcIds, [THIRD_ADVANCEMENT_NPC_ID]);
        assert.deepEqual(quest.turnInNpcIds, [THIRD_ADVANCEMENT_NPC_ID]);
        assert.equal(quest.repeat, false);
    }
});

test('천광성자 숙련은 지정한 회복·보호 기술의 정상 완료만 집계한다', () => {
    const lineage = LINEAGES.find(entry => entry.lineage === 'cleric')!;
    const actual = new ThirdAdvancementPlayer(98_050, lineage);
    const player = actual as unknown as Player;
    const definition = THIRD_ADVANCEMENT_DEFINITIONS.find(entry => entry.lineage === 'cleric')!;

    assert.equal(player.quests.accept(definition.questId, THIRD_ADVANCEMENT_NPC_ID).success, true);
    for (const locationId of ['nebula_waystation', 'chronofrost_refuge', 'endstar_bastion']) {
        emitGameEvent(GameEventIds.LOCATION_CHANGED, {
            actor: player,
            data: { fromLocationId: 'test', toLocationId: locationId },
        });
    }
    emitRepeated(player, GameEventIds.SKILL_FINISHED, 10, undefined, {
        skillDataId: 'radiant_bolt',
        reason: 'completed',
    });
    emitRepeated(player, GameEventIds.SKILL_FINISHED, 10, undefined, {
        skillDataId: 'dawn_covenant',
        reason: 'cancelled',
    });
    emitRepeated(player, GameEventIds.SKILL_FINISHED, 39, undefined, {
        skillDataId: 'sanctuary_aegis',
        reason: 'completed',
    });
    assert.equal(player.quests.getSnapshot(definition.questId)?.stageId, 'mastery');

    emitRepeated(player, GameEventIds.SKILL_FINISHED, 1, undefined, {
        skillDataId: 'dawn_covenant',
        reason: 'completed',
    });
    assert.equal(player.quests.getSnapshot(definition.questId)?.stageId, 'throne-trial');
});

test('각 3차 계보는 이전 단계 이벤트를 소급하지 않고 정확한 목표로만 완주·승급한다', async () => {
    for (const [index, lineage] of LINEAGES.entries()) {
        const actual = new ThirdAdvancementPlayer(98_000 + index, lineage);
        const player = actual as unknown as Player;
        const definition = THIRD_ADVANCEMENT_DEFINITIONS.find(entry => entry.lineage === lineage.lineage)!;

        assert.equal(player.quests.accept(definition.questId, THIRD_ADVANCEMENT_NPC_ID).success, true);
        emitGameEvent(GameEventIds.ENTITY_DEFEATED, {
            actor: player,
            subject: new Monster('nebula_sovereign', 'third-advancement-test'),
        });
        emitGameEvent(GameEventIds.LOCATION_CHANGED, {
            actor: player,
            data: { fromLocationId: 'job_hall', toLocationId: 'wrong_place' },
        });
        assert.equal(player.quests.getSnapshot(definition.questId)?.stageId, 'pilgrimage');

        for (const locationId of ['nebula_waystation', 'chronofrost_refuge', 'endstar_bastion']) {
            emitGameEvent(GameEventIds.LOCATION_CHANGED, {
                actor: player,
                data: { fromLocationId: 'test', toLocationId: locationId },
            });
        }
        assert.equal(player.quests.getSnapshot(definition.questId)?.stageId, 'mastery');

        const lowLevel = new ThirdMasteryTarget(379, [GameTags.ENTITY_MONSTER]);
        const boss = new ThirdMasteryTarget(500, [GameTags.ENTITY_MONSTER, GameTags.ENTITY_BOSS]);
        emitGameEvent(GameEventIds.ENTITY_DEFEATED, { actor: player, subject: lowLevel });
        emitGameEvent(GameEventIds.CRITICAL_HIT, { actor: player, subject: boss });
        finishMastery(player, lineage.lineage);
        assert.equal(player.quests.getSnapshot(definition.questId)?.stageId, 'throne-trial');

        emitGameEvent(GameEventIds.ENTITY_DEFEATED, {
            actor: player,
            subject: new ThirdMasteryTarget(999, [GameTags.ENTITY_MONSTER, GameTags.ENTITY_BOSS]),
        });
        for (const bossId of ['nebula_sovereign', 'zero_hour_queen', 'last_constellation']) {
            emitGameEvent(GameEventIds.ENTITY_DEFEATED, {
                actor: player,
                subject: new Monster(bossId, 'third-advancement-test'),
            });
        }
        assert.equal(player.quests.getSnapshot(definition.questId)?.stageId, 'return-report');

        emitGameEvent(GameEventIds.NPC_DIALOGUE_STARTED, {
            actor: player,
            data: { npcId: 'job_master', scenarioKey: 'test' },
        });
        assert.equal(player.quests.getStatus(definition.questId), QuestStatus.ACTIVE);
        emitGameEvent(GameEventIds.NPC_DIALOGUE_STARTED, {
            actor: player,
            data: { npcId: THIRD_ADVANCEMENT_NPC_ID, scenarioKey: 'progress' },
        });
        assert.equal(player.quests.getStatus(definition.questId), QuestStatus.READY);
        assert.equal(player.quests.turnIn(definition.questId, 'job_master').success, false);
        assert.equal(player.quests.turnIn(definition.questId, THIRD_ADVANCEMENT_NPC_ID).success, true);
        assert.equal(actual.career.thirdJob?.id, definition.thirdJobId);
        assert.ok(actual.grantedSkills.includes(actual.career.eliteJob!.grantedSkills[0].skillDataId));
        assert.ok(actual.grantedSkills.includes(actual.career.thirdJob!.grantedSkills[0].skillDataId));
        assert.equal(player.quests.canAccept(definition.questId, THIRD_ADVANCEMENT_NPC_ID), false);
        await Promise.resolve();
        assert.equal(actual.saveCount, 1);
    }
});

test('세 왕좌 공동 처치는 막타자와 양수 기여자의 3차 시험을 함께 진행시킨다', () => {
    const lineage = LINEAGES[0];
    const definition = THIRD_ADVANCEMENT_DEFINITIONS.find(entry => entry.lineage === lineage.lineage)!;
    const finisher = new ThirdAdvancementPlayer(98_100, lineage);
    const contributor = new ThirdAdvancementPlayer(98_101, lineage);
    const finisherPlayer = finisher as unknown as Player;
    const contributorPlayer = contributor as unknown as Player;
    registerOnlinePlayer(finisherPlayer);
    registerOnlinePlayer(contributorPlayer);

    try {
        advanceToThroneTrial(finisherPlayer, lineage, definition.questId);
        advanceToThroneTrial(contributorPlayer, lineage, definition.questId);

        for (const [index, bossId] of ['nebula_sovereign', 'zero_hour_queen', 'last_constellation'].entries()) {
            const boss = new Monster(bossId, 'job_hall');
            assert.equal(boss.recordThreat(finisherPlayer, ThreatAction.DAMAGE, 20), true);
            assert.equal(boss.recordThreat(contributorPlayer, ThreatAction.DAMAGE, 10), true);
            if (index === 0) {
                assert.deepEqual(boss.getDefeatCreditUserIds(), [finisher.userId, contributor.userId]);
                assert.equal(Object.isFrozen(boss.getDefeatCreditUserIds()), true);
            }
            emitGameEvent(GameEventIds.ENTITY_DEFEATED, {
                actor: finisherPlayer,
                subject: boss,
            });
        }

        assert.equal(finisher.quests.getSnapshot(definition.questId)?.stageId, 'return-report');
        assert.equal(contributor.quests.getSnapshot(definition.questId)?.stageId, 'return-report');
    } finally {
        unregisterOnlinePlayer(finisher.userId);
        unregisterOnlinePlayer(contributor.userId);
    }
});
