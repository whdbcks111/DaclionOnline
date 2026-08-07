import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import type Player from '../../models/actors/Player.js';
import Entity from '../../models/core/Entity.js';
import Equipment from '../../models/economy/Equipment.js';
import SkillBook from '../../models/progression/SkillBook.js';
import { defineSkill } from '../../models/progression/Skill.js';
import { PlayerProgress } from '../../models/progression/Progress.js';
import { CodexCategory, createCodexEntryId, reloadCodexRegistry } from '../../models/progression/Codex.js';
import { emitGameEvent, GameEventIds } from '../../models/core/GameEvent.js';
import { GameTags } from '../../../../shared/tags.js';
import { initSocket } from '../infrastructure/socket.js';
import {
    PASSIVE_TRAINING_DAILY_CAP,
    awardPassiveTrainingExperience,
    getPassiveTrainingDayKey,
    getPassiveTrainingSnapshot,
    initPassiveTrainingEventTracking,
    resetPassiveTrainingEventTracking,
    setPassiveTrainingFocus,
} from './passiveTraining.js';

initSocket(createServer(), '*');

const FIRST_SKILL_ID = 'test_passive_training_first';
const SECOND_SKILL_ID = 'test_passive_training_second';

for (const [id, name, gain] of [
    [FIRST_SKILL_ID, '첫 패시브', 10],
    [SECOND_SKILL_ID, '둘째 패시브', 20],
] as const) {
    defineSkill({
        id,
        name,
        icon: 'skills/power_strike',
        maxLevel: 5,
        descriptionTemplate: '',
        costTemplate: '',
        activationConditionTemplate: '',
        baseMetadata: null,
        calculateExperienceGain: () => gain,
        tags: [GameTags.SKILL_PASSIVE],
    });
}

class PassiveTrainingPlayer extends Entity {
    override readonly name = '패시브 수련 시험 플레이어';
    readonly userId: number;
    readonly progress: PlayerProgress;
    readonly skills: SkillBook;

    constructor(userId: number) {
        super(1, 0, 'test', { maxLife: 100 }, Equipment.createEmpty());
        this.userId = userId;
        this.progress = PlayerProgress.createEmpty(userId);
        this.skills = SkillBook.createEmpty(userId);
        this.skills.bindOwner(this as unknown as Player);
        this.skills.grant(FIRST_SKILL_ID, 'test');
        this.skills.grant(SECOND_SKILL_ID, 'test');
    }

    override get isPlayer(): boolean { return true; }
    override get playerUserId(): number { return this.userId; }
}

test('패시브 수련 날짜는 KST 자정에 바뀌고 하루 300 경험치로 제한된다', () => {
    assert.equal(getPassiveTrainingDayKey(new Date('2026-08-08T14:59:59.000Z')), '2026-08-08');
    assert.equal(getPassiveTrainingDayKey(new Date('2026-08-08T15:00:00.000Z')), '2026-08-09');

    const player = new PassiveTrainingPlayer(981_001) as unknown as Player;
    const now = new Date('2026-08-08T03:00:00.000Z');
    const result = awardPassiveTrainingExperience(player, 100, () => 0, now);
    assert.equal(result.awarded, true);
    assert.equal(result.gained, PASSIVE_TRAINING_DAILY_CAP);
    assert.equal(result.remainingToday, 0);
    assert.equal(awardPassiveTrainingExperience(player, 1, () => 0, now).reason, 'daily-cap');

    const tomorrow = getPassiveTrainingSnapshot(player, new Date('2026-08-09T03:00:00.000Z'));
    assert.equal(tomorrow.gainedToday, 0);
    assert.equal(tomorrow.remainingToday, PASSIVE_TRAINING_DAILY_CAP);
});

test('기본은 성장 가능한 패시브 하나를 무작위로 고르고 집중 대상을 영속 지정한다', () => {
    const actual = new PassiveTrainingPlayer(981_002);
    const player = actual as unknown as Player;
    const first = awardPassiveTrainingExperience(player, 1, () => 0);
    assert.equal(first.skillId, FIRST_SKILL_ID);
    assert.equal(first.gained, 10);

    const focused = setPassiveTrainingFocus(player, '둘째 패시브');
    assert.equal(focused.changed, true);
    assert.equal(getPassiveTrainingSnapshot(player).focusSkillId, SECOND_SKILL_ID);
    const second = awardPassiveTrainingExperience(player, 1, () => 0);
    assert.equal(second.skillId, SECOND_SKILL_ID);
    assert.equal(second.gained, 20);

    assert.equal(setPassiveTrainingFocus(player, '자동').changed, true);
    assert.equal(getPassiveTrainingSnapshot(player).automatic, true);
});

test('낚시와 등록된 요리 제작 성공 이벤트만 패시브 수련 경험치를 지급한다', () => {
    reloadCodexRegistry([{
        id: createCodexEntryId(CodexCategory.COOKING, 'test:meal'),
        category: CodexCategory.COOKING,
        name: '시험 요리',
        thresholds: { bronze: 1, silver: 5, gold: 20 },
    }], false);
    resetPassiveTrainingEventTracking();
    initPassiveTrainingEventTracking();
    const actual = new PassiveTrainingPlayer(981_003);
    const player = actual as unknown as Player;
    setPassiveTrainingFocus(player, '첫 패시브');

    emitGameEvent(GameEventIds.FISH_CAUGHT, { actor: player, data: { itemDataId: 'fish' } });
    emitGameEvent(GameEventIds.ITEM_CRAFTED, { actor: player, data: { recipeId: 'test:meal', quantity: 2 } });
    emitGameEvent(GameEventIds.ITEM_CRAFTED, { actor: player, data: { recipeId: 'test:weapon', quantity: 99 } });

    assert.equal(actual.skills.get(FIRST_SKILL_ID)?.experience, 30);
    resetPassiveTrainingEventTracking();
});
