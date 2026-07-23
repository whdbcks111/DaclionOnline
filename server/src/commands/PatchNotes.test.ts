import assert from 'node:assert/strict';
import test from 'node:test';
import {
    formatPatchNoteDate,
    formatPatchNoteVersion,
    getPatchNote,
    getPatchNotes,
} from '../../../shared/patchNotes.js';
import { buildPatchNoteMessage } from './patchNotes.js';

test('패치노트는 버전별 유일 항목을 최신순으로 반환한다', () => {
    const notes = getPatchNotes();
    assert.ok(notes.length > 0);
    assert.ok(notes.every(note => /^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?$/i.test(note.version)));
    assert.equal(new Set(notes.map(note => note.version)).size, notes.length);
    assert.ok(notes.every(note => note.sections.every(section => section.items.length > 0)));
});

test('버전 조회는 선택적 v 접두사를 지원하고 외부 변경에 원본이 노출되지 않는다', () => {
    const latest = getPatchNotes()[0];
    assert.equal(getPatchNote(latest.version)?.releasedAt, latest.releasedAt);
    assert.equal(getPatchNote(`v${latest.version}`)?.releasedAt, latest.releasedAt);
    assert.equal(formatPatchNoteVersion(latest.version), `v${latest.version}`);
    assert.match(formatPatchNoteDate(latest.releasedAt), /년 .*월 .*일/);

    const mutableItems = latest.sections[0].items as string[];
    mutableItems.push('외부에서 추가한 항목');
    assert.equal(getPatchNotes()[0].sections[0].items.includes('외부에서 추가한 항목'), false);
});

test('튜토리얼 완성까지는 베타 버전이고 이후 정식 버전으로 분리된다', () => {
    const notes = getPatchNotes();
    assert.equal(notes[0].version, '1.0.4');
    assert.ok(notes.some(note => note.version === '0.68.0'));
    assert.ok(notes.some(note => note.version === '1.0.0'));
    assert.equal(notes.length, 73);
    assert.equal(notes.filter(note => note.version.startsWith('0.')).length, 68);
    assert.equal(notes.filter(note => note.version.startsWith('1.')).length, 5);
    assert.ok(notes.every(note => note.sections.every(section => ['+', '/', '-'].includes(section.categoryMarker))));
});

test('패치노트 명령 메시지는 전체 기록을 상세보기 안에 접는다', () => {
    const nodes = buildPatchNoteMessage(getPatchNotes());
    const details = nodes.find(node => node.type === 'hide');
    assert.ok(details && details.type === 'hide');
    assert.equal(details.title, '상세 보기');
    assert.match(JSON.stringify(details.children), /v1\.0\.4/);

    const visibleText = nodes
        .filter(node => node.type !== 'hide')
        .map(node => JSON.stringify(node))
        .join('');
    assert.match(visibleText, /73개 버전/);
    assert.doesNotMatch(visibleText, /추가된 콘텐츠/);
});
