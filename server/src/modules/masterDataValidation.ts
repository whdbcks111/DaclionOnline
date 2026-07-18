import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LocationData } from '../../../shared/types.js';
import { getAllCraftingRecipes } from '../models/Crafting.js';
import { getAllItemData, getItemData } from '../models/Item.js';
import { getAllJobs, getJob } from '../models/Job.js';
import { getAllMonsterData, getMonsterData } from '../models/Monster.js';
import NPC from '../models/NPC.js';
import { getAllQuestData, getQuestData } from '../models/Quest.js';
import { getAllResourceData, getResourceData } from '../models/Resource.js';
import { getAllSkillData, getSkillData } from '../models/Skill.js';
import { StatusEffectType } from '../models/StatusEffect.js';

export interface MasterDataIssue {
    scope: string
    id: string
    message: string
}

export interface MasterDataValidationOptions {
    locations?: readonly LocationData[]
    iconRoot?: string
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
    for (const skill of getAllSkillData()) icon('skill', skill.id, skill.icon);
    for (const job of getAllJobs()) {
        icon('job', job.id, job.icon);
        for (const parentId of job.parentJobIds) if (!getJob(parentId)) issue('job', job.id, `상위 직업이 없습니다: ${parentId}`);
        for (const grant of job.grantedSkills) if (!getSkillData(grant.skillDataId)) issue('job', job.id, `지급 스킬이 없습니다: ${grant.skillDataId}`);
    }
    for (const monster of getAllMonsterData()) {
        for (const drop of monster.drops) if (!getItemData(drop.itemDataId)) issue('monster', monster.id, `드롭 아이템이 없습니다: ${drop.itemDataId}`);
        for (const equipment of monster.equipments) if (!getItemData(equipment.itemDataId)) issue('monster', monster.id, `장비 아이템이 없습니다: ${equipment.itemDataId}`);
        for (const skill of monster.skills ?? []) if (!getSkillData(skill.skillDataId)) issue('monster', monster.id, `스킬이 없습니다: ${skill.skillDataId}`);
        const effectId = monster.attack?.effect?.statusEffectId;
        if (effectId && !StatusEffectType.fromKey(effectId)) issue('monster', monster.id, `상태이상이 없습니다: ${effectId}`);
        if (monster.ai?.intelligence !== undefined && (monster.ai.intelligence < 0 || monster.ai.intelligence > 100)) {
            issue('monster', monster.id, 'AI 지능은 0~100이어야 합니다.');
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
