import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createServer } from 'node:http';
import Attribute from './Attribute.js';
import CareerProfile, { CareerProgressIds } from './Career.js';
import { getAllJobs, getJob, JobSlotType, JobTier, resolveEliteJob } from './Job.js';
import { PlayerProgress } from './Progress.js';
import type Player from './Player.js';
import '../data/jobs.js';
import '../data/skills.js';
import Skill, { getSkillData } from './Skill.js';
import { getAllQuestData } from './Quest.js';
import '../data/quests.js';
import '../data/items.js';
import { getIO, initSocket } from '../modules/socket.js';

initSocket(createServer(), 'http://localhost');
test.after(() => { getIO().close(); });

function createCareer(level = 200): { career: CareerProfile; player: Player } {
    const progress = PlayerProgress.createEmpty(901);
    const player = {
        userId: 901,
        level,
        progress,
        attribute: new Attribute(),
        skills: { grant: () => ({ acquired: true }) },
        save: async () => undefined,
    } as unknown as Player;
    Object.assign(player, { attackOwner: player, name: '직업 시험 플레이어', playerUserId: 901 });
    const career = new CareerProfile(player);
    Object.assign(player, { career });
    return { career, player };
}

test('1차 직업은 최소 3개 스킬을 지급하고 서로 다른 12개 순서 조합만 엘리트 직업을 가진다', () => {
    const firstJobs = getAllJobs().filter(job => job.tier === JobTier.FIRST);
    const eliteJobs = getAllJobs().filter(job => job.tier === JobTier.ELITE);
    assert.equal(firstJobs.length, 4);
    assert.equal(eliteJobs.length, 12);
    assert.ok(firstJobs.every(job => job.grantedSkills.length >= 3));
    assert.ok(firstJobs.every(job => job.grantedSkills.filter(grant =>
        getSkillData(grant.skillDataId)?.tags.includes('skill:passive')).length === 1));
    for (const grant of firstJobs.flatMap(job => job.grantedSkills)) {
        const skill = getSkillData(grant.skillDataId);
        assert.ok(skill, grant.skillDataId);
        const png = readFileSync(new URL(`../../../client/public/icons/${skill.icon}.png`, import.meta.url));
        assert.equal(png.readUInt32BE(16), 128);
        assert.equal(png.readUInt32BE(20), 128);
    }
    assert.equal(getAllQuestData().filter(quest => quest.tags.includes('quest:career')).length, 8);
    const mageTrial = getAllQuestData().find(quest => quest.id === 'career:main_mage_promotion');
    assert.equal(mageTrial?.stages[0].objectives[0].label, '불·얼음·독·자연 속성 적 처치');
    assert.ok(mageTrial?.rewards.some(reward => reward.label === '견습 마법 지팡이 x1'));
    for (const main of firstJobs) for (const sub of firstJobs) {
        assert.equal(Boolean(resolveEliteJob(main.id, sub.id)), main.id !== sub.id, `${main.id}>${sub.id}`);
    }
    for (const icon of new Set(firstJobs.map(job => job.icon))) {
        const png = readFileSync(new URL(`../../../client/public/icons/${icon}.png`, import.meta.url));
        assert.equal(png.readUInt32BE(16), 128);
        assert.equal(png.readUInt32BE(20), 128);
        assert.equal(png[25], 6);
    }
    for (const itemId of ['training_axe', 'apprentice_staff']) {
        const png = readFileSync(new URL(`../../../client/public/icons/items/${itemId}.png`, import.meta.url));
        assert.equal(png.readUInt32BE(16), 128);
        assert.equal(png.readUInt32BE(20), 128);
        assert.equal(png[25], 6);
    }
});

test('메인과 같은 서브 직업은 거부하고 엘리트 직업은 원래 메인 계보 스킬과 호환된다', () => {
    const { career, player } = createCareer();
    career.initialize();
    assert.equal(career.mainJob, undefined);
    player.progress.setState(CareerProgressIds.MAIN, 'career:warrior');
    assert.equal(career.canAssign(JobSlotType.SUB, 'career:warrior').success, false);
    assert.match(career.canAssign(JobSlotType.SUB, 'career:warrior').reason ?? '', /같은/);

    player.progress.setState(CareerProgressIds.SUB, 'career:mage');
    player.progress.setState(CareerProgressIds.ELITE, 'career:spellblade');
    assert.equal(career.hasJob('career:warrior', JobSlotType.MAIN), true);
    assert.equal(career.hasJob('career:mage', JobSlotType.SUB), true);
    assert.equal(career.hasJob('career:spellblade'), true);
    assert.equal(career.hasJob('career:archer'), false);
    assert.deepEqual(getJob('career:spellblade')?.parentJobIds, ['career:warrior']);
});

test('Lv.200에는 서로 다른 메인·서브 순서 조합으로 엘리트 직업이 자동 확정된다', () => {
    const { career, player } = createCareer(200);
    player.progress.setState(CareerProgressIds.MAIN, 'career:warrior');
    player.progress.setState(CareerProgressIds.SUB, 'career:mage');

    assert.equal(career.evaluateElitePromotion(), true);
    assert.equal(career.eliteJobId, 'career:spellblade');
    assert.equal(career.evaluateElitePromotion(), false);
});

test('관리자 직업 설정도 같은 이중 직업을 막고 유효한 조합을 즉시 적용한다', () => {
    const { career } = createCareer(50);

    assert.equal(career.setByAdmin('career:warrior', 'career:warrior').success, false);
    assert.equal(career.setByAdmin('', 'career:mage').success, false);
    assert.equal(career.setByAdmin('career:warrior', 'career:mage').success, true);
    assert.equal(career.mainJobId, 'career:warrior');
    assert.equal(career.subJobId, 'career:mage');
});

test('직업 스킬 설명은 현재 수치와 계수 hover를 제공하고 두 발동 방식을 안내한다', () => {
    const { player } = createCareer();
    const skillIds = [
        'warrior_combat_instinct', 'archer_hawkeye', 'assassin_lethal_instinct', 'mage_mana_cycle',
        'steel_slash', 'battle_rush', 'indomitable', 'arcane_arrow', 'multishot',
        'stunning_shot', 'wind_evasion', 'stealth', 'ambush', 'venom_blade',
        'magic_bolt', 'mana_barrier', 'elemental_bind', 'elemental_insight',
        'fireball', 'frost_bolt', 'lightning_orb',
    ];
    for (const skillDataId of skillIds) {
        const skill = new Skill({ playerId: player.userId, skillDataId, level: 3 });
        const description = skill.formatDescription(player);
        const activation = skill.formatActivationCondition(player);
        assert.doesNotMatch(description, /\{\{/);
        assert.match(description, /\[tooltip=/);
        if (skill.isPassive) {
            assert.match(activation, /항상 적용/);
        } else {
            assert.match(activation, /\/스킬/);
            assert.match(activation, /!/);
        }
        assert.doesNotMatch(activation, /계보|계승/);
    }
});
