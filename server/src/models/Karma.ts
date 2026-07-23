import type { ZoneType } from '../../../shared/types.js';

export const KarmaRules = Object.freeze({
    /** 레거시와 같은 자연 감소 속도. 시간당 10.8, 카르마 25가 약 2시간 19분에 사라진다. */
    DECAY_PER_SECOND: 0.003,
    NEUTRAL_PVP_KILL_GAIN: 25,
    HOSTILE_PVP_KILL_GAIN: 10,
    WANTED_THRESHOLD: 100,
    LAWFUL_SHOP_DENIED_THRESHOLD: 300,
    SANCTUARY_DENIED_THRESHOLD: 500,
    DEATH_REDUCTION: 15,
    MAX_VALUE: 1_000_000,
} as const);

/** 표시명·제한 단계·채팅 표식을 한곳에서 제공하는 카르마 클래스형 enum. */
export class KarmaTier {
    private static readonly all: KarmaTier[] = [];

    static readonly CLEAR = new KarmaTier('clear', '무고', 0, '#9ca3af');
    static readonly TAINTED = new KarmaTier('tainted', '흔적', 25, '#c08457');
    static readonly NOTORIOUS = new KarmaTier('notorious', '악명', 100, '#dc5868');
    static readonly OUTLAW = new KarmaTier('outlaw', '무법자', 300, '#b91c3c');
    static readonly CALAMITY = new KarmaTier('calamity', '재앙', 1_000, '#7f1d3a');

    private constructor(
        readonly key: string,
        readonly label: string,
        readonly minimum: number,
        readonly color: string,
    ) {
        KarmaTier.all.push(this);
    }

    get marked(): boolean { return this.minimum >= KarmaRules.WANTED_THRESHOLD; }

    static values(): readonly KarmaTier[] { return KarmaTier.all; }
    static fromKey(key: string): KarmaTier | undefined {
        return KarmaTier.all.find(tier => tier.key === key.trim().toLowerCase());
    }
    static forValue(value: number): KarmaTier {
        const normalized = getEffectiveKarma(value);
        return [...KarmaTier.all].reverse().find(tier => normalized >= tier.minimum)
            ?? KarmaTier.CLEAR;
    }
}

/** 시설마다 서로 다른 카르마 상한과 사용자용 거부 문구를 소유한다. */
export class KarmaAccessPolicy {
    private static readonly all: KarmaAccessPolicy[] = [];

    static readonly BENEVOLENT_QUEST = new KarmaAccessPolicy(
        'benevolent-quest',
        '선의 성향 의뢰',
        KarmaRules.WANTED_THRESHOLD,
        '악명이 퍼져 선의를 중시하는 의뢰를 받을 수 없습니다.',
    );
    static readonly LAWFUL_SHOP = new KarmaAccessPolicy(
        'lawful-shop',
        '질서 시설',
        KarmaRules.LAWFUL_SHOP_DENIED_THRESHOLD,
        '악명이 너무 높아 이 시설에서 거래를 거부했습니다.',
    );
    static readonly SANCTUARY = new KarmaAccessPolicy(
        'sanctuary',
        '교단 성소',
        KarmaRules.SANCTUARY_DENIED_THRESHOLD,
        '쌓인 악업이 너무 무거워 교단의 성소에 들어갈 수 없습니다.',
    );

    private constructor(
        readonly key: string,
        readonly label: string,
        readonly deniedAt: number,
        readonly deniedMessage: string,
    ) {
        KarmaAccessPolicy.all.push(this);
    }

    static values(): readonly KarmaAccessPolicy[] { return KarmaAccessPolicy.all; }
    static fromKey(key: string): KarmaAccessPolicy | undefined {
        return KarmaAccessPolicy.all.find(policy => policy.key === key.trim().toLowerCase());
    }

    getDeniedReason(karma: number): string | undefined {
        return getEffectiveKarma(karma) >= this.deniedAt ? this.deniedMessage : undefined;
    }
}

export interface KarmaValueSnapshot {
    readonly value: number;
    readonly updatedAt: Date;
}

export interface KarmaChangeSnapshot {
    readonly before: number;
    readonly value: number;
    readonly delta: number;
}

/**
 * 저장된 기준값과 시각으로 자연 감소를 지연 계산한다.
 * 매 tick dirty를 만들지 않으면서 온라인·오프라인 시간을 같은 규칙으로 반영한다.
 */
export class KarmaState {
    private baseValue: number;
    private baseUpdatedAtMs: number;

    constructor(value = 0, updatedAt: Date | number = Date.now()) {
        this.baseValue = normalizeKarma(value);
        this.baseUpdatedAtMs = normalizeTimestamp(updatedAt);
    }

    get value(): number { return this.getValueAt(Date.now()); }
    get tier(): KarmaTier { return KarmaTier.forValue(this.value); }
    get marked(): boolean { return this.tier.marked; }

    getValueAt(now: Date | number): number {
        const nowMs = Math.max(this.baseUpdatedAtMs, normalizeTimestamp(now));
        const elapsedSeconds = (nowMs - this.baseUpdatedAtMs) / 1_000;
        return normalizeKarma(this.baseValue - elapsedSeconds * KarmaRules.DECAY_PER_SECOND);
    }

    add(amount: number, now: Date | number = Date.now()): KarmaChangeSnapshot {
        return this.change(Math.abs(requireFiniteAmount(amount)), now);
    }

    reduce(amount: number, now: Date | number = Date.now()): KarmaChangeSnapshot {
        return this.change(-Math.abs(requireFiniteAmount(amount)), now);
    }

    set(value: number, now: Date | number = Date.now()): KarmaChangeSnapshot {
        const nowMs = normalizeTimestamp(now);
        const before = this.getValueAt(nowMs);
        this.baseValue = normalizeKarma(value);
        this.baseUpdatedAtMs = nowMs;
        return { before, value: this.baseValue, delta: this.baseValue - before };
    }

    snapshot(now: Date | number = Date.now()): KarmaValueSnapshot {
        const nowMs = normalizeTimestamp(now);
        return {
            value: this.getValueAt(nowMs),
            updatedAt: new Date(nowMs),
        };
    }

    private change(delta: number, now: Date | number): KarmaChangeSnapshot {
        const nowMs = normalizeTimestamp(now);
        const before = this.getValueAt(nowMs);
        this.baseValue = normalizeKarma(before + delta);
        this.baseUpdatedAtMs = nowMs;
        return { before, value: this.baseValue, delta: this.baseValue - before };
    }
}

export interface KarmaHeroReward {
    readonly level: number;
    readonly durationSeconds: number;
}

export interface KarmaDeathPenalty {
    readonly respawnSeconds: number;
    readonly experienceLossRate: number;
    readonly goldLossRate: number;
    readonly karmaReduction: number;
}

/** 현상 대상이 아닌 플레이어를 처치했을 때만 지역별 악업을 반환한다. */
export function getPvpKarmaGain(zoneType: ZoneType | 'unknown', victimKarma: number): number {
    if (getEffectiveKarma(victimKarma) >= KarmaRules.WANTED_THRESHOLD) return 0;
    if (zoneType === 'neutral') return KarmaRules.NEUTRAL_PVP_KILL_GAIN;
    if (zoneType === 'hostile') return KarmaRules.HOSTILE_PVP_KILL_GAIN;
    return 0;
}

/** 악명 높은 플레이어를 처치했을 때 영웅 효과의 레벨과 지속시간을 계산한다. */
export function getKarmaHeroReward(victimKarma: number): KarmaHeroReward | undefined {
    const karma = getEffectiveKarma(victimKarma);
    if (karma < KarmaRules.WANTED_THRESHOLD) return undefined;
    return {
        level: Math.min(5, Math.max(1, Math.floor(karma / 200) + 1)),
        durationSeconds: Math.min(3_600, Math.floor(600 + karma * 3)),
    };
}

/** 지역 기본 사망 손실에 더할 고카르마 전용 패널티를 계산한다. */
export function getKarmaDeathPenalty(karmaValue: number): KarmaDeathPenalty {
    const karma = getEffectiveKarma(karmaValue);
    if (karma < KarmaRules.WANTED_THRESHOLD) {
        return { respawnSeconds: 0, experienceLossRate: 0, goldLossRate: 0, karmaReduction: 0 };
    }
    return {
        // 레거시의 5분 + karma^1.5/10, 최대 12시간 추가를 유지한다.
        respawnSeconds: Math.ceil(300 + Math.min(Math.pow(karma, 1.5) / 10, 43_200)),
        experienceLossRate: Math.min(0.25, 0.04 + karma / 5_000),
        goldLossRate: Math.min(0.30, 0.02 + karma / 4_000),
        karmaReduction: Math.min(karma, KarmaRules.DEATH_REDUCTION),
    };
}

export function normalizeKarma(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(KarmaRules.MAX_VALUE, Math.max(0, value));
}

/** 사용자에게 표시하는 소수 첫째 자리와 정책 임계값 판정을 일치시킨다. */
export function getEffectiveKarma(value: number): number {
    return Math.round(normalizeKarma(value) * 10) / 10;
}

function requireFiniteAmount(value: number): number {
    if (!Number.isFinite(value)) throw new Error('카르마 변경량은 유한한 숫자여야 합니다.');
    return value;
}

function normalizeTimestamp(value: Date | number): number {
    const timestamp = value instanceof Date ? value.getTime() : value;
    return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : Date.now();
}
