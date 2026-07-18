import { registerConnectionCondition } from '../models/Location.js';

const levelConditions = [10, 20, 28, 36, 45, 50, 70, 90, 120, 150, 180, 200] as const;

for (const requiredLevel of levelConditions) {
    registerConnectionCondition(`level_${requiredLevel}`, player => player.level >= requiredLevel
        ? 'visible'
        : { status: 'locked', publicReason: `필요 레벨: Lv.${requiredLevel}` });
}
