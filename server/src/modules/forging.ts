import {
    calculateForgeQualityScore,
    createForgeBeatTimesMs,
    simulateForgeRhythm,
    type ForgeRhythmConfig,
} from '../../../shared/minigames.js';
import { emitGameEvent, GameEventIds } from '../models/GameEvent.js';
import { createForgedItemSnapshot, ForgeForm, ForgeMaterial } from '../models/Forging.js';
import type Player from '../models/Player.js';
import { chat } from '../utils/chatBuilder.js';
import { sendBotMessageToUser, sendNotificationToUser } from './message.js';
import { normalizeMiniGameActions, startMiniGame } from './minigame.js';
import { AttributeType } from '../models/Attribute.js';
import { StatType } from '../models/Stat.js';

export const BLACKSMITH_JOB_ID = 'career:blacksmith';
export const BLACKSMITH_PROFESSION_FLAG = 'profession:blacksmith';

interface BlacksmithExperienceOwner { readonly maxExp: number }

/** 제련은 처리한 원광 수에 비례해 다음 레벨 요구 경험치의 최대 4%를 지급한다. */
export function calculateSmeltingExperience(player: BlacksmithExperienceOwner, processedCount: number): number {
    const count = Math.max(0, Math.floor(processedCount));
    const rate = Math.min(0.04, count * 0.0025);
    return Math.max(0, Math.round(Math.max(0, player.maxExp) * rate));
}

/** 단조 성공은 정확도와 재료 난도를 반영해 다음 레벨 요구 경험치의 약 2.8~4%를 지급한다. */
export function calculateForgingExperience(
    player: BlacksmithExperienceOwner,
    material: ForgeMaterial,
    accuracy: number,
): number {
    const normalizedAccuracy = Math.max(0, Math.min(1, accuracy));
    const rate = Math.min(0.04, 0.02 + normalizedAccuracy * 0.015 + Math.max(0, material.power - 0.9) * 0.01);
    return Math.max(1, Math.round(Math.max(0, player.maxExp) * rate));
}

export function hasBlacksmithProfession(player: Player): boolean {
    return player.career.hasJob(BLACKSMITH_JOB_ID)
        || player.progress.getFlag(BLACKSMITH_PROFESSION_FLAG);
}

export function canAcquireBlacksmithProfession(player: Player): boolean {
    return !hasBlacksmithProfession(player) && Boolean(player.career.getAssignableSlot(BLACKSMITH_JOB_ID));
}

/** 정식 대장장이 계보 또는 별도 기능 해금 스킬로 금속 단조 사용 권한을 판정한다. */
export function canUseMetalForging(player: Player): boolean {
    return hasBlacksmithProfession(player) || player.skills.has('metal_forging');
}

export function grantBlacksmithProfession(player: Player): boolean {
    if (hasBlacksmithProfession(player)) return false;
    return player.career.assignAvailable(BLACKSMITH_JOB_ID).success;
}

/** 재료 난도와 장비 크기로 엇박·연속박자와 성공 품질 보정을 함께 확정한다. */
export function createForgingRhythmConfig(
    form: ForgeForm,
    material: ForgeMaterial,
    forgingPrecision: number,
): ForgeRhythmConfig {
    const precision = Math.max(0, Math.min(0.45, forgingPrecision));
    const difficulty = Math.max(1, Math.min(10, Math.round(1 + material.power * 2 + form.materialCount * 0.3)));
    const interval = Math.max(390, 680 - material.power * 115);
    const beatTimesMs = createForgeBeatTimesMs(interval, difficulty, 12 + difficulty);
    return {
        durationMs: beatTimesMs.at(-1)! + 900,
        label: `${material.label} ${form.label} 단조`,
        difficulty,
        qualityBonus: Math.max(0, (difficulty - 3) * 0.025),
        beatTimesMs,
        hitWindowMs: Math.round(230 * (1 + precision)),
        perfectWindowMs: Math.round(82 * (1 + precision * 0.6)),
        requiredAccuracy: Math.min(0.7, 0.52 + difficulty * 0.015),
    };
}

/** 구형 독립 플래그를 빈 메인/서브 슬롯으로 이전한다. 두 슬롯이 차 있으면 덮어쓰지 않는다. */
export function migrateLegacyBlacksmithProfession(player: Player): boolean {
    if (!player.progress.getFlag(BLACKSMITH_PROFESSION_FLAG)) return false;
    const migrated = player.career.migrateLegacyFirstJob(BLACKSMITH_JOB_ID);
    if (!migrated.success) return false;
    player.progress.setFlag(BLACKSMITH_PROFESSION_FLAG, false);
    return true;
}

export function startForging(player: Player, form: ForgeForm, material: ForgeMaterial): { success: boolean; reason?: string } {
    if (!canUseMetalForging(player)) {
        return { success: false, reason: '대장장이 전문 직업 또는 금속 단조 스킬이 필요합니다.' };
    }
    if (player.isDefeated) return { success: false, reason: '사망 상태에서는 단조할 수 없습니다.' };
    const requirement = [{ count: form.materialCount, matches: (item: { itemDataId: string }) => item.itemDataId === material.itemDataId }];
    if (!player.inventory.selectItems(requirement)) {
        return { success: false, reason: `${material.label} 제련 소재가 ${form.materialCount}개 필요합니다.` };
    }

    const precision = Math.max(0, Math.min(0.45, player.attribute.get(AttributeType.FORGING_PRECISION)));
    const config = createForgingRhythmConfig(form, material, precision);
    const started = startMiniGame({
        userId: player.userId,
        type: 'forge_rhythm',
        config,
        expiresInMs: config.durationMs + 3_000,
        validate: request => {
            const state = simulateForgeRhythm(config, normalizeMiniGameActions(request), request.elapsedMs);
            const quality = calculateForgeQualityScore(config, state.accuracy);
            return state.finished && state.success
                ? { success: true, score: quality, message: `단조 성공 · 정확도 ${Math.round(state.accuracy * 100)}% · 난도 보정 품질 ${Math.round(quality * 100)}%` }
                : { success: false, score: quality, message: `단조 실패 · 정확도 ${Math.round(state.accuracy * 100)}%` };
        },
        onResolved: result => {
            const selections = player.inventory.selectItems(requirement);
            if (!selections) {
                sendNotificationToUser(player.userId, { key: 'forging:material-changed', message: '단조 소재가 변경되어 결과를 처리하지 못했습니다.' });
                return;
            }
            if (!result.success) {
                player.inventory.replaceSelectedItems(selections, []);
                sendNotificationToUser(player.userId, { key: 'forging:failed', message: '단조에 실패해 사용한 제련 소재가 부서졌습니다.' });
                return;
            }
            const accuracy = Math.max(0, Math.min(1, result.score ?? 0));
            const output = createForgedItemSnapshot(form, material, {
                accuracy,
                creatorUserId: player.userId,
                creatorLevel: player.level,
                sensibility: player.stat.get(StatType.SENSIBILITY),
                forgingPrecision: player.attribute.get(AttributeType.FORGING_PRECISION),
            });
            if (!player.inventory.replaceSelectedItems(selections, [output])) {
                sendNotificationToUser(player.userId, { key: 'forging:no-space', message: '완성품을 보관할 중량 공간이 부족해 단조가 취소되었습니다.' });
                return;
            }
            const name = output.metadataDelta?.customName;
            const itemName = typeof name === 'string' ? name : `${material.label} ${form.label}`;
            const experience = calculateForgingExperience(player, material, accuracy);
            const levelsGained = player.gainExp(experience);
            emitGameEvent(GameEventIds.ITEM_FORGED, {
                actor: player,
                data: { form: form.key, material: material.key, accuracy, itemName },
            });
            const levelText = levelsGained.length ? ` · Lv.${levelsGained.at(-1)} 달성` : '';
            sendBotMessageToUser(player.userId, chat().color('gold', b => b.text('[ 단조 완료 ] ')).text(`${itemName} · 정확도 ${Math.round(accuracy * 100)}% · 제련 정밀도 ${Math.round(precision * 100)}% · +${experience} EXP${levelText}`).build());
            sendNotificationToUser(player.userId, { key: 'forging:complete', message: `${itemName} 단조를 완료했습니다!` });
        },
    });
    return started ? { success: true } : { success: false, reason: '이미 다른 미니게임을 진행 중입니다.' };
}
