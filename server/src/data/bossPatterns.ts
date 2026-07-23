import {
    simulateHazardDodge,
    type HazardDodgeConfig,
    type HazardDodgeMode,
    type MiniGameResultRequest,
} from '../../../shared/minigames.js';
import { AttributeType } from '../models/Attribute.js';
import type Player from '../models/Player.js';
import { getLocation, registerLocationPassive } from '../models/Location.js';
import { registerMonsterChallengePattern } from '../models/Monster.js';
import { StatusEffectType } from '../models/StatusEffect.js';
import { cancelMiniGame, normalizeMiniGameInputs, startMiniGame } from '../modules/minigame.js';
import { sendBotMessageToUser, sendNotificationToUser } from '../modules/message.js';
import { chat } from '../utils/chatBuilder.js';

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

function validateHazard(config: HazardDodgeConfig, request: MiniGameResultRequest) {
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
                        player.applyStatusEffect(effectType, failureEffect.duration, failureEffect.level);
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

const CRYSTAL_PROTECTION_SOURCE = 'boss:ironroot:resonance-crystals';
const SILVERWEB_BROOD_PROTECTION_SOURCE = 'boss:silverweb:egg-clusters';
const SUN_MIRROR_PROTECTION_SOURCE = 'boss:glassdune:sun-mirrors';
const PARADOX_ANCHOR_PROTECTION_SOURCE = 'boss:paradox:causality-anchors';

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
