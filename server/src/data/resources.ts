import { defineResource, registerResourceInteraction } from '../models/Resource.js';
import { sendNotificationToUser } from '../modules/message.js';
import { GameTags } from '../../../shared/tags.js';

registerResourceInteraction('inspect_ore', (resource, player) => {
    sendNotificationToUser(player.userId, {
        key: `resource:${resource.resourceDataId}`,
        message: '단단한 광맥이다. 채굴 속성이 있는 도구로 공격하면 캘 수 있을 것 같다.',
    });
});

defineResource({
    id: 'ore_deposit',
    name: '광석',
    level: 1,
    baseAttribute: {
        maxLife: 35,
        def: 2,
    },
    requiredToolTags: [GameTags.TOOL_MINING],
    drops: [
        { itemDataId: 'stone', weight: 50, minCount: 1, maxCount: 1 },
        { itemDataId: 'coal', weight: 25, minCount: 1, maxCount: 1 },
        { itemDataId: 'iron_ore', weight: 13, minCount: 1, maxCount: 1 },
        { itemDataId: 'gold_ore', weight: 5, minCount: 1, maxCount: 1 },
        { itemDataId: 'ruby', weight: 3, minCount: 1, maxCount: 1 },
        { itemDataId: 'emerald', weight: 3, minCount: 1, maxCount: 1 },
        { itemDataId: 'diamond', weight: 1, minCount: 1, maxCount: 1 },
    ],
    expReward: { min: 3, max: 7 },
    interaction: 'inspect_ore',
    tags: [GameTags.RESOURCE_ORE, GameTags.TRAIT_INANIMATE, GameTags.MATERIAL_STONE],
});
