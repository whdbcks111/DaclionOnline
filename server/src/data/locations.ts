import { registerConnectionCondition } from '../models/Location.js';

const levelConditions = [10, 20, 28, 36, 45] as const;

for (const requiredLevel of levelConditions) {
    registerConnectionCondition(`level_${requiredLevel}`, player => (
        player.level >= requiredLevel ? 'visible' : 'locked'
    ));
}
