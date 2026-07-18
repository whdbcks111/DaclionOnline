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
import { cancelMiniGame, normalizeMiniGameInputs, startMiniGame } from '../modules/minigame.js';
import { sendBotMessageToUser, sendNotificationToUser } from '../modules/message.js';
import { chat } from '../utils/chatBuilder.js';

interface HazardBossPatternData {
    id: string;
    label: string;
    mode: HazardDodgeMode;
    difficulty: number;
    failureLifeRatio: number;
    activeCrystalDifficulty?: number;
}

function seed(): number {
    return Math.floor(Math.random() * 2_147_483_647);
}

function createHazardConfig(player: Player, data: HazardBossPatternData, difficulty: number): HazardDodgeConfig {
    const movementSpeed = Math.max(0.1, player.attribute.get(AttributeType.SPEED));
    return {
        seed: seed(),
        durationMs: 5_000,
        mode: data.mode,
        difficulty,
        playerLabel: player.name.slice(0, 1) || 'P',
        playerSpeed: Math.max(10, Math.min(48, movementSpeed * 18)),
        playerSize: 6,
        telegraphMs: Math.max(420, 1_030 - difficulty * 85),
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
                    const rawDamage = player.maxLife * data.failureLifeRatio;
                    const damage = player.damage(rawDamage, 'magic', {
                        type: 'attack',
                        causeEntity: monster,
                        fixedDamage: true,
                    });
                    sendNotificationToUser(player.userId, {
                        key: `boss-pattern-hit:${data.id}`,
                        message: `${data.label}에 피격되어 ${damage.lifeDamage.toFixed(1)} 피해를 입었습니다.`,
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
            .text('\n5초 동안 위험 구역을 피하세요!')
            .build());
        return {
            cancel: () => { cancelMiniGame(player.userId, `${monster.name}의 패턴이 중단되었습니다.`); },
        };
    });
}

registerHazardBossPattern({
    id: 'crystal:cave-in',
    label: '수정 낙석',
    mode: 'bombs',
    difficulty: 3,
    failureLifeRatio: 0.18,
});

registerHazardBossPattern({
    id: 'ironroot:resonance-storm',
    label: '지핵 공명 폭주',
    mode: 'mixed',
    difficulty: 4,
    activeCrystalDifficulty: 6,
    failureLifeRatio: 0.26,
});

registerHazardBossPattern({
    id: 'astral:crossfire',
    label: '성계 교차포화',
    mode: 'mixed',
    difficulty: 6,
    failureLifeRatio: 0.3,
});

const CRYSTAL_PROTECTION_SOURCE = 'boss:ironroot:resonance-crystals';

registerLocationPassive('ironroot_crystal_sanctum', location => {
    const protectedByCrystals = location.getActiveResourceCount('ironroot_resonance_crystal') > 0;
    for (const boss of location.getMonstersByDataId('ironroot_heartwarden')) {
        if (protectedByCrystals) boss.setDamageReceivedModifier(CRYSTAL_PROTECTION_SOURCE, 0.15);
        else boss.removeDamageReceivedModifier(CRYSTAL_PROTECTION_SOURCE);
    }
});

/** 테스트·운영 진단에서 수정 보호가 적용됐는지 같은 계산식으로 확인한다. */
export function getIronrootCrystalProtectionMultiplier(locationId = 'ironroot_crystal_sanctum'): number {
    return (getLocation(locationId)?.getActiveResourceCount('ironroot_resonance_crystal') ?? 0) > 0 ? 0.15 : 1;
}
