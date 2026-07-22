import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNickname } from './validators.js';

test('닉네임은 한글 초성 ㄱ-ㅎ을 허용한다', () => {
    assert.equal(validateNickname('ㄱㄴㄷ'), null);
    assert.equal(validateNickname('ㅋㅋDaclion_7'), null);
    assert.equal(validateNickname('ㅎ'), null);
});

test('닉네임은 한글 중성 및 기존 금지 문자를 허용하지 않는다', () => {
    assert.equal(validateNickname('ㅏ'), '닉네임은 한글(초성 포함), 영문, 숫자, 언더스코어만 가능합니다.');
    assert.equal(validateNickname('닉 네임'), '닉네임은 한글(초성 포함), 영문, 숫자, 언더스코어만 가능합니다.');
});
