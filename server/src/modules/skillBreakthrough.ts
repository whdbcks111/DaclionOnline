import type Player from '../models/Player.js';
import { gameAction } from '../models/GameAction.js';
import type { SkillMaxLevelBreakthroughSnapshot } from '../models/Skill.js';
import logger from '../utils/logger.js';

export const MASTERY_ESSENCE_ITEM_DATA_ID = 'mastery_essence';
export const MASTERY_ESSENCE_BREAKTHROUGH_COST = 10;

export type SkillBreakthroughFailureCode = 'missing' | 'cap' | 'not-enough' | 'changed';

export type SkillBreakthroughResult =
    | {
        success: true;
        consumed: number;
        previousMaxLevel: number;
        snapshot: SkillMaxLevelBreakthroughSnapshot;
        saveDeferred: boolean;
    }
    | {
        success: false;
        code: SkillBreakthroughFailureCode;
        message: string;
        snapshot?: SkillMaxLevelBreakthroughSnapshot;
    };

/** 숙련의 정수 소비와 스킬 상한 변경을 같은 동기식 변경 경계로 묶은 뒤 즉시 저장한다. */
export async function performSkillBreakthrough(
    player: Player,
    skillInput: string,
): Promise<SkillBreakthroughResult> {
    const skill = player.skills.findOwnedByInput(skillInput);
    if (!skill) {
        return {
            success: false,
            code: 'missing',
            message: '보유한 스킬 중 해당 이름을 찾을 수 없습니다.',
        };
    }

    const initialSnapshot = player.skills.getMaxLevelBreakthroughSnapshots()
        .find(snapshot => snapshot.id === skill.skillDataId);
    if (!initialSnapshot) {
        return {
            success: false,
            code: 'missing',
            message: '보유한 스킬 정보를 확인할 수 없습니다.',
        };
    }
    if (initialSnapshot.remainingMaxLevelBonus <= 0) {
        return {
            success: false,
            code: 'cap',
            message: `[ ${initialSnapshot.name} ] 스킬은 최대 돌파 단계에 도달했습니다.`,
            snapshot: initialSnapshot,
        };
    }

    const selections = player.inventory.selectItems([{
        count: MASTERY_ESSENCE_BREAKTHROUGH_COST,
        matches: item => item.itemDataId === MASTERY_ESSENCE_ITEM_DATA_ID,
    }]);
    if (!selections) {
        const owned = player.inventory.countMatching(
            item => item.itemDataId === MASTERY_ESSENCE_ITEM_DATA_ID,
        );
        return {
            success: false,
            code: 'not-enough',
            message: `숙련의 정수가 ${MASTERY_ESSENCE_BREAKTHROUGH_COST}개 필요합니다. (보유 ${owned}개)`,
            snapshot: initialSnapshot,
        };
    }

    const rollbackSnapshots = selections.map(selection => selection.item.snapshot(selection.count));
    let breakthrough:
        | Extract<ReturnType<Player['skills']['increaseMaxLevel']>, { increased: true }>
        | undefined;
    const action = gameAction('스킬 최대 레벨 돌파')
        .require(
            () => player.skills.get(skill.skillDataId) === skill,
            '스킬 보유 상태가 변경되어 돌파를 취소했습니다.',
        )
        .require(
            () => player.inventory.canReplaceSelectedItems(selections, []),
            '숙련의 정수 보유 상태가 변경되어 돌파를 취소했습니다.',
        )
        .step(() => {
            if (!player.inventory.consumeSelectedItems(selections)) {
                throw new Error('숙련의 정수 보유 상태가 변경되어 돌파를 취소했습니다.');
            }
        }, () => {
            for (const snapshot of rollbackSnapshots) player.inventory.restoreItemSnapshot(snapshot);
        })
        .step(() => {
            const result = player.skills.increaseMaxLevel(skill.skillDataId);
            if (!result.increased) throw new Error(result.message);
            breakthrough = result;
        })
        .run();

    if (!action.ok || !breakthrough) {
        return {
            success: false,
            code: 'changed',
            message: action.error ?? '스킬 돌파 상태가 변경되어 돌파를 취소했습니다.',
            snapshot: initialSnapshot,
        };
    }

    let saveDeferred = false;
    try {
        await player.save();
    } catch (error) {
        // Inventory/SkillBook의 dirty 상태가 남아 다음 주기 저장에서 재시도된다.
        saveDeferred = true;
        logger.error(`스킬 돌파 즉시 저장 실패, dirty 저장 재시도 예정: ${player.userId}`, error);
    }
    return {
        success: true,
        consumed: MASTERY_ESSENCE_BREAKTHROUGH_COST,
        previousMaxLevel: breakthrough.previousMaxLevel,
        snapshot: breakthrough.snapshot,
        saveDeferred,
    };
}
