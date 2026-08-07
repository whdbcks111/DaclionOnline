import type Player from '../../models/actors/Player.js';
import { GameEventIds, subscribeGameEvent, type GameEvent } from '../../models/core/GameEvent.js';
import { defineProgress, ProgressType } from '../../models/progression/Progress.js';
import { CodexCategory, createCodexEntryId, getCodexEntry } from '../../models/progression/Codex.js';
import { sendBotMessageToUser, sendNotificationToUser } from '../communication/message.js';

export const PASSIVE_TRAINING_FOCUS_PROGRESS_ID = 'skill:passive-training-focus';
export const PASSIVE_TRAINING_DAILY_PROGRESS_ID = 'skill:passive-training-daily';
export const PASSIVE_TRAINING_DAILY_CAP = 300;

defineProgress({
    id: PASSIVE_TRAINING_FOCUS_PROGRESS_ID,
    type: ProgressType.STATE,
    label: '패시브 수련 집중 대상',
    description: '생활 콘텐츠 성공 시 경험치를 받을 패시브 스킬 ID입니다. 비어 있으면 무작위로 선택합니다.',
    visible: false,
    tags: ['skill:passive-training'],
});

defineProgress({
    id: PASSIVE_TRAINING_DAILY_PROGRESS_ID,
    type: ProgressType.STATE,
    label: '패시브 수련 일일 획득량',
    description: 'KST 날짜와 그날 생활 콘텐츠로 획득한 패시브 스킬 경험치입니다.',
    visible: false,
    tags: ['skill:passive-training'],
});

export interface PassiveTrainingSnapshot {
    readonly focusSkillId?: string;
    readonly focusSkillName?: string;
    readonly automatic: boolean;
    readonly dayKey: string;
    readonly gainedToday: number;
    readonly dailyCap: number;
    readonly remainingToday: number;
    readonly candidates: ReturnType<Player['skills']['getTrainablePassiveSnapshots']>;
}

export type SetPassiveTrainingFocusResult =
    | { readonly changed: true; readonly snapshot: PassiveTrainingSnapshot }
    | { readonly changed: false; readonly reason: 'missing' | 'not-trainable'; readonly message: string };

export interface PassiveTrainingAwardResult {
    readonly awarded: boolean;
    readonly reason?: 'daily-cap' | 'no-candidates' | 'invalid-units';
    readonly skillId?: string;
    readonly skillName?: string;
    readonly gained: number;
    readonly levelsGained: number;
    readonly gainedToday: number;
    readonly remainingToday: number;
}

let eventUnsubscribers: Array<() => void> = [];

/** 한국 표준시 자정에 바뀌는 생활 수련 날짜 key. */
export function getPassiveTrainingDayKey(now = new Date()): string {
    return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function parseDailyState(value: string, now: Date): { dayKey: string; gained: number } {
    const dayKey = getPassiveTrainingDayKey(now);
    const [storedDay, storedAmount] = value.split(':');
    const parsed = Number.parseInt(storedAmount ?? '', 10);
    return storedDay === dayKey && Number.isSafeInteger(parsed) && parsed >= 0
        ? { dayKey, gained: Math.min(parsed, PASSIVE_TRAINING_DAILY_CAP) }
        : { dayKey, gained: 0 };
}

function writeDailyState(player: Player, dayKey: string, gained: number): void {
    player.progress.setState(
        PASSIVE_TRAINING_DAILY_PROGRESS_ID,
        `${dayKey}:${Math.max(0, Math.min(PASSIVE_TRAINING_DAILY_CAP, Math.floor(gained)))}`,
    );
}

export function getPassiveTrainingSnapshot(player: Player, now = new Date()): PassiveTrainingSnapshot {
    const candidates = player.skills.getTrainablePassiveSnapshots();
    const focusedId = player.progress.getState(PASSIVE_TRAINING_FOCUS_PROGRESS_ID);
    const focused = candidates.find(candidate => candidate.id === focusedId);
    const daily = parseDailyState(player.progress.getState(PASSIVE_TRAINING_DAILY_PROGRESS_ID), now);
    return Object.freeze({
        ...(focused ? { focusSkillId: focused.id, focusSkillName: focused.name } : {}),
        automatic: !focused,
        dayKey: daily.dayKey,
        gainedToday: daily.gained,
        dailyCap: PASSIVE_TRAINING_DAILY_CAP,
        remainingToday: PASSIVE_TRAINING_DAILY_CAP - daily.gained,
        candidates,
    });
}

export function setPassiveTrainingFocus(
    player: Player,
    input: string | null,
    now = new Date(),
): SetPassiveTrainingFocusResult {
    const normalized = input?.trim() ?? '';
    if (!normalized || ['자동', '무작위', 'random', 'auto'].includes(normalized.toLowerCase())) {
        player.progress.setState(PASSIVE_TRAINING_FOCUS_PROGRESS_ID, '');
        return { changed: true, snapshot: getPassiveTrainingSnapshot(player, now) };
    }
    const owned = player.skills.findOwnedByInput(normalized);
    if (!owned) {
        return { changed: false, reason: 'missing', message: '보유한 패시브 스킬을 찾을 수 없습니다.' };
    }
    const candidate = player.skills.getTrainablePassiveSnapshots()
        .find(skill => skill.id === owned.skillDataId);
    if (!candidate) {
        return {
            changed: false,
            reason: 'not-trainable',
            message: '현재 최대 레벨이 아니고 경험치 성장이 활성화된 패시브만 집중 수련할 수 있습니다.',
        };
    }
    player.progress.setState(PASSIVE_TRAINING_FOCUS_PROGRESS_ID, candidate.id);
    return { changed: true, snapshot: getPassiveTrainingSnapshot(player, now) };
}

export function awardPassiveTrainingExperience(
    player: Player,
    units = 1,
    random: () => number = Math.random,
    now = new Date(),
): PassiveTrainingAwardResult {
    const normalizedUnits = Math.floor(units);
    const snapshot = getPassiveTrainingSnapshot(player, now);
    if (!Number.isSafeInteger(normalizedUnits) || normalizedUnits <= 0) {
        return { awarded: false, reason: 'invalid-units', gained: 0, levelsGained: 0,
            gainedToday: snapshot.gainedToday, remainingToday: snapshot.remainingToday };
    }
    if (snapshot.remainingToday <= 0) {
        return { awarded: false, reason: 'daily-cap', gained: 0, levelsGained: 0,
            gainedToday: snapshot.gainedToday, remainingToday: 0 };
    }
    const candidates = snapshot.candidates;
    if (candidates.length === 0) {
        return { awarded: false, reason: 'no-candidates', gained: 0, levelsGained: 0,
            gainedToday: snapshot.gainedToday, remainingToday: snapshot.remainingToday };
    }
    const roll = random();
    const normalizedRoll = Number.isFinite(roll)
        ? Math.min(1 - Number.EPSILON, Math.max(0, roll))
        : 0;
    const selected = snapshot.focusSkillId
        ? candidates.find(candidate => candidate.id === snapshot.focusSkillId)!
        : candidates[Math.floor(normalizedRoll * candidates.length)]!;
    const requested = selected.experienceGain * normalizedUnits;
    const amount = Math.min(requested, snapshot.remainingToday);
    const result = player.skills.awardPassiveExperience(selected.id, amount);
    if (!result.awarded) {
        return { awarded: false, reason: 'no-candidates', gained: 0, levelsGained: 0,
            gainedToday: snapshot.gainedToday, remainingToday: snapshot.remainingToday };
    }
    const gainedToday = snapshot.gainedToday + result.gained;
    writeDailyState(player, snapshot.dayKey, gainedToday);
    return {
        awarded: true,
        skillId: selected.id,
        skillName: selected.name,
        gained: result.gained,
        levelsGained: result.levelsGained,
        gainedToday,
        remainingToday: PASSIVE_TRAINING_DAILY_CAP - gainedToday,
    };
}

function resolvePlayer(event: GameEvent): Player | undefined {
    const owner = event.actor?.attackOwner;
    return owner?.isPlayer && 'skills' in owner && 'progress' in owner ? owner as Player : undefined;
}

function awardFromEvent(event: GameEvent): void {
    const player = resolvePlayer(event);
    if (!player) return;
    let units = 1;
    if (event.id === GameEventIds.ITEM_CRAFTED) {
        const recipeId = event.data.recipeId;
        if (typeof recipeId !== 'string'
            || !getCodexEntry(createCodexEntryId(CodexCategory.COOKING, recipeId))) return;
        units = typeof event.data.quantity === 'number' ? event.data.quantity : 1;
    }
    const result = awardPassiveTrainingExperience(player, units);
    if (!result.awarded || !result.skillName) return;
    const levelText = result.levelsGained > 0 ? ` · Lv.${player.skills.get(result.skillId!)?.level} 달성` : '';
    const message = `${result.skillName} 패시브 경험치 +${result.gained}${levelText}`
        + ` (오늘 ${result.gainedToday}/${PASSIVE_TRAINING_DAILY_CAP})`;
    sendBotMessageToUser(player.userId, message);
    sendNotificationToUser(player.userId, {
        key: `passive-training:${result.skillId}`,
        message,
        length: 3_500,
    });
}

export function initPassiveTrainingEventTracking(): void {
    if (eventUnsubscribers.length > 0) return;
    eventUnsubscribers = [
        subscribeGameEvent(GameEventIds.FISH_CAUGHT, awardFromEvent),
        subscribeGameEvent(GameEventIds.ITEM_CRAFTED, awardFromEvent),
    ];
}

export function resetPassiveTrainingEventTracking(): void {
    for (const unsubscribe of eventUnsubscribers) unsubscribe();
    eventUnsubscribers = [];
}
