import {
    simulateFishingCapture,
    simulateForgeRhythm,
    simulateHazardDodge,
    type FishingCaptureConfig,
    type ForgeRhythmConfig,
    type HazardDodgeConfig,
    type MiniGameResultRequest,
    type MiniGameType,
} from '../../../shared/minigames.js';
import { AttributeType } from '../models/Attribute.js';
import type Player from '../models/Player.js';
import { normalizeMiniGameActions, normalizeMiniGameInputs, startMiniGame } from './minigame.js';

export interface MiniGamePresetSummary {
    id: string
    label: string
    description: string
    type: MiniGameType
}

interface MiniGamePreset extends MiniGamePresetSummary {
    start: (player: Player) => boolean
}

function seed(): number {
    return Math.floor(Math.random() * 2_147_483_647);
}

function fishingPreset(
    id: string,
    label: string,
    description: string,
    difficulty: number,
): MiniGamePreset {
    return {
        id,
        label,
        description,
        type: 'fishing_capture',
        start: player => {
            const config: FishingCaptureConfig = {
                seed: seed(),
                durationMs: 12_000,
                rarityLabel: label,
                rarityColor: difficulty >= 5 ? '#a86bd5' : difficulty >= 3 ? '#478bd1' : '#4f9f69',
                fishIcon: difficulty >= 5 ? 'items/storm_manta' : 'items/silver_minnow',
                difficulty,
                netShape: difficulty >= 5 ? 'circle' : 'square',
                netWidth: Math.max(12, 24 - difficulty * 1.5),
                netHeight: Math.max(12, 24 - difficulty * 1.5),
                netSpeed: 34,
                initialGauge: 0.5,
                fillPerSecond: 0.16,
                drainPerSecond: 0.08 + difficulty * 0.008,
            };
            return startMiniGame({
                userId: player.userId,
                type: 'fishing_capture',
                config,
                expiresInMs: config.durationMs + 3_000,
                validate: request => validateFishing(config, request),
                onResolved: () => undefined,
            }) !== null;
        },
    };
}

function validateFishing(config: FishingCaptureConfig, request: MiniGameResultRequest) {
    const state = simulateFishingCapture(config, normalizeMiniGameInputs(request), request.elapsedMs);
    return state.finished && state.success
        ? { success: true, message: '관리자 낚시 테스트에 성공했습니다.' }
        : { success: false, message: '관리자 낚시 테스트에 실패했습니다.' };
}

function dodgePreset(
    id: string,
    label: string,
    description: string,
    mode: HazardDodgeConfig['mode'],
    difficulty: number,
): MiniGamePreset {
    const endgame = difficulty > 6;
    return {
        id,
        label,
        description,
        type: 'hazard_dodge',
        start: player => {
            const movementSpeed = Math.max(0.1, player.attribute.get(AttributeType.SPEED));
            const config: HazardDodgeConfig = {
                seed: seed(),
                durationMs: endgame ? 10_000 : 5_000,
                label,
                mode,
                theme: mode === 'chain_bombs' || mode === 'bombs' ? 'crystal'
                    : mode === 'resonance' ? 'ironroot'
                        : mode === 'crossfire' ? 'astral' : 'neutral',
                difficulty,
                playerLabel: player.name.slice(0, 1) || 'P',
                playerSpeed: Math.max(10, Math.min(48, movementSpeed * 18)),
                playerSize: endgame ? 7 : 6,
                telegraphMs: Math.max(endgame ? 300 : 480, 1_050 - difficulty * 85),
            };
            return startMiniGame({
                userId: player.userId,
                type: 'hazard_dodge',
                config,
                expiresInMs: config.durationMs + 3_000,
                validate: request => {
                    const state = simulateHazardDodge(config, normalizeMiniGameInputs(request), request.elapsedMs);
                    return state.finished && state.success
                        ? { success: true, message: '위험 회피 테스트에 성공했습니다.' }
                        : { success: false, message: '위험 구역에 피격되었습니다.' };
                },
                onResolved: () => undefined,
            }) !== null;
        },
    };
}

function forgePreset(
    id: string,
    label: string,
    description: string,
    intervalMs: number,
    requiredAccuracy: number,
): MiniGamePreset {
    return {
        id,
        label,
        description,
        type: 'forge_rhythm',
        start: player => {
            const beatTimesMs = Array.from({ length: 12 }, (_, index) => 1_200 + index * intervalMs);
            const config: ForgeRhythmConfig = {
                durationMs: beatTimesMs.at(-1)! + 900,
                label,
                beatTimesMs,
                hitWindowMs: 240,
                perfectWindowMs: 85,
                requiredAccuracy,
            };
            return startMiniGame({
                userId: player.userId,
                type: 'forge_rhythm',
                config,
                expiresInMs: config.durationMs + 3_000,
                validate: request => {
                    const state = simulateForgeRhythm(config, normalizeMiniGameActions(request), request.elapsedMs);
                    return state.finished && state.success
                        ? { success: true, message: `단조 테스트 성공 · 정확도 ${Math.round(state.accuracy * 100)}%` }
                        : { success: false, message: `단조 테스트 실패 · 정확도 ${Math.round(state.accuracy * 100)}%` };
                },
                onResolved: () => undefined,
            }) !== null;
        },
    };
}

const PRESETS: readonly MiniGamePreset[] = Object.freeze([
    fishingPreset('fishing:normal', '낚시 일반', '일반 난이도의 12초 포획 테스트', 2),
    fishingPreset('fishing:legendary', '낚시 전설', '빠르게 움직이는 전설 난이도 포획 테스트', 6),
    dodgePreset('dodge:bombs:easy', '폭탄 회피 쉬움', '이동속도 동기화 · 폭발 범위만 회피', 'bombs', 2),
    dodgePreset('dodge:lasers:normal', '레이저 회피 보통', '이동속도 동기화 · 가로/세로 레이저 회피', 'lasers', 4),
    dodgePreset('dodge:mixed:boss', '복합 보스 패턴', '이동속도 동기화 · 폭탄과 레이저 복합 패턴', 'mixed', 6),
    dodgePreset('dodge:resonance:endgame', '후반 공명 폭주', '10초 · 레이저 연사 · 심장수호자 수정 생존 기준 난이도 10', 'resonance', 10),
    dodgePreset('dodge:crossfire:astral', '성계 교차포화', '10초 · 가로/세로 시간차 교차 레이저 · 난이도 8', 'crossfire', 8),
    dodgePreset('dodge:chain-bombs:crystal', '수정 연쇄 낙석', '중앙에서 커진 뒤 상하좌우로 이어지는 연쇄 폭발', 'chain_bombs', 4),
    forgePreset('forge:steady', '기초 단조', '일정한 박자에 맞춰 망치를 내리치는 단조 테스트', 620, 0.65),
    forgePreset('forge:rapid', '고속 단조', '빠른 박자와 좁은 판정의 상급 단조 테스트', 420, 0.78),
]);

export function getMiniGamePresetSummaries(): MiniGamePresetSummary[] {
    return PRESETS.map(({ id, label, description, type }) => ({ id, label, description, type }));
}

export function startMiniGamePreset(player: Player, presetId: string): boolean {
    return PRESETS.find(preset => preset.id === presetId)?.start(player) ?? false;
}
