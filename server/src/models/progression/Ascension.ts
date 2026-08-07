import { defineProgress, PlayerProgress, ProgressType } from './Progress.js';

export const ASCENSION_RANK_COUNTER = 'ascension:rank';
export const ASCENSION_LEVEL = 1_000;
export const MORTAL_LEVEL_CAP = 1_500;
export const ASCENDED_EARLY_EXPERIENCE_MULTIPLIER = 10;
export const MORTAL_LATE_EXPERIENCE_MULTIPLIER = 0.2;
export const ASCENSION_BONUS_STAT_POINTS = 25;
export const ASCENSION_PASSIVE_SKILL_ID = 'transcendent_soul';
export const ASCENSION_ARTIFACT_ITEM_ID = 'transcendent_compass';

defineProgress({
    id: ASCENSION_RANK_COUNTER,
    type: ProgressType.COUNTER,
    label: '초월 단계',
    description: '기원종언의 잔재를 통해 삶의 성장을 영혼의 격으로 압축한 횟수입니다.',
    visible: true,
    format: value => `${value.toString()}회`,
    tags: ['ascension:rank'],
});

export function isAscended(progress: PlayerProgress): boolean {
    return progress.getCounter(ASCENSION_RANK_COUNTER) > 0n;
}

export function getAscensionExperienceMultiplier(progress: PlayerProgress, level: number): number {
    if (isAscended(progress)) {
        return level < ASCENSION_LEVEL ? ASCENDED_EARLY_EXPERIENCE_MULTIPLIER : 1;
    }
    return level >= ASCENSION_LEVEL ? MORTAL_LATE_EXPERIENCE_MULTIPLIER : 1;
}

export function getAscensionLevelCap(progress: PlayerProgress): number {
    return isAscended(progress) ? 10_000 : MORTAL_LEVEL_CAP;
}
