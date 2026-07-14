import { registerCommand } from '../modules/bot.js';
import { sendBotMessageToUser, sendNotificationToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';
import { chat } from '../utils/chatBuilder.js';
import { parseChatMessage } from '../utils/chatParser.js';
import type { CompletionItem } from '../../../shared/types.js';
import type Player from '../models/Player.js';
import type Skill from '../models/Skill.js';

interface SkillDisplayStatus {
    label: string;
    detail: string;
    color: string;
}

function skillCompletions(userId: number): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    if (!player) return [];
    return player.skills.getVisible().map(skill => ({
        value: skill.name,
        description: `Lv.${skill.level} · ${skill.formatCost(player).replace(/\[[^\]]+\]/g, '')}`,
    }));
}

function getSkillDisplayStatus(player: Player, skill: Skill): SkillDisplayStatus {
    if (skill.isActive) return { label: '발동 중', detail: '현재 발동 중입니다.', color: 'gold' };
    const remaining = skill.getRemainingCooldown();
    if (remaining > 0) {
        const label = `재사용 대기 ${remaining.toFixed(1)}초`;
        return { label, detail: label, color: 'red' };
    }
    const status = player.skills.getActivationStatus(skill);
    return status.accepted
        ? { label: '사용 가능', detail: '지금 사용할 수 있습니다.', color: 'lime' }
        : { label: '조건 불충족', detail: status.reason, color: 'red' };
}

export function initSkillCommands(): void {
    registerCommand({
        name: '스킬목록',
        aliases: ['skilllist', 'sl'],
        description: '현재 표시 가능한 보유 스킬 목록을 확인합니다.',
        showCommandUse: 'hide',
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
                    const status = getSkillDisplayStatus(player, skill);
                    builder.text('\n')
                        .color('gray', b => b.text(`${index + 1}. `))
                        .weight('bold', b => b.color('gold', b2 => b2.text(skill.name)))
                        .text(`  Lv.${skill.level}  `)
                        .tooltip(status.detail, b => b.color(status.color, b2 => b2.text(status.label)))
                        .text('  ')
                        .closeButton(`/스킬정보 ${skill.name}`, b => b.text('[정보]'))
                        .text(' ')
                        .closeButton(`/스킬 ${skill.name}`, b => b.color('gold', b2 => b2.text('[사용]')));
                }
            }
            sendBotMessageToUser(userId, builder.build());
        },
    });

    registerCommand({
        name: '스킬',
        aliases: ['skill', 'su'],
        description: '보유한 스킬을 이름으로 발동합니다.',
        showCommandUse: 'hide',
        args: [{
            name: '스킬이름',
            description: '발동할 스킬 이름',
            required: true,
            isText: true,
            completions: skillCompletions,
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
        args: [{
            name: '스킬이름',
            description: '확인할 스킬 이름',
            required: true,
            isText: true,
            completions: skillCompletions,
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const skill = player.skills.findVisibleByInput(args[0] ?? '');
            if (!skill) {
                sendBotMessageToUser(userId, '보유하고 있거나 현재 표시 가능한 스킬이 아닙니다.');
                return;
            }

            const status = getSkillDisplayStatus(player, skill);
            const statusLabel = status.label === '조건 불충족' ? status.detail : status.label;

            const nodes = [
                ...chat()
                    .color('gray', b => b.text('[ 스킬 정보 ]  '))
                    .weight('bold', b => b.color('gold', b2 => b2.text(skill.name)))
                    .text(`  Lv.${skill.level} / ${skill.maxLevel}\n`)
                    .color('gray', b => b.text('─── 효과 ───\n'))
                    .build(),
                ...parseChatMessage(skill.formatDescription(player)),
                ...chat().text('\n').color('gray', b => b.text('─── 소모 및 재사용 ───\n')).build(),
                ...parseChatMessage(skill.formatCost(player)),
                ...chat().text('\n').color('gray', b => b.text('─── 발동 조건 ───\n')).build(),
                ...parseChatMessage(skill.formatActivationCondition(player)),
                ...chat()
                    .text('\n')
                    .color('gray', b => b.text('─── 현재 상태 ───\n'))
                    .color(status.color, b => b.text(statusLabel))
                    .text('\n')
                    .color('gray', b => b.text(`획득 경로: ${skill.acquisitionSource ?? '알 수 없음'}\n`))
                    .closeButton(`/스킬 ${skill.name}`, b => b.color('gold', b2 => b2.text('[사용]')))
                    .build(),
            ];
            sendBotMessageToUser(userId, nodes);
        },
    });
}
