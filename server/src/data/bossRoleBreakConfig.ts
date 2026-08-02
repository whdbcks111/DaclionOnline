import type { MonsterChallengePattern } from '../models/Monster.js';

/** 역할 파훼에서 요구할 수 있는 행동을 표시명과 함께 소유하는 클래스형 enum. */
export class BossRoleBreakRequirement {
    private static readonly all: BossRoleBreakRequirement[] = [];

    static readonly TAUNT = new BossRoleBreakRequirement('taunt', '도발');
    static readonly DEFENSE_REDUCTION = new BossRoleBreakRequirement(
        'defense_reduction',
        '방어력 감소',
        'defense_reduction',
    );
    static readonly MAGIC_DEFENSE_REDUCTION = new BossRoleBreakRequirement(
        'magic_defense_reduction',
        '마법 저항력 감소',
        'magic_defense_reduction',
    );

    private constructor(
        readonly key: string,
        readonly label: string,
        readonly statusEffectId?: string,
    ) {
        BossRoleBreakRequirement.all.push(this);
    }

    static values(): readonly BossRoleBreakRequirement[] { return [...BossRoleBreakRequirement.all]; }
    static fromKey(key: string): BossRoleBreakRequirement | undefined {
        return BossRoleBreakRequirement.all.find(value => value.key === key.trim().toLowerCase());
    }
}

export interface BossRoleBreakPatternConfig {
    readonly handlerId: string;
    readonly monsterDataId: string;
    readonly label: string;
    readonly requirements: readonly BossRoleBreakRequirement[];
    readonly duration: number;
    /** 파훼 수집 중 보스가 받는 피해 배율. */
    readonly wardMultiplier: number;
    /** 성공 노출 중 보스가 받는 피해 배율. */
    readonly vulnerabilityMultiplier: number;
    readonly vulnerabilityDuration: number;
    /** 실패 시 참여자가 받는 최대 생명력 비율 고정 피해. */
    readonly failureLifeRatio: number;
    readonly initialDelay: number;
    readonly interval: Readonly<{ min: number; max: number }>;
}

function defineRoleBreakPattern(
    config: BossRoleBreakPatternConfig,
): Readonly<BossRoleBreakPatternConfig> {
    return Object.freeze({
        ...config,
        requirements: Object.freeze([...config.requirements]),
        interval: Object.freeze({ ...config.interval }),
    });
}

/** 마스터 배치·서버 판정·플레이어 안내·테스트가 함께 쓰는 역할 파훼 수치 원본. */
export const ROLE_BREAK_BOSS_PATTERNS = Object.freeze([
    defineRoleBreakPattern({
        handlerId: 'role-break:nebula-sovereign',
        monsterDataId: 'nebula_sovereign',
        label: '성운 왕권 봉쇄',
        requirements: [
            BossRoleBreakRequirement.DEFENSE_REDUCTION,
            BossRoleBreakRequirement.MAGIC_DEFENSE_REDUCTION,
        ],
        duration: 12,
        wardMultiplier: 0.55,
        vulnerabilityMultiplier: 1.15,
        vulnerabilityDuration: 7,
        failureLifeRatio: 0.28,
        initialDelay: 9,
        interval: { min: 28, max: 34 },
    }),
    defineRoleBreakPattern({
        handlerId: 'role-break:zero-hour-queen',
        monsterDataId: 'zero_hour_queen',
        label: '영시 왕좌 봉쇄',
        requirements: [
            BossRoleBreakRequirement.TAUNT,
            BossRoleBreakRequirement.MAGIC_DEFENSE_REDUCTION,
        ],
        duration: 11,
        wardMultiplier: 0.5,
        vulnerabilityMultiplier: 1.18,
        vulnerabilityDuration: 7,
        failureLifeRatio: 0.35,
        initialDelay: 8,
        interval: { min: 26, max: 32 },
    }),
    defineRoleBreakPattern({
        handlerId: 'role-break:last-constellation',
        monsterDataId: 'last_constellation',
        label: '종성 삼중 봉쇄',
        requirements: [
            BossRoleBreakRequirement.TAUNT,
            BossRoleBreakRequirement.DEFENSE_REDUCTION,
            BossRoleBreakRequirement.MAGIC_DEFENSE_REDUCTION,
        ],
        duration: 14,
        wardMultiplier: 0.45,
        vulnerabilityMultiplier: 1.2,
        vulnerabilityDuration: 8,
        failureLifeRatio: 0.42,
        initialDelay: 8,
        interval: { min: 24, max: 30 },
    }),
] as const);

export function getBossRoleBreakPattern(
    monsterDataId: string,
): Readonly<BossRoleBreakPatternConfig> | undefined {
    return ROLE_BREAK_BOSS_PATTERNS.find(config => config.monsterDataId === monsterDataId.trim());
}

export function createBossRoleBreakChallengePattern(monsterDataId: string): MonsterChallengePattern {
    const config = getBossRoleBreakPattern(monsterDataId);
    if (!config) throw new Error(`역할 파훼 설정을 찾을 수 없습니다: ${monsterDataId}`);
    return {
        handler: config.handlerId,
        initialDelay: config.initialDelay,
        interval: { ...config.interval },
    };
}
