import type { CompletionItem } from '../../../shared/types.js';
import {
    formatPatchNoteDate,
    formatPatchNoteVersion,
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
        description: '버전별 패치 내용을 최신순으로 확인합니다.',
        information: true,
        showCommandUse: 'private',
        args: [{
            name: '버전',
            description: '특정 버전 (예: 1.0.0, 생략 시 전체)',
            completions: getPatchNotes().map((note): CompletionItem => ({
                value: note.version,
                description: note.title,
            })),
        }],
        handler(userId, args) {
            const requestedVersion = args[0]?.trim();
            const notes = requestedVersion
                ? [getPatchNote(requestedVersion)].filter(note => note !== undefined)
                : getPatchNotes();
            if (notes.length === 0) {
                const versions = getPatchNotes().map(note => formatPatchNoteVersion(note.version)).join(', ');
                sendBotMessageToUser(userId, `해당 버전의 패치노트가 없습니다. 확인 가능한 버전: ${versions}`);
                return;
            }

            const builder = chat()
                .text('[ 패치노트 ]\n')
                .color('$text-tertiary', body => body.text('최신 버전부터 표시됩니다.\n'));

            for (const note of notes) {
                builder
                    .divider(`${formatPatchNoteVersion(note.version)} · ${note.title}`)
                    .color('$text-tertiary', body => body.text(`${formatPatchNoteDate(note.releasedAt)}\n`))
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
