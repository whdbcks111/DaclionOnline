import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { publishClient } from './publish.mjs';
test('반영 시 이전 진입 파일을 보존하고 새 HTML을 마지막에 바꾼다', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gamebox-publish-'));
  try {
    const stage = join(root, 'stage'), dist = join(root, 'dist');
    await mkdir(join(stage, 'assets'), { recursive: true }); await mkdir(join(dist, 'assets'), { recursive: true });
    await writeFile(join(dist, 'index.html'), 'old'); await writeFile(join(dist, 'assets/old.js'), 'old code');
    await writeFile(join(stage, 'index.html'), '<script src="/assets/new.js"></script>');
    await assert.rejects(publishClient(stage, dist));
    assert.equal(await readFile(join(dist, 'index.html'), 'utf8'), 'old');
    await writeFile(join(stage, 'assets/new.js'), 'new code'); await publishClient(stage, dist);
    assert.equal(await readFile(join(dist, 'assets/old.js'), 'utf8'), 'old code');
    assert.equal(await readFile(join(dist, 'assets/new.js'), 'utf8'), 'new code');
    assert.match(await readFile(join(dist, 'index.html'), 'utf8'), /new.js/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
