import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatNode } from '../../../../shared/types.js';
import CodexBook, {
    CodexCategory,
    reloadCodexRegistry,
    type CodexCategorySnapshot,
} from '../../models/progression/Codex.js';
import { PlayerProgress } from '../../models/progression/Progress.js';
import { getCommandList } from '../../modules/communication/bot.js';
import type { CodexBonusSnapshot } from '../../modules/world/codex.js';
import {
    buildCodexCategoryMessage,
    buildCodexOverviewMessage,
    initCodexCommands,
} from './codex.js';

function collectText(nodes: readonly ChatNode[]): string {
    return nodes.map(node => {
        const own = node.type === 'text' ? node.text : '';
        const children = 'children' in node && node.children ? collectText(node.children) : '';
        return own + children;
    }).join('');
}

function bonus(category: CodexCategory, rankLabel?: string): CodexBonusSnapshot {
    return {
        categoryKey: category.key,
        categoryLabel: category.label,
        source: `codex:${category.key}`,
        ...(rankLabel ? { rankKey: 'bronze' as const, rankLabel } : {}),
        ratio: rankLabel ? 0.0025 : 0,
        percent: rankLabel ? 0.25 : 0,
        attributeLabels: category === CodexCategory.EXPLORATION
            ? ['이동속도']
            : ['공격력', '마법력'],
    };
}

function createSnapshots(): {
    categories: readonly CodexCategorySnapshot[];
    bonuses: readonly CodexBonusSnapshot[];
} {
    reloadCodexRegistry([
        {
            id: 'monster:known',
            category: CodexCategory.MONSTER,
            name: '알려진 몬스터',
            thresholds: { bronze: 1, silver: 5, gold: 20 },
        },
        {
            id: 'monster:secret',
            category: CodexCategory.MONSTER,
            name: '숨겨야 할 몬스터 이름',
            thresholds: { bronze: 10, silver: 50, gold: 200 },
        },
    ]);
    const book = new CodexBook(PlayerProgress.createEmpty(84_001));
    book.record('monster:known');
    return {
        categories: book.getCategorySnapshots(),
        bonuses: CodexCategory.values().map(category => bonus(
            category,
            category === CodexCategory.MONSTER ? '동' : undefined,
        )),
    };
}

test.after(() => { reloadCodexRegistry([], false); });

test('도감 요약은 다섯 분류의 진척·등급·보너스와 별도 낚시도감 안내를 표시한다', () => {
    const { categories, bonuses } = createSnapshots();
    const text = collectText(buildCodexOverviewMessage(categories, bonuses));

    for (const category of CodexCategory.values()) assert.match(text, new RegExp(category.label));
    assert.match(text, /등급 동/);
    assert.match(text, /공격력·마법력 \+0\.25%/);
    assert.match(text, /\/낚시도감/);
});

test('분류 상세는 발견한 이름만 노출하고 현재 횟수·동은금 목표를 접이식 구간으로 표시한다', () => {
    const { categories, bonuses } = createSnapshots();
    const snapshot = categories.find(category => category.key === 'monster')!;
    const nodes = buildCodexCategoryMessage(snapshot, bonuses[0]!);
    const text = collectText(nodes);

    assert.match(text, /알려진 몬스터 — 1회/);
    assert.doesNotMatch(text, /숨겨야 할 몬스터 이름/);
    assert.match(text, /미발견 — 0회/);
    assert.match(text, /동 ✓ · 은 1\/5 · 금 1\/20/);
    assert.match(text, /동 0\/10 · 은 0\/50 · 금 0\/200/);
    assert.equal(nodes.filter(node => node.type === 'hide').length, 1);
});

test('긴 엔트리 목록은 40개 단위 접이식 구간으로 나누고 명령 API는 고정 분류를 제시한다', () => {
    reloadCodexRegistry(Array.from({ length: 81 }, (_, index) => ({
        id: `ore:long_${index}`,
        category: CodexCategory.ORE,
        name: `긴 광맥 ${index}`,
        thresholds: { bronze: 5, silver: 25, gold: 100 },
    })));
    const snapshot = new CodexBook(PlayerProgress.createEmpty(84_002))
        .getCategorySnapshot(CodexCategory.ORE)!;
    const nodes = buildCodexCategoryMessage(snapshot, bonus(CodexCategory.ORE));
    assert.deepEqual(
        nodes.filter((node): node is Extract<ChatNode, { type: 'hide' }> => node.type === 'hide')
            .map(node => node.title),
        ['엔트리 1~40', '엔트리 41~80', '엔트리 81~81'],
    );

    initCodexCommands();
    const command = getCommandList().find(candidate => candidate.name === '도감');
    assert.ok(command);
    assert.deepEqual(command.args?.[0]?.completions, [
        '일반몬스터', '보스', '광물', '탐험', '요리',
    ].map(value => ({ value })));
});
