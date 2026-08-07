import { registerConnectionCondition } from '../../models/world/Location.js';

const levelConditions = [
    10, 20, 28, 36, 45, 50, 70, 90, 120, 150, 180, 200, 235, 275, 310, 345,
    380, 420, 460, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950,
] as const;

for (const requiredLevel of levelConditions) {
    registerConnectionCondition(`level_${requiredLevel}`, player => player.level >= requiredLevel
        ? 'visible'
        : { status: 'locked', publicReason: `필요 레벨: Lv.${requiredLevel}` });
}
