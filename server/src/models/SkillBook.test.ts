import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import type Player from './Player.js';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
import { AttributeType } from './Attribute.js';
import { PlayerProgress } from './Progress.js';
import SkillBook from './SkillBook.js';
import { getIO, initSocket } from '../modules/socket.js';
import { getChannelHistory } from '../modules/channel.js';
import { createSession, removeSession } from '../modules/login.js';
import '../data/progress.js';
import '../data/skills.js';

class TestSkillPlayer extends Entity {
    override readonly name = '스킬 시험 플레이어';
    readonly userId = 9301;
    readonly progress = PlayerProgress.createEmpty(this.userId);
    readonly skills = SkillBook.createEmpty(this.userId);

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
