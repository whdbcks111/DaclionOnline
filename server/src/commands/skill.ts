import { registerCommand } from '../modules/bot.js';
import { sendBotMessageToUser, sendNotificationToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';
import { chat } from '../utils/chatBuilder.js';
import { parseChatMessage } from '../utils/chatParser.js';
import type { CompletionItem } from '../../../shared/types.js';
import type Skill from '../models/Skill.js';

interface SkillListStatus {
    label: string;
    color: string;
}

function visibleSkillCompletions(userId: number): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    if (!player) return [];
    return player.skills.getVisible().map(skill => ({
        value: skill.name,
        description: `Lv.${skill.level} · ${skill.formatCost(player).replace(/\[[^\]]+\]/g, '')}`,
    }));
}

function activeSkillCompletions(userId: number): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    if (!player) return [];
    return player.skills.getVisible()
        .filter(skill => !skill.isPassive)
        .map(skill => ({
            value: skill.name,
            description: `Lv.${skill.level} · ${skill.formatCost(player).replace(/\[[^\]]+\]/g, '')}`,
        }));
}

function getSkillListStatus(skill: Skill): SkillListStatus | null {
    if (skill.isPassive) return { label: '패시브', color: 'cyan' };
    if (skill.isActive) return { label: '발동 중', color: 'gold' };
    const remaining = skill.getRemainingCooldown();
    if (remaining > 0) {
        return { label: `재사용 대기 ${remaining.toFixed(1)}초`, color: 'red' };
    }
    return null;
}

export function initSkillCommands(): void {
    registerCommand({
        name: '스킬목록',
        aliases: ['skilllist', 'sl'],
        description: '현재 표시 가능한 보유 스킬 목록을 확인합니다.',
        showCommandUse: 'hide',
        information: true,
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const skills = player.skills.getVisible();
            const builder = chat()
                .color('gray', b => b.text(`[ 스킬 목록 ]  ${skills.length}개`));

            if (skills.length === 0) {
                builder.text('\n현재 표시 가능한 보유 스킬이 없습니다.');
            } else {
                for (const [index, skill] of skills.entries()) {
                    const status = getSkillListStatus(skill);
                    builder.text('\n')
                        .color('gray', b => b.text(`${index + 1}. `))
                        .icon(skill.data.icon)
                        .weight('bold', b => b.color('gold', b2 => b2.text(skill.name)))
                        .text(`  Lv.${skill.level}`);
                    if (status) {
                        builder.text('  ').color(status.color, b => b.text(status.label));
                    }
                    builder.text('  ').closeButton(`/스킬정보 ${skill.name}`, b => b.text('[정보]'));
                    if (!skill.isPassive) builder.text(' ')
                        .closeButton(`/스킬 ${skill.name}`, b => b.color('gold', b2 => b2.text('[사용]')));
                }
            }
            sendBotMessageToUser(userId, builder.build());
        },
    });

    registerCommand({
        name: '스킬',
        aliases: ['skill', 'su', 'k'],
        description: '보유한 스킬을 이름으로 발동합니다.',
        showCommandUse: 'hide',
        args: [{
            name: '스킬이름',
            description: '발동할 스킬 이름',
            required: true,
            isText: true,
            completions: activeSkillCompletions,
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const outcome = player.skills.activateByInput(args[0] ?? '');
            if (outcome.matched) return;
            const reason = outcome.reason ?? '발동할 스킬을 찾을 수 없습니다.';
            sendNotificationToUser(userId, { key: 'skill-not-found', message: reason });
            sendBotMessageToUser(userId, reason);
        },
    });

    registerCommand({
        name: '스킬정보',
        aliases: ['skillinfo', 'si'],
        description: '보유한 스킬의 상세 정보를 확인합니다.',
        showCommandUse: 'hide',
        information: true,
        args: [{
            name: '스킬이름',
            description: '확인할 스킬 이름',
            required: true,
            isText: true,
            completions: visibleSkillCompletions,
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const skill = player.skills.findVisibleByInput(args[0] ?? '');
            if (!skill) {
                sendBotMessageToUser(userId, '보유하고 있거나 현재 표시 가능한 스킬이 아닙니다.');
                return;
            }

            const requiredExperience = skill.getRequiredExperience(player);
            const experienceNodes = skill.level >= skill.maxLevel
                ? chat()
                    .color('gray', b => b.text('경험치  '))
                    .weight('bold', b => b.color('gold', b2 => b2.text('MAX')))
                    .text('\n')
                    .build()
                : chat()
                    .color('gray', b => b.text('경험치  '))
                    .color('gold', b => b.text(`${skill.experience} / ${requiredExperience}`))
                    .text('  ')
                    .progress({
                        value: requiredExperience > 0 ? skill.experience / requiredExperience : 1,
                        length: '8em',
                        color: 'gold',
                        thickness: 6,
                    })
                    .text('\n')
                    .build();

            const nodes = [
                ...chat()
                    .color('gray', b => b.text('[ 스킬 정보 ]  '))
                    .icon(skill.data.icon)
                    .weight('bold', b => b.color('gold', b2 => b2.text(skill.name)))
                    .text(`  Lv.${skill.level} / ${skill.maxLevel}\n`)
                    .build(),
                ...experienceNodes,
                ...chat().divider('효과').build(),
                ...parseChatMessage(skill.formatDescription(player)),
                ...chat().divider('소모값').build(),
                ...parseChatMessage(skill.formatCost(player)),
                ...chat()
                    .divider('재사용 대기시간')
                    .color('gold', b => b.text(skill.isPassive ? '없음' : skill.format('{{maxCooldown}}초', player)))
                    .build(),
                ...chat().divider('발동 조건').build(),
                ...parseChatMessage(skill.formatActivationCondition(player)),
                ...(!skill.isPassive ? chat()
                    .text('\n')
                    .closeButton(`/스킬 ${skill.name}`, b => b.color('gold', b2 => b2.text('[사용]')))
                    .build() : []),
            ];
            sendBotMessageToUser(userId, nodes);
        },
    });
}
