import type { ZoneType } from '../../../shared/types.js';

/** 장소 위험도별 PVP·사망 규칙을 한곳에서 소유하는 클래스형 enum. */
export class RegionRiskPolicy {
    private static readonly all: RegionRiskPolicy[] = [];

    static readonly SAFE = new RegionRiskPolicy({
        key: 'safe', label: '안전 구역', pvpAllowed: false,
        experienceLossRate: 0, goldLossRate: 0, respawnTimeMultiplier: 0.5,
    });
    static readonly NEUTRAL = new RegionRiskPolicy({
        key: 'neutral', label: '중립 구역', pvpAllowed: true,
        experienceLossRate: 0.03, goldLossRate: 0, respawnTimeMultiplier: 1,
    });
    static readonly HOSTILE = new RegionRiskPolicy({
        key: 'hostile', label: '적대 구역', pvpAllowed: true,
        experienceLossRate: 0.07, goldLossRate: 0.03, respawnTimeMultiplier: 1.5,
    });

    readonly key: ZoneType;
    readonly label: string;
    readonly pvpAllowed: boolean;
    readonly experienceLossRate: number;
    readonly goldLossRate: number;
    readonly respawnTimeMultiplier: number;

    private constructor(options: {
        key: ZoneType;
        label: string;
        pvpAllowed: boolean;
        experienceLossRate: number;
        goldLossRate: number;
        respawnTimeMultiplier: number;
    }) {
        this.key = options.key;
        this.label = options.label;
        this.pvpAllowed = options.pvpAllowed;
        this.experienceLossRate = options.experienceLossRate;
        this.goldLossRate = options.goldLossRate;
        this.respawnTimeMultiplier = options.respawnTimeMultiplier;
        RegionRiskPolicy.all.push(this);
    }

    static values(): readonly RegionRiskPolicy[] { return RegionRiskPolicy.all; }
    static fromKey(key: string): RegionRiskPolicy | undefined {
        return RegionRiskPolicy.all.find(policy => policy.key === key);
    }
    static require(key: ZoneType): RegionRiskPolicy {
        const policy = RegionRiskPolicy.fromKey(key);
        if (!policy) throw new Error(`지원하지 않는 지역 위험도입니다: ${key}`);
        return policy;
    }

    calculateExperienceLoss(currentExperience: number, maxExperience: number, level: number): number {
        if (level < 10) return 0;
        return Math.min(
            Math.max(0, Math.floor(currentExperience)),
            Math.max(0, Math.floor(maxExperience * this.experienceLossRate)),
        );
    }

    calculateGoldLoss(currentGold: number, level: number): number {
        if (level < 10) return 0;
        return Math.min(
            Math.max(0, Math.floor(currentGold)),
            Math.max(0, Math.floor(currentGold * this.goldLossRate)),
        );
    }

    calculateRespawnDuration(baseDuration: number): number {
        return Math.max(1, Math.ceil(Math.max(0, baseDuration) * this.respawnTimeMultiplier));
    }
}
