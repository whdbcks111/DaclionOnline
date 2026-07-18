import Attribute, { AttributeType, type AttributeRecord } from './Attribute.js';
import Stat, { StatType, type StatRecord } from './Stat.js';

export interface RankingMetricSource {
    level: number;
    gold: number;
    stat: Pick<Stat, 'get'>;
    attribute: Pick<Attribute, 'get'>;
}

export type RankingMetricRecord = Record<string, number>;

/** 조회·표시·정렬 규칙을 한곳에 모은 순위 카테고리 클래스형 enum. */
export class RankingCategory {
    private static readonly all: RankingCategory[] = [];

    static readonly LEVEL = new RankingCategory('level', '레벨', ['level', 'lv'],
        source => source.level, value => `Lv.${Math.trunc(value)}`);
    static readonly GOLD = new RankingCategory('gold', '골드', ['gold', 'money'],
        source => source.gold, value => `${Math.trunc(value).toLocaleString()}G`);

    private static readonly dynamicCategories = (() => {
        for (const stat of StatType.values()) {
            new RankingCategory(
                `stat:${stat.key}`,
                stat.label,
                [stat.key],
                source => source.stat.get(stat),
                value => Math.trunc(value).toLocaleString(),
            );
        }
        for (const attribute of AttributeType.values()) {
            const aliases: string[] = [attribute.key];
            if (attribute === AttributeType.ATK) aliases.push('물리공격력', 'physicalattack');
            if (attribute === AttributeType.MAGIC_FORCE) aliases.push('마법공격력', 'magicattack');
            new RankingCategory(
                `attribute:${attribute.key}`,
                attribute.label,
                aliases,
                source => source.attribute.get(attribute),
                value => attribute.format(value),
            );
        }
        return true;
    })();

    private constructor(
        readonly key: string,
        readonly label: string,
        private readonly aliases: readonly string[],
        private readonly read: (source: RankingMetricSource) => number,
        readonly format: (value: number) => string,
    ) {
        RankingCategory.all.push(this);
    }

    static values(): readonly RankingCategory[] {
        void RankingCategory.dynamicCategories;
        return RankingCategory.all;
    }

    static fromKey(key: string): RankingCategory | undefined {
        return RankingCategory.values().find(category => category.key === key);
    }

    static fromInput(input: string): RankingCategory | undefined {
        const normalized = input.trim().toLocaleLowerCase('ko-KR');
        return RankingCategory.values().find(category =>
            category.key.toLocaleLowerCase('ko-KR') === normalized
            || category.label.toLocaleLowerCase('ko-KR') === normalized
            || category.aliases.some(alias => alias.toLocaleLowerCase('ko-KR') === normalized));
    }

    getValue(source: RankingMetricSource): number {
        const value = this.read(source);
        return Number.isFinite(value) ? value : 0;
    }
}

export interface RankingVisibilitySnapshot {
    defaultPublic: boolean;
    overrides: Readonly<Record<string, boolean>>;
}

export interface StoredPlayerRankingSnapshot {
    userId: number;
    nickname: string;
    metrics: RankingMetricRecord;
    visibility: RankingVisibilitySnapshot;
}

/** 기본 공개 여부와 카테고리별 예외를 소유하고 dirty flush 경계를 제공한다. */
export class RankingVisibility {
    private defaultPublicValue: boolean;
    private readonly categoryOverrides = new Map<string, boolean>();
    private dirtyValue = false;

    constructor(raw?: unknown) {
        const parsed = parseRankingVisibility(raw);
        this.defaultPublicValue = parsed.defaultPublic;
        for (const [key, value] of Object.entries(parsed.overrides)) {
            this.categoryOverrides.set(key, value);
        }
    }

    get dirty(): boolean { return this.dirtyValue; }
    get defaultPublic(): boolean { return this.defaultPublicValue; }

    isPublic(category: RankingCategory): boolean {
        return this.categoryOverrides.get(category.key) ?? this.defaultPublicValue;
    }

    setAll(isPublic: boolean): void {
        if (this.defaultPublicValue === isPublic && this.categoryOverrides.size === 0) return;
        this.defaultPublicValue = isPublic;
        this.categoryOverrides.clear();
        this.dirtyValue = true;
    }

    setCategory(category: RankingCategory, isPublic: boolean): void {
        const previousOverride = this.categoryOverrides.get(category.key);
        if (isPublic === this.defaultPublicValue) this.categoryOverrides.delete(category.key);
        else this.categoryOverrides.set(category.key, isPublic);
        if (previousOverride !== this.categoryOverrides.get(category.key)) this.dirtyValue = true;
    }

    snapshot(): RankingVisibilitySnapshot {
        return {
            defaultPublic: this.defaultPublicValue,
            overrides: Object.freeze(Object.fromEntries(this.categoryOverrides)),
        };
    }

    toPersistence(): { defaultPublic: boolean; overrides: Record<string, boolean> } {
        return {
            defaultPublic: this.defaultPublicValue,
            overrides: Object.fromEntries(this.categoryOverrides),
        };
    }

    resetDirty(): void { this.dirtyValue = false; }
}

export function parseRankingVisibility(raw: unknown): RankingVisibilitySnapshot {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { defaultPublic: true, overrides: Object.freeze({}) };
    }
    const record = raw as Record<string, unknown>;
    const defaultPublic = typeof record.defaultPublic === 'boolean' ? record.defaultPublic : true;
    const overrides: Record<string, boolean> = {};
    if (record.overrides && typeof record.overrides === 'object' && !Array.isArray(record.overrides)) {
        for (const [key, value] of Object.entries(record.overrides as Record<string, unknown>)) {
            if (typeof value === 'boolean' && value !== defaultPublic && RankingCategory.fromKey(key)) {
                overrides[key] = value;
            }
        }
    }
    return { defaultPublic, overrides: Object.freeze(overrides) };
}

export function createRankingMetricRecord(source: RankingMetricSource): RankingMetricRecord {
    return Object.fromEntries(RankingCategory.values().map(category => [category.key, category.getValue(source)]));
}

export function createStoredPlayerRankingMetricRecord(data: {
    level: number;
    gold: number;
    maxWeight: number;
    stats?: Partial<StatRecord>;
    baseAttribute: Partial<AttributeRecord>;
}): RankingMetricRecord {
    const attribute = new Attribute({ ...data.baseAttribute, maxWeight: data.maxWeight });
    const stat = new Stat(data.stats);
    stat.applyModifiers({ attribute });
    return createRankingMetricRecord({ level: data.level, gold: data.gold, stat, attribute });
}

export function parseRankingMetricRecord(raw: unknown, fallback: RankingMetricRecord): RankingMetricRecord {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...fallback };
    const source = raw as Record<string, unknown>;
    return Object.fromEntries(RankingCategory.values().map(category => {
        const value = source[category.key];
        return [category.key, typeof value === 'number' && Number.isFinite(value) ? value : fallback[category.key] ?? 0];
    }));
}

export function isCompleteRankingMetricRecord(raw: unknown): boolean {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const source = raw as Record<string, unknown>;
    return RankingCategory.values().every(category =>
        typeof source[category.key] === 'number' && Number.isFinite(source[category.key]));
}
