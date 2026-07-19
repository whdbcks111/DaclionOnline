import type { CompletionItem } from '../../../shared/types.js';
import { registerCommand } from '../modules/bot.js';
import { startForging } from '../modules/forging.js';
import { sendBotMessageToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';
import {
    ARCANE_ENCHANT_MENTALITY_COST,
    FORGED_ITEM_NAMING_SENSIBILITY,
    ForgeForm,
    ForgeMaterial,
    enchantWeapon,
    renameForgedItem,
} from '../models/Forging.js';
import { StatType } from '../models/Stat.js';
import { itemTargetCompletions, resolveItemInspectionTarget } from './inspection.js';

export function initForgingCommands(): void {
    registerCommand({
        name: '단조', aliases: ['forge', 'fg'], description: '제련 소재를 사용해 리듬 미니게임으로 장비를 단조합니다.',
        showCommandUse: 'private',
        args: [
            {
                name: '형태', description: '제작할 장비 형태', required: true, isText: true,
                completions: (): CompletionItem[] => ForgeForm.values().map(form => ({ value: form.label, description: `재료 ${form.materialCount}개` })),
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
                const forms = ForgeForm.values().map(value => value.label).join('|');
                const materials = ForgeMaterial.values().map(value => value.label).join('|');
                sendBotMessageToUser(userId, `사용법: /단조 <${forms}> <${materials}>`);
                return;
            }
            const result = startForging(player, form, material);
            if (!result.success) sendBotMessageToUser(userId, result.reason ?? '단조를 시작할 수 없습니다.');
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
            sendBotMessageToUser(userId,
                `[ ${target.item.name} ]에 [ ${result.label} ]을 새겼습니다. 적중 시 ${(result.effect.chance * 100).toFixed(1)}% 확률로 Lv.${result.effect.level} 효과가 ${result.effect.duration}초간 발동합니다.`);
        },
    });
}
