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
import Skill, { getAllSkillData, getSkillData } from './Skill.js';
import { getAllQuestData } from './Quest.js';
import '../data/quests.js';
import '../data/items.js';
import { getIO, initSocket } from '../modules/socket.js';
import { GameEventIds } from './GameEvent.js';

initSocket(createServer(), 'http://localhost');
test.after(() => { getIO().close(); });

function createCareer(level = 200): { career: CareerProfile; player: Player; granted: string[] } {
    const progress = PlayerProgress.createEmpty(901);
    const granted: string[] = [];
    const player = {
        userId: 901,
        level,
        progress,
        attribute: new Attribute(),
        skills: { grant: (id: string) => { granted.push(id); return { acquired: true }; } },
        save: async () => undefined,
    } as unknown as Player;
    Object.assign(player, { attackOwner: player, name: '직업 시험 플레이어', playerUserId: 901 });
    const career = new CareerProfile(player);
    Object.assign(player, { career });
    return { career, player, granted };
}

test('5개 1차 직업은 최소 3개 스킬을 지급하고 서로 다른 20개 순서 조합이 엘리트 직업을 가진다', () => {
    const firstJobs = getAllJobs().filter(job => job.tier === JobTier.FIRST);
    const eliteJobs = getAllJobs().filter(job => job.tier === JobTier.ELITE);
    assert.equal(firstJobs.length, 5);
    assert.equal(eliteJobs.length, 20);
    assert.ok(firstJobs.every(job => job.grantedSkills.length >= 3));
    assert.ok(firstJobs.every(job => job.grantedSkills.some(grant =>
        getSkillData(grant.skillDataId)?.tags.includes('skill:passive'))));
    assert.ok(eliteJobs.every(job => job.grantedSkills.length === 2
        && job.grantedSkills.filter(grant => getSkillData(grant.skillDataId)?.tags.includes('skill:passive')).length === 1
        && job.grantedSkills.filter(grant => getSkillData(grant.skillDataId)?.tags.includes('skill:active')).length === 1));
    for (const skill of getAllSkillData()) {
        const png = readFileSync(new URL(`../../../client/public/icons/${skill.icon}.png`, import.meta.url));
        assert.equal(png.readUInt32BE(16), 128, `${skill.id} icon width`);
        assert.equal(png.readUInt32BE(20), 128, `${skill.id} icon height`);
    }
    for (const skill of getAllSkillData().filter(data => data.activationMessage)) {
        assert.equal(skill.activationHeader, skill.id);
        const icon = readFileSync(new URL(`../../../client/public/icons/${skill.icon}.png`, import.meta.url));
        assert.equal(icon.readUInt32BE(16), 128, `${skill.id} icon width`);
        assert.equal(icon.readUInt32BE(20), 128, `${skill.id} icon height`);
        const banner = readFileSync(new URL(`../../../client/public/icons/skill-headers/${skill.activationHeader}.png`, import.meta.url));
        assert.equal(banner.readUInt32BE(16), 256, `${skill.id} cast header width`);
        assert.equal(banner.readUInt32BE(20), 64, `${skill.id} cast header height`);
    }
    assert.equal(getAllQuestData().filter(quest => quest.tags.includes('quest:career')).length, 10);
    const mageTrial = getAllQuestData().find(quest => quest.id === 'career:main_mage_promotion');
    assert.equal(mageTrial?.stages[0].objectives[0].label, '불·얼음·독·자연 속성 적 처치');
    assert.ok(mageTrial?.rewards.some(reward => reward.label === '견습 마법 지팡이 x1'));
    const blacksmithTrials = getAllQuestData().filter(quest => /^career:(main|sub)_blacksmith_promotion$/.test(quest.id));
    assert.equal(blacksmithTrials.length, 2);
    assert.ok(blacksmithTrials.every(quest => quest.giverNpcIds.includes('job_master')));
    assert.ok(blacksmithTrials.every(quest => quest.stages[0].objectives[0].eventId === GameEventIds.RESOURCE_DESTROYED));
    assert.ok(blacksmithTrials.find(quest => quest.id.includes(':main_'))?.rewards.some(reward => reward.label === '철 곡괭이 x1'));
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

test('마법 주문과 자체 생성 투사체는 장착 무기를 요구하지 않는다', () => {
    for (const skillId of [
        'magic_bolt', 'elemental_bind', 'fireball', 'frost_bolt', 'lightning_orb',
        'phantom_shooter_technique', 'arcane_reaper_technique', 'battle_magus_technique',
        'star_weaver_technique', 'hexblade_technique', 'runeforger_technique',
        'artificer_technique', 'arcane_smith_technique',
    ]) {
        assert.equal(getSkillData(skillId)?.weaponRequirement, undefined, skillId);
    }

    assert.deepEqual(getSkillData('spellblade_technique')?.weaponRequirement?.mainHandAnyTags, ['weapon:sword']);
    assert.ok(getSkillData('steel_slash')?.weaponRequirement);
    assert.ok(getSkillData('multishot')?.weaponRequirement);
    assert.ok(getSkillData('venom_blade')?.weaponRequirement);
});

test('엘리트 직업의 계승 패시브와 액티브는 서로 다른 표시 이름을 가진다', () => {
    for (const job of getAllJobs().filter(candidate => candidate.tier === JobTier.ELITE)) {
        const names = job.grantedSkills.map(grant => getSkillData(grant.skillDataId)?.name);
        assert.equal(new Set(names).size, names.length, job.name);
    }
    assert.equal(getSkillData('arcane_reaper_mastery')?.name, '영혼 포식');
    assert.equal(getSkillData('arcane_reaper_technique')?.name, '비전 수확');
});

test('대장장이는 현재 조건에 맞는 메인 또는 서브 직업 슬롯을 실제로 차지한다', () => {
    const mainCase = createCareer(20);
    assert.equal(mainCase.career.getAssignableSlot('career:blacksmith'), JobSlotType.MAIN);
    assert.equal(mainCase.career.assignAvailable('career:blacksmith').success, true);
    assert.equal(mainCase.career.mainJobId, 'career:blacksmith');
    assert.deepEqual(mainCase.granted, ['blacksmith_temper', 'precision_break', 'arcane_smelting', 'metal_forging']);

    const subCase = createCareer(50);
    subCase.player.progress.setState(CareerProgressIds.MAIN, 'career:warrior');
    assert.equal(subCase.career.getAssignableSlot('career:blacksmith'), JobSlotType.SUB);
    assert.equal(subCase.career.assignAvailable('career:blacksmith').success, true);
    assert.equal(subCase.career.subJobId, 'career:blacksmith');
});

test('구형 독립 대장장이는 기존 직업을 덮어쓰지 않고 빈 슬롯으로 이전한다', () => {
    const { career, player } = createCareer(20);
    player.progress.setState(CareerProgressIds.MAIN, 'career:warrior');
    assert.equal(career.migrateLegacyFirstJob('career:blacksmith').success, true);
    assert.equal(career.mainJobId, 'career:warrior');
    assert.equal(career.subJobId, 'career:blacksmith');

    const full = createCareer(200);
    full.player.progress.setState(CareerProgressIds.MAIN, 'career:warrior');
    full.player.progress.setState(CareerProgressIds.SUB, 'career:mage');
    assert.equal(full.career.migrateLegacyFirstJob('career:blacksmith').success, false);
    assert.equal(full.career.subJobId, 'career:mage');
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
    assert.equal(getJob('career:spellblade')?.grantedSkills[0].skillDataId, 'spellblade_mastery');
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

    for (const skillDataId of ['blacksmith_temper', 'precision_break', 'arcane_smelting', 'metal_forging']) {
        const skill = new Skill({ playerId: player.userId, skillDataId, level: 1 });
        assert.doesNotMatch(skill.formatDescription(player), /\{\{/);
        assert.doesNotMatch(skill.formatActivationCondition(player), /\{\{/);
    }
    assert.match(new Skill({ playerId: player.userId, skillDataId: 'arcane_smelting' }).formatActivationCondition(player), /\/스킬|!/);
    assert.match(new Skill({ playerId: player.userId, skillDataId: 'metal_forging' }).formatActivationCondition(player), /\/단조/);

    for (const job of getAllJobs().filter(job => job.tier === JobTier.ELITE)) {
        const skills = job.grantedSkills.map(grant => new Skill({ playerId: player.userId, skillDataId: grant.skillDataId }));
        assert.equal(skills.filter(skill => skill.isPassive).length, 1);
        assert.equal(skills.filter(skill => !skill.isPassive).length, 1);
        for (const skill of skills) {
            assert.match(skill.formatDescription(player), /\[tooltip=/);
            if (!skill.isPassive) {
                assert.match(skill.formatActivationCondition(player), /\/스킬/);
                assert.match(skill.formatActivationCondition(player), /!/);
            }
        }
    }
});
