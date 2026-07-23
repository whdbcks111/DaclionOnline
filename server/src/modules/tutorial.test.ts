import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getNextMainTutorialStep,
    TutorialContent,
    TutorialStep,
} from './tutorial.js';

test('튜토리얼 단계 enum은 key와 표시 입력을 해석한다', () => {
    assert.equal(TutorialStep.fromKey('skill-use'), TutorialStep.SKILL_USE);
    assert.equal(TutorialStep.fromInput('스킬 사용'), TutorialStep.SKILL_USE);
    assert.equal(TutorialContent.fromInput(' 낚 시 '), TutorialContent.FISHING);
    assert.equal(TutorialContent.fromInput('mining'), TutorialContent.MINING);
    assert.equal(TutorialStep.STATUS.acceptsCommand('상태창'), true);
    assert.equal(TutorialStep.STATUS.acceptsCommand('스테이터스'), false);
});

test('주요 튜토리얼 단계는 콘텐츠 선택까지 순서대로 이어진다', () => {
    const visited: TutorialStep[] = [];
    let current: TutorialStep | undefined = TutorialStep.WELCOME;
    while (current) {
        visited.push(current);
        current = getNextMainTutorialStep(current);
    }

    assert.equal(visited[0], TutorialStep.WELCOME);
    assert.ok(visited.includes(TutorialStep.INTERACT));
    assert.ok(visited.includes(TutorialStep.SHOP));
    assert.ok(visited.includes(TutorialStep.SKILL_USE));
    assert.equal(visited.at(-1), TutorialStep.CONTENT_CHOICE);
    assert.equal(new Set(visited).size, visited.length);
});
