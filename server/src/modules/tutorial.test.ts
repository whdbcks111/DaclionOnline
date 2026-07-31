import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import {
    acknowledgeTutorialStep,
    buildTutorialCard,
    doesTutorialEventCompleteStep,
    getNextMainTutorialStep,
    TutorialContent,
    TutorialProgressIds,
    TutorialStep,
} from './tutorial.js';
import { GameEventIds } from '../models/GameEvent.js';
import type Player from '../models/Player.js';
import type { ChatNode } from '../../../shared/types.js';
import { clearGameTasks, hasGameTask, updateGameScheduler } from './scheduler.js';

afterEach(clearGameTasks);

function containsButton(nodes: readonly ChatNode[]): boolean {
    return nodes.some(node => {
        if (node.type === 'button') return true;
        if (node.type === 'tooltip') {
            return containsButton(node.description) || containsButton(node.children);
        }
        return 'children' in node && containsButton(node.children);
    });
}

test('튜토리얼 안내 카드는 모든 단계에서 명령 실행 버튼을 제공하지 않는다', () => {
    const player = {
        locationId: 'tutorial-card-test',
        currentTarget: undefined,
    } as unknown as Player;

    for (const step of TutorialStep.values()) {
        const card = buildTutorialCard(player, {
            status: 'active',
            step,
            completedContents: [],
        });
        assert.equal(containsButton(card), false, `${step.label} 카드에 실행 버튼이 남아 있습니다.`);
    }
});

test('단계 완료는 다음 안내를 1초 뒤 실행할 scheduler 작업으로 예약한다', () => {
    const states = new Map<string, string>([
        [TutorialProgressIds.STATUS, 'active'],
        [TutorialProgressIds.STEP, TutorialStep.WELCOME.key],
    ]);
    const player = {
        userId: 91_001,
        progress: {
            getState: (key: string) => states.get(key) ?? '',
            setState: (key: string, value: string) => states.set(key, value),
        },
        skills: { grant: () => undefined },
    } as unknown as Player;

    assert.equal(acknowledgeTutorialStep(player), true);
    assert.equal(states.get(TutorialProgressIds.STEP), TutorialStep.STATUS.key);
    const taskKey = `tutorial:step-message:${player.userId}`;
    assert.equal(hasGameTask(taskKey), true);
    updateGameScheduler(0.99);
    assert.equal(hasGameTask(taskKey), true);
    updateGameScheduler(0.011);
    assert.equal(hasGameTask(taskKey), false);
});

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
    assert.equal(doesTutorialEventCompleteStep(TutorialStep.CONTENT_FISHING, {
        id: GameEventIds.FISH_CAUGHT,
    }), true);
    assert.equal(doesTutorialEventCompleteStep(TutorialStep.CONTENT_MINING, {
        id: GameEventIds.RESOURCE_DESTROYED,
        isOreResource: false,
    }), false);
    assert.equal(doesTutorialEventCompleteStep(TutorialStep.CONTENT_MINING, {
        id: GameEventIds.RESOURCE_DESTROYED,
        isOreResource: true,
    }), true);
    assert.equal(doesTutorialEventCompleteStep(TutorialStep.CONTENT_HUNTING, {
        id: GameEventIds.ENTITY_DEFEATED,
        isMonster: true,
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
