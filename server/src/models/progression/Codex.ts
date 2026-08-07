import { defineProgress, ProgressType } from './Progress.js';
import type { PlayerProgress } from './Progress.js';

export type CodexCategoryKey = 'monster' | 'boss' | 'ore' | 'exploration' | 'cooking';

function normalizeEnumInput(value: string): string {
    return value.trim().toLocaleLowerCase().replace(/[\s·_-]+/g, '');
}

/** 도감 분류 key와 한국어 입력·영구 보너스 안내를 함께 소유한다. */
export class CodexCategory {
    private static readonly all: CodexCategory[] = [];

    static readonly MONSTER = new CodexCategory(
        'monster', '몬스터', '공격력·마법력 영구 보너스',
        ['몬스터도감', '일반몬스터', '몹'],
    );
    static readonly BOSS = new CodexCategory(
        'boss', '보스', '공격력·마법력 영구 보너스',
        ['보스도감', '우두머리'],
    );
    static readonly ORE = new CodexCategory(
        'ore', '광물', '방어력·마법 방어력 영구 보너스',
        ['광물도감', '광석', '채광'],
    );
    static readonly EXPLORATION = new CodexCategory(
        'exploration', '지역 탐험', '이동속도 영구 보너스',
        ['지역탐험도감', '탐험', '지역'],
    );
    static readonly COOKING = new CodexCategory(
        'cooking', '음식·요리', '최대 생명력·최대 정신력 영구 보너스',
        ['음식요리도감', '음식', '요리'],
    );

    readonly aliases: readonly string[];

    private constructor(
        readonly key: CodexCategoryKey,
        readonly label: string,
        readonly bonusDescription: string,
        aliases: readonly string[],
    ) {
        this.aliases = Object.freeze([...aliases]);
        CodexCategory.all.push(this);
        Object.freeze(this);
    }

    static values(): readonly CodexCategory[] {
        return Object.freeze([...CodexCategory.all]);
    }

    static fromKey(key: string): CodexCategory | undefined {
        const normalized = key.trim().toLowerCase();
        return CodexCategory.all.find(category => category.key === normalized);
    }

    static fromInput(input: string): CodexCategory | undefined {
        const normalized = normalizeEnumInput(input);
        return CodexCategory.all.find(category => [
            category.key,
            category.label,
            `${category.label}도감`,
            ...category.aliases,
        ].some(value => normalizeEnumInput(value) === normalized));
    }
}

export type CodexRankKey = 'bronze' | 'silver' | 'gold';

/** 엔트리 점수와 카테고리 영구 해금 비율을 함께 소유하는 도감 단계. */
export class CodexRank {
    private static readonly all: CodexRank[] = [];

    static readonly BRONZE = new CodexRank('bronze', '동', 1, 0.10, ['동급', '브론즈']);
    static readonly SILVER = new CodexRank('silver', '은', 2, 0.35, ['은급', '실버']);
    static readonly GOLD = new CodexRank('gold', '금', 3, 0.70, ['금급', '골드']);

    readonly aliases: readonly string[];

    private constructor(
        readonly key: CodexRankKey,
        readonly label: string,
        readonly score: number,
        readonly unlockRatio: number,
        aliases: readonly string[],
    ) {
        this.aliases = Object.freeze([...aliases]);
        CodexRank.all.push(this);
        Object.freeze(this);
    }

    static values(): readonly CodexRank[] {
        return Object.freeze([...CodexRank.all]);
    }

    static fromKey(key: string): CodexRank | undefined {
        const normalized = key.trim().toLowerCase();
        return CodexRank.all.find(rank => rank.key === normalized);
    }

    static fromInput(input: string): CodexRank | undefined {
        const normalized = normalizeEnumInput(input);
        return CodexRank.all.find(rank => [rank.key, rank.label, ...rank.aliases]
            .some(value => normalizeEnumInput(value) === normalized));
    }
}

export interface CodexEntryThresholds {
    readonly bronze: number;
    readonly silver: number;
    readonly gold: number;
}

export interface CodexEntryDefinition {
    readonly id: string;
    readonly category: CodexCategory;
    readonly name: string;
    readonly thresholds: CodexEntryThresholds;
}

export interface CodexEntryStageSnapshot {
    readonly key: CodexRankKey;
    readonly label: string;
    readonly score: number;
    readonly threshold: number;
    readonly achieved: boolean;
}

export interface CodexEntrySnapshot {
    readonly id: string;
    readonly categoryKey: CodexCategoryKey;
    readonly categoryLabel: string;
    readonly name: string;
    readonly count: number;
    readonly score: number;
    readonly rankKey?: CodexRankKey;
    readonly rankLabel?: string;
    readonly stages: readonly CodexEntryStageSnapshot[];
}

export interface CodexCategoryRankSnapshot {
    readonly key: CodexRankKey;
    readonly label: string;
    readonly score: number;
    readonly unlockRatio: number;
    readonly unlocked: boolean;
    readonly currentlyEligible: boolean;
}

export interface CodexCategorySnapshot {
    readonly key: CodexCategoryKey;
    readonly label: string;
    readonly bonusDescription: string;
    readonly score: number;
    readonly maxScore: number;
    readonly completionRatio: number;
    readonly ranks: readonly CodexCategoryRankSnapshot[];
    readonly entries: readonly CodexEntrySnapshot[];
}

export type CodexRecordResult =
    | {
        readonly recorded: true;
        readonly entry: CodexEntrySnapshot;
        readonly category: CodexCategorySnapshot;
        readonly newlyUnlockedRanks: readonly CodexRank[];
    }
    | {
        readonly recorded: false;
        readonly reason: 'missing';
        readonly newlyUnlockedRanks: readonly CodexRank[];
    };

const codexEntryRegistry = new Map<string, Readonly<CodexEntryDefinition>>();
let codexRegistryFrozen = false;

const CODEX_ENTRY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*:[a-z0-9][a-z0-9/:._-]*$/;

/**
 * 도감 id는 `category:source-id` 형태다. source-id 자체가 namespace id일 수 있어
 * `cooking:cuisine:grilled-fish`처럼 두 번째 콜론부터는 경로 문자로 허용한다.
 */
function normalizeCodexEntryId(entryId: string): string {
    const normalized = entryId.trim().toLowerCase();
    if (!CODEX_ENTRY_ID_PATTERN.test(normalized)) {
        throw new Error(`Invalid codex entry id: ${entryId}`);
    }
    return normalized;
}

/** source master id를 도감 분류 namespace 아래의 충돌 없는 표준 entry id로 조합한다. */
export function createCodexEntryId(category: CodexCategory, sourceId: string): string {
    if (!CodexCategory.values().includes(category)) {
        throw new Error('Invalid codex category');
    }
    const normalizedSourceId = sourceId.trim().toLowerCase().replaceAll(':', '/');
    return normalizeCodexEntryId(`${category.key}:${normalizedSourceId}`);
}

function entryProgressId(entryId: string): string {
    const normalized = normalizeCodexEntryId(entryId);
    const separator = normalized.indexOf(':');
    const namespace = normalized.slice(0, separator);
    // `_`를 먼저 escape하면 source id의 추가 `:`도 tag-safe하고 충돌 없이 보존된다.
    const path = normalized.slice(separator + 1)
        .replaceAll('_', '__')
        .replaceAll(':', '_c');
    return `codex-entry:${namespace}/${path}`;
}

function rankProgressId(category: CodexCategory, rank: CodexRank): string {
    return `codex-rank:${category.key}/${rank.key}`;
}

function registerCategoryRankProgress(): void {
    for (const category of CodexCategory.values()) {
        for (const rank of CodexRank.values()) {
            defineProgress({
                id: rankProgressId(category, rank),
                type: ProgressType.FLAG,
                label: `${category.label} 도감 ${rank.label} 등급`,
                description: `${category.label} 도감 ${rank.label} 등급 영구 해금 여부입니다.`,
                visible: false,
                tags: ['codex:rank', `codex-category:${category.key}`],
            });
        }
    }
}

registerCategoryRankProgress();

function normalizeThreshold(value: number, label: string, entryId: string): number {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`Invalid codex ${label} threshold: ${entryId}/${value}`);
    }
    return value;
}

function normalizeCodexEntry(data: CodexEntryDefinition): Readonly<CodexEntryDefinition> {
    const id = normalizeCodexEntryId(data.id);
    if (!CodexCategory.values().includes(data.category)) {
        throw new Error(`Invalid codex category: ${id}`);
    }
    if (!id.startsWith(`${data.category.key}:`)) {
        throw new Error(`Codex entry id must use its category namespace: ${id}`);
    }
    const name = data.name.trim();
    if (!name) throw new Error(`Codex entry name must not be empty: ${id}`);
    const thresholds = {
        bronze: normalizeThreshold(data.thresholds.bronze, 'bronze', id),
        silver: normalizeThreshold(data.thresholds.silver, 'silver', id),
        gold: normalizeThreshold(data.thresholds.gold, 'gold', id),
    };
    if (thresholds.bronze > thresholds.silver || thresholds.silver > thresholds.gold) {
        throw new Error(`Codex thresholds must be non-decreasing: ${id}`);
    }
    return Object.freeze({
        id,
        category: data.category,
        name,
        thresholds: Object.freeze(thresholds),
    });
}

function validateUniqueEntries(entries: readonly Readonly<CodexEntryDefinition>[]): void {
    const ids = new Set<string>();
    for (const entry of entries) {
        if (ids.has(entry.id)) throw new Error(`Duplicate codex entry: ${entry.id}`);
        ids.add(entry.id);
    }
}

function registerEntryProgress(entry: Readonly<CodexEntryDefinition>): void {
    defineProgress({
        id: entryProgressId(entry.id),
        type: ProgressType.COUNTER,
        label: `${entry.name} 도감 진행`,
        description: `${entry.name} 도감 기록 횟수입니다.`,
        visible: false,
        tags: ['codex:entry', `codex-category:${entry.category.key}`],
    });
}

export function defineCodexEntry(data: CodexEntryDefinition): Readonly<CodexEntryDefinition> {
    if (codexRegistryFrozen) throw new Error('Codex registry is frozen');
    const entry = normalizeCodexEntry(data);
    validateUniqueEntries([...codexEntryRegistry.values(), entry]);
    codexEntryRegistry.set(entry.id, entry);
    registerEntryProgress(entry);
    return entry;
}

/** 운영 초기화가 끝난 뒤 실수로 마스터 데이터가 바뀌지 않게 등록 경계를 잠근다. */
export function freezeCodexRegistry(): void {
    codexRegistryFrozen = true;
}

export function isCodexRegistryFrozen(): boolean {
    return codexRegistryFrozen;
}

/** 전체 정의를 먼저 검증한 뒤 원자적으로 교체한다. 테스트와 마스터 데이터 재초기화가 공유한다. */
export function reloadCodexRegistry(
    definitions: readonly CodexEntryDefinition[],
    freeze = true,
): void {
    const entries = definitions.map(normalizeCodexEntry);
    validateUniqueEntries(entries);
    codexEntryRegistry.clear();
    for (const entry of entries) {
        codexEntryRegistry.set(entry.id, entry);
        registerEntryProgress(entry);
    }
    codexRegistryFrozen = freeze;
}

export function getCodexEntry(id: string): Readonly<CodexEntryDefinition> | undefined {
    try {
        return codexEntryRegistry.get(normalizeCodexEntryId(id));
    } catch {
        return undefined;
    }
}

export function getAllCodexEntries(
    category?: CodexCategory | string,
): readonly Readonly<CodexEntryDefinition>[] {
    const resolved = typeof category === 'string' ? CodexCategory.fromInput(category) : category;
    if (category !== undefined && !resolved) return Object.freeze([]);
    return Object.freeze([...codexEntryRegistry.values()]
        .filter(entry => !resolved || entry.category === resolved));
}

function getThreshold(entry: Readonly<CodexEntryDefinition>, rank: CodexRank): number {
    return entry.thresholds[rank.key];
}

function getEntryRank(entry: Readonly<CodexEntryDefinition>, count: number): CodexRank | undefined {
    let achieved: CodexRank | undefined;
    for (const rank of CodexRank.values()) {
        if (count >= getThreshold(entry, rank)) achieved = rank;
    }
    return achieved;
}

export default class CodexBook {
    constructor(private readonly progress: PlayerProgress) {}

    record(entryId: string, amount = 1): CodexRecordResult {
        if (!Number.isSafeInteger(amount) || amount < 0) {
            throw new Error(`Codex record amount must be a non-negative safe integer: ${amount}`);
        }
        const entry = getCodexEntry(entryId);
        if (!entry) {
            return Object.freeze({
                recorded: false,
                reason: 'missing',
                newlyUnlockedRanks: Object.freeze([]),
            });
        }
        const progressId = entryProgressId(entry.id);
        if (amount > 0) {
            const current = this.progress.getCounterNumber(progressId);
            const next = current + amount;
            if (!Number.isSafeInteger(next)) {
                throw new Error(`Codex entry count exceeds safe number range: ${entry.id}`);
            }
            const shouldClampExploration = entry.category === CodexCategory.EXPLORATION
                && entry.thresholds.bronze === 1
                && entry.thresholds.silver === 1
                && entry.thresholds.gold === 1;
            this.progress.setCounter(progressId, shouldClampExploration ? Math.min(next, 1) : next);
        }
        const newlyUnlockedRanks = amount > 0
            ? this.unlockEligibleRanks(entry.category)
            : [];
        return Object.freeze({
            recorded: true,
            entry: this.createEntrySnapshot(entry),
            category: this.createCategorySnapshot(entry.category),
            newlyUnlockedRanks: Object.freeze(newlyUnlockedRanks),
        });
    }

    isRankUnlocked(category: CodexCategory | string, rank: CodexRank | string): boolean {
        const resolvedCategory = typeof category === 'string' ? CodexCategory.fromInput(category) : category;
        const resolvedRank = typeof rank === 'string' ? CodexRank.fromInput(rank) : rank;
        return Boolean(resolvedCategory && resolvedRank
            && this.progress.getFlag(rankProgressId(resolvedCategory, resolvedRank)));
    }

    getEntrySnapshot(entryId: string): CodexEntrySnapshot | undefined {
        const entry = getCodexEntry(entryId);
        return entry ? this.createEntrySnapshot(entry) : undefined;
    }

    getEntrySnapshots(category?: CodexCategory | string): readonly CodexEntrySnapshot[] {
        return Object.freeze(getAllCodexEntries(category).map(entry => this.createEntrySnapshot(entry)));
    }

    getCategorySnapshot(category: CodexCategory | string): CodexCategorySnapshot | undefined {
        const resolved = typeof category === 'string' ? CodexCategory.fromInput(category) : category;
        return resolved ? this.createCategorySnapshot(resolved) : undefined;
    }

    getCategorySnapshots(): readonly CodexCategorySnapshot[] {
        return Object.freeze(CodexCategory.values().map(category => this.createCategorySnapshot(category)));
    }

    private createEntrySnapshot(entry: Readonly<CodexEntryDefinition>): CodexEntrySnapshot {
        const count = this.progress.getCounterNumber(entryProgressId(entry.id));
        const rank = getEntryRank(entry, count);
        const stages = CodexRank.values().map(candidate => Object.freeze({
            key: candidate.key,
            label: candidate.label,
            score: candidate.score,
            threshold: getThreshold(entry, candidate),
            achieved: count >= getThreshold(entry, candidate),
        }));
        return Object.freeze({
            id: entry.id,
            categoryKey: entry.category.key,
            categoryLabel: entry.category.label,
            name: entry.name,
            count,
            score: rank?.score ?? 0,
            ...(rank ? { rankKey: rank.key, rankLabel: rank.label } : {}),
            stages: Object.freeze(stages),
        });
    }

    private createCategorySnapshot(category: CodexCategory): CodexCategorySnapshot {
        const entries = this.getEntrySnapshots(category);
        const score = entries.reduce((sum, entry) => sum + entry.score, 0);
        const maxScore = entries.length * CodexRank.GOLD.score;
        const completionRatio = maxScore > 0 ? score / maxScore : 0;
        const ranks = CodexRank.values().map(rank => Object.freeze({
            key: rank.key,
            label: rank.label,
            score: rank.score,
            unlockRatio: rank.unlockRatio,
            unlocked: this.isRankUnlocked(category, rank),
            currentlyEligible: completionRatio >= rank.unlockRatio,
        }));
        return Object.freeze({
            key: category.key,
            label: category.label,
            bonusDescription: category.bonusDescription,
            score,
            maxScore,
            completionRatio,
            ranks: Object.freeze(ranks),
            entries,
        });
    }

    private unlockEligibleRanks(category: CodexCategory): CodexRank[] {
        const snapshot = this.createCategorySnapshot(category);
        const newlyUnlocked: CodexRank[] = [];
        for (const rank of CodexRank.values()) {
            if (snapshot.completionRatio < rank.unlockRatio || this.isRankUnlocked(category, rank)) continue;
            this.progress.setFlag(rankProgressId(category, rank));
            newlyUnlocked.push(rank);
        }
        return newlyUnlocked;
    }
}
