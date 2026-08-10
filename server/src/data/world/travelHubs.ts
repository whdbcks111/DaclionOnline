import { chat } from '../../utils/chatBuilder.js';
import { sendBotMessageToUser } from '../../modules/communication/message.js';
import { defineResource, registerResourceInteraction } from '../../models/actors/Resource.js';
import { defineTravelHub } from '../../models/world/TravelHub.js';
import {
    ASHEN_ABYSS_QUEST_IDS,
    CHRONOFROST_QUEST_IDS,
    ECLIPSE_TRENCH_QUEST_IDS,
    ENDSTAR_QUEST_IDS,
    FROSTVEIL_QUEST_IDS,
    GLASSDUNE_QUEST_IDS,
    MISTTIDE_QUEST_IDS,
    NEBULA_QUEST_IDS,
    PARADOX_QUEST_IDS,
    TWILIGHT_TOMB_QUEST_IDS,
    VOIDCROWN_QUEST_IDS,
    WORLDROOT_QUEST_IDS,
} from '../progression/quests.js';

export const TRAVEL_RELAY_RESOURCE_ID = 'travel_relay';

defineResource({
    id: TRAVEL_RELAY_RESOURCE_ID,
    name: '공간 중계핵',
    level: 1,
    baseAttribute: { maxLife: 1 },
    attackable: false,
    drops: [],
    expReward: { min: 0, max: 0 },
    interaction: 'open_travel_relay',
    tags: [],
});

registerResourceInteraction('open_travel_relay', (_resource, player) => {
    sendBotMessageToUser(player.userId, chat()
        .color('aqua', value => value.weight('bold', nested => nested.text('[ 공간 중계핵 ]')))
        .text('\n해금한 성장 거점으로 순간이동하거나 현재 거점을 부활 거주점으로 지정할 수 있습니다.\n')
        .button('/중계소', button => button.text('[중계소 열기]'), true)
        .text(' ')
        .button('/거주점', button => button.text('[거주점 확인]'), true)
        .build());
    return true;
});

export const TRAVEL_HUB_DEFINITIONS = Object.freeze([
    { locationId: 'town_square', unlockFee: 0, useFee: 1_000, unlockedByDefault: true },
    {
        locationId: 'twilight_lantern_camp', unlockFee: 50_000, useFee: 500,
        prerequisiteQuestId: TWILIGHT_TOMB_QUEST_IDS.RESTLESS_DEAD,
        prerequisiteLabel: '꺼지지 않는 장송행렬',
    },
    {
        locationId: 'glassdune_caravan', unlockFee: 150_000, useFee: 1_500,
        prerequisiteQuestId: GLASSDUNE_QUEST_IDS.CARAPACE_ROUTE,
        prerequisiteLabel: '황금갑으로 이은 길',
    },
    {
        locationId: 'frostveil_outpost', unlockFee: 300_000, useFee: 3_000,
        prerequisiteQuestId: FROSTVEIL_QUEST_IDS.WINTER_SUPPLY,
        prerequisiteLabel: '눈보라를 버티는 실',
    },
    {
        locationId: 'misttide_harbor', unlockFee: 600_000, useFee: 6_000,
        prerequisiteQuestId: MISTTIDE_QUEST_IDS.REPAIR_SALT_BEACON,
        prerequisiteLabel: '안개를 가르는 염등',
    },
    {
        locationId: 'paradox_relay_station', unlockFee: 1_000_000, useFee: 10_000,
        prerequisiteQuestId: PARADOX_QUEST_IDS.RESTORE_ARCHIVE,
        prerequisiteLabel: '기억 톱니의 순서',
    },
    {
        locationId: 'ashen_waystation', unlockFee: 1_500_000, useFee: 15_000,
        prerequisiteQuestId: ASHEN_ABYSS_QUEST_IDS.RELIGHT_WAYSTATION,
        prerequisiteLabel: '회색불길을 다시 밝히는 법',
    },
    {
        locationId: 'voidcrown_waystation', unlockFee: 2_000_000, useFee: 20_000,
        prerequisiteQuestId: VOIDCROWN_QUEST_IDS.RESTORE_WARD,
        prerequisiteLabel: '빛이 닿지 않는 귀환표식',
    },
    {
        locationId: 'eclipse_dock', unlockFee: 3_000_000, useFee: 30_000,
        prerequisiteQuestId: ECLIPSE_TRENCH_QUEST_IDS.RESTORE_DOCK,
        prerequisiteLabel: '달빛 아래 잠긴 정박지',
    },
    {
        locationId: 'worldroot_waystation', unlockFee: 4_000_000, useFee: 40_000,
        prerequisiteQuestId: WORLDROOT_QUEST_IDS.RESTORE_MEMORY,
        prerequisiteLabel: '수해가 잊은 이름',
    },
    {
        locationId: 'nebula_waystation', unlockFee: 5_000_000, useFee: 50_000,
        prerequisiteQuestId: NEBULA_QUEST_IDS.RESTORE_BEACON,
        prerequisiteLabel: '별길을 잃은 정거장',
    },
    {
        locationId: 'chronofrost_refuge', unlockFee: 6_000_000, useFee: 60_000,
        prerequisiteQuestId: CHRONOFROST_QUEST_IDS.RESTART_CLOCK,
        prerequisiteLabel: '멈춘 분침을 움직이는 법',
    },
    {
        locationId: 'endstar_bastion', unlockFee: 8_000_000, useFee: 80_000,
        prerequisiteQuestId: ENDSTAR_QUEST_IDS.RELIGHT_CONSTELLATION,
        prerequisiteLabel: '꺼진 별을 잇는 선',
    },
] as const);

for (const definition of TRAVEL_HUB_DEFINITIONS) defineTravelHub(definition);
