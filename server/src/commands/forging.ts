import type { CompletionItem } from '../../../shared/types.js';
import { registerCommand } from '../modules/bot.js';
import { getAvailableForgeForms, startForging } from '../modules/forging.js';
import { sendBotMessageToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';
import {
    ARCANE_ENCHANT_MENTALITY_COST,
    ENHANCEMENT_STONE_ITEM_ID,
    FORGED_ITEM_NAMING_SENSIBILITY,
    MAX_WEAPON_REINFORCEMENT,
    STAFF_INFUSION_MENTALITY_COST,
    ForgeForm,
    ForgeMaterial,
    WeaponReinforcementStage,
    createEquipmentRepairPlan,
    createInfusedStaffSnapshot,
    enchantWeapon,
    reinforceWeapon,
    renameForgedItem,
    selectEquipmentRepairMaterials,
} from '../models/Forging.js';
import { StatType } from '../models/Stat.js';
import { AttributeType } from '../models/Attribute.js';
import { itemTargetCompletions, resolveItemInspectionTarget } from './inspection.js';
import { GameTags } from '../../../shared/tags.js';
import { ItemAttackEffectType } from '../models/ItemAttackEffect.js';
import { chat } from '../utils/chatBuilder.js';

export function initForgingCommands(): void {
    registerCommand({
        name: '단조', aliases: ['forge', 'fg'], description: '제련 소재를 사용해 리듬 미니게임으로 장비를 단조합니다.',
        showCommandUse: 'private',
        args: [
            {
                name: '형태', description: '제작할 장비 형태', required: true,
                list: userId => {
                    const player = getPlayerByUserId(userId);
                    return (player ? getAvailableForgeForms(player) : []).flatMap(form => [form.label, form.key]);
                },
                completions: (userId): CompletionItem[] => {
                    const player = getPlayerByUserId(userId);
                    return (player ? getAvailableForgeForms(player) : [])
                        .map(form => ({ value: form.label, description: `재료 ${form.materialCount}개` }));
                },
            },
            {
                name: '재료', description: '사용할 제련 소재', required: true,
                list: ForgeMaterial.values().flatMap(material => material.getInputValues()),
                completions: ForgeMaterial.values().map(material => ({ value: material.label, description: material.itemDataId })),
            },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const form = ForgeForm.fromInput(args[0] ?? '');
            const material = ForgeMaterial.fromInput(args[1] ?? '');
            if (!form || !material) {
                const forms = getAvailableForgeForms(player).map(value => value.label).join('|');
                const materials = ForgeMaterial.values().map(value => value.label).join('|');
                sendBotMessageToUser(userId, `사용법: /단조 <${forms}> <${materials}>`);
                return;
            }
            const result = startForging(player, form, material);
            if (!result.success) sendBotMessageToUser(userId, result.reason ?? '단조를 시작할 수 없습니다.');
        },
    });

    registerCommand({
        name: '수리', aliases: ['repair', 'rp'], description: '대장장이 기술로 손상된 장비의 내구도를 복구합니다.',
        showCommandUse: 'private',
        args: [{
            name: '아이템 번호 또는 장착칸', description: '인벤토리 번호 또는 손, 몸 같은 장착칸', required: true,
            completions: itemTargetCompletions,
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const skill = player.skills.get('equipment_repair');
            if (!skill) {
                sendBotMessageToUser(userId, '대장장이의 [ 야전 수리 ] 스킬이 필요합니다.');
                return;
            }
            const target = resolveItemInspectionTarget(player, args[0] ?? '');
            if (!target) {
                sendBotMessageToUser(userId, '유효한 인벤토리 번호 또는 장착칸을 입력해주세요.');
                return;
            }
            const current = target.item.durability;
            const maximum = target.item.baseDurability;
            if (current === null || maximum === null) {
                sendBotMessageToUser(userId, '내구도가 존재하는 장비만 수리할 수 있습니다.');
                return;
            }
            if (current >= maximum) {
                sendBotMessageToUser(userId, '이미 내구도가 최대인 장비입니다.');
                return;
            }
            const plan = createEquipmentRepairPlan(target.item, skill.level);
            if (!plan) {
                sendBotMessageToUser(userId, '수리가 필요하지 않은 장비입니다.');
                return;
            }
            const materialSelection = selectEquipmentRepairMaterials(player.inventory, target.item, plan);
            if (!materialSelection) {
                const preferred = plan.preferredMaterialLabel
                    ? `원 제작 소재 [ ${plan.preferredMaterialLabel} ] 또는 `
                    : '';
                sendBotMessageToUser(
                    userId,
                    `${preferred}장비와 같은 재질·속성의 수리 소재가 ${plan.requiredMaterialCount}개 필요합니다.`,
                );
                return;
            }
            const mentalityCost = 20;
            if (!player.canSpendMentality(mentalityCost)) {
                sendBotMessageToUser(userId, `정신력이 ${mentalityCost} 필요합니다.`);
                return;
            }
            const repaired = target.repairDurability(plan.repairAmount, plan.maxDurabilityLossRate);
            if (!repaired
                || !player.spendMentality(mentalityCost)
                || !player.inventory.consumeSelectedItems(materialSelection.selections)) {
                sendBotMessageToUser(userId, '장비 상태가 변경되어 수리를 완료하지 못했습니다.');
                return;
            }
            skill.addExperience(player, skill.getExperienceGain(player));
            const degradation = repaired.lostMaxDurability > 0
                ? ` 최대 내구도 ${maximum} → ${repaired.maxDurability}.`
                : '';
            sendBotMessageToUser(
                userId,
                `[ ${target.item.name} ]을 ${materialSelection.materialNames.join(', ')} ${plan.requiredMaterialCount}개로 수리했습니다. `
                + `(내구도 ${current} → ${repaired.durability} / ${repaired.maxDurability})${degradation}`,
            );
        },
    });

    registerCommand({
        name: '지팡이부여',
        aliases: ['지팡이마법부여', 'staffinfuse', 'sfi'],
        description: '단조한 지팡이 틀에 마력 회로를 열어 실제 지팡이로 완성합니다.',
        showCommandUse: 'private',
        args: [{
            name: '인벤토리 번호',
            description: '마력을 부여할 단조 지팡이 틀',
            required: true,
            completions(userId): CompletionItem[] {
                const player = getPlayerByUserId(userId);
                if (!player) return [];
                return player.inventory.getIndexedItems()
                    .filter(({ item }) => item.itemDataId === ForgeForm.STAFF_FRAME.itemDataId)
                    .map(({ item, index }) => ({ value: String(index + 1), description: item.name }));
            },
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const skill = player.skills.get('staff_infusing');
            if (!skill || !player.career.hasJob('career:arcane_smith')) {
                sendBotMessageToUser(userId, '마도 대장장이의 [ 지팡이 마력 부여 ] 스킬이 필요합니다.');
                return;
            }
            if (!/^\d+$/.test(args[0] ?? '')) {
                sendBotMessageToUser(userId, '사용법: /지팡이부여 <인벤토리 번호>');
                return;
            }
            const frame = player.inventory.getItemByIndex(Number(args[0]) - 1);
            if (!frame) {
                sendBotMessageToUser(userId, '인벤토리에서 해당 지팡이 틀을 찾지 못했습니다.');
                return;
            }
            if (!player.canSpendMentality(STAFF_INFUSION_MENTALITY_COST)) {
                sendBotMessageToUser(userId, `정신력이 ${STAFF_INFUSION_MENTALITY_COST} 필요합니다.`);
                return;
            }
            const completion = createInfusedStaffSnapshot(frame);
            if (!completion.success || !completion.snapshot) {
                sendBotMessageToUser(userId, completion.reason ?? '지팡이를 완성하지 못했습니다.');
                return;
            }
            const selections = player.inventory.selectItems([{
                count: 1,
                matches: item => item === frame,
            }]);
            if (!selections || !player.spendMentality(STAFF_INFUSION_MENTALITY_COST)) {
                sendBotMessageToUser(userId, '지팡이 틀 또는 정신력 상태가 변경되어 마력 부여를 취소했습니다.');
                return;
            }
            if (!player.inventory.replaceSelectedItems(selections, [completion.snapshot])) {
                player.restoreMentality(STAFF_INFUSION_MENTALITY_COST);
                sendBotMessageToUser(userId, '지팡이 틀이 변경되었거나 완성품을 보관할 공간이 부족합니다.');
                return;
            }
            sendBotMessageToUser(userId, `[ ${completion.snapshot.metadataDelta?.customName ?? '단조 지팡이'} ]에 마력 회로를 열었습니다.`);
        },
    });

    registerCommand({
        name: '장비명명', aliases: ['gearname', 'gn'], description: '직접 단조한 장비에 고유한 이름을 붙입니다.',
        showCommandUse: 'private',
        args: [
            {
                name: '아이템 번호 또는 장착칸', description: '인벤토리 번호 또는 손, 다리 같은 장착칸', required: true,
                completions: itemTargetCompletions,
            },
            { name: '새 이름', description: '공백 포함 2~24자', required: true, isText: true },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            if (!player.skills.has('artisan_naming')) {
                sendBotMessageToUser(userId, `대장장이 직업과 감각 ${FORGED_ITEM_NAMING_SENSIBILITY} 이상에서 [ 장인의 명명 ] 스킬을 얻어야 합니다.`);
                return;
            }
            const currentSensibility = player.stat.get(StatType.SENSIBILITY);
            if (currentSensibility < FORGED_ITEM_NAMING_SENSIBILITY) {
                sendBotMessageToUser(userId, `감각이 부족합니다. (필요: ${FORGED_ITEM_NAMING_SENSIBILITY}, 현재: ${currentSensibility})`);
                return;
            }
            const target = resolveItemInspectionTarget(player, args[0] ?? '');
            if (!target) {
                sendBotMessageToUser(userId, '유효한 인벤토리 번호 또는 장착칸을 입력해주세요.');
                return;
            }
            const previousName = target.item.name;
            const result = renameForgedItem(target.item, player.userId, args[1] ?? '');
            if (!result.success) {
                sendBotMessageToUser(userId, result.reason ?? '장비 이름을 변경할 수 없습니다.');
                return;
            }
            sendBotMessageToUser(userId, `[ ${previousName} ]에 [ ${result.name} ]이라는 이름을 새겼습니다.`);
        },
    });

    registerCommand({
        name: '마법부여효과',
        aliases: ['enchantmenteffects', 'ee'],
        description: '마법 부여로 등장할 수 있는 상태이상·공격·회복·보호 효과를 확인합니다.',
        information: true,
        handler(userId) {
            const lines = ItemAttackEffectType.values()
                .map(type => `${type.label}: ${type.summary}`);
            sendBotMessageToUser(userId, [
                '[ 마법 부여 효과 목록 ]',
                ...lines,
                '무기의 속성·재료·이름이 후보 가중치에 영향을 주며, 한 무기에는 마법 부여를 한 번만 할 수 있습니다.',
            ].join('\n'));
        },
    });

    registerCommand({
        name: '마법부여', aliases: ['enchant', 'enc'], description: '무기에 속성 연관 적중 마법을 한 번 부여합니다.',
        showCommandUse: 'private',
        args: [{
            name: '아이템 번호 또는 장착칸', description: '인벤토리 번호 또는 손 같은 장착칸', required: true,
            completions: itemTargetCompletions,
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const skill = player.skills.get('arcane_enchanting');
            if (!skill || !player.career.hasJob('career:arcane_smith')) {
                sendBotMessageToUser(userId, '대장장이를 메인, 마법사를 서브로 선택해 마도 대장장이로 전직해야 합니다.');
                return;
            }
            const target = resolveItemInspectionTarget(player, args[0] ?? '');
            if (!target) {
                sendBotMessageToUser(userId, '유효한 인벤토리 번호 또는 장착칸을 입력해주세요.');
                return;
            }
            if (!player.canSpendMentality(ARCANE_ENCHANT_MENTALITY_COST)) {
                sendBotMessageToUser(userId, `정신력이 ${ARCANE_ENCHANT_MENTALITY_COST} 필요합니다.`);
                return;
            }
            const result = enchantWeapon(target.item, {
                enchanterUserId: userId,
                skillLevel: skill.level,
                sensibility: player.stat.get(StatType.SENSIBILITY),
            });
            if (!result.success || !result.effect) {
                sendBotMessageToUser(userId, result.reason ?? '마법 부여에 실패했습니다.');
                return;
            }
            player.spendMentality(ARCANE_ENCHANT_MENTALITY_COST);
            skill.addExperience(player, skill.getExperienceGain(player));
            const effectType = ItemAttackEffectType.fromKey(result.effect.type);
            if (!effectType) return;
            sendBotMessageToUser(userId, chat()
                .text(`[ ${target.item.name} ]에 `)
                .tooltip(effectType.summary, b => b.weight('bold', b2 => b2.text(`[ ${effectType.label} ]`)))
                .text(`을 새겼습니다. ${effectType.describe(result.effect)}.`)
                .build());
        },
    });

    registerCommand({
        name: '강화확률',
        aliases: ['reinforcerates', 'rr'],
        description: '목표 강화 단계별 성공·유지·하락·파괴 확률을 확인합니다.',
        information: true,
        handler(userId) {
            const lines = WeaponReinforcementStage.values()
                .map(stage => `+${stage.level} 도전: ${stage.chanceDescription}`);
            sendBotMessageToUser(userId, [
                `[ 무기 강화 확률 · 최대 +${MAX_WEAPON_REINFORCEMENT} ]`,
                ...lines,
                '강화석은 모든 유효한 시도에 1개 소모됩니다. +7부터 하락, +9부터 파괴가 발생합니다.',
            ].join('\n'));
        },
    });

    registerCommand({
        name: '무기강화', aliases: ['reinforce', 'rf'],
        description: `지핵 강화석으로 무기를 최대 +${MAX_WEAPON_REINFORCEMENT}까지 확률 강화합니다.`,
        showCommandUse: 'private',
        args: [{
            name: '아이템 번호 또는 장착칸', description: '인벤토리 번호 또는 손 같은 장착칸', required: true,
            completions: itemTargetCompletions,
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const skill = player.skills.get('weapon_reinforcement');
            if (!skill || !player.career.hasJob('career:battle_smith')) {
                sendBotMessageToUser(userId, '대장장이를 메인, 전사를 서브로 선택해 전투 대장장이로 전직해야 합니다.');
                return;
            }
            const target = resolveItemInspectionTarget(player, args[0] ?? '');
            if (!target) {
                sendBotMessageToUser(userId, '유효한 인벤토리 번호 또는 장착칸을 입력해주세요.');
                return;
            }
            if (player.inventory.getCount(ENHANCEMENT_STONE_ITEM_ID) < 1) {
                sendBotMessageToUser(userId, '철근미궁 지핵 수정실의 강화 수정맥에서 얻는 지핵 강화석이 1개 필요합니다.');
                return;
            }
            const before = target.item.reinforcementLevel;
            const preview = before >= MAX_WEAPON_REINFORCEMENT || !target.item.hasTag(GameTags.ITEM_WEAPON);
            if (preview) {
                sendBotMessageToUser(
                    userId,
                    before >= MAX_WEAPON_REINFORCEMENT
                        ? `이미 최대 강화 단계(+${MAX_WEAPON_REINFORCEMENT})입니다.`
                        : '무기 아이템만 강화할 수 있습니다.',
                );
                return;
            }
            const stage = WeaponReinforcementStage.fromLevel(before + 1);
            if (!stage) return;
            const previousName = target.item.name;
            if (!player.inventory.removeItemByData(ENHANCEMENT_STONE_ITEM_ID, 1)) return;
            const result = reinforceWeapon(target.item, {
                creatorLevel: player.level,
                sensibility: player.stat.get(StatType.SENSIBILITY),
                skillLevel: skill.level,
            });
            if (!result.outcome) {
                player.inventory.addItem(ENHANCEMENT_STONE_ITEM_ID, 1);
                sendBotMessageToUser(userId, result.reason ?? '무기 강화에 실패했습니다.');
                return;
            }
            const chance = `+${stage.level} 도전: ${stage.chanceDescription}`;
            if (result.outcome === 'retained') {
                sendBotMessageToUser(
                    userId,
                    `[ ${previousName} ] 강화 실패. 단계가 +${result.level ?? before}로 유지됩니다. (${chance})`,
                );
                return;
            }
            if (result.outcome === 'downgraded') {
                sendBotMessageToUser(
                    userId,
                    `[ ${previousName} ] 강화 실패로 +${result.previousLevel} → +${result.level} 하락했습니다. (${chance})`,
                );
                return;
            }
            if (result.outcome === 'destroyed') {
                if (!target.destroy()) {
                    sendBotMessageToUser(userId, '강화 결과를 적용하는 동안 장비 상태가 변경되었습니다.');
                    return;
                }
                sendBotMessageToUser(
                    userId,
                    `[ ${previousName} ] 강화에 실패해 장비가 파괴되었습니다. (${chance})`,
                );
                return;
            }

            skill.addExperience(player, skill.getExperienceGain(player));
            const bonus = (result.addedModifiers ?? []).map(modifier => {
                const label = AttributeType.fromKey(modifier.attribute)?.label ?? modifier.attribute;
                const value = modifier.op === 'multiply'
                    ? `+${((modifier.value - 1) * 100).toFixed(1)}%`
                    : `+${modifier.value}`;
                return `${label} ${value}`;
            }).join(', ');
            sendBotMessageToUser(userId, `[ ${target.item.name} ] 강화 성공! (${chance} · ${bonus})`);
        },
    });
}
