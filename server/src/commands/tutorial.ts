import { registerCommand } from '../modules/bot.js';
import { sendBotMessageToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';
import {
    acknowledgeTutorialStep,
    chooseTutorialContent,
    skipTutorial,
    startTutorial,
    TutorialContent,
} from '../modules/tutorial.js';

export function initTutorialCommands(): void {
    registerCommand({
        name: '튜토리얼시작',
        aliases: ['tutorialstart'],
        description: '첫 모험 안내를 처음부터 다시 시작합니다.',
        showCommandUse: 'hide',
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (player) startTutorial(player);
        },
    });

    registerCommand({
        name: '튜토리얼스킵',
        aliases: ['tutorialskip'],
        description: '진행 중인 첫 모험 안내를 건너뜁니다.',
        showCommandUse: 'hide',
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (player) skipTutorial(player);
        },
    });

    registerCommand({
        name: '튜토리얼다음',
        aliases: ['tutorialnext'],
        description: '설명 확인형 튜토리얼 단계를 진행합니다.',
        showCommandUse: 'hide',
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            if (!acknowledgeTutorialStep(player)) {
                sendBotMessageToUser(userId, '현재 안내 카드의 기능 버튼이나 명령어를 먼저 사용해주세요.');
            }
        },
    });

    registerCommand({
        name: '튜토리얼선택',
        aliases: ['tutorialchoose'],
        description: '먼저 체험할 생활·전투 콘텐츠를 선택합니다.',
        showCommandUse: 'hide',
        args: [{
            name: '콘텐츠',
            description: '낚시, 광질, 사냥 중 먼저 체험할 콘텐츠',
            required: true,
            completions: TutorialContent.values().map(content => ({
                value: content.label,
                description: content.description,
            })),
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const result = chooseTutorialContent(player, args[0]);
            if (!result.success && result.reason) sendBotMessageToUser(userId, result.reason);
        },
    });
}
