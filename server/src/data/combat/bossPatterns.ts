import {
    simulateHazardDodge,
    type HazardDodgeConfig,
    type HazardDodgeMode,
    type MiniGameValidationRequest,
} from '../../../../shared/minigames.js';
import type { ChatNode } from '../../../../shared/types.js';
import { AttributeType } from '../../models/core/Attribute.js';
import type Player from '../../models/actors/Player.js';
import { getLocation, registerLocationPassive } from '../../models/world/Location.js';
import { registerMonsterChallengePattern } from '../../models/actors/Monster.js';
import type Monster from '../../models/actors/Monster.js';
import { StatusEffectType } from '../../models/combat/StatusEffect.js';
import {
    GameEventIds,
    subscribeGameEvent,
    type GameEvent,
} from '../../models/core/GameEvent.js';
import { cancelMiniGame, normalizeMiniGameInputs, startMiniGame } from '../../modules/professions/minigame.js';
import {
    sendBotMessageToUser,
    sendBotMessageToUsers,
    sendNotificationToUser,
} from '../../modules/communication/message.js';
import {
    getOnlinePlayer,
    getOnlinePlayerUserIdsAtLocation,
} from '../../modules/player/playerRegistry.js';
import { chat } from '../../utils/chatBuilder.js';
import {
    BossRoleBreakRequirement,
    ROLE_BREAK_BOSS_PATTERNS,
    type BossRoleBreakPatternConfig,
} from './bossRoleBreakConfig.js';

export { ROLE_BREAK_BOSS_PATTERNS } from './bossRoleBreakConfig.js';

interface HazardBossPatternData {
    id: string;
    label: string;
    mode: HazardDodgeMode;
    theme: HazardDodgeConfig['theme'];
    difficulty: number;
    failureLifeRatio: number;
    activeCrystalDifficulty?: number;
    activeCrystalFailureLifeRatio?: number;
    durationMs?: number;
    playerSize?: number;
    failureEffect?: {
        statusEffectId: string;
        duration: number;
        level: number;
    };
}

function seed(): number {
    return Math.floor(Math.random() * 2_147_483_647);
}

function createHazardConfig(player: Player, data: HazardBossPatternData, difficulty: number): HazardDodgeConfig {
    const movementSpeed = Math.max(0.1, player.attribute.get(AttributeType.SPEED));
    return {
        seed: seed(),
        durationMs: data.durationMs ?? 5_000,
        label: data.label,
        mode: data.mode,
        theme: data.theme,
        difficulty,
        playerLabel: player.name.slice(0, 1) || 'P',
        playerSpeed: Math.max(10, Math.min(48, movementSpeed * 18)),
        playerSize: data.playerSize ?? 6,
        telegraphMs: Math.max(300, 1_030 - difficulty * 85),
    };
}

function validateHazard(config: HazardDodgeConfig, request: MiniGameValidationRequest) {
    const state = simulateHazardDodge(config, normalizeMiniGameInputs(request), request.elapsedMs);
    return state.finished && state.success
        ? { success: true, message: '위험 지대를 완전히 피했습니다.' }
        : { success: false, message: '보스 패턴에 피격되었습니다.' };
}

function registerHazardBossPattern(data: HazardBossPatternData): void {
    registerMonsterChallengePattern(data.id, ({ monster, target, complete }) => {
        if (!target.isPlayer || target.playerUserId === undefined) return false;
        const player = target as Player;
        const location = getLocation(monster.locationId);
        const activeCrystals = location?.getActiveResourceCount('ironroot_resonance_crystal') ?? 0;
        const difficulty = activeCrystals > 0 && data.activeCrystalDifficulty
            ? data.activeCrystalDifficulty
            : data.difficulty;
        const config = createHazardConfig(player, data, difficulty);
        const started = startMiniGame({
            userId: player.userId,
            type: 'hazard_dodge',
            config,
            expiresInMs: config.durationMs + 3_000,
            validate: request => validateHazard(config, request),
            onResolved: result => {
                try {
                    if (result.success || monster.isDefeated || player.isDefeated
                        || monster.locationId !== player.locationId) return;
                    const failureLifeRatio = activeCrystals > 0 && data.activeCrystalFailureLifeRatio
                        ? data.activeCrystalFailureLifeRatio
                        : data.failureLifeRatio;
                    const rawDamage = player.maxLife * failureLifeRatio;
                    const damage = player.damage(rawDamage, 'magic', {
                        type: 'attack',
                        causeEntity: monster,
                        fixedDamage: true,
                    });
                    const failureEffect = data.failureEffect;
                    const effectType = failureEffect
                        ? StatusEffectType.fromKey(failureEffect.statusEffectId)
                        : undefined;
                    if (failureEffect && effectType) {
                        player.applyStatusEffect(effectType, failureEffect.duration, failureEffect.level, monster);
                    }
                    sendNotificationToUser(player.userId, {
                        key: `boss-pattern-hit:${data.id}`,
                        message: `${data.label}에 피격되어 ${damage.lifeDamage.toFixed(1)} 피해를 입었습니다.`
                            + (effectType ? ` ${effectType.label} 상태가 적용됩니다.` : ''),
                    });
                } finally {
                    complete();
                }
            },
            onCancelled: complete,
        });
        if (!started) return false;

        sendBotMessageToUser(player.userId, chat()
            .color('red', builder => builder.weight('bold', nested => nested.text(`[ ${data.label} ]`)))
            .text(`\n${(config.durationMs / 1_000).toFixed(0)}초 동안 위험 구역을 피하세요!`)
            .build());
        return {
            cancel: () => { cancelMiniGame(player.userId, `${monster.name}의 패턴이 중단되었습니다.`); },
        };
    });
}

registerHazardBossPattern({
    id: 'crystal:cave-in',
    label: '수정 낙석',
    mode: 'chain_bombs',
    theme: 'crystal',
    difficulty: 3,
    failureLifeRatio: 0.18,
});

registerHazardBossPattern({
    id: 'ironroot:resonance-storm',
    label: '지핵 공명 폭주',
    mode: 'resonance',
    theme: 'ironroot',
    difficulty: 8,
    activeCrystalDifficulty: 10,
    failureLifeRatio: 0.45,
    activeCrystalFailureLifeRatio: 0.6,
    durationMs: 10_000,
    playerSize: 7,
    failureEffect: { statusEffectId: 'overmaster', duration: 4, level: 10 },
});

registerHazardBossPattern({
    id: 'astral:crossfire',
    label: '성계 교차포화',
    mode: 'crossfire',
    theme: 'astral',
    difficulty: 8,
    failureLifeRatio: 0.5,
    durationMs: 10_000,
    playerSize: 7,
    failureEffect: { statusEffectId: 'blindness', duration: 5, level: 10 },
});

registerMonsterChallengePattern('rift:twofold-resonance', ({ monster, complete }) => {
    const wardSource = 'boss:rift:twofold-resonance:ward';
    const vulnerabilitySource = 'boss:rift:twofold-resonance:vulnerability';
    const attackers = new Set<number>();
    let collecting = true;
    let remaining = 8;

    const cleanup = () => {
        monster.removeDamageReceivedModifier(wardSource);
        monster.removeDamageReceivedModifier(vulnerabilitySource);
        unsubscribe();
    };
    const unsubscribe = subscribeGameEvent(GameEventIds.ATTACK_HIT, event => {
        if (!collecting || event.subject !== monster) return;
        const userId = event.actor?.attackOwner.playerUserId;
        if (userId === undefined) return;
        attackers.add(userId);
        if (attackers.size < 2) return;
        collecting = false;
        remaining = 6;
        monster.removeDamageReceivedModifier(wardSource);
        monster.setDamageReceivedModifier(vulnerabilitySource, 1.3);
        sendRoleBreakMessage(monster, chat()
            .color('lime', builder => builder.weight('bold', nested => nested.text('[ 이중 공명 파훼 ]')))
            .text(`\n서로 다른 두 존재의 공격이 공명했습니다. 6초 동안 ${monster.name}이 받는 피해가 130%가 됩니다.`)
            .build());
    });

    monster.setDamageReceivedModifier(wardSource, 0.35);
    sendRoleBreakMessage(monster, chat()
        .color('red', builder => builder.weight('bold', nested => nested.text('[ 이중 공명 ]')))
        .text('\n8초 안에 서로 다른 두 플레이어가 보스를 공격해야 보호막이 무너집니다.')
        .build());
    return {
        update: dt => {
            remaining -= Math.max(0, dt);
            if (remaining > 0) return;
            if (collecting) {
                for (const player of getRoleBreakFailurePlayers(monster)) {
                    player.damage(player.maxLife * 0.3, 'absolute', {
                        type: 'attack', causeEntity: monster, fixedDamage: true,
                    });
                }
                sendRoleBreakMessage(monster, chat()
                    .color('red', builder => builder.weight('bold', nested => nested.text('[ 공명 실패 ]')))
                    .text('\n두 존재의 공명을 만들지 못해 참가자들이 최대 생명력의 30% 고정 피해를 받았습니다.')
                    .build());
            }
            cleanup();
            complete();
        },
        cancel: cleanup,
    };
});

type RoleBreakState = 'collecting' | 'exposed' | 'done';

function sendRoleBreakMessage(monster: Monster, content: ChatNode[]): void {
    const userIds = getOnlinePlayerUserIdsAtLocation(monster.locationId);
    if (userIds.length > 0) sendBotMessageToUsers(userIds, content);
}

function matchesRoleBreakRequirement(
    requirement: BossRoleBreakRequirement,
    event: GameEvent,
    monster: Monster,
): boolean {
    if (event.subject !== monster) return false;
    if (requirement === BossRoleBreakRequirement.TAUNT) {
        return event.id === GameEventIds.MONSTER_TAUNTED;
    }
    return (event.id === GameEventIds.STATUS_EFFECT_APPLIED
        || event.id === GameEventIds.STATUS_EFFECT_UPDATED)
        && event.data.effectId === requirement.statusEffectId;
}

function getRoleBreakFailurePlayers(monster: Monster): Player[] {
    const userIds = new Set(monster.getDefeatCreditUserIds());
    const currentTargetUserId = monster.getCurrentTarget()?.attackOwner.playerUserId;
    if (currentTargetUserId !== undefined) userIds.add(currentTargetUserId);
    return [...userIds].flatMap(userId => {
        const player = getOnlinePlayer(userId);
        return player && !player.isDefeated && player.locationId === monster.locationId ? [player] : [];
    });
}

/** 방어 약화·마법 약화·도발을 조합해 재사용하는 dt 기반 파티 역할 파훼 handler. */
function registerRoleBreakBossPattern(config: Readonly<BossRoleBreakPatternConfig>): void {
    registerMonsterChallengePattern(config.handlerId, ({ monster, complete }) => {
        if (monster.monsterDataId !== config.monsterDataId) return false;
        const wardSource = `boss:role-break:${config.monsterDataId}:ward`;
        const vulnerabilitySource = `boss:role-break:${config.monsterDataId}:vulnerability`;
        const completed = new Set<BossRoleBreakRequirement>();
        const unsubscribers: Array<() => void> = [];
        let state: RoleBreakState = 'collecting';
        let remaining = config.duration;

        const unsubscribeCollection = () => {
            for (const unsubscribe of unsubscribers.splice(0)) unsubscribe();
        };
        const cleanup = () => {
            unsubscribeCollection();
            monster.removeDamageReceivedModifier(wardSource);
            monster.removeDamageReceivedModifier(vulnerabilitySource);
        };
        const finish = () => {
            if (state === 'done') return;
            state = 'done';
            cleanup();
            complete();
        };
        const enterExposure = () => {
            if (state !== 'collecting') return;
            state = 'exposed';
            remaining = config.vulnerabilityDuration;
            unsubscribeCollection();
            monster.removeDamageReceivedModifier(wardSource);
            monster.setDamageReceivedModifier(vulnerabilitySource, config.vulnerabilityMultiplier);
            sendRoleBreakMessage(monster, chat()
                .color('lime', builder => builder.weight('bold', nested => nested.text(`[ 파훼 성공 ] ${config.label}`)))
                .text(`\n${config.vulnerabilityDuration}초 동안 ${monster.name}이(가) 받는 피해가 ${Math.round(config.vulnerabilityMultiplier * 100)}%가 됩니다.`)
                .build());
        };
        const recordRequirement = (event: GameEvent) => {
            if (state !== 'collecting') return;
            const requirement = config.requirements.find(value =>
                !completed.has(value) && matchesRoleBreakRequirement(value, event, monster));
            if (!requirement) return;
            completed.add(requirement);
            const remainingLabels = config.requirements.filter(value => !completed.has(value)).map(value => value.label);
            sendRoleBreakMessage(monster, chat()
                .color('gold', builder => builder.weight('bold', nested => nested.text(`[ 역할 달성 ] ${requirement.label}`)))
                .text(remainingLabels.length > 0 ? `\n남은 조건: ${remainingLabels.join(' · ')}` : '')
                .build());
            if (completed.size === config.requirements.length) enterExposure();
        };
        const fail = () => {
            if (state !== 'collecting') return;
            state = 'done';
            cleanup();
            try {
                const players = getRoleBreakFailurePlayers(monster);
                for (const player of players) {
                    const result = player.damage(player.maxLife * config.failureLifeRatio, 'absolute', {
                        type: 'attack',
                        causeEntity: monster,
                        fixedDamage: true,
                    });
                    sendNotificationToUser(player.userId, {
                        key: `boss-role-break-failed:${config.monsterDataId}`,
                        message: `${config.label} 파훼에 실패해 ${result.lifeDamage.toFixed(1)} 고정 피해를 입었습니다.`,
                    });
                }
                sendRoleBreakMessage(monster, chat()
                    .color('red', builder => builder.weight('bold', nested => nested.text(`[ 파훼 실패 ] ${config.label}`)))
                    .text(`\n참여자 ${players.length}명이 최대 생명력의 ${Math.round(config.failureLifeRatio * 100)}%에 해당하는 고정 피해를 받았습니다.`)
                    .build());
            } finally {
                complete();
            }
        };

        for (const eventId of [
            GameEventIds.MONSTER_TAUNTED,
            GameEventIds.STATUS_EFFECT_APPLIED,
            GameEventIds.STATUS_EFFECT_UPDATED,
        ]) {
            unsubscribers.push(subscribeGameEvent(eventId, recordRequirement));
        }
        monster.setDamageReceivedModifier(wardSource, config.wardMultiplier);
        sendRoleBreakMessage(monster, chat()
            .color('red', builder => builder.weight('bold', nested => nested.text(`[ 역할 파훼 ] ${config.label}`)))
            .text(`\n${config.duration}초 안에 ${config.requirements.map(value => value.label).join(' · ')}를 패턴 시작 후 적용하세요.`)
            .text(`\n진행 중 보스가 받는 피해 ${Math.round(config.wardMultiplier * 100)}% · 성공 시 ${config.vulnerabilityDuration}초간 ${Math.round(config.vulnerabilityMultiplier * 100)}% · 실패 시 참여자 최대 생명력 ${Math.round(config.failureLifeRatio * 100)}% 고정 피해`)
            .build());

        return {
            update: dt => {
                if (state === 'done') return;
                remaining -= Math.max(0, dt);
                if (remaining > 0) return;
                if (state === 'collecting') fail();
                else finish();
            },
            cancel: () => {
                if (state === 'done') return;
                state = 'done';
                cleanup();
            },
        };
    });
}

for (const config of ROLE_BREAK_BOSS_PATTERNS) registerRoleBreakBossPattern(config);

const CRYSTAL_PROTECTION_SOURCE = 'boss:ironroot:resonance-crystals';
const SILVERWEB_BROOD_PROTECTION_SOURCE = 'boss:silverweb:egg-clusters';
const SUN_MIRROR_PROTECTION_SOURCE = 'boss:glassdune:sun-mirrors';
const PARADOX_ANCHOR_PROTECTION_SOURCE = 'boss:paradox:causality-anchors';
const VOIDCROWN_PILLAR_PROTECTION_SOURCE = 'boss:voidcrown:crown-pillars';
const WHITE_NIGHT_MIRROR_PROTECTION_SOURCE = 'boss:eclipse:tide-mirrors';
const PRIMORDIAL_SEED_PROTECTION_SOURCE = 'boss:worldroot:heart-seeds';

registerLocationPassive('silverweb_queen_nest', location => {
    const protectedByBrood = location.getActiveResourceCount('silverweb_egg_cluster') > 0;
    for (const boss of location.getMonstersByDataId('silverweb_spider_queen')) {
        if (protectedByBrood) boss.setDamageReceivedModifier(SILVERWEB_BROOD_PROTECTION_SOURCE, 0.65);
        else boss.removeDamageReceivedModifier(SILVERWEB_BROOD_PROTECTION_SOURCE);
    }
});

registerLocationPassive('ironroot_crystal_sanctum', location => {
    const protectedByCrystals = location.getActiveResourceCount('ironroot_resonance_crystal') > 0;
    for (const boss of location.getMonstersByDataId('ironroot_heartwarden')) {
        if (protectedByCrystals) boss.setDamageReceivedModifier(CRYSTAL_PROTECTION_SOURCE, 0.15);
        else boss.removeDamageReceivedModifier(CRYSTAL_PROTECTION_SOURCE);
    }
});

registerLocationPassive('glassdune_sun_vault', location => {
    const protectedByMirrors = location.getActiveResourceCount('sun_mirror_pillar') > 0;
    for (const boss of location.getMonstersByDataId('sun_vault_colossus')) {
        if (protectedByMirrors) boss.setDamageReceivedModifier(SUN_MIRROR_PROTECTION_SOURCE, 0.3);
        else boss.removeDamageReceivedModifier(SUN_MIRROR_PROTECTION_SOURCE);
    }
});

registerLocationPassive('paradox_architect_core', location => {
    const protectedByAnchors = location.getActiveResourceCount('paradox_anchor') > 0;
    for (const boss of location.getMonstersByDataId('paradox_architect')) {
        if (protectedByAnchors) boss.setDamageReceivedModifier(PARADOX_ANCHOR_PROTECTION_SOURCE, 0.25);
        else boss.removeDamageReceivedModifier(PARADOX_ANCHOR_PROTECTION_SOURCE);
    }
});

registerLocationPassive('voidcrown_throne', location => {
    const protectedByPillars = location.getActiveResourceCount('voidcrown_pillar') > 0;
    for (const boss of location.getMonstersByDataId('voidcrown_regent')) {
        if (protectedByPillars) boss.setDamageReceivedModifier(VOIDCROWN_PILLAR_PROTECTION_SOURCE, 0.4);
        else boss.removeDamageReceivedModifier(VOIDCROWN_PILLAR_PROTECTION_SOURCE);
    }
});

registerLocationPassive('eclipse_white_night_altar', location => {
    const protectedByMirrors = location.getActiveResourceCount('white_night_tide_mirror') > 0;
    for (const boss of location.getMonstersByDataId('white_night_hierophant')) {
        if (protectedByMirrors) boss.setDamageReceivedModifier(WHITE_NIGHT_MIRROR_PROTECTION_SOURCE, 0.35);
        else boss.removeDamageReceivedModifier(WHITE_NIGHT_MIRROR_PROTECTION_SOURCE);
    }
});

registerLocationPassive('worldroot_primordial_heart', location => {
    const protectedBySeeds = location.getActiveResourceCount('primordial_heart_seed') > 0;
    for (const boss of location.getMonstersByDataId('primordial_heart_arbor')) {
        if (protectedBySeeds) boss.setDamageReceivedModifier(PRIMORDIAL_SEED_PROTECTION_SOURCE, 0.3);
        else boss.removeDamageReceivedModifier(PRIMORDIAL_SEED_PROTECTION_SOURCE);
    }
});

/** 테스트·운영 진단에서 수정 보호가 적용됐는지 같은 계산식으로 확인한다. */
export function getIronrootCrystalProtectionMultiplier(locationId = 'ironroot_crystal_sanctum'): number {
    return (getLocation(locationId)?.getActiveResourceCount('ironroot_resonance_crystal') ?? 0) > 0 ? 0.15 : 1;
}

/** 알주머니를 먼저 제거해야 여왕의 35% 피해 경감이 해제되는지 진단한다. */
export function getSilverwebBroodProtectionMultiplier(locationId = 'silverweb_queen_nest'): number {
    return (getLocation(locationId)?.getActiveResourceCount('silverweb_egg_cluster') ?? 0) > 0 ? 0.65 : 1;
}

/** 태양거울 기둥이 하나라도 남아 있을 때 거상의 70% 피해 감소가 유지되는지 확인한다. */
export function getGlassduneMirrorProtectionMultiplier(locationId = 'glassdune_sun_vault'): number {
    return (getLocation(locationId)?.getActiveResourceCount('sun_mirror_pillar') ?? 0) > 0 ? 0.3 : 1;
}

/** 역설 고정자가 하나라도 남아 있을 때 설계자의 75% 피해 감소가 유지되는지 확인한다. */
export function getParadoxAnchorProtectionMultiplier(locationId = 'paradox_architect_core'): number {
    return (getLocation(locationId)?.getActiveResourceCount('paradox_anchor') ?? 0) > 0 ? 0.25 : 1;
}

/** 벨카인 기둥이 남아 있을 때 섭정의 60% 피해 감소가 유지되는지 확인한다. */
export function getVoidcrownPillarProtectionMultiplier(locationId = 'voidcrown_throne'): number {
    return (getLocation(locationId)?.getActiveResourceCount('voidcrown_pillar') ?? 0) > 0 ? 0.4 : 1;
}

/** 조류거울이 남아 있을 때 백야대사제의 65% 피해 감소가 유지되는지 확인한다. */
export function getWhiteNightMirrorProtectionMultiplier(locationId = 'eclipse_white_night_altar'): number {
    return (getLocation(locationId)?.getActiveResourceCount('white_night_tide_mirror') ?? 0) > 0 ? 0.35 : 1;
}

/** 심장씨앗이 남아 있을 때 에오나의 심장의 70% 피해 감소가 유지되는지 확인한다. */
export function getPrimordialSeedProtectionMultiplier(locationId = 'worldroot_primordial_heart'): number {
    return (getLocation(locationId)?.getActiveResourceCount('primordial_heart_seed') ?? 0) > 0 ? 0.3 : 1;
}
