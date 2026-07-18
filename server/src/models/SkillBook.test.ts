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
import { Item } from './Item.js';
import { getActiveProjectiles, removeProjectile } from './Projectile.js';
import { getIO, initSocket } from '../modules/socket.js';
import { getChannelHistory, getFilteredHistoryForUser } from '../modules/channel.js';
import { createSession, removeSession } from '../modules/login.js';
import { registerOnlinePlayer, unregisterOnlinePlayer } from '../modules/playerRegistry.js';
import '../data/progress.js';
import '../data/skills.js';
import '../data/items.js';
import '../data/jobs.js';
import '../data/projectiles.js';
import CareerProfile, { CareerProgressIds } from './Career.js';
import { ShieldType } from './Shield.js';
import Stat, { StatType } from './Stat.js';

class TestSkillPlayer extends Entity {
    override readonly name = '스킬 시험 플레이어';
    readonly userId = 9301;
    readonly progress = PlayerProgress.createEmpty(this.userId);
    readonly skills = SkillBook.createEmpty(this.userId);
    readonly inventory = Inventory.createEmpty(this.userId, 100);
    readonly stat = new Stat();
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

test('스킬북 쿨다운 감소 API는 진행 중인 모든 스킬을 지정 초만큼 줄인다', () => {
    const player = new TestSkillPlayer();
    const first = player.skills.grant('power_strike', 'test').skill;
    const second = player.skills.grant('battle_rush', 'test').skill;
    const now = 20_000;
    first.startCooldown(20, now);
    second.startCooldown(8, now);

    assert.deepEqual(player.skills.reduceCooldowns(10, now), { affected: 2, reducedSeconds: 18 });
    assert.equal(first.getRemainingCooldown(now), 10);
    assert.equal(second.getRemainingCooldown(now), 0);
});

test('직업 패시브는 유효한 직업에서만 적용되고 사용형 HUD에서 제외된다', () => {
    const player = new TestSkillPlayer();
    player.progress.setState(CareerProgressIds.MAIN, 'career:warrior');
    player.skills.grant('warrior_combat_instinct', 'test');

    player.skills.update(0.1);

    assert.ok(Math.abs(player.attribute.get(AttributeType.ATK) - 10.6) < 0.0001);
    assert.equal(player.attribute.get(AttributeType.DEF), 6);
    assert.equal(player.skills.getHudSnapshots().length, 0);

    player.progress.setState(CareerProgressIds.MAIN, '');
    player.skills.update(0.1);
    assert.equal(player.attribute.get(AttributeType.ATK), 10);
    assert.equal(player.attribute.get(AttributeType.DEF), 0);

    player.progress.setState(CareerProgressIds.MAIN, 'career:warrior');
    player.skills.update(0.1);
    assert.equal(player.skills.revoke('warrior_combat_instinct'), true);
    assert.equal(player.attribute.get(AttributeType.ATK), 10);
});

test('무기 반복 적중 통계는 숨겨진 숙련 패시브를 해금하고 장착 중에만 적용한다', () => {
    const player = new TestSkillPlayer();
    const target = new TestTarget();
    assert.equal(player.equipment.equip('mainHand', new Item('old_sword', 1, 50, null), player.attribute), true);

    const hit = player.attack(target, 'physical');
    assert.ok(hit && hit.finalDamage > 0);
    assert.equal(player.progress.getCounter('combat:weapon_hits/sword'), 1n);

    player.progress.setCounter('combat:weapon_hits/sword', 200);
    player.skills.update(0.5);
    assert.equal(player.skills.has('sword_mastery'), true);
    assert.ok(Math.abs(player.attribute.get(AttributeType.ATK) - 15.75) < 0.0001);
    assert.equal(player.skills.getHudSnapshots().some(skill => skill.id === 'sword_mastery'), false);

    assert.ok(player.equipment.unequip('mainHand', 0, player.attribute));
    player.skills.update(0.1);
    assert.equal(player.attribute.get(AttributeType.ATK), 10);
});

test('스탯 달성형 히든 패시브는 Progress 변경 없이도 자동 획득한다', () => {
    const player = new TestSkillPlayer();
    player.stat.set(StatType.STRENGTH, 100);
    player.stat.applyModifiers(player);

    player.skills.update(0.5);

    assert.equal(player.skills.has('titan_strength'), true);
    assert.ok(Math.abs(player.attribute.get(AttributeType.ATK) - 226.8) < 0.0001);
    assert.equal(player.attribute.get(AttributeType.ARMOR_PEN), 8);
    assert.equal(player.skills.getHudSnapshots().some(skill => skill.id === 'titan_strength'), false);
});

test('스킬 회수 API는 보유 목록에서 제거하고 저장 전 재지급도 허용한다', () => {
    const player = new TestSkillPlayer();
    player.skills.grant('power_strike', 'test');

    assert.equal(player.skills.revoke('power_strike'), true);
    assert.equal(player.skills.has('power_strike'), false);
    assert.equal(player.skills.revoke('power_strike'), false);
    assert.equal(player.skills.grant('power_strike', 'admin').acquired, true);
    assert.equal(player.skills.has('power_strike'), true);
});

test('스킬 레벨 설정 API는 보유 스킬만 정의 최대 레벨 안에서 변경한다', () => {
    const player = new TestSkillPlayer();
    player.skills.grant('power_strike', 'test');

    assert.equal(player.skills.setLevel('power_strike', 3), 3);
    assert.equal(player.skills.get('power_strike')?.level, 3);
    assert.equal(player.skills.setLevel('power_strike', 999), 5);
    assert.equal(player.skills.setLevel('unknown_skill', 2), null);
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

test('마력탄 스킬은 지팡이용 마력 구체와 분리된 전용 투사체를 발사한다', () => {
    const player = new TestSkillPlayer();
    const target = new TestTarget();
    player.progress.setState(CareerProgressIds.MAIN, 'career:mage');
    player.equipment.equip('mainHand', new Item('apprentice_staff', 1, null, null), player.attribute);
    player.currentTarget = target;
    player.skills.grant('magic_bolt', 'test');

    const outcome = player.skills.activateByInput('마력탄');
    const projectile = getActiveProjectiles().find(candidate => candidate.owner === player);

    assert.equal(outcome.activated, true);
    assert.equal(projectile?.name, '마력탄');
    if (projectile) removeProjectile(projectile);
});

test('마력 보호막 스킬은 방어 버프와 같은 시간의 마법 보호막을 부여한다', () => {
    const player = new TestSkillPlayer();
    player.progress.setState(CareerProgressIds.MAIN, 'career:mage');
    player.skills.grant('mana_barrier', 'test', 2);

    const outcome = player.skills.activateByInput('마력 보호막');
    const shield = player.getShield('skill:mana_barrier');

    assert.equal(outcome.activated, true);
    assert.equal(shield?.type, ShieldType.MAGIC);
    assert.equal(shield?.duration, 11);
    assert.ok((shield?.amount ?? 0) > 0);
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
