import type { ChatNode, CompletionItem } from '../../../shared/types.js';
import {
    formatPatchNoteDate,
    formatPatchNoteVersion,
    getPatchNote,
    getPatchNotes,
    type PatchNoteSnapshot,
} from '../../../shared/patchNotes.js';
import { registerCommand } from '../modules/bot.js';
import { sendBotMessageToUser } from '../modules/message.js';
import { chat } from '../utils/chatBuilder.js';

export function buildPatchNoteMessage(notes: readonly PatchNoteSnapshot[]): ChatNode[] {
    const latest = notes[0];
    if (!latest) return chat().text('[ 패치노트 ]\n등록된 패치노트가 없습니다.').build();

    return chat()
        .text('[ 패치노트 ] ')
        .weight('bold', title => title.text(`${formatPatchNoteVersion(latest.version)}\n`))
        .color('$text-tertiary', body => body.text(`${formatPatchNoteDate(latest.releasedAt)} · ${notes.length}개 버전\n`))
        .hide('상세 보기', details => {
            for (const note of notes) {
                details
                    .divider()
                    .weight('bold', title => title.text(`${formatPatchNoteVersion(note.version)}\n`))
                    .color('$text-tertiary', body => body.text(`${formatPatchNoteDate(note.releasedAt)}\n`));
                for (const section of note.sections) {
                    details.weight('bold', title => title.text(`\n[${section.categoryMarker}] ${section.categoryLabel}\n`));
                    for (const item of section.items) details.text(`• ${item}\n`);
                }
            }
            return details;
        })
        .build();
}

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
                description: formatPatchNoteDate(note.releasedAt),
            })),
        }],
        handler(userId, args) {
            const requestedVersion = args[0]?.trim();
            const notes = requestedVersion
                ? [getPatchNote(requestedVersion)].filter(note => note !== undefined)
                : getPatchNotes();
            if (notes.length === 0) {
                sendBotMessageToUser(userId, '해당 버전의 패치노트가 없습니다. 버전 자동완성에서 확인할 항목을 선택해 주세요.');
                return;
            }

            sendBotMessageToUser(userId, buildPatchNoteMessage(notes));
        },
    });
}
