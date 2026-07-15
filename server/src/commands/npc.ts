import type { CompletionItem } from '../../../shared/types.js';
import { getLocation } from '../models/Location.js';
import {
    DialogueEndReason,
    chooseNpcDialogue,
    endNpcDialogue,
    startNpcDialogue,
} from '../models/NpcDialogue.js';
import { registerCommand } from '../modules/bot.js';
import { sendBotMessageToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';

export function initNpcCommands(): void {
    registerCommand({
        name: '대화',
        aliases: ['talk'],
        description: '현재 위치의 NPC와 대화합니다.',
        showCommandUse: 'hide',
        args: [{
            name: '번호',
            description: '대화할 NPC 번호',
            required: true,
            completions(userId) {
                const player = getPlayerByUserId(userId);
                const location = player ? getLocation(player.locationId) : undefined;
                if (!location) return [];
                return location.getNpcs().map((npc, index): CompletionItem => ({
                    value: String(index + 1),
                    description: npc.name,
                }));
            },
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const number = Number(args[0]);
            const location = getLocation(player.locationId);
            const npc = Number.isInteger(number) ? location?.getNpc(number - 1) : undefined;
            if (!npc) {
                sendBotMessageToUser(userId, '유효한 NPC 번호를 입력해주세요.');
                return;
            }
            const result = startNpcDialogue(player, npc);
            if (!result.success && result.reason) sendBotMessageToUser(userId, result.reason);
        },
    });

    registerCommand({
        name: '대화선택',
        description: '진행 중인 NPC 대화의 선택지를 고릅니다.',
        showCommandUse: 'hide',
        args: [
            { name: '세션', description: '대화 세션 ID', required: true },
            { name: '번호', description: '선택지 번호', required: true },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const result = chooseNpcDialogue(player, args[0], Number(args[1]));
            if (!result.success && result.reason) sendBotMessageToUser(userId, result.reason);
        },
    });

    registerCommand({
        name: '대화종료',
        aliases: ['endtalk'],
        description: '진행 중인 NPC 대화를 종료합니다.',
        showCommandUse: 'hide',
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            if (!endNpcDialogue(player, DialogueEndReason.USER)) {
                sendBotMessageToUser(userId, '진행 중인 대화가 없습니다.');
            }
        },
    });
}
