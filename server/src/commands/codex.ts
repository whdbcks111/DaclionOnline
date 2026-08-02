import type { ChatNode } from '../../../shared/types.js';
import {
    CodexCategory,
    type CodexCategorySnapshot,
    type CodexEntrySnapshot,
} from '../models/Codex.js';
import { registerCommand } from '../modules/bot.js';
import { getCodexBonusSnapshots, type CodexBonusSnapshot } from '../modules/codex.js';
import { sendBotMessageToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';
import { chat } from '../utils/chatBuilder.js';

const CODEX_CATEGORY_COMPLETIONS = Object.freeze([
    '일반몬스터', '보스', '광물', '탐험', '요리',
]);
const ENTRY_CHUNK_SIZE = 40;

function formatPercent(ratio: number): string {
    return `${(ratio * 100).toFixed(1)}%`;
}

function formatBonus(bonus: CodexBonusSnapshot): string {
    if (!bonus.rankLabel || bonus.percent <= 0) return '미해금';
    const percent = bonus.percent.toFixed(2).replace(/\.00$/, '').replace(/0$/, '');
    return `${bonus.attributeLabels.join('·')} +${percent}%`;
}

function highestUnlockedRank(snapshot: CodexCategorySnapshot): string {
    return [...snapshot.ranks].reverse().find(rank => rank.unlocked)?.label ?? '미해금';
}

function formatEntryLine(entry: CodexEntrySnapshot, index: number): string {
    const stages = entry.stages.map(stage =>
        `${stage.label} ${stage.achieved ? '✓' : `${entry.count}/${stage.threshold}`}`);
    return `${index + 1}. ${entry.count > 0 ? entry.name : '미발견'} — ${entry.count}회 · ${stages.join(' · ')}`;
}

export function buildCodexOverviewMessage(
    categories: readonly CodexCategorySnapshot[],
    bonuses: readonly CodexBonusSnapshot[],
): ChatNode[] {
    const builder = chat()
        .weight('bold', nested => nested.text('[ 도감 ]'))
        .text('\n확정된 활동 기록으로 성장하는 전문 도감입니다.');
    for (const category of categories) {
        const bonus = bonuses.find(candidate => candidate.categoryKey === category.key);
        builder.text('\n\n')
            .weight('bold', nested => nested.text(category.label))
            .text(`  ${formatPercent(category.completionRatio)} · ${category.score}/${category.maxScore}점`)
            .text(`\n등급 ${highestUnlockedRank(category)} · ${bonus ? formatBonus(bonus) : '미해금'}`);
    }
    return builder
        .text('\n\n')
        .color('$text-tertiary', nested => nested.text('분류 상세: /도감 일반몬스터|보스|광물|탐험|요리'))
        .text('\n')
        .color('aqua', nested => nested.text('낚시는 별도 전문 도감인 /낚시도감에서 확인할 수 있습니다.'))
        .build();
}

export function buildCodexCategoryMessage(
    snapshot: CodexCategorySnapshot,
    bonus: CodexBonusSnapshot,
): ChatNode[] {
    const discovered = snapshot.entries.filter(entry => entry.count > 0).length;
    const builder = chat()
        .weight('bold', nested => nested.text(`[ ${snapshot.label} 도감 ]`))
        .text(`  발견 ${discovered}/${snapshot.entries.length}`)
        .text(`\n진척 ${formatPercent(snapshot.completionRatio)} · ${snapshot.score}/${snapshot.maxScore}점\n`)
        .progress({
            value: snapshot.completionRatio,
            length: 'min(68vw, 420px)',
            color: 'gold',
        })
        .text('\n\n')
        .weight('bold', nested => nested.text('[ 분류 등급 ]'));

    for (const rank of snapshot.ranks) {
        builder.text('\n')
            .color(
                rank.unlocked ? 'gold' : rank.currentlyEligible ? 'lime' : '$text-secondary',
                nested => nested.text(`${rank.unlocked ? '✓' : '·'} ${rank.label} — ${formatPercent(rank.unlockRatio)}`),
            );
    }
    builder.text(`\n현재 영구 보너스: ${formatBonus(bonus)}`)
        .text(`\n${snapshot.bonusDescription}`);

    if (snapshot.entries.length === 0) {
        return builder.text('\n\n등록된 엔트리가 없습니다.').build();
    }
    for (let start = 0; start < snapshot.entries.length; start += ENTRY_CHUNK_SIZE) {
        const chunk = snapshot.entries.slice(start, start + ENTRY_CHUNK_SIZE);
        const end = start + chunk.length;
        builder.text('\n\n').hide(
            `엔트리 ${start + 1}~${end}`,
            list => list.text(`\n${chunk.map((entry, offset) =>
                formatEntryLine(entry, start + offset)).join('\n')}`),
        );
    }
    return builder.build();
}

export function initCodexCommands(): void {
    registerCommand({
        name: '도감',
        aliases: ['codex', 'collectionbook'],
        description: '몬스터·보스·광물·탐험·요리 전문 도감의 진척과 영구 보너스를 확인합니다.',
        information: true,
        showCommandUse: 'private',
        args: [{
            name: '분류',
            description: '상세히 확인할 전문 도감 분류',
            list: CODEX_CATEGORY_COMPLETIONS,
            completions: CODEX_CATEGORY_COMPLETIONS.map(value => ({ value })),
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const bonuses = getCodexBonusSnapshots(player);
            const category = args[0] ? CodexCategory.fromInput(args[0]) : undefined;
            if (!category) {
                sendBotMessageToUser(userId, buildCodexOverviewMessage(
                    player.codex.getCategorySnapshots(),
                    bonuses,
                ));
                return;
            }
            const snapshot = player.codex.getCategorySnapshot(category);
            const bonus = bonuses.find(candidate => candidate.categoryKey === category.key);
            if (!snapshot || !bonus) return;
            sendBotMessageToUser(userId, buildCodexCategoryMessage(snapshot, bonus));
        },
    });
}
