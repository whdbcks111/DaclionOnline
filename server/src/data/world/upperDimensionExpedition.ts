import type { LocationData } from '../../../../shared/types.js';
import type { TagId } from '../../../../shared/tags.js';
import { GameTags } from '../../../../shared/tags.js';

export const UPPER_DIMENSION_EXPEDITION_CONNECTION_CONDITION = 'upper_dimension_expedition_unlocked';
export const UPPER_DIMENSION_EXPEDITION_ENTRY_LOCATION_ID = 'upper_dimension_riftfall';
export const UPPER_DIMENSION_EXPEDITION_HUB_LOCATION_ID = 'inverse_hellgate_bastion';

const upperDimensionTags: readonly TagId[] = [
    GameTags.LOCATION_WILDERNESS,
    'location:upper-dimension',
    'region:daclevis-frontier',
];

function connect(locationId: string, condition?: string): LocationData['connections'][number] {
    return condition ? { locationId, condition } : { locationId };
}

/**
 * 아르케를 우회해 처음 발을 딛는 상위차원 원정망.
 * 전투 권역을 임시 몬스터 한두 종으로 채우지 않고, 이후 Lv.1000+ 권역이 갈라질 영구 거점과 정찰 동선을 먼저 둔다.
 */
export function buildUpperDimensionExpeditionLocations(): LocationData[] {
    return [
        {
            id: UPPER_DIMENSION_EXPEDITION_ENTRY_LOCATION_ID,
            name: '마녀흔 균열낙하지',
            x: 7_600,
            y: -8_000,
            z: 900,
            mapColor: '#625a76',
            zoneType: 'neutral',
            tags: [...upperDimensionTags, 'location:dimensional-crossing'],
            npcIds: [],
            objects: [],
            connections: [
                connect('originboundary_transition'),
                connect('inverse_hellgate_approach'),
            ],
        },
        {
            id: 'inverse_hellgate_approach',
            name: '역지옥문 회랑',
            x: 7_800,
            y: -8_000,
            z: 940,
            mapColor: '#625a76',
            zoneType: 'neutral',
            tags: [...upperDimensionTags, 'location:dimensional-crossing', 'lore:hellgate'],
            npcIds: [],
            objects: [],
            connections: [
                connect(UPPER_DIMENSION_EXPEDITION_ENTRY_LOCATION_ID),
                connect(UPPER_DIMENSION_EXPEDITION_HUB_LOCATION_ID),
            ],
        },
        {
            id: UPPER_DIMENSION_EXPEDITION_HUB_LOCATION_ID,
            name: '역지옥문 원정기지',
            x: 8_000,
            y: -8_000,
            z: 980,
            isRespawnLocation: true,
            mapColor: '#625a76',
            zoneType: 'safe',
            tags: ['location:upper-dimension', 'region:daclevis-frontier', 'lore:hellgate'],
            npcIds: ['upper_expedition_warden'],
            objects: [],
            connections: [
                connect('inverse_hellgate_approach'),
                connect('boundary_anchor_forge'),
                connect('daclevis_gaze_observatory'),
                connect('witchscar_east_survey'),
                connect('witchscar_west_survey'),
            ],
        },
        {
            id: 'boundary_anchor_forge',
            name: '경계닻 공방',
            x: 8_000,
            y: -7_800,
            z: 1_010,
            mapColor: '#625a76',
            zoneType: 'safe',
            tags: ['location:upper-dimension', 'region:daclevis-frontier', 'lore:hellgate'],
            npcIds: [],
            objects: [],
            connections: [connect(UPPER_DIMENSION_EXPEDITION_HUB_LOCATION_ID)],
        },
        {
            id: 'daclevis_gaze_observatory',
            name: '마녀시선 관측소',
            x: 8_000,
            y: -8_200,
            z: 1_040,
            mapColor: '#625a76',
            zoneType: 'safe',
            tags: ['location:upper-dimension', 'region:daclevis-frontier', 'lore:daclevis'],
            npcIds: [],
            objects: [],
            connections: [connect(UPPER_DIMENSION_EXPEDITION_HUB_LOCATION_ID)],
        },
        {
            id: 'witchscar_east_survey',
            name: '마녀흔 동부 정찰로',
            x: 8_220,
            y: -7_880,
            z: 1_020,
            mapColor: '#625a76',
            zoneType: 'neutral',
            tags: [...upperDimensionTags, 'location:expedition-scout-route'],
            npcIds: [],
            objects: [],
            connections: [
                connect(UPPER_DIMENSION_EXPEDITION_HUB_LOCATION_ID),
                connect('first_invasion_crossing'),
            ],
        },
        {
            id: 'witchscar_west_survey',
            name: '마녀흔 서부 정찰로',
            x: 8_220,
            y: -8_120,
            z: 960,
            mapColor: '#625a76',
            zoneType: 'neutral',
            tags: [...upperDimensionTags, 'location:expedition-scout-route'],
            npcIds: [],
            objects: [],
            connections: [
                connect(UPPER_DIMENSION_EXPEDITION_HUB_LOCATION_ID),
                connect('first_invasion_crossing'),
            ],
        },
        {
            id: 'first_invasion_crossing',
            name: '첫 침공흔 합류지',
            x: 8_440,
            y: -8_000,
            z: 1_000,
            mapColor: '#625a76',
            zoneType: 'neutral',
            tags: [...upperDimensionTags, 'location:expedition-forward-line'],
            npcIds: [],
            objects: [],
            connections: [
                connect('witchscar_east_survey'),
                connect('witchscar_west_survey'),
            ],
        },
    ];
}
