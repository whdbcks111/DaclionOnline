import { defineProgress, ProgressType } from '../../models/progression/Progress.js';
export {
    ASCENSION_ARTIFACT_ITEM_ID,
    ASCENSION_BONUS_STAT_POINTS,
    ASCENSION_LEVEL,
    ASCENSION_PASSIVE_SKILL_ID,
    ASCENSION_RANK_COUNTER,
    MORTAL_LEVEL_CAP,
} from '../../models/progression/Ascension.js';

export const ORIGINBOUNDARY_SOVEREIGN_DEFEATED_FLAG = 'ascension:originboundary-sovereign-defeated';
export const DACLEVIS_REVELATION_FLAG = 'ascension:daclevis-revealed';

defineProgress({
    id: ORIGINBOUNDARY_SOVEREIGN_DEFEATED_FLAG,
    type: ProgressType.FLAG,
    label: '기원종언체 아르케 제압',
    description: 'Lv.1000 경계의 수호자를 제압하고 기원종언의 잔재를 볼 수 있게 된 영속 기록입니다.',
    visible: false,
    tags: ['ascension:qualification', 'boss:originboundary-sovereign'],
});

defineProgress({
    id: DACLEVIS_REVELATION_FLAG,
    type: ProgressType.FLAG,
    label: '대마녀 다클레비스의 존재 확인',
    description: '기원종언의 잔재에게 루미나르의 균열과 상위차원의 대마녀에 관한 진실을 들었습니다.',
    visible: false,
    tags: ['ascension:revelation', 'lore:daclevis'],
});
