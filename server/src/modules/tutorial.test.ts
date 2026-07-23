import assert from 'node:assert/strict';
import test from 'node:test';
import {
    doesTutorialEventCompleteStep,
    getNextMainTutorialStep,
    TutorialContent,
    TutorialStep,
} from './tutorial.js';
import { GameEventIds } from '../models/GameEvent.js';

test('튜토리얼 단계 enum은 key와 표시 입력을 해석한다', () => {
    assert.equal(TutorialStep.fromKey('skill-use'), TutorialStep.SKILL_USE);
    assert.equal(TutorialStep.fromInput('강타 사용'), TutorialStep.SKILL_USE);
    assert.equal(TutorialContent.fromInput(' 낚 시 '), TutorialContent.FISHING);
    assert.equal(TutorialContent.fromInput('mining'), TutorialContent.MINING);
    assert.equal(TutorialStep.STATUS.acceptsCommand('상태창'), true);
    assert.equal(TutorialStep.STATUS.acceptsCommand('스테이터스'), false);
});

test('행동 실습은 명령 호출이 아니라 올바른 실제 게임 결과로만 완료된다', () => {
    assert.equal(TutorialStep.MOVE.acceptsCommand('이동'), false);
    assert.equal(TutorialStep.INTERACT.acceptsCommand('상호작용'), false);
    assert.equal(TutorialStep.TARGET.acceptsCommand('대상지정'), false);

    assert.equal(doesTutorialEventCompleteStep(TutorialStep.MOVE, {
        id: GameEventIds.LOCATION_CHANGED,
        toLocationId: 'luminous_pond',
    }), true);
    assert.equal(doesTutorialEventCompleteStep(TutorialStep.MOVE, {
        id: GameEventIds.LOCATION_CHANGED,
        toLocationId: 'field',
    }), false);
    assert.equal(doesTutorialEventCompleteStep(TutorialStep.INTERACT, {
        id: GameEventIds.RESOURCE_INTERACTED,
        resourceDataId: 'treasure_chest',
    }), false);
    assert.equal(doesTutorialEventCompleteStep(TutorialStep.INTERACT, {
        id: GameEventIds.RESOURCE_INTERACTED,
        resourceDataId: 'tutorial_training_dummy',
    }), true);
    assert.equal(doesTutorialEventCompleteStep(TutorialStep.USE, {
        id: GameEventIds.ITEM_USED,
        itemDataId: 'mana_potion',
    }), false);
    assert.equal(doesTutorialEventCompleteStep(TutorialStep.USE, {
        id: GameEventIds.ITEM_USED,
        itemDataId: 'health_potion',
    }), true);
});

test('주요 튜토리얼 단계는 콘텐츠 선택까지 순서대로 이어진다', () => {
    const visited: TutorialStep[] = [];
    let current: TutorialStep | undefined = TutorialStep.WELCOME;
    while (current) {
        visited.push(current);
        current = getNextMainTutorialStep(current);
    }

    assert.equal(visited[0], TutorialStep.WELCOME);
    assert.ok(visited.indexOf(TutorialStep.NPC) < visited.indexOf(TutorialStep.MOVE));
    assert.ok(visited.indexOf(TutorialStep.SHOP) < visited.indexOf(TutorialStep.MOVE_FIELD));
    assert.ok(visited.includes(TutorialStep.INTERACT));
    assert.ok(visited.includes(TutorialStep.SHOP));
    assert.ok(visited.includes(TutorialStep.SKILL_USE));
    assert.equal(visited.at(-1), TutorialStep.CONTENT_CHOICE);
    assert.equal(new Set(visited).size, visited.length);
});
