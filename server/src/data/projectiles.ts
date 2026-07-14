import { defineProjectileData } from '../models/Projectile.js';
import { GameTags } from '../../../shared/tags.js';

defineProjectileData({
    id: 'basic_arrow',
    name: '화살',
    damageType: 'physical',
    travelTime: 0.35,
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
    damageMultiplier: 1,
    damageBonus: 0,
    tags: [],
    baseAttribute: { magicPen: 0, critRate: 0 },
});
