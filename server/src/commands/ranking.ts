import { registerCommand } from '../modules/bot.js';
import { sendBotMessageToUser, sendNotificationToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';
import { getRankingEntries, type RankingEntrySnapshot } from '../modules/ranking.js';
import { RankingCategory } from '../models/Ranking.js';
import { chat } from '../utils/chatBuilder.js';
import logger from '../utils/logger.js';

const RANK_LIMIT = 20;
const RANK_WIDTH = 75;
const NAME_WIDTH = 180;
const VALUE_WIDTH = 125;

const categoryCompletions = RankingCategory.values().map(category => ({
    value: category.label,
    description: `${category.label} 순위`,
}));

function rankColor(rank: number): string | undefined {
    if (rank === 1) return '#f5c451';
    if (rank === 2) return '#cbd5e1';
    if (rank === 3) return '#cd7f52';
    if (rank === 4) return '#60a5fa';
    if (rank === 5) return '#a78bfa';
    return undefined;
}

function appendRankingRow(
    builder: ReturnType<typeof chat>,
    category: RankingCategory,
    entry: RankingEntrySnapshot,
): void {
    const append = (row: ReturnType<typeof chat>) => row
        .tab(RANK_WIDTH, cell => cell.text(`${entry.rank === 1 ? '👑 ' : ''}${entry.rank}위`))
        .tab(NAME_WIDTH, cell => cell.text(entry.nickname))
        .tab(VALUE_WIDTH, cell => cell.text(entry.valuePublic ? category.format(entry.value) : '?'))
        .text('\n');
    const color = rankColor(entry.rank);
    if (color) builder.color(color, append);
    else append(builder);
}

function resolveCategory(input?: string): RankingCategory | undefined {
    return input ? RankingCategory.fromInput(input) : RankingCategory.LEVEL;
}

function registerVisibilityCommand(isPublic: boolean): void {
    registerCommand({
        name: isPublic ? '순위공개' : '순위비공개',
        aliases: isPublic ? ['rankpublic'] : ['rankprivate'],
        description: `전체 또는 특정 순위 카테고리의 수치를 ${isPublic ? '공개' : '비공개'}합니다.`,
        showCommandUse: 'private',
        args: [{
            name: '카테고리',
            description: '생략하면 전체 순위 공개 설정을 변경합니다.',
            completions: categoryCompletions,
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const category = args[0] ? RankingCategory.fromInput(args[0]) : undefined;
            if (args[0] && !category) {
                sendBotMessageToUser(userId, '존재하지 않는 순위 카테고리입니다. /순위공개정보에서 목록을 확인해주세요.');
                return;
            }
            if (category) player.rankingVisibility.setCategory(category, isPublic);
            else player.rankingVisibility.setAll(isPublic);
            sendNotificationToUser(userId, {
                key: `ranking-visibility:${category?.key ?? 'all'}`,
                message: `${category?.label ?? '전체 순위'} 수치가 ${isPublic ? '공개' : '비공개'}로 설정되었습니다.`,
                length: 2500,
            });
        },
    });
}

export function initRankingCommands(): void {
    registerCommand({
        name: '순위',
        aliases: ['rank', 'ranking', 'rk'],
        description: '레벨·골드·스탯·능력치별 전체 플레이어 순위를 확인합니다.',
        information: true,
        args: [{
            name: '카테고리',
            description: '생략하면 레벨 순위를 표시합니다.',
            completions: categoryCompletions,
        }],
        async handler(userId, args) {
            const category = resolveCategory(args[0]);
            if (!category) {
                sendBotMessageToUser(userId, '존재하지 않는 순위 카테고리입니다.');
                return;
            }
            try {
                const entries = await getRankingEntries(category);
                const builder = chat()
                    .text(`[ 순위 · ${category.label} ]\n`)
                    .tab(RANK_WIDTH, cell => cell.weight('bold', text => text.text('순위')))
                    .tab(NAME_WIDTH, cell => cell.weight('bold', text => text.text('플레이어')))
                    .tab(VALUE_WIDTH, cell => cell.weight('bold', text => text.text('수치')))
                    .text('\n')
                    .divider();
                for (const entry of entries.slice(0, RANK_LIMIT)) appendRankingRow(builder, category, entry);
                const own = entries.find(entry => entry.userId === userId);
                if (own && !entries.slice(0, RANK_LIMIT).includes(own)) {
                    builder.divider('내 순위');
                    appendRankingRow(builder, category, own);
                }
                if (entries.length === 0) builder.color('gray', row => row.text('표시할 플레이어가 없습니다.'));
                sendBotMessageToUser(userId, builder.build());
            } catch (error) {
                logger.error('순위 조회 실패', error);
                sendBotMessageToUser(userId, '순위를 불러오는 중 오류가 발생했습니다.');
            }
        },
    });

    registerVisibilityCommand(false);
    registerVisibilityCommand(true);

    registerCommand({
        name: '순위공개정보',
        aliases: ['rankvisibility'],
        description: '자신의 전체 순위 공개 기준과 카테고리별 예외를 확인합니다.',
        information: true,
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const snapshot = player.rankingVisibility.snapshot();
            const builder = chat()
                .text('[ 순위 공개 정보 ]\n')
                .weight('bold', text => text.text('전체 기본 설정'))
                .text(`  ${snapshot.defaultPublic ? '공개' : '비공개'}\n`)
                .divider('카테고리별 예외');
            const overrides = RankingCategory.values().filter(category => category.key in snapshot.overrides);
            if (overrides.length === 0) {
                builder.color('gray', text => text.text('(별도 설정 없음)'));
            } else {
                for (const category of overrides) {
                    builder
                        .tab(NAME_WIDTH, cell => cell.text(category.label))
                        .color(snapshot.overrides[category.key] ? '#60a5fa' : '#ef6464', value =>
                            value.text(snapshot.overrides[category.key] ? '공개' : '비공개'))
                        .text('\n');
                }
            }
            sendBotMessageToUser(userId, builder.build());
        },
    });
}
