import assert from 'node:assert/strict';
import test from 'node:test';
import {
    formatPatchNoteDate,
    formatPatchNoteVersion,
    getPatchNote,
    getPatchNotes,
} from '../../../shared/patchNotes.js';

test('패치노트는 버전별 유일 항목을 최신순으로 반환한다', () => {
    const notes = getPatchNotes();
    assert.ok(notes.length > 0);
    assert.ok(notes.every(note => /^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?$/i.test(note.version)));
    assert.equal(new Set(notes.map(note => note.version)).size, notes.length);
    assert.ok(notes.every(note => note.sections.every(section => section.items.length > 0)));
});

test('버전 조회는 선택적 v 접두사를 지원하고 외부 변경에 원본이 노출되지 않는다', () => {
    const latest = getPatchNotes()[0];
    assert.equal(getPatchNote(latest.version)?.title, latest.title);
    assert.equal(getPatchNote(`v${latest.version}`)?.title, latest.title);
    assert.equal(formatPatchNoteVersion(latest.version), `v${latest.version}`);
    assert.match(formatPatchNoteDate(latest.releasedAt), /년 .*월 .*일/);

    const mutableItems = latest.sections[0].items as string[];
    mutableItems.push('외부에서 추가한 항목');
    assert.equal(getPatchNotes()[0].sections[0].items.includes('외부에서 추가한 항목'), false);
});
