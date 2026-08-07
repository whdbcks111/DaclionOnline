import { registerConnectionCondition } from '../../models/world/Location.js';
import { UPPER_DIMENSION_EXPEDITION_UNLOCKED_FLAG } from '../progression/ascension.js';
import { ASCENSION_LEVEL, isAscended } from '../../models/progression/Ascension.js';
import { UPPER_DIMENSION_EXPEDITION_CONNECTION_CONDITION } from './upperDimensionExpedition.js';

const levelConditions = [
    10, 20, 28, 36, 45, 50, 70, 90, 120, 150, 180, 200, 235, 275, 310, 345,
    380, 420, 460, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950,
] as const;

for (const requiredLevel of levelConditions) {
    registerConnectionCondition(`level_${requiredLevel}`, player => player.level >= requiredLevel
        ? 'visible'
        : { status: 'locked', publicReason: `필요 레벨: Lv.${requiredLevel}` });
}

registerConnectionCondition(UPPER_DIMENSION_EXPEDITION_CONNECTION_CONDITION, player => {
    if (player.progress.getFlag(UPPER_DIMENSION_EXPEDITION_UNLOCKED_FLAG)) return 'visible';
    if (isAscended(player.progress) && player.level >= ASCENSION_LEVEL) {
        return {
            status: 'locked',
            publicReason: '기원종언의 잔재에게 경계 통과 권한을 확인해야 합니다.',
        };
    }
    return 'hidden';
});
