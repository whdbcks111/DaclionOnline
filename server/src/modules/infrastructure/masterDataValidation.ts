import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LocationData } from '../../../../shared/types.js';
import { CHAT_EMOTES } from '../../../../shared/cosmetics.js';
import { GameTags } from '../../../../shared/tags.js';
import {
    ALCHEMY_WATER_BOTTLE_ITEM_ID,
    AlchemyEffectType,
    FAILED_ALCHEMY_POTION_ITEM_ID,
    getAllAlchemyFormulas,
    getAllAlchemyReagents,
    type AlchemyFormulaData,
    type AlchemyReagentData,
} from '../../models/professions/Alchemy.js';
import { getAllCraftingRecipes } from '../../models/professions/Crafting.js';
import { getAllItemData, getItemData } from '../../models/economy/Item.js';
import { getAllJobs, getJob, JobTier, resolveThirdJob } from '../../models/progression/Job.js';
import { getAllMonsterData, getMonsterData, hasMonsterChallengePattern } from '../../models/actors/Monster.js';
import NPC from '../../models/actors/NPC.js';
import { getAllQuestData, getQuestData } from '../../models/progression/Quest.js';
import { getAllResourceData, getResourceData } from '../../models/actors/Resource.js';
import { getAllSkillData, getSkillData } from '../../models/progression/Skill.js';
import { StatusEffectType } from '../../models/combat/StatusEffect.js';

export interface MasterDataIssue {
    scope: string
    id: string
    message: string
}

export interface MasterDataValidationOptions {
    locations?: readonly LocationData[]
    iconRoot?: string
}

/** 연금술 registry가 참조하는 아이템·상태효과와 실행 handler를 독립적으로 검증한다. */
export function validateAlchemyMasterData(
    reagents: readonly Readonly<AlchemyReagentData>[] = getAllAlchemyReagents(),
    formulas: readonly Readonly<AlchemyFormulaData>[] = getAllAlchemyFormulas(),
): MasterDataIssue[] {
    const issues: MasterDataIssue[] = [];
    const issue = (id: string, message: string) => issues.push({ scope: 'alchemy', id, message });
    const reagentIds = new Set(reagents.map(reagent => reagent.itemDataId));

    for (const reagent of reagents) {
        if (!getItemData(reagent.itemDataId)) {
            issue(reagent.itemDataId, `재료 아이템이 없습니다: ${reagent.itemDataId}`);
        }
        if (reagent.traits.length === 0) issue(reagent.itemDataId, '재료 성질이 비어 있습니다.');
    }

    for (const formula of formulas) {
        const result = getItemData(formula.resultItemDataId);
        if (!result) issue(formula.id, `결과 아이템이 없습니다: ${formula.resultItemDataId}`);
        else if (result.onUse !== 'alchemy_potion') {
            issue(formula.id, `결과 아이템의 사용 handler가 조제약이 아닙니다: ${formula.resultItemDataId}`);
        }
        if (formula.ingredients.length < 2) issue(formula.id, '조합식은 서로 다른 재료가 2종 이상이어야 합니다.');
        for (const ingredient of formula.ingredients) {
            if (!Number.isSafeInteger(ingredient.count) || ingredient.count <= 0) {
                issue(formula.id, `재료 수량은 양의 정수여야 합니다: ${ingredient.itemDataId}`);
            }
            if (!getItemData(ingredient.itemDataId)) {
                issue(formula.id, `재료 아이템이 없습니다: ${ingredient.itemDataId}`);
            }
            if (!reagentIds.has(ingredient.itemDataId)) {
                issue(formula.id, `등록된 연금술 재료가 아닙니다: ${ingredient.itemDataId}`);
            }
        }
        if (!Number.isFinite(formula.effect.basePower) || (formula.effect.basePower ?? 0) <= 0) {
            issue(formula.id, '효과 기본 위력은 양수여야 합니다.');
        }
        if (formula.effect.type === AlchemyEffectType.BENEFICIAL_STATUS
            || formula.effect.type === AlchemyEffectType.HARMFUL_STATUS) {
            if (!Number.isFinite(formula.effect.baseDuration) || (formula.effect.baseDuration ?? 0) <= 0) {
                issue(formula.id, '상태효과 지속시간은 양수여야 합니다.');
            }
            if (!formula.effect.statusEffectId || !StatusEffectType.fromKey(formula.effect.statusEffectId)) {
                issue(formula.id, `상태이상이 없습니다: ${formula.effect.statusEffectId ?? '(비어 있음)'}`);
            }
        } else if (formula.effect.statusEffectId && !StatusEffectType.fromKey(formula.effect.statusEffectId)) {
            issue(formula.id, `상태이상이 없습니다: ${formula.effect.statusEffectId}`);
        }
    }

    const water = getItemData(ALCHEMY_WATER_BOTTLE_ITEM_ID);
    if (!water) issue(ALCHEMY_WATER_BOTTLE_ITEM_ID, '정제수 물병 아이템이 없습니다.');
    const failedPotion = getItemData(FAILED_ALCHEMY_POTION_ITEM_ID);
    if (!failedPotion) issue(FAILED_ALCHEMY_POTION_ITEM_ID, '실패 조제약 아이템이 없습니다.');
    else if (failedPotion.onUse !== 'alchemy_potion') {
        issue(FAILED_ALCHEMY_POTION_ITEM_ID, '실패 조제약의 사용 handler가 올바르지 않습니다.');
    }
    return issues;
}

export function validateMasterData(options: MasterDataValidationOptions = {}): MasterDataIssue[] {
    const issues: MasterDataIssue[] = [];
    const iconRoot = options.iconRoot ?? resolve(process.cwd(), '../client/public/icons');
    const issue = (scope: string, id: string, message: string) => issues.push({ scope, id, message });
    const icon = (scope: string, id: string, key: string) => {
        if (!existsSync(resolve(iconRoot, `${key}.png`))) issue(scope, id, `아이콘이 없습니다: ${key}.png`);
    };

    for (const item of getAllItemData()) {
        icon('item', item.id, item.image ?? `items/${item.id}`);
        if (item.weight < 0) issue('item', item.id, '중량은 음수일 수 없습니다.');
        if (item.maxStack < 1) issue('item', item.id, '최대 스택은 1 이상이어야 합니다.');
    }
    for (const emote of CHAT_EMOTES) icon('chat-emote', emote.key, emote.image);
    issues.push(...validateAlchemyMasterData());
    for (const skill of getAllSkillData()) icon('skill', skill.id, skill.icon);
    for (const job of getAllJobs()) {
        icon('job', job.id, job.icon);
        for (const parentId of job.parentJobIds) if (!getJob(parentId)) issue('job', job.id, `상위 직업이 없습니다: ${parentId}`);
        for (const grant of job.grantedSkills) if (!getSkillData(grant.skillDataId)) issue('job', job.id, `지급 스킬이 없습니다: ${grant.skillDataId}`);
        if (job.tier === JobTier.THIRD) {
            const parent = job.parentJobIds.length === 1 ? getJob(job.parentJobIds[0]) : undefined;
            if (!parent || parent.tier !== JobTier.FIRST) {
                issue('job', job.id, '3차 직업은 원래 1차 메인 계보 하나만 가져야 합니다.');
            } else if (resolveThirdJob(parent.id)?.id !== job.id) {
                issue('job', job.id, `3차 계보 매핑이 일치하지 않습니다: ${parent.id}`);
            }
            for (const grant of job.grantedSkills) {
                const skill = getSkillData(grant.skillDataId);
                if (skill && (!skill.tags.includes(GameTags.SKILL_PASSIVE)
                    || !skill.jobRequirement?.anyOf.includes(job.id))) {
                    issue('job', job.id, `3차 지급 스킬의 패시브·계보 조건이 올바르지 않습니다: ${grant.skillDataId}`);
                }
            }
        }
    }
    for (const monster of getAllMonsterData()) {
        icon('monster', monster.id, monster.icon ?? `monsters/${monster.id}`);
        for (const drop of monster.drops) if (!getItemData(drop.itemDataId)) issue('monster', monster.id, `드롭 아이템이 없습니다: ${drop.itemDataId}`);
        for (const equipment of monster.equipments) if (!getItemData(equipment.itemDataId)) issue('monster', monster.id, `장비 아이템이 없습니다: ${equipment.itemDataId}`);
        for (const skill of monster.skills ?? []) if (!getSkillData(skill.skillDataId)) issue('monster', monster.id, `스킬이 없습니다: ${skill.skillDataId}`);
        const effectId = monster.attack?.effect?.statusEffectId;
        if (effectId && !StatusEffectType.fromKey(effectId)) issue('monster', monster.id, `상태이상이 없습니다: ${effectId}`);
        if (monster.ai?.intelligence !== undefined && (monster.ai.intelligence < 0 || monster.ai.intelligence > 100)) {
            issue('monster', monster.id, 'AI 지능은 0~100이어야 합니다.');
        }
        if (monster.challengePattern && !hasMonsterChallengePattern(monster.challengePattern.handler)) {
            issue('monster', monster.id, `보스 미니게임 패턴이 없습니다: ${monster.challengePattern.handler}`);
        }
    }
    for (const resource of getAllResourceData()) {
        for (const drop of resource.drops) if (!getItemData(drop.itemDataId)) issue('resource', resource.id, `드롭 아이템이 없습니다: ${drop.itemDataId}`);
    }
    for (const recipe of getAllCraftingRecipes()) {
        if (recipe.resultItemDataId && !getItemData(recipe.resultItemDataId)) issue('crafting', recipe.id, `결과 아이템이 없습니다: ${recipe.resultItemDataId}`);
    }
    for (const quest of getAllQuestData()) {
        for (const npcId of [...quest.giverNpcIds, ...quest.turnInNpcIds]) if (!NPC.getNpc(npcId)) issue('quest', quest.id, `NPC가 없습니다: ${npcId}`);
        for (const prerequisite of quest.prerequisiteQuestIds) if (!getQuestData(prerequisite)) issue('quest', quest.id, `선행 퀘스트가 없습니다: ${prerequisite}`);
        for (const reward of quest.rewards) {
            const itemId = reward.getItemSnapshot()?.itemDataId;
            if (itemId && !getItemData(itemId)) issue('quest', quest.id, `보상 아이템이 없습니다: ${itemId}`);
        }
    }

    const locations = options.locations ?? [];
    const locationIds = new Set(locations.map(location => location.id));
    for (const location of locations) {
        const bossSpawns = location.objects.filter(object =>
            object.type === 'monster' && getMonsterData(object.dataId)?.tags.includes(GameTags.ENTITY_BOSS));
        if (location.tags.includes(GameTags.LOCATION_BOSS_ROOM) && bossSpawns.length === 0) {
            issue('location', location.id, '보스방 태그가 있지만 보스 몬스터가 없습니다.');
        }
        if (location.mapIcon) icon('location', location.id, `map/${location.mapIcon}`);
        for (const connection of location.connections) if (!locationIds.has(connection.locationId)) issue('location', location.id, `연결 장소가 없습니다: ${connection.locationId}`);
        for (const npcId of location.npcIds) if (!NPC.getNpc(npcId)) issue('location', location.id, `NPC가 없습니다: ${npcId}`);
        for (const object of location.objects) {
            if (object.type === 'monster' && !getMonsterData(object.dataId)) issue('location', location.id, `몬스터가 없습니다: ${object.dataId}`);
            if (object.type === 'resource' && !getResourceData(object.dataId)) issue('location', location.id, `자원이 없습니다: ${object.dataId}`);
        }
    }
    return issues;
}
