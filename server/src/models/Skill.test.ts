import assert from 'node:assert/strict';
import test from 'node:test';
import type Player from './Player.js';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
import Skill, { defineSkill } from './Skill.js';
import { parseChatMessage } from '../utils/chatParser.js';

class TestEntity extends Entity {
    constructor(override readonly name: string) {
        super(1, 0, 'test', { atk: 20, maxLife: 100 }, Equipment.createEmpty());
    }
}

test('스킬 템플릿은 metadata와 계산 필드를 치환하고 채팅 색상 문법을 보존한다', () => {
    defineSkill({
        id: 'test_template_skill',
        name: '시험 스킬',
        maxLevel: 3,
        descriptionTemplate: '[color=orange]{{damage}}[/color] 피해',
        costTemplate: '{{meta.cost}} 정신력',
        activationConditionTemplate: '{{cost}} 이상 필요',
        baseMetadata: { baseDamage: 10, cost: 5 },
        calculatedFields: {
            damage: ({ skill }) => (skill.getMetadata<number>('baseDamage') ?? 0) * skill.level,
            cost: ({ skill }) => skill.getMetadata<number>('cost') ?? 0,
        },
        tags: [],
    });
    const player = new TestEntity('플레이어 대역') as unknown as Player;
    const skill = new Skill({ playerId: 1, skillDataId: 'test_template_skill', level: 2 });

    assert.equal(skill.formatDescription(player), '[color=orange]20[/color] 피해');
    assert.equal(skill.formatCost(player), '5 정신력');
    assert.equal(skill.formatActivationCondition(player), '5 이상 필요');
});

test('스킬 인스턴스 metadata는 원본 변경을 상속하되 델타값은 유지한다', () => {
    const define = (baseDamage: number) => defineSkill({
        id: 'test_delta_skill',
        name: '델타 시험',
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
