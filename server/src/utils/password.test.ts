import assert from 'node:assert/strict';
import test from 'node:test';
import { derivePasswordHash, verifyPasswordHash } from './password.js';

test('비동기 비밀번호 해싱은 기존 PBKDF2 저장 문자열과 검증 호환된다', async () => {
    const salt = '0123456789abcdef'.repeat(4);
    const hash = await derivePasswordHash('correct horse battery staple', salt);
    assert.equal(hash.length, 128);
    assert.equal(await verifyPasswordHash('correct horse battery staple', salt, hash), true);
    assert.equal(await verifyPasswordHash('wrong password', salt, hash), false);
});
