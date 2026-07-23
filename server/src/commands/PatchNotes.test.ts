import assert from 'node:assert/strict';
import test from 'node:test';
import {
    formatPatchNoteDate,
    getPatchNote,
    getPatchNotes,
} from '../../../shared/patchNotes.js';

test('패치노트는 날짜별 유일 항목을 최신순으로 반환한다', () => {
    const notes = getPatchNotes();
    assert.ok(notes.length > 0);
    assert.deepEqual(
        notes.map(note => note.date),
        [...notes].map(note => note.date).sort((left, right) => right.localeCompare(left)),
    );
    assert.equal(new Set(notes.map(note => note.date)).size, notes.length);
    assert.ok(notes.every(note => note.sections.every(section => section.items.length > 0)));
});

test('날짜 조회는 구분 기호 없는 입력을 지원하고 외부 변경에 원본이 노출되지 않는다', () => {
    const latest = getPatchNotes()[0];
    assert.equal(getPatchNote(latest.date)?.title, latest.title);
    assert.equal(getPatchNote(latest.date.replaceAll('-', ''))?.title, latest.title);
    assert.match(formatPatchNoteDate(latest.date), /년 .*월 .*일/);

    const mutableItems = latest.sections[0].items as string[];
    mutableItems.push('외부에서 추가한 항목');
    assert.equal(getPatchNotes()[0].sections[0].items.includes('외부에서 추가한 항목'), false);
});
