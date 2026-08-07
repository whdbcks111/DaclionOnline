import assert from 'node:assert/strict';
import test from 'node:test';
import { RevisionedSnapshot } from './stateSync.js';

test('revision snapshot은 내용이 바뀔 때만 증가하고 reset 뒤 새 syncId로 시작한다', () => {
    const stream = new RevisionedSnapshot<{ life: number }>();
    const first = stream.resolve({ life: 100 });
    const same = stream.resolve({ life: 100 });
    const changed = stream.resolve({ life: 90 });
    assert.equal(first, same);
    assert.equal(first.revision, 1);
    assert.equal(changed.revision, 2);
    assert.equal(changed.syncId, first.syncId);

    stream.reset();
    const reset = stream.resolve({ life: 90 });
    assert.equal(reset.revision, 1);
    assert.notEqual(reset.syncId, first.syncId);
});
