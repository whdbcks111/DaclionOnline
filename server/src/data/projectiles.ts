import { defineProjectileData } from '../models/Projectile.js';
import { GameTags } from '../../../shared/tags.js';

defineProjectileData({
    id: 'basic_arrow',
    name: '화살',
    damageType: 'physical',
    travelTime: 0.35,
    accelerationCoefficient: 1,
    damageMultiplier: 1,
    damageBonus: 0,
    tags: [GameTags.PROPERTY_NATURAL, GameTags.MATERIAL_WOOD],
    baseAttribute: { armorPen: 0, critRate: 0 },
});

// 무기 자체의 projectileAttack.projectile에서 참조할 수 있는 무탄약 예시 데이터.
defineProjectileData({
    id: 'basic_magic_orb',
    name: '마력 구체',
    damageType: 'magic',
    travelTime: 0.5,
    accelerationCoefficient: 0.85,
    damageMultiplier: 1.08,
    damageBonus: 0,
    tags: [],
    baseAttribute: { magicPen: 0, critRate: 0 },
});

// 마법사 기본 스킬 전용 투사체. 지팡이 기본 공격용 마력 구체와 독립적으로 조정한다.
defineProjectileData({
    id: 'magic_bolt',
    name: '마력탄',
    damageType: 'magic',
    travelTime: 0.45,
    accelerationCoefficient: 1,
    damageMultiplier: 1,
    damageBonus: 0,
    tags: [],
    baseAttribute: { magicPen: 0, critRate: 0 },
});
