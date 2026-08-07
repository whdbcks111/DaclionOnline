import assert from 'node:assert/strict';
import test from 'node:test';
import {
    clearInformationMode,
    isInformationPublicMode,
    runInformationCommand,
    setInformationPublicMode,
    shouldPublishInformationOutput,
} from './informationVisibility.js';

test('정보 공개 모드는 사용자별이며 기본값은 비공개다', () => {
    clearInformationMode(1);
    clearInformationMode(2);
    assert.equal(isInformationPublicMode(1), false);
    setInformationPublicMode(1, true);
    assert.equal(isInformationPublicMode(1), true);
    assert.equal(isInformationPublicMode(2), false);
    setInformationPublicMode(1, false);
    assert.equal(isInformationPublicMode(1), false);
});

test('정보 명령 문맥은 await 이후에도 공개 여부를 유지하고 명시적 override를 지원한다', async () => {
    setInformationPublicMode(1, true);
    await runInformationCommand(1, async () => {
        await Promise.resolve();
        assert.equal(shouldPublishInformationOutput(1), true);
        assert.equal(shouldPublishInformationOutput(2), false);
    });
    runInformationCommand(1, () => assert.equal(shouldPublishInformationOutput(1), false), false);
    assert.equal(shouldPublishInformationOutput(1), false);
    clearInformationMode(1);
});
