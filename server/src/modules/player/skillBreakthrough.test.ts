import assert from 'node:assert/strict';
import test from 'node:test';
import type Player from '../../models/actors/Player.js';
import Entity from '../../models/core/Entity.js';
import Equipment from '../../models/economy/Equipment.js';
import Inventory from '../../models/economy/Inventory.js';
import SkillBook from '../../models/progression/SkillBook.js';
import { defineSkill } from '../../models/progression/Skill.js';
import { GameTags } from '../../../../shared/tags.js';
import './itemUse.js';
import '../../data/economy/items.js';
import {
    MASTERY_ESSENCE_BREAKTHROUGH_COST,
    MASTERY_ESSENCE_ITEM_DATA_ID,
    performSkillBreakthrough,
} from './skillBreakthrough.js';

let testSkillSequence = 0;

class SkillBreakthroughPlayer extends Entity {
    override readonly name = '돌파 시험 플레이어';
    readonly userId: number;
    readonly inventory: Inventory;
    readonly skills: SkillBook;
    saveCalls = 0;
    failSave = false;

    constructor() {
        const userId = 970_000 + testSkillSequence;
        super(1, 0, 'test', { maxLife: 100 }, Equipment.createEmpty());
        this.userId = userId;
        this.inventory = Inventory.createEmpty(userId, 1_000);
        this.skills = SkillBook.createEmpty(userId);
        this.skills.bindOwner(this as unknown as Player);
    }

    override get playerUserId(): number { return this.userId; }

    async save(): Promise<void> {
        this.saveCalls++;
        if (this.failSave) throw new Error('의도한 저장 실패');
    }
}

function createPlayerWithSkill(options: { passive?: boolean; essence?: number } = {}): {
    actual: SkillBreakthroughPlayer;
    player: Player;
    skillId: string;
} {
    testSkillSequence++;
    const skillId = `test_breakthrough_${testSkillSequence}`;
    defineSkill({
        id: skillId,
        name: `돌파 시험 ${testSkillSequence}`,
        icon: 'skills/power_strike',
        maxLevel: 5,
        descriptionTemplate: '',
        costTemplate: '',
        activationConditionTemplate: '',
        baseMetadata: null,
        tags: options.passive ? [GameTags.SKILL_PASSIVE] : [],
    });
    const actual = new SkillBreakthroughPlayer();
    actual.skills.grant(skillId, 'test', 5);
    if (options.essence) {
        assert.equal(actual.inventory.addItem(MASTERY_ESSENCE_ITEM_DATA_ID, options.essence), true);
    }
    return { actual, player: actual as unknown as Player, skillId };
}

test('스킬 돌파 서비스는 정수 10개와 상한 증가를 함께 확정하고 즉시 저장한다', async () => {
    const { actual, player, skillId } = createPlayerWithSkill({ essence: MASTERY_ESSENCE_BREAKTHROUGH_COST });

    const result = await performSkillBreakthrough(player, actual.skills.get(skillId)!.name);

    assert.equal(result.success, true);
    assert.equal(actual.inventory.getCount(MASTERY_ESSENCE_ITEM_DATA_ID), 0);
    assert.equal(actual.skills.get(skillId)?.maxLevel, 6);
    assert.equal(actual.skills.get(skillId)?.level, 5);
    assert.equal(actual.saveCalls, 1);
    assert.equal(result.success && result.saveDeferred, false);
});

test('정수가 부족하거나 스킬이 없으면 아무것도 소비하지 않는다', async () => {
    const insufficient = createPlayerWithSkill({ essence: MASTERY_ESSENCE_BREAKTHROUGH_COST - 1 });
    const insufficientResult = await performSkillBreakthrough(
        insufficient.player,
        insufficient.actual.skills.get(insufficient.skillId)!.name,
    );
    assert.deepEqual(
        [insufficientResult.success, !insufficientResult.success && insufficientResult.code],
        [false, 'not-enough'],
    );
    assert.equal(
        insufficient.actual.inventory.getCount(MASTERY_ESSENCE_ITEM_DATA_ID),
        MASTERY_ESSENCE_BREAKTHROUGH_COST - 1,
    );
    assert.equal(insufficient.actual.skills.get(insufficient.skillId)?.maxLevel, 5);
    assert.equal(insufficient.actual.saveCalls, 0);

    const missing = createPlayerWithSkill({ essence: MASTERY_ESSENCE_BREAKTHROUGH_COST });
    const missingResult = await performSkillBreakthrough(missing.player, '없는 스킬');
    assert.deepEqual(
        [missingResult.success, !missingResult.success && missingResult.code],
        [false, 'missing'],
    );
    assert.equal(
        missing.actual.inventory.getCount(MASTERY_ESSENCE_ITEM_DATA_ID),
        MASTERY_ESSENCE_BREAKTHROUGH_COST,
    );
    assert.equal(missing.actual.saveCalls, 0);
});

test('액티브와 패시브의 누적 돌파 상한에서는 정수를 소비하지 않는다', async () => {
    for (const passive of [false, true]) {
        const { actual, player, skillId } = createPlayerWithSkill({
            passive,
            essence: MASTERY_ESSENCE_BREAKTHROUGH_COST,
        });
        const cap = passive ? 2 : 5;
        assert.equal(actual.skills.increaseMaxLevel(skillId, cap).increased, true);

        const result = await performSkillBreakthrough(player, actual.skills.get(skillId)!.name);

        assert.deepEqual([result.success, !result.success && result.code], [false, 'cap']);
        assert.equal(actual.inventory.getCount(MASTERY_ESSENCE_ITEM_DATA_ID), MASTERY_ESSENCE_BREAKTHROUGH_COST);
        assert.equal(actual.skills.get(skillId)?.maxLevel, 5 + cap);
        assert.equal(actual.saveCalls, 0);
    }
});

test('상한 변경 단계가 실패하면 먼저 소비한 정수를 원상 복구한다', async () => {
    const { actual, player, skillId } = createPlayerWithSkill({ essence: MASTERY_ESSENCE_BREAKTHROUGH_COST });
    const originalIncrease = actual.skills.increaseMaxLevel.bind(actual.skills);
    actual.skills.increaseMaxLevel = (() => { throw new Error('의도한 변경 실패'); }) as typeof originalIncrease;

    const result = await performSkillBreakthrough(player, actual.skills.get(skillId)!.name);

    assert.deepEqual([result.success, !result.success && result.code], [false, 'changed']);
    assert.equal(actual.inventory.getCount(MASTERY_ESSENCE_ITEM_DATA_ID), MASTERY_ESSENCE_BREAKTHROUGH_COST);
    assert.equal(actual.skills.get(skillId)?.maxLevel, 5);
    assert.equal(actual.saveCalls, 0);
});

test('즉시 저장 실패는 확정된 돌파를 실패로 오인시키지 않고 dirty 재시도를 남긴다', async () => {
    const { actual, player, skillId } = createPlayerWithSkill({ essence: MASTERY_ESSENCE_BREAKTHROUGH_COST });
    actual.failSave = true;

    const result = await performSkillBreakthrough(player, actual.skills.get(skillId)!.name);

    assert.equal(result.success, true);
    assert.equal(result.success && result.saveDeferred, true);
    assert.equal(actual.inventory.getCount(MASTERY_ESSENCE_ITEM_DATA_ID), 0);
    assert.equal(actual.skills.get(skillId)?.maxLevel, 6);
    assert.equal(actual.skills.dirty, true);
    assert.equal(actual.saveCalls, 1);
});
