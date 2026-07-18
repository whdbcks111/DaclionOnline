import { registerCommand } from '../modules/bot.js';
import { sendBotMessageToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';
import { submitQuestionPuzzle } from '../models/DungeonPuzzle.js';

export function initPuzzleCommands(): void {
    registerCommand({
        name: '퍼즐답',
        aliases: ['puzzleanswer', 'pz'],
        description: '현재 조사 중인 질문형 장치에 답합니다.',
        showCommandUse: 'private',
        args: [{ name: '정답', description: '질문의 정답', required: true, isText: true }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const result = submitQuestionPuzzle(player, args.join(' '));
            if (result === 'none') sendBotMessageToUser(userId, '현재 답을 기다리는 퍼즐이 없습니다. 먼저 장치를 조사해주세요.');
            if (result === 'expired') sendBotMessageToUser(userId, '퍼즐에서 멀어졌거나 답변 시간이 지났습니다. 장치를 다시 조사해주세요.');
        },
    });
}
