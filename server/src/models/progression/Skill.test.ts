import assert from 'node:assert/strict';
import test from 'node:test';
import type Player from '../actors/Player.js';
import Entity from '../core/Entity.js';
import Equipment from '../economy/Equipment.js';
import Skill, { defineSkill } from './Skill.js';
import { parseChatMessage } from '../../utils/chatParser.js';
import { GameTags } from '../../../../shared/tags.js';

class TestEntity extends Entity {
    constructor(override readonly name: string) {
        super(1, 0, 'test', { atk: 20, maxLife: 100 }, Equipment.createEmpty());
    }
}

defineSkill({
    id: 'test_breakthrough_active',
    name: '돌파 액티브',
    icon: 'skills/test',
    maxLevel: 5,
    descriptionTemplate: '',
    costTemplate: '',
    activationConditionTemplate: '',
    baseMetadata: null,
    tags: [GameTags.SKILL_ACTIVE],
});

defineSkill({
    id: 'test_breakthrough_passive',
    name: '돌파 패시브',
    icon: 'skills/test',
    maxLevel: 1,
    descriptionTemplate: '',
    costTemplate: '',
    activationConditionTemplate: '',
    baseMetadata: null,
    tags: [GameTags.SKILL_PASSIVE],
});

test('스킬 템플릿은 metadata와 계산 필드를 치환하고 채팅 색상 문법을 보존한다', () => {
    defineSkill({
        id: 'test_template_skill',
        name: '시험 스킬',
        icon: 'skills/test',
        maxLevel: 3,
        descriptionTemplate: '{{icon.atk}} [color=orange]{{damage}}[/color] 피해',
        costTemplate: '{{meta.cost}} 정신력',
        activationConditionTemplate: '{{cost}} 이상 필요',
        activationMessage: '시험 스킬!',
        baseMetadata: { baseDamage: 10, cost: 5 },
        calculatedFields: {
            damage: ({ skill }) => (skill.getMetadata<number>('baseDamage') ?? 0) * skill.level,
            cost: ({ skill }) => skill.getMetadata<number>('cost') ?? 0,
        },
        tags: [],
    });
    const player = new TestEntity('플레이어 대역') as unknown as Player;
    const skill = new Skill({ playerId: 1, skillDataId: 'test_template_skill', level: 2 });

    assert.equal(skill.formatDescription(player), '[icon=attributes/atk] [color=orange]20[/color] 피해');
    assert.deepEqual(parseChatMessage(skill.formatDescription(player))[0], {
        type: 'icon',
        name: 'attributes/atk',
    });
    assert.equal(skill.formatCost(player), '5 정신력');
    assert.equal(skill.formatActivationCondition(player), '5 이상 필요');
    assert.equal(skill.data.activationHeader, 'test_template_skill');
});

test('스킬 인스턴스 metadata는 원본 변경을 상속하되 델타값은 유지한다', () => {
    const define = (baseDamage: number) => defineSkill({
        id: 'test_delta_skill',
        name: '델타 시험',
        icon: 'skills/test',
        maxLevel: 1,
        descriptionTemplate: '{{meta.baseDamage}}',
        costTemplate: '',
        activationConditionTemplate: '',
        baseMetadata: { baseDamage },
        tags: [],
    });
    define(10);
    const skill = new Skill({ playerId: 1, skillDataId: 'test_delta_skill' });
    assert.equal(skill.getMetadata('baseDamage'), 10);

    define(12);
    assert.equal(skill.getMetadata('baseDamage'), 12);
    skill.setMetadata('baseDamage', 30);
    define(15);
    assert.equal(skill.getMetadata('baseDamage'), 30);
    skill.resetMetadata('baseDamage');
    assert.equal(skill.getMetadata('baseDamage'), 15);
});

test('최대 레벨 돌파는 액티브 +5, 패시브 +2로 누적 상한을 제한한다', () => {
    const active = new Skill({ playerId: 1, skillDataId: 'test_breakthrough_active' });
    const passive = new Skill({ playerId: 1, skillDataId: 'test_breakthrough_passive' });

    assert.equal(active.increaseMaxLevelBonus(99), 5);
    assert.deepEqual(active.getMaxLevelBreakthroughSnapshot(), {
        id: 'test_breakthrough_active',
        name: '돌파 액티브',
        icon: 'skills/test',
        level: 1,
        baseMaxLevel: 5,
        maxLevel: 10,
        maxLevelBonus: 5,
        maxLevelBonusCap: 5,
        remainingMaxLevelBonus: 0,
        isPassive: false,
    });
    assert.equal(active.increaseMaxLevelBonus(), 0);

    assert.equal(passive.increaseMaxLevelBonus(99), 2);
    assert.equal(passive.maxLevel, 3);
    assert.equal(passive.maxLevelBonus, 2);
    assert.equal(passive.remainingMaxLevelBonus, 0);
});

test('액티브 돌파 레벨은 기존 레벨 계수 증가량의 두 배로 계산하고 패시브는 실제 레벨을 유지한다', () => {
    const active = new Skill({ playerId: 1, skillDataId: 'test_breakthrough_active', level: 5 });
    const passive = new Skill({ playerId: 1, skillDataId: 'test_breakthrough_passive' });

    assert.equal(active.coefficientLevel, 5);
    active.increaseMaxLevelBonus(2);
    active.setLevel(6);
    assert.equal(active.coefficientLevel, 7);
    active.setLevel(7);
    assert.equal(active.coefficientLevel, 9);

    passive.increaseMaxLevelBonus(2);
    passive.setLevel(3);
    assert.equal(passive.coefficientLevel, 3);
});

test('손상된 최대 레벨 보너스 metadata는 안전한 범위로 정규화되고 일반 metadata API에서 숨겨진다', () => {
    for (const invalid of [-1, Number.NaN, Number.POSITIVE_INFINITY, '2', null, {}, []]) {
        const skill = new Skill({
            playerId: 1,
            skillDataId: 'test_breakthrough_active',
            metadataDelta: { 'progression.maxLevelBonus': invalid as never },
        });
        assert.equal(skill.maxLevelBonus, 0, String(invalid));
        assert.equal(skill.maxLevel, 5, String(invalid));
    }

    const fractional = new Skill({
        playerId: 1,
        skillDataId: 'test_breakthrough_active',
        metadataDelta: { 'progression.maxLevelBonus': 1.5 },
    });
    assert.equal(fractional.maxLevelBonus, 1);
    assert.equal(fractional.maxLevel, 6);

    const clamped = new Skill({
        playerId: 1,
        skillDataId: 'test_breakthrough_active',
        metadataDelta: { 'progression.maxLevelBonus': 99 },
    });
    assert.equal(clamped.maxLevelBonus, 5);
    assert.equal(clamped.getMetadata('progression.maxLevelBonus'), undefined);
    assert.equal(clamped.getMetadataSnapshot(), null);
    assert.equal(clamped.getMetadataDeltaSnapshot(), null);
    assert.throws(
        () => clamped.setMetadata('progression.maxLevelBonus', 1),
        /progression API/,
    );
    assert.throws(
        () => clamped.resetMetadata('progression.maxLevelBonus'),
        /progression API/,
    );
});

test('돌파 metadata를 먼저 복원해 원래 상한의 레벨과 경험치를 보존하고 Lv.6까지 성장한다', () => {
    const owner = new TestEntity('돌파 경험치 소유자');
    const original = new Skill({
        playerId: 1,
        skillDataId: 'test_breakthrough_active',
        level: 5,
    });
    assert.equal(original.increaseMaxLevelBonus(), 1);
    assert.equal(original.addExperience(owner, 37).experience, 37);
    assert.deepEqual(original.getPersistedMetadata(), {
        __daclionSkillMetadata: 1,
        values: { 'progression.maxLevelBonus': 1 },
    });

    const reloaded = Skill.fromPersistence({
        playerId: 1,
        skillDataId: original.skillDataId,
        level: original.level,
        experience: original.experience,
        cooldownEndsAt: null,
        metadata: original.getPersistedMetadata(),
        tags: [],
        acquiredAt: new Date(0),
    });
    assert.equal(reloaded.level, 5);
    assert.equal(reloaded.experience, 37);
    assert.equal(reloaded.maxLevelBonus, 1);
    assert.equal(reloaded.maxLevel, 6);

    const result = reloaded.addExperience(owner, 263);
    assert.equal(result.levelsGained, 1);
    assert.equal(reloaded.level, 6);
    assert.equal(reloaded.experience, 0);
});

test('공격 옵션으로 한 번의 공격을 확정 치명타로 계산한다', () => {
    const attacker = new TestEntity('공격자');
    const target = new TestEntity('대상');
    const result = attacker.attack(target, 'physical', 10, {
        criticalRate: 1,
        criticalDamage: 2,
        consumeMainHandDurability: false,
    });

    assert.ok(result);
    assert.equal(result.critical, true);
    assert.equal(result.rawAmount, 20);
});

test('스킬 포맷 문자열은 상태창과 같은 테마 색상 token을 사용할 수 있다', () => {
    assert.deepEqual(parseChatMessage('[color=$magic]정신력 20[/color]'), [{
        type: 'color',
        color: '$magic',
        children: [{ type: 'text', text: '정신력 20' }],
    }]);
});
