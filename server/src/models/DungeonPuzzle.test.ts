import assert from 'node:assert/strict';
import test from 'node:test';
import { isCorrectPuzzleAnswer } from './DungeonPuzzle.js';

test('질문 퍼즐 정답은 공백·문장부호·대소문자 차이를 무시한다', () => {
    const puzzle = { answers: ['나무의 뿌리', 'ROOT'] };
    assert.equal(isCorrectPuzzleAnswer(puzzle, '나무의-뿌리!'), true);
    assert.equal(isCorrectPuzzleAnswer(puzzle, ' root '), true);
    assert.equal(isCorrectPuzzleAnswer(puzzle, '그림자'), false);
});
