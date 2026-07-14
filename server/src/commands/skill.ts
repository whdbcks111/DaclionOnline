import { registerCommand } from '../modules/bot.js';
import { sendBotMessageToUser, sendNotificationToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';
import { chat } from '../utils/chatBuilder.js';
import { parseChatMessage } from '../utils/chatParser.js';
import type { CompletionItem } from '../../../shared/types.js';

function skillCompletions(userId: number): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    if (!player) return [];
    return player.skills.getVisible().map(skill => ({
        value: skill.name,
        description: `Lv.${skill.level} · ${skill.formatCost(player).replace(/\[[^\]]+\]/g, '')}`,
    }));
}

export function initSkillCommands(): void {
    registerCommand({
        name: '스킬',
        aliases: ['skill', 'sk'],
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
        aliases: ['skillinfo', 'ski'],
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

            const status = player.skills.getActivationStatus(skill);
            const remaining = skill.getRemainingCooldown();
            const statusLabel = skill.isActive
                ? '발동 중'
                : remaining > 0
                    ? `재사용 대기 ${remaining.toFixed(1)}초`
                    : status.accepted ? '사용 가능' : status.reason;
            const statusColor = skill.isActive ? 'gold' : status.accepted ? 'lime' : 'red';

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
                    .color(statusColor, b => b.text(statusLabel))
                    .text('\n')
                    .color('gray', b => b.text(`획득 경로: ${skill.acquisitionSource ?? '알 수 없음'}\n`))
                    .closeButton(`/스킬 ${skill.name}`, b => b.color('gold', b2 => b2.text('[사용]')))
                    .build(),
            ];
            sendBotMessageToUser(userId, nodes);
        },
    });
}
