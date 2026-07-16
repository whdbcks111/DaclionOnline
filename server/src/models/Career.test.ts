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
import { getSkillData } from './Skill.js';
import { getAllQuestData } from './Quest.js';
import '../data/quests.js';
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
    for (const grant of firstJobs.flatMap(job => job.grantedSkills)) {
        const skill = getSkillData(grant.skillDataId);
        assert.ok(skill, grant.skillDataId);
        const png = readFileSync(new URL(`../../../client/public/icons/${skill.icon}.png`, import.meta.url));
        assert.equal(png.readUInt32BE(16), 128);
        assert.equal(png.readUInt32BE(20), 128);
    }
    assert.equal(getAllQuestData().filter(quest => quest.tags.includes('quest:career')).length, 8);
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
