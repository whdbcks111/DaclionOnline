import type { CompletionItem } from '../../../shared/types.js';
import { registerCommand } from '../modules/bot.js';
import { sendBotMessageToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';
import { QuestStatus } from '../models/Quest.js';
import type { QuestDisplaySnapshot } from '../models/QuestBook.js';
import { chat } from '../utils/chatBuilder.js';

function knownQuestCompletions(userId: number, activeOnly = false): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    if (!player) return [];
    return player.quests.getSnapshots(true)
        .filter(quest => !activeOnly || quest.status === QuestStatus.ACTIVE)
        .map(quest => ({ value: quest.name, description: quest.status.label }));
}

export function initQuestCommands(): void {
    registerCommand({
        name: '퀘스트목록',
        aliases: ['questlist', 'ql'],
        description: '수락했거나 완료한 퀘스트 목록을 확인합니다.',
        showCommandUse: 'hide',
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const quests = player.quests.getSnapshots(true).sort(compareQuestSnapshots);
            const builder = chat().color('gray', b => b.text(`[ 퀘스트 목록 ]  ${quests.length}개`));
            if (quests.length === 0) {
                builder.text('\n아직 수락한 퀘스트가 없습니다.');
            } else {
                for (const [index, quest] of quests.entries()) {
                    builder.text('\n')
                        .color('gray', b => b.text(`${index + 1}. `))
                        .color(quest.status.color, b => b.weight('bold', b2 => b2.text(`[${quest.status.label}] `)))
                        .weight('bold', b => b.text(quest.name));
                    const objective = quest.objectives[0];
                    if (quest.status === QuestStatus.ACTIVE && objective) {
                        builder.text(`  ${objective.label} ${objective.progress}/${objective.required}`);
                    }
                    builder.text(' ')
                        .closeButton(`/퀘스트정보 ${quest.name}`, b => b.color('gold', b2 => b2.text('[정보]')));
                }
            }
            sendBotMessageToUser(userId, builder.build());
        },
    });

    registerCommand({
        name: '퀘스트정보',
        aliases: ['questinfo', 'qi'],
        description: '수락했거나 완료한 퀘스트의 상세 정보를 확인합니다.',
        showCommandUse: 'hide',
        args: [{
            name: '퀘스트이름',
            description: '확인할 퀘스트 이름',
            required: true,
            isText: true,
            completions: userId => knownQuestCompletions(userId),
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const quest = player.quests.getByInput(args[0]);
            const snapshot = quest ? player.quests.getSnapshot(quest.questDataId) : undefined;
            if (!snapshot) {
                sendBotMessageToUser(userId, '수락했거나 완료한 퀘스트가 아닙니다.');
                return;
            }
            const builder = chat()
                .color('gray', b => b.text('[ 퀘스트 정보 ]\n'))
                .color('gold', b => b.weight('bold', b2 => b2.text(snapshot.name)))
                .text('  ')
                .color(snapshot.status.color, b => b.text(snapshot.status.label))
                .text(`\n${snapshot.description}`)
                .text('\n\n')
                .color('gray', b => b.text(`[ 단계 · ${snapshot.stageId} ]`));
            if (snapshot.stageDescription) builder.text(`\n${snapshot.stageDescription}`);
            for (const objective of snapshot.objectives) {
                builder.text('\n- ')
                    .color(objective.completed ? 'lime' : 'white', b => b.text(objective.label))
                    .text(`  ${objective.progress}/${objective.required}`);
            }
            builder.text('\n\n').color('gray', b => b.text('[ 보상 ]'));
            if (snapshot.rewards.length === 0) builder.text('\n없음');
            else for (const reward of snapshot.rewards) builder.text(`\n- ${reward}`);
            if (snapshot.status === QuestStatus.ACTIVE && snapshot.abandonable) {
                builder.text('\n\n').closeButton(`/퀘스트포기 ${snapshot.name}`, b => b.color('red', b2 => b2.text('[퀘스트 포기]')));
            }
            sendBotMessageToUser(userId, builder.build());
        },
    });

    registerCommand({
        name: '퀘스트포기',
        aliases: ['questabandon', 'qa'],
        description: '진행 중인 퀘스트를 포기합니다.',
        showCommandUse: 'hide',
        args: [{
            name: '퀘스트이름',
            description: '포기할 퀘스트 이름',
            required: true,
            isText: true,
            completions: userId => knownQuestCompletions(userId, true),
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const quest = player.quests.getByInput(args[0]);
            if (!quest) {
                sendBotMessageToUser(userId, '진행 중인 퀘스트가 아닙니다.');
                return;
            }
            const result = player.quests.abandon(quest.questDataId);
            if (!result.success && result.reason) sendBotMessageToUser(userId, result.reason);
        },
    });
}

function compareQuestSnapshots(left: QuestDisplaySnapshot, right: QuestDisplaySnapshot): number {
    const priority = (status: QuestStatus): number => {
        if (status === QuestStatus.READY) return 0;
        if (status === QuestStatus.ACTIVE) return 1;
        if (status === QuestStatus.COMPLETED) return 2;
        return 3;
    };
    return priority(left.status) - priority(right.status) || left.name.localeCompare(right.name, 'ko');
}
