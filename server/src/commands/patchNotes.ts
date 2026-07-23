import type { CompletionItem } from '../../../shared/types.js';
import {
    formatPatchNoteDate,
    getPatchNote,
    getPatchNotes,
} from '../../../shared/patchNotes.js';
import { registerCommand } from '../modules/bot.js';
import { sendBotMessageToUser } from '../modules/message.js';
import { chat } from '../utils/chatBuilder.js';

export function initPatchNoteCommands(): void {
    registerCommand({
        name: '패치노트',
        aliases: ['patchnotes', 'pn'],
        description: '일별 패치 내용을 최신순으로 확인합니다.',
        information: true,
        showCommandUse: 'private',
        args: [{
            name: '날짜',
            description: '특정 날짜 (YYYY-MM-DD, 생략 시 전체)',
            completions: getPatchNotes().map((note): CompletionItem => ({
                value: note.date,
                description: note.title,
            })),
        }],
        handler(userId, args) {
            const requestedDate = args[0]?.trim();
            const notes = requestedDate
                ? [getPatchNote(requestedDate)].filter(note => note !== undefined)
                : getPatchNotes();
            if (notes.length === 0) {
                const dates = getPatchNotes().map(note => note.date).join(', ');
                sendBotMessageToUser(userId, `해당 날짜의 패치노트가 없습니다. 확인 가능한 날짜: ${dates}`);
                return;
            }

            const builder = chat()
                .text('[ 패치노트 ]\n')
                .color('$text-tertiary', body => body.text('최신 날짜부터 표시됩니다.\n'));

            for (const note of notes) {
                builder
                    .divider(`${formatPatchNoteDate(note.date)} · ${note.title}`)
                    .color('$text-secondary', body => body.text(note.summary))
                    .text('\n');
                for (const section of note.sections) {
                    builder
                        .weight('bold', title => title.text(`\n[ ${section.categoryLabel} ]\n`));
                    for (const item of section.items) builder.text(`• ${item}\n`);
                }
            }
            sendBotMessageToUser(userId, builder.build());
        },
    });
}
