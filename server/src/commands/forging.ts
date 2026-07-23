import type { CompletionItem } from '../../../shared/types.js';
import { registerCommand } from '../modules/bot.js';
import { getAvailableForgeForms, startForging } from '../modules/forging.js';
import { sendBotMessageToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';
import {
    ARCANE_ENCHANT_MENTALITY_COST,
    ENHANCEMENT_STONE_ITEM_ID,
    FORGED_ITEM_NAMING_SENSIBILITY,
    STAFF_INFUSION_MENTALITY_COST,
    ForgeForm,
    ForgeMaterial,
    createInfusedStaffSnapshot,
    enchantWeapon,
    reinforceWeapon,
    renameForgedItem,
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
                name: '형태', description: '제작할 장비 형태', required: true, isText: true,
                completions: (userId): CompletionItem[] => {
                    const player = getPlayerByUserId(userId);
                    return (player ? getAvailableForgeForms(player) : [])
                        .map(form => ({ value: form.label, description: `재료 ${form.materialCount}개` }));
                },
            },
            {
                name: '재료', description: '사용할 제련 소재', required: true, isText: true,
                completions: (): CompletionItem[] => ForgeMaterial.values().map(material => ({ value: material.label, description: material.itemDataId })),
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
                .text(`[ ${target.item.name} ]에 [ ${effectType.label} ]을 새겼습니다. 적중 시 ${(result.effect.chance * 100).toFixed(1)}% 확률로 Lv.${result.effect.level} `)
                .tooltip(effectType.statusEffectSummary, b => b.weight('bold', b2 => b2.text(effectType.statusEffectLabel)))
                .text(` 효과를 ${result.effect.duration}초간 부여합니다.`)
                .build());
        },
    });

    registerCommand({
        name: '무기강화', aliases: ['reinforce', 'rf'], description: '지핵 강화석으로 무기를 최대 +5까지 확정 강화합니다.',
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
            const preview = before >= 5 || !target.item.hasTag(GameTags.ITEM_WEAPON);
            if (preview) {
                sendBotMessageToUser(userId, before >= 5 ? '이미 최대 강화 단계(+5)입니다.' : '무기 아이템만 강화할 수 있습니다.');
                return;
            }
            if (!player.inventory.removeItemByData(ENHANCEMENT_STONE_ITEM_ID, 1)) return;
            const result = reinforceWeapon(target.item, {
                creatorLevel: player.level,
                sensibility: player.stat.get(StatType.SENSIBILITY),
                skillLevel: skill.level,
            });
            if (!result.success || !result.level) {
                player.inventory.addItem(ENHANCEMENT_STONE_ITEM_ID, 1);
                sendBotMessageToUser(userId, result.reason ?? '무기 강화에 실패했습니다.');
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
            sendBotMessageToUser(userId, `[ ${target.item.name} ] 강화 성공! (${bonus})`);
        },
    });
}
