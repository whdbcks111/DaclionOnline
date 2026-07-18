import type { CompletionItem } from '../../../shared/types.js';
import { registerCommand } from '../modules/bot.js';
import { startForging } from '../modules/forging.js';
import { sendBotMessageToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';
import { ForgeForm, ForgeMaterial } from '../models/Forging.js';

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
                sendBotMessageToUser(userId, '사용법: /단조 <장검|도끼|단검|방패|곡괭이> <철|황금|홍염|녹영|금강>');
                return;
            }
            const result = startForging(player, form, material);
            if (!result.success) sendBotMessageToUser(userId, result.reason ?? '단조를 시작할 수 없습니다.');
        },
    });
}
