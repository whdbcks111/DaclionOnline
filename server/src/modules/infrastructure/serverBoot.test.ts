import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { incrementPatchVersion, readServerBootState, recordServerBoot } from './serverBoot.js';

test('적용 버전에서 다음 patch 버전을 계산한다', () => {
    assert.equal(incrementPatchVersion('1.0.17'), '1.0.18');
    assert.equal(incrementPatchVersion('v2.4.9-beta.1'), '2.4.10');
    assert.throws(() => incrementPatchVersion('1.0'), /올바르지 않은 패치 버전/);
});

test('서버 부팅 상태는 횟수·마지막 시각·적용 패치 버전을 원자적으로 갱신한다', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'daclion-server-boot-'));
    const statePath = path.join(directory, 'server-boot.json');
    try {
        const first = await recordServerBoot('1.0.17', {
            statePath,
            now: new Date('2026-07-30T01:00:00.000Z'),
            bootId: 'boot-one',
            processId: 100,
        });
        assert.equal(first.bootCount, 1);
        assert.equal(first.appliedPatchVersion, '1.0.17');
        assert.equal(first.nextPatchVersion, '1.0.18');

        const second = await recordServerBoot('1.0.18', {
            statePath,
            now: new Date('2026-07-30T02:00:00.000Z'),
            bootId: 'boot-two',
            processId: 101,
        });
        assert.deepEqual(second, {
            schemaVersion: 1,
            bootCount: 2,
            lastBootId: 'boot-two',
            lastBootAt: '2026-07-30T02:00:00.000Z',
            appliedPatchVersion: '1.0.18',
            nextPatchVersion: '1.0.19',
            updatedAt: '2026-07-30T02:00:00.000Z',
            source: 'server-start',
        });
        assert.deepEqual(await readServerBootState(statePath), second);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
