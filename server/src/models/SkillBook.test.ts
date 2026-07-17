import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import type Player from './Player.js';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
import { AttributeType } from './Attribute.js';
import { PlayerProgress } from './Progress.js';
import SkillBook from './SkillBook.js';
import Inventory from './Inventory.js';
import { getIO, initSocket } from '../modules/socket.js';
import { getChannelHistory, getFilteredHistoryForUser } from '../modules/channel.js';
import { createSession, removeSession } from '../modules/login.js';
import { registerOnlinePlayer, unregisterOnlinePlayer } from '../modules/playerRegistry.js';
import '../data/progress.js';
import '../data/skills.js';
import '../data/items.js';
import '../data/jobs.js';
import CareerProfile, { CareerProgressIds } from './Career.js';

class TestSkillPlayer extends Entity {
    override readonly name = '스킬 시험 플레이어';
    readonly userId = 9301;
    readonly progress = PlayerProgress.createEmpty(this.userId);
    readonly skills = SkillBook.createEmpty(this.userId);
    readonly inventory = Inventory.createEmpty(this.userId, 100);
    readonly career: CareerProfile;

    constructor() {
        super(1, 0, 'test', { maxLife: 100 }, Equipment.createEmpty());
        this.career = new CareerProfile(this as unknown as Player);
        this.skills.bindOwner(this as unknown as Player);
    }

    override get isPlayer(): boolean { return true; }
    override get playerUserId(): number { return this.userId; }

    canSpendMentality(amount: number): boolean {
        return Number.isFinite(amount) && amount >= 0 && this.mentality >= amount;
    }

    spendMentality(amount: number): boolean {
        if (!this.canSpendMentality(amount)) return false;
        this.mentality -= amount;
        return true;
    }

    restoreMentality(amount: number): number {
        this.mentality = Math.min(this.maxMentality, this.mentality + amount);
        return this.mentality;
    }
}

class TestTarget extends Entity {
    override readonly name = '강타 대상';
    activationMessageSeenBeforeDamage = false;

    constructor() {
        super(1, 0, 'test', { maxLife: 100, def: 0 }, Equipment.createEmpty());
    }

    override damage(...args: Parameters<Entity['damage']>): ReturnType<Entity['damage']> {
        const lastMessage = getFilteredHistoryForUser(9301, null).at(-1);
        const content = lastMessage?.content;
        this.activationMessageSeenBeforeDamage = lastMessage?.userId === 9301
            && (content === '강타!'
                || (Array.isArray(content)
                    && content.some(node => node.type === 'text' && node.text === '강타!')));
        return super.damage(...args);
    }
}

class TestMonsterSkillOwner extends Entity {
    override readonly name = '보스 시험체';
    readonly skills: SkillBook;

    constructor() {
        super(30, 0, 'test', {
            maxLife: 1000,
            magicForce: 100,
            speed: 1,
            attackSpeed: 0.2,
        }, Equipment.createEmpty());
        this.skills = SkillBook.createRuntime(this, [{ skillDataId: 'seismic_crush', level: 3 }]);
    }
}

const httpServer = createServer();
initSocket(httpServer, 'http://localhost');
test.after(() => { getIO().close(); });

test('치명타 통계가 5회가 되면 강타를 자동 획득한다', () => {
    const player = new TestSkillPlayer();
    player.progress.increment('combat:critical_hits', 5);

    player.skills.update(0.5);

    assert.equal(player.skills.has('power_strike'), true);
    assert.equal(player.skills.get('power_strike')?.acquisitionSource, 'automatic');
    assert.equal(player.skills.dirty, true);
});

test('엘리트 직업은 원래 메인 직업 스킬의 표시 조건을 계속 만족한다', () => {
    const player = new TestSkillPlayer();
    player.progress.setState(CareerProgressIds.MAIN, 'career:warrior');
    player.progress.setState(CareerProgressIds.SUB, 'career:mage');
    player.progress.setState(CareerProgressIds.ELITE, 'career:spellblade');
    player.skills.grant('steel_slash', 'test');

    assert.equal(player.skills.getVisible().some(skill => skill.skillDataId === 'steel_slash'), true);
});

test('스킬 HUD snapshot은 표시 가능한 스킬의 아이콘과 남은 쿨다운을 제공한다', () => {
    const player = new TestSkillPlayer();
    const skill = player.skills.grant('power_strike', 'test', 2).skill;
    const now = 10_000;
    skill.startCooldown(5, now);

    const snapshot = player.skills.getHudSnapshots(now);
    assert.deepEqual(snapshot, [{
        id: 'power_strike',
        name: '강타',
        icon: 'skills/power_strike',
        level: 2,
        isActive: false,
        remainingCooldown: 5,
        maxCooldown: 7.5,
    }]);
});

test('강타는 일회성 관통을 제거하고 확정 치명타 공격과 비용을 확정한다', () => {
    const player = new TestSkillPlayer();
    const target = new TestTarget();
    player.currentTarget = target;
    player.skills.grant('power_strike', 'test');
    const sessionToken = createSession({
        id: player.userId,
        username: 'skill_test',
        nickname: player.name,
    });

    try {
        const outcome = player.skills.activateByInput('강타');

        assert.equal(outcome.activated, true);
        assert.equal(target.activationMessageSeenBeforeDamage, true);
        assert.equal(player.mentality, player.maxMentality - 20);
        assert.equal(target.life, 100 - (10 * 1.15 * 1.5));
        assert.equal(player.attribute.get(AttributeType.ARMOR_PEN), 0);
        assert.equal(player.progress.getCounter('combat:critical_hits'), 1n);
        assert.equal(player.skills.get('power_strike')?.experience, 10);
        assert.ok(player.attackCooldown > 0);
    } finally {
        removeSession(sessionToken);
    }
});

test('스킬 경험치는 성공 발동에만 오르고 요구량을 넘으면 잔여 경험치를 보존해 레벨업한다', () => {
    const player = new TestSkillPlayer();
    player.progress.setState(CareerProgressIds.MAIN, 'career:warrior');
    const skill = player.skills.grant('battle_rush', 'test').skill;

    const first = player.skills.activateByInput('전투 질주');
    const denied = player.skills.activateByInput('전투 질주');

    assert.equal(first.activated, true);
    assert.equal(denied.activated, false);
    assert.equal(skill.experience, 10);
    assert.equal(skill.level, 1);
    assert.equal(skill.getRequiredExperience(player), 100);

    const result = skill.addExperience(player, 100);
    assert.equal(result.levelsGained, 1);
    assert.equal(skill.level, 2);
    assert.equal(skill.experience, 10);
    assert.equal(skill.getRequiredExperience(player), 150);
});

test('몬스터 런타임 스킬은 성공적으로 발동해도 경험치를 획득하지 않는다', () => {
    const monster = new TestMonsterSkillOwner();
    const target = new TestTarget();
    monster.currentTarget = target;

    const outcome = monster.skills.activateById('seismic_crush');

    assert.equal(outcome.activated, true);
    assert.equal(monster.skills.get('seismic_crush')?.experience, 0);
});

test('버프 스킬은 시전 메시지와 효과 피드백을 모두 본인에게만 남긴다', () => {
    const player = new TestSkillPlayer();
    player.progress.setState(CareerProgressIds.MAIN, 'career:warrior');
    player.skills.grant('battle_rush', 'test', 3);
    const sessionToken = createSession({
        id: player.userId,
        username: 'buff_skill_test',
        nickname: player.name,
    });

    try {
        const publicMessageCount = getChannelHistory(null).length;
        const outcome = player.skills.activateByInput('전투 질주');
        assert.equal(outcome.activated, true);
        assert.equal(getChannelHistory(null).length, publicMessageCount);

        const privateMessages = getFilteredHistoryForUser(player.userId, null);
        const activationMessage = privateMessages.at(-2);
        assert.equal(activationMessage?.userId, player.userId);
        assert.ok(Array.isArray(activationMessage?.content));
        assert.equal(
            Array.isArray(activationMessage?.content) && activationMessage.content[0]?.type === 'text'
                ? activationMessage.content[0].text
                : '',
            '전투 질주!',
        );

        const feedback = privateMessages.at(-1);
        assert.equal(feedback?.userId, 0);
        const feedbackText = Array.isArray(feedback?.content)
            ? feedback.content.filter(node => node.type === 'text').map(node => node.text).join('')
            : feedback?.content ?? '';
        assert.match(feedbackText, /전투 질주 발동/);
        assert.match(feedbackText, /공격력 \+21%/);
        assert.match(feedbackText, /10초/);
    } finally {
        removeSession(sessionToken);
    }
});

test('몬스터 런타임 스킬북도 플레이어와 같은 SkillData 수명주기를 실행한다', () => {
    const monster = new TestMonsterSkillOwner();
    const target = new TestTarget();
    monster.currentTarget = target;

    const outcome = monster.skills.activateById('seismic_crush');
    assert.equal(outcome.activated, true);
    assert.equal(monster.skills.get('seismic_crush')?.isActive, true);

    monster.skills.update(1.8);

    assert.ok(target.life < target.maxLife);
    assert.equal(monster.skills.get('seismic_crush')?.isActive, false);
    assert.equal(monster.skills.get('seismic_crush')?.data.icon, 'skills/seismic_crush');
});

test('스킬북은 신규 스킬 획득 때만 아이템 한 개를 소비한다', async () => {
    const player = new TestSkillPlayer();
    registerOnlinePlayer(player as unknown as Player);
    try {
        player.inventory.addItem('seismic_crush_skillbook', 1);
        const firstBook = player.inventory.getFirstItemByData('seismic_crush_skillbook');
        assert.ok(firstBook);
        await player.inventory.useItem(firstBook.id);
        assert.equal(player.skills.has('seismic_crush'), true);
        assert.equal(player.inventory.getCount('seismic_crush_skillbook'), 0);

        player.inventory.addItem('seismic_crush_skillbook', 1);
        const duplicateBook = player.inventory.getFirstItemByData('seismic_crush_skillbook');
        assert.ok(duplicateBook);
        await player.inventory.useItem(duplicateBook.id);
        assert.equal(player.inventory.getCount('seismic_crush_skillbook'), 1);
    } finally {
        unregisterOnlinePlayer(player.userId);
    }
});
