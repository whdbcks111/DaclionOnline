import type {
    TargetAttributeHudData,
    TargetMonsterAnalysisHudData,
} from '../../../../shared/types.js';
import { AttributeType } from '../core/Attribute.js';
import { getItemData } from '../economy/Item.js';
import type Monster from '../actors/Monster.js';
import { StatusEffectType } from './StatusEffect.js';
import { getTagEffectAffinitySnapshots } from './TagEffect.js';

export type MonsterInspectionTier = 0 | 1 | 2 | 3;

export const MONSTER_INFO_SENSIBILITY = 100;
export const MONSTER_COMBAT_SENSIBILITY = 125;
export const MONSTER_REWARD_SENSIBILITY = 150;

export const MONSTER_COMBAT_ATTRIBUTES = [
    AttributeType.MAX_LIFE,
    AttributeType.ATK,
    AttributeType.MAGIC_FORCE,
    AttributeType.DEF,
    AttributeType.MAGIC_DEF,
    AttributeType.ARMOR_PEN,
    AttributeType.MAGIC_PEN,
    AttributeType.SPEED,
    AttributeType.ATTACK_SPEED,
    AttributeType.CRIT_RATE,
    AttributeType.CRIT_DMG,
] as const;

export function getMonsterInspectionTier(sensibility: number): MonsterInspectionTier {
    if (sensibility < MONSTER_INFO_SENSIBILITY) return 0;
    if (sensibility < MONSTER_COMBAT_SENSIBILITY) return 1;
    if (sensibility < MONSTER_REWARD_SENSIBILITY) return 2;
    return 3;
}

export function getNextMonsterInspectionSensibility(tier: MonsterInspectionTier): number | undefined {
    if (tier === 0) return MONSTER_INFO_SENSIBILITY;
    if (tier === 1) return MONSTER_COMBAT_SENSIBILITY;
    if (tier === 2) return MONSTER_REWARD_SENSIBILITY;
    return undefined;
}

function formatRewardNumber(value: number): string {
    return Math.max(0, value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** 타게팅 HUD와 몬스터 정보가 같은 감각 단계로 가공된 정보만 공개하도록 만드는 DTO. */
export function createMonsterTargetAnalysis(
    monster: Monster,
    sensibility: number,
): TargetMonsterAnalysisHudData {
    const tier = getMonsterInspectionTier(sensibility);
    const snapshot = monster.getInspectionSnapshot();
    const affinityDisplays = tier >= 1
        ? getTagEffectAffinitySnapshots().filter(affinity => snapshot.tags.includes(affinity.tag))
        : [];
    const combatAttributes: TargetAttributeHudData[] = tier >= 2
        ? MONSTER_COMBAT_ATTRIBUTES.map(type => ({
            label: type.label,
            icon: type.icon,
            value: type.format(snapshot.attributes[type.key]),
        }))
        : [];

    const damageType = snapshot.attack?.damageType ?? 'physical';
    const effect = snapshot.attack?.effect;
    const attackSummary = tier >= 2
        ? [
            damageType === 'magic' ? '마법 피해' : damageType === 'absolute' ? '고정 피해' : '물리 피해',
            effect
                ? `${StatusEffectType.fromKey(effect.statusEffectId)?.label ?? '상태이상'} ${Math.round(effect.chance * 100)}%`
                : '',
        ].filter(Boolean).join(' · ')
        : undefined;
    const gold = snapshot.goldReward;

    return {
        tier,
        nextSensibility: getNextMonsterInspectionSensibility(tier),
        affinities: affinityDisplays.map(({ label, icon }) => ({ label, icon })),
        combatAttributes,
        attackSummary,
        experienceReward: tier >= 3 ? formatRewardNumber(snapshot.expReward) : undefined,
        goldReward: tier >= 3
            ? typeof gold === 'number'
                ? formatRewardNumber(gold)
                : `${formatRewardNumber(gold.min)}~${formatRewardNumber(gold.max)}`
            : undefined,
        dropNames: tier >= 3
            ? [...new Set(snapshot.drops.map(drop => getItemData(drop.itemDataId)?.name ?? '알 수 없는 전리품'))]
            : [],
        skillNames: tier >= 3 ? snapshot.skills.map(skill => `${skill.name} Lv.${skill.level}`) : [],
    };
}
