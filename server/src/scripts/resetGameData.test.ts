import assert from 'node:assert/strict';
import test from 'node:test';
import {
    GAME_DATA_RESET_CONFIRMATION,
    parseGameDataResetArguments,
} from './resetGameData.js';

test('운영 데이터 초기화는 기본값과 dry-run에서 실행되지 않는다', () => {
    assert.deepEqual(parseGameDataResetArguments([]), { execute: false });
    assert.deepEqual(parseGameDataResetArguments(['--dry-run']), { execute: false });
});

test('정확한 확인 문자열만 운영 데이터 초기화를 허용한다', () => {
    assert.deepEqual(
        parseGameDataResetArguments(['--confirm', GAME_DATA_RESET_CONFIRMATION]),
        { execute: true },
    );
    assert.deepEqual(
        parseGameDataResetArguments([`--confirm=${GAME_DATA_RESET_CONFIRMATION}`]),
        { execute: true },
    );
    assert.throws(
        () => parseGameDataResetArguments(['--confirm', 'RESET']),
        /확인 문자열/,
    );
    assert.throws(
        () => parseGameDataResetArguments(['--force']),
        /알 수 없는 인자/,
    );
});
