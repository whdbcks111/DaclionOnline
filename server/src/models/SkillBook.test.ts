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
import { getChannelHistory } from '../modules/channel.js';
import { createSession, removeSession } from '../modules/login.js';
import { registerOnlinePlayer, unregisterOnlinePlayer } from '../modules/playerRegistry.js';
import '../data/progress.js';
import '../data/skills.js';
import '../data/items.js';

class TestSkillPlayer extends Entity {
    override readonly name = '스킬 시험 플레이어';
    readonly userId = 9301;
    readonly progress = PlayerProgress.createEmpty(this.userId);
    readonly skills = SkillBook.createEmpty(this.userId);
    readonly inventory = Inventory.createEmpty(this.userId, 100);

    constructor() {
        super(1, 0, 'test', { maxLife: 100 }, Equipment.createEmpty());
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
        const lastMessage = getChannelHistory(null).at(-1);
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
        assert.ok(player.attackCooldown > 0);
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
