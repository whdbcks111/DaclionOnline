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
import { createSession, removeSession, setUserOffline, setUserOnline } from '../modules/login.js';
import { registerOnlinePlayer, unregisterOnlinePlayer } from '../modules/playerRegistry.js';
import '../data/progress.js';
import '../data/tagEffects.js';
import '../data/skills.js';
import '../data/items.js';
import '../data/jobs.js';
import '../data/projectiles.js';
import CareerProfile, { CareerProgressIds } from './Career.js';
import { ShieldType } from './Shield.js';
import Stat, { StatType } from './Stat.js';
import { partyManager } from '../modules/party.js';
import { StatusEffectType } from './StatusEffect.js';
import { ActionType } from './Action.js';
import type { ChatNode } from '../../../shared/types.js';

function getChatText(content: string | ChatNode[] | undefined): string {
    if (typeof content === 'string') return content;
    if (!content) return '';
    return content.map(node => {
        if (node.type === 'text') return node.text;
        if ('children' in node) return getChatText(node.children);
        return '';
    }).join('');
}

class TestSkillPlayer extends Entity {
    override readonly name = '스킬 시험 플레이어';
    readonly userId: number;
    readonly progress: PlayerProgress;
    readonly skills: SkillBook;
    readonly inventory: Inventory;
    readonly stat: Stat;
    readonly career: CareerProfile;

    constructor(userId = 9301) {
        super(1, 0, 'test', { maxLife: 100 }, Equipment.createEmpty());
        this.userId = userId;
        this.progress = PlayerProgress.createEmpty(userId);
        this.skills = SkillBook.createEmpty(userId);
        this.inventory = Inventory.createEmpty(userId, 100);
        this.stat = new Stat();
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
                    && content.some(node => node.type === 'text' && node.text.trim() === '강타!')));
        return super.damage(...args);
    }
}

class TestMonsterSkillOwner extends Entity {
    override readonly name = '보스 시험체';
    readonly skills: SkillBook;

    constructor(skillDataId = 'seismic_crush') {
        super(30, 0, 'test', {
            maxLife: 1000,
            magicForce: 100,
            speed: 1,
            attackSpeed: 0.2,
        }, Equipment.createEmpty());
        this.skills = SkillBook.createRuntime(this, [{ skillDataId, level: 3 }]);
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

test('각 1차 직업은 Lv.30부터 Lv.180까지 성장 기술을 단계별로 자동 획득한다', () => {
    for (const [jobId, expectedByLevel] of [
        ['career:warrior', [
            [30, ['fracture_slash']], [50, ['iron_tempest']], [75, ['frontline_cleave']],
            [100, ['ironblood_counter']], [140, ['giant_execution']], [180, ['war_god_descent']],
        ]],
        ['career:archer', [
            [30, ['piercing_arrow']], [50, ['arrow_storm']], [75, ['tracking_arrow']],
            [100, ['rupture_volley']], [140, ['meteor_arrow']], [180, ['skyfall_barrage']],
        ]],
        ['career:assassin', [
            [30, ['rupture_cut']], [50, ['shadow_dagger']], [75, ['venom_shadow']],
            [100, ['shadow_pursuit']], [140, ['heart_extraction']], [180, ['formless_chain']],
        ]],
        ['career:mage', [
            [30, ['mana_lance']], [50, ['flame_wave']], [75, ['mana_detonation']],
            [100, ['arcane_meteor']], [140, ['element_collapse']], [180, ['constellation_rupture']],
        ]],
        ['career:blacksmith', [
            [30, ['fault_finder']], [50, ['anvil_resonance', 'tempered_aegis']], [75, ['hotspot_strike']],
            [100, ['steel_pulse']], [140, ['masterwork_break']], [180, ['anvil_starfall']],
        ]],
    ] as const) {
        const player = new TestSkillPlayer();
        player.progress.setState(CareerProgressIds.MAIN, jobId);
        for (const [level, skillIds] of expectedByLevel) {
            player.level = level - 1;
            player.skills.update(0.5);
            assert.ok(skillIds.every(skillId => !player.skills.has(skillId)), `${jobId} Lv.${level - 1}`);
            player.level = level;
            player.skills.update(0.5);
            assert.ok(skillIds.every(skillId => player.skills.has(skillId)), `${jobId} Lv.${level}`);
        }
    }
});

test('마법사 속성 상위 주문은 처치 통계와 선행 스킬 숙련을 모두 만족해야 열린다', () => {
    const player = new TestSkillPlayer();
    player.progress.setState(CareerProgressIds.MAIN, 'career:mage');
    player.level = 180;
    const fireball = player.skills.grant('fireball', 'test', 2).skill;
    player.progress.increment('career:mage_fire_kills', 30);
    player.skills.update(0.5);
    assert.equal(player.skills.has('blazing_spear'), false);

    fireball.setLevel(3);
    player.skills.update(0.5);
    assert.equal(player.skills.has('blazing_spear'), true);

    player.progress.increment('career:mage_fire_kills', 70);
    player.skills.update(0.5);
    assert.equal(player.skills.has('phoenix_eruption'), false);
    player.skills.setLevel('blazing_spear', 3);
    player.skills.update(0.5);
    assert.equal(player.skills.has('phoenix_eruption'), true);

    player.progress.increment('career:mage_fire_kills', 100);
    player.skills.setLevel('phoenix_eruption', 4);
    player.skills.update(0.5);
    assert.equal(player.skills.has('inferno_meteor'), true);
});

test('성장 기술 정보는 내부 태그 대신 속성·계열·공유 쿨다운 표시명을 제공한다', () => {
    const player = new TestSkillPlayer();
    player.progress.setState(CareerProgressIds.MAIN, 'career:mage');
    const skill = player.skills.grant('flame_wave', 'test').skill;
    const tags = skill.getInformationTagsSnapshot();

    assert.deepEqual(tags.groups.map(value => value.label), ['마법', '화염 계열']);
    assert.deepEqual(tags.affinities.map(value => value.label), ['불']);
    assert.deepEqual(tags.sharedCooldowns.map(value => [value.label, value.seconds]), [
        ['마법', 0.5],
        ['화염 계열', 1],
    ]);
    assert.equal(JSON.stringify(tags).includes('skill:group'), false);
});

test('모든 엘리트 직업은 계승 패시브와 조합 전용 액티브를 정의한다', () => {
    const eliteIds = [
        'blade_ranger', 'shadow_blade', 'spellblade', 'siege_bow', 'night_hunter', 'elemental_marksman',
        'executioner', 'phantom_shooter', 'arcane_reaper', 'battle_magus', 'star_weaver', 'hexblade',
    ];
    const player = new TestSkillPlayer();
    for (const eliteId of eliteIds) {
        player.progress.setState(CareerProgressIds.ELITE, `career:${eliteId}`);
        const passive = player.skills.grant(`${eliteId}_mastery`, 'test').skill;
        const active = player.skills.grant(`${eliteId}_technique`, 'test').skill;
        assert.equal(passive.isPassive, true, eliteId);
        assert.equal(active.isPassive, false, eliteId);
        assert.equal(active.isVisibleTo(player), true, eliteId);
    }
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

test('공유 쿨다운은 보유 스킬의 표시 계열 태그에 최소 시간만 적용하고 개인 쿨다운은 줄이지 않는다', () => {
    const player = new TestSkillPlayer();
    const fireball = player.skills.grant('fireball', 'test').skill;
    const magicBolt = player.skills.grant('magic_bolt', 'test').skill;
    const runeforger = player.skills.grant('runeforger_technique', 'test').skill;
    const now = 30_000;
    fireball.startCooldown(7, now);

    assert.equal(player.skills.applySharedCooldowns(fireball, now), 2);
    assert.equal(fireball.getRemainingCooldown(now), 7);
    assert.equal(magicBolt.getRemainingCooldown(now), 0.5);
    assert.equal(runeforger.getRemainingCooldown(now), 1);

    const info = fireball.getInformationTagsSnapshot();
    assert.deepEqual(info.groups.map(tag => tag.label), ['마법', '화염 계열']);
    assert.deepEqual(info.affinities.map(tag => tag.label), ['불']);
    assert.deepEqual(info.sharedCooldowns.map(rule => [rule.label, rule.seconds]), [
        ['마법', 0.5],
        ['화염 계열', 1],
    ]);
});

test('직접 공격과 투사체 발사는 적중 여부를 기다리지 않고 기존 은신을 해제한다', () => {
    const stealth = StatusEffectType.fromKey('stealth');
    assert.ok(stealth);

    const meleePlayer = new TestSkillPlayer(9311);
    const meleeTarget = new TestTarget();
    meleePlayer.applyStatusEffect(stealth, 10, 1);
    assert.equal(meleePlayer.attack(meleeTarget)?.evaded, false);
    assert.equal(meleePlayer.hasStatusEffect(stealth), false);

    const caster = new TestSkillPlayer(9312);
    const rangedTarget = new TestTarget();
    caster.progress.setState(CareerProgressIds.MAIN, 'career:mage');
    caster.currentTarget = rangedTarget;
    caster.skills.grant('magic_bolt', 'test');
    caster.applyStatusEffect(stealth, 10, 1);
    assert.equal(caster.skills.activateByInput('마력탄').activated, true);
    assert.equal(caster.hasStatusEffect(stealth), false);
    const projectile = getActiveProjectiles().find(candidate => candidate.owner === caster);
    if (projectile) removeProjectile(projectile);
});

test('바람 회피는 Lv.1부터 7초 동안 확정 회피 상태를 유지한다', () => {
    const player = new TestSkillPlayer(9313);
    player.progress.setState(CareerProgressIds.MAIN, 'career:archer');
    player.skills.grant('wind_evasion', 'test');

    assert.equal(player.skills.activateByInput('바람 회피').activated, true);
    const effect = player.getStatusEffect('wind_evasion');
    assert.equal(effect?.duration, 7);
    assert.equal(effect?.maxDuration, 7);
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

test('활 숙련은 활 장착 중 공격력과 치명타 확률을 함께 높인다', () => {
    const player = new TestSkillPlayer();
    assert.equal(player.equipment.equip('mainHand', new Item('light_bow', 1, 80, null), player.attribute), true);
    const attackBefore = player.attribute.get(AttributeType.ATK);
    const critBefore = player.attribute.get(AttributeType.CRIT_RATE);

    player.progress.setCounter('combat:weapon_hits/bow', 200);
    player.skills.update(0.5);

    assert.equal(player.skills.has('bow_mastery'), true);
    assert.ok(Math.abs(player.attribute.get(AttributeType.ATK) - attackBefore * 1.04) < 0.0001);
    assert.ok(Math.abs(player.attribute.get(AttributeType.CRIT_RATE) - (critBefore + 0.03)) < 0.0001);
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
    assert.equal(player.equipment.equip('mainHand', new Item('old_sword', 1, 50, null), player.attribute), true);
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
        assert.equal(target.life, 100 - (player.attribute.get(AttributeType.ATK) * 1.15 * 1.5));
        assert.equal(player.attribute.get(AttributeType.ARMOR_PEN), 0);
        assert.equal(player.progress.getCounter('combat:critical_hits'), 1n);
        assert.equal(player.skills.get('power_strike')?.experience, 10);
        assert.ok(player.attackCooldown > 0);
    } finally {
        removeSession(sessionToken);
    }
});

test('강타는 활을 근접 무기처럼 사용해 투사체 공격을 우회할 수 없다', () => {
    const player = new TestSkillPlayer();
    player.currentTarget = new TestTarget();
    assert.equal(player.equipment.equip('mainHand', new Item('light_bow', 1, 80, null), player.attribute), true);
    player.skills.grant('power_strike', 'test');

    const outcome = player.skills.activateByInput('강타');

    assert.equal(outcome.activated, false);
    assert.match(outcome.reason ?? '', /검, 도끼, 단검 또는 곡괭이/);
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

test('성장 투사체는 표시·밸런스 callback과 같은 복합 피해량을 발사체에 고정한다', () => {
    const player = new TestSkillPlayer();
    const target = new TestTarget();
    player.progress.setState(CareerProgressIds.MAIN, 'career:mage');
    player.attribute.addModifier({ attribute: 'magicForce', op: 'add', value: 90, source: 'test:magic' });
    player.currentTarget = target;
    player.skills.grant('mana_detonation', 'test');

    assert.equal(player.skills.activateByInput('마력 폭쇄').activated, true);
    const projectile = getActiveProjectiles().find(candidate => candidate.owner === player);
    assert.ok(projectile);
    assert.equal(projectile.damageAmount, 210);
    removeProjectile(projectile);
});

test('대장장이 상위 공격은 실제 발동에서도 최대 생명력과 제련 정밀도 계수를 사용한다', () => {
    const player = new TestSkillPlayer();
    const target = new TestTarget();
    player.progress.setState(CareerProgressIds.MAIN, 'career:blacksmith');
    player.attribute.addModifier({
        attribute: AttributeType.FORGING_PRECISION.key,
        op: 'add',
        value: 1,
        source: 'test:precision',
    });
    player.currentTarget = target;
    player.skills.grant('hotspot_strike', 'test');

    assert.equal(player.skills.activateByInput('열점 타격').activated, true);
    // (공격력 10 × 270% + 최대 생명력 100 × 3% + 공격력 10 × 정밀도 1 × 50%) × 치명타 150%
    assert.equal(target.life, 47.5);
});

test('마법 투사체는 스킬 레벨과 마법력이 높을수록 더 빨리 도달한다', () => {
    const createProjectile = (level: number, magicForceBonus: number) => {
        const player = new TestSkillPlayer();
        const target = new TestTarget();
        player.progress.setState(CareerProgressIds.MAIN, 'career:mage');
        player.equipment.equip('mainHand', new Item('apprentice_staff', 1, null, null), player.attribute);
        player.attribute.addModifier({ attribute: 'magicForce', op: 'add', value: magicForceBonus, source: 'test:magic' });
        player.currentTarget = target;
        player.skills.grant('magic_bolt', 'test', level);
        assert.equal(player.skills.activateByInput('마력탄').activated, true);
        const projectile = getActiveProjectiles().find(candidate => candidate.owner === player);
        assert.ok(projectile);
        return projectile;
    };

    const novice = createProjectile(1, 0);
    const master = createProjectile(5, 300);
    assert.ok(master.remainingTravelTime < novice.remainingTravelTime);
    assert.ok(master.projectileAcceleration > novice.projectileAcceleration);
    removeProjectile(novice);
    removeProjectile(master);
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

test('솔로 버프 스킬은 시전 메시지와 효과 피드백을 모두 본인에게만 남긴다', () => {
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
        assert.deepEqual(
            Array.isArray(activationMessage?.content) ? activationMessage.content[0] : null,
            {
                type: 'image',
                src: '/icons/skill-headers/battle_rush.png',
                alt: '전투 질주 시전',
                maxHeight: 64,
                width: 256,
                height: 64,
            },
        );
        assert.equal(
            Array.isArray(activationMessage?.content) && activationMessage.content[1]?.type === 'text'
                ? activationMessage.content[1].text.trim()
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

test('파티원은 스킬 시전·효과 피드백과 공격 결과를 파티 피드로 받는다', () => {
    const player = new TestSkillPlayer(9391);
    const memberId = 9392;
    const member = {
        userId: memberId,
        name: '전투 관전자',
        level: 1,
        locationId: 'test',
        isDefeated: false,
        life: 100,
        maxLife: 100,
        mentality: 100,
        maxMentality: 100,
        maxExp: 100,
        gainExp: () => [],
    } as unknown as Player;
    player.progress.setState(CareerProgressIds.MAIN, 'career:warrior');
    player.skills.grant('battle_rush', 'test', 1);
    const playerToken = createSession({ id: player.userId, username: 'party_skill_source', nickname: player.name });
    const memberToken = createSession({ id: memberId, username: 'party_skill_member', nickname: member.name });
    setUserOnline(player.userId, 'party-skill-source');
    setUserOnline(memberId, 'party-skill-member');
    registerOnlinePlayer(player as unknown as Player);
    registerOnlinePlayer(member);

    try {
        assert.equal(partyManager.invite(player as unknown as Player, member).success, true);
        const accepted = partyManager.accept(member);
        assert.equal(accepted.success, true, accepted.reason);
        const before = getFilteredHistoryForUser(memberId, null).length;

        assert.equal(player.skills.activateByInput('전투 질주').activated, true);
        const skillMessages = getFilteredHistoryForUser(memberId, null).slice(before);
        assert.equal(skillMessages.length, 2);
        assert.ok(skillMessages.every(message => message.flags?.some(flag => flag.text === '파티')));

        const target = new TestTarget();
        const result = player.attack(target, 'physical', 10, {
            unavoidable: true,
            consumeMainHandDurability: false,
        });
        assert.ok(result);
        const attackMessage = getFilteredHistoryForUser(memberId, null).at(-1);
        assert.ok(attackMessage?.flags?.some(flag => flag.text === '파티'));
        const attackText = Array.isArray(attackMessage?.content)
            ? attackMessage.content.filter(node => node.type === 'text').map(node => node.text).join('')
            : attackMessage?.content ?? '';
        assert.match(attackText, /피해/);
    } finally {
        partyManager.leave(player as unknown as Player);
        unregisterOnlinePlayer(player.userId);
        unregisterOnlinePlayer(memberId);
        setUserOffline(player.userId, 'party-skill-source');
        setUserOffline(memberId, 'party-skill-member');
        removeSession(playerToken);
        removeSession(memberToken);
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

test('보스 스킬은 지속되는 예고와 기술명·효과 코멘트가 포함된 공격 기록을 남긴다', () => {
    const monster = new TestMonsterSkillOwner('bone_crown_decree');
    const target = new TestSkillPlayer(9411);
    const token = createSession({
        id: target.userId,
        username: 'boss_combat_record_target',
        nickname: target.name,
    });
    setUserOnline(target.userId, 'boss-combat-record-target');
    registerOnlinePlayer(target as unknown as Player);
    target.attribute.setBase(AttributeType.MAX_LIFE, 1_000);
    target.life = target.maxLife;
    target.disableAction(ActionType.EVASION, 'test:boss-combat-record');
    monster.currentTarget = target;

    try {
        const before = getFilteredHistoryForUser(target.userId, null).length;
        assert.equal(monster.skills.activateById('bone_crown_decree').activated, true);
        monster.skills.update(1.5);

        const messages = getFilteredHistoryForUser(target.userId, null).slice(before);
        const texts = messages.map(message => getChatText(message.content)).join('\n');
        assert.match(texts, /전투 예고/);
        assert.match(texts, /백골 왕명/);
        assert.match(texts, /왕관에 남은 명령/);
        assert.match(texts, /공포 Lv\.3/);
        assert.equal(target.hasStatusEffect('fear'), true);
        assert.equal(messages[0]?.private, undefined);
    } finally {
        unregisterOnlinePlayer(target.userId);
        setUserOffline(target.userId, 'boss-combat-record-target');
        removeSession(token);
    }
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
