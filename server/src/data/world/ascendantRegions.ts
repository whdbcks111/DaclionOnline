import type { LocationData } from '../../../../shared/types.js';
import type { TagId } from '../../../../shared/tags.js';
import { GameTags } from '../../../../shared/tags.js';
import { getFishingEquipmentTierByLocation } from '../professions/fishingEquipmentCatalog.js';

export interface AscendantRegionDefinition {
    readonly id: string;
    readonly name: string;
    readonly startLevel: number;
    readonly bossLevel: number;
    readonly mapColor: string;
    readonly propertyTags: readonly TagId[];
    readonly materialName: string;
    readonly normalNames: readonly [string, string, string];
    readonly bossName: string;
    readonly environment: {
        readonly id: string;
        readonly label: string;
        readonly description: string;
        readonly icon: string;
    };
}

export interface AscendantRegionLayout {
    readonly x: number;
    readonly y: number;
    readonly quarterTurns: 0 | 1 | 2 | 3;
}

/**
 * Lv.500 이후 50레벨 단위 권역의 단일 원본.
 * 전용 아트 제작 전에는 속성·장비 카테고리 fallback을 명시적으로 재사용한다.
 */
export const ASCENDANT_REGIONS: readonly AscendantRegionDefinition[] = Object.freeze([
    {
        id: 'skygrave', name: '세라핀 하늘묘지', startLevel: 500, bossLevel: 550, mapColor: '#45586a',
        propertyTags: [GameTags.PROPERTY_ELECTRIC, GameTags.PROPERTY_LIGHT],
        materialName: '부유묘철', normalNames: ['낙뢰깃 망령', '부유석 장의사', '허공비늘 추적자'],
        bossName: '천장송주 아엘로스',
        environment: {
            id: 'thin_air', label: '희박한 대기',
            description: '세라핀 하늘묘지의 희박한 대기가 생명력 재생을 낮추지만 투사체의 비행을 가속합니다.',
            icon: 'affinities/electric',
        },
    },
    {
        id: 'abyssglass', name: '네레이아 수정바다', startLevel: 550, bossLevel: 600, mapColor: '#315869',
        propertyTags: [GameTags.PROPERTY_WATER, GameTags.PROPERTY_DARK],
        materialName: '심해유리', normalNames: ['압해 갑각수', '흑류 잠복자', '유리해파리'],
        bossName: '만압해왕 네레이돈',
        environment: {
            id: 'abyss_pressure', label: '심해 수압',
            description: '심해의 수압이 이동속도를 낮추는 대신 물리·마법 방어를 단단하게 압축합니다.',
            icon: 'affinities/water',
        },
    },
    {
        id: 'dreamarchive', name: '미르엔 꿈서고', startLevel: 600, bossLevel: 650, mapColor: '#5a4967',
        propertyTags: [GameTags.PROPERTY_DARK, GameTags.PROPERTY_NATURAL],
        materialName: '몽각지', normalNames: ['꿈먹는 서충', '기억묵 사서', '잠든 문장수'],
        bossName: '대몽서관 이도르',
        environment: {
            id: 'dream_dust', label: '몽진',
            description: '기억의 먼지가 감각을 예민하게 해 치명타를 강화하지만 마법 저항을 흐립니다.',
            icon: 'affinities/dark',
        },
    },
    {
        id: 'thunderforge', name: '벨토르 번개대장간', startLevel: 650, bossLevel: 700, mapColor: '#6a5537',
        propertyTags: [GameTags.PROPERTY_ELECTRIC, GameTags.PROPERTY_FIRE],
        materialName: '뇌화강', normalNames: ['전로 화정', '낙뢰 망치병', '천로 도가니수'],
        bossName: '뇌화대장군 볼카리온',
        environment: {
            id: 'magnetic_storm', label: '전자기 폭풍',
            description: '전자기 폭풍이 공격속도를 높이는 대신 마법 저항을 불안정하게 만듭니다.',
            icon: 'affinities/electric',
        },
    },
    {
        id: 'rustworld', name: '루스카 붉은황야', startLevel: 700, bossLevel: 750, mapColor: '#68483d',
        propertyTags: [GameTags.PROPERTY_METAL, GameTags.PROPERTY_POISON],
        materialName: '적철핵', normalNames: ['녹비늘 포식기', '산화거인', '폐계 수확자'],
        bossName: '적철군주 페록스',
        environment: {
            id: 'oxidized_air', label: '산화 대기',
            description: '산화된 공기가 방어력을 깎지만 부식된 틈을 읽어 관통력을 높입니다.',
            icon: 'affinities/metal',
        },
    },
    {
        id: 'paleeclipse', name: '루멘 흰그늘길', startLevel: 750, bossLevel: 800, mapColor: '#69645b',
        propertyTags: [GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_HOLY],
        materialName: '백식석', normalNames: ['식광 순례자', '백야 사냥개', '무영 성가자'],
        bossName: '백식성자 루멘',
        environment: {
            id: 'pale_afterglow', label: '백식 잔광',
            description: '그림자를 지운 잔광이 치명타 피해를 높이지만 생명력 재생을 억제합니다.',
            icon: 'affinities/light',
        },
    },
    {
        id: 'crimsongravity', name: '그라벨 붉은분지', startLevel: 800, bossLevel: 850, mapColor: '#6a3d49',
        propertyTags: [GameTags.PROPERTY_EARTH, GameTags.PROPERTY_FIRE],
        materialName: '홍중정', normalNames: ['적도 중력수', '홍핵 거상', '낙하궤도 사냥꾼'],
        bossName: '홍중력황 그라비온',
        environment: {
            id: 'gravity_flood', label: '중력 홍수',
            description: '넘치는 중력이 이동을 무겁게 하지만 최대 생명력과 방어력을 끌어올립니다.',
            icon: 'affinities/earth',
        },
    },
    {
        id: 'silentdivine', name: '아오이 고요숲', startLevel: 850, bossLevel: 900, mapColor: '#405b4c',
        propertyTags: [GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_HOLY],
        materialName: '무언성목', normalNames: ['묵언 수호록', '성흔 이끼사슴', '기도먹는 덩굴'],
        bossName: '침묵신수 에클레시아',
        environment: {
            id: 'silent_prayer', label: '무언의 기도',
            description: '소리 없는 기도가 정신력 재생을 낮추는 대신 마법력과 마법 저항을 높입니다.',
            icon: 'affinities/holy',
        },
    },
    {
        id: 'nulllibrary', name: '니힐 기록원', startLevel: 900, bossLevel: 950, mapColor: '#4d4d59',
        propertyTags: [GameTags.PROPERTY_DARK, GameTags.PROPERTY_UNDEAD],
        materialName: '공백잉크', normalNames: ['삭제된 기사', '무명색인충', '백지 집행자'],
        bossName: '공백대사서 니힐',
        environment: {
            id: 'blank_erosion', label: '공백 침식',
            description: '기록을 지우는 공백이 공격력을 낮추지만 적의 방어를 읽는 관통력을 높입니다.',
            icon: 'affinities/undead',
        },
    },
    {
        id: 'originboundary', name: '아르케 끝자락', startLevel: 950, bossLevel: 1000, mapColor: '#625a76',
        propertyTags: [GameTags.PROPERTY_HOLY, GameTags.PROPERTY_DARK],
        materialName: '기원결정', normalNames: ['첫빛 모사체', '종말 이전의 그림자', '경계선 파수자'],
        bossName: '기원종언체 아르케',
        environment: {
            id: 'origin_resonance', label: '기원 공명',
            description: '세계의 시작과 끝이 공명해 공격력과 마법력을 함께 증폭합니다.',
            icon: 'affinities/holy',
        },
    },
]);

/**
 * 권역 진행선을 한 방향으로 늘이지 않고 큰 순환 대륙처럼 배치한다.
 * 각 좌표는 경계문의 위치이며 quarterTurns만큼 권역 내부 미궁 전체를 회전한다.
 */
export const ASCENDANT_REGION_LAYOUTS: readonly AscendantRegionLayout[] = Object.freeze([
    { x: 3_800, y: -3_650, quarterTurns: 0 },
    { x: 4_950, y: -3_650, quarterTurns: 3 },
    { x: 4_950, y: -4_800, quarterTurns: 0 },
    { x: 6_100, y: -4_800, quarterTurns: 3 },
    { x: 6_100, y: -5_950, quarterTurns: 2 },
    { x: 4_950, y: -5_950, quarterTurns: 2 },
    // 후반 권역은 남쪽의 빈 회랑으로 이어 붙인다. 기존처럼 안쪽으로 되감으면
    // 아오이부터 앞선 권역의 노드와 선이 겹쳐 지도를 판독하기 어렵다.
    { x: 3_800, y: -5_950, quarterTurns: 3 },
    { x: 3_800, y: -7_100, quarterTurns: 0 },
    { x: 4_950, y: -7_100, quarterTurns: 0 },
    { x: 6_100, y: -7_100, quarterTurns: 0 },
]);

export interface HighLevelMineDefinition {
    readonly regionId: string;
    readonly id: string;
    readonly name: string;
    readonly level: number;
    readonly rawMineralIds: readonly [string, string];
}

export const HIGH_LEVEL_MINES: readonly HighLevelMineDefinition[] = Object.freeze([
    { regionId: 'abyssglass', id: 'abyssglass_starfall_mine', name: '스타폴 심해광산', level: 600, rawMineralIds: ['astral_iron_ore', 'abyss_pearl_ore'] },
    { regionId: 'rustworld', id: 'rustworld_redcore_mine', name: '루스카 폐광', level: 750, rawMineralIds: ['thunder_quartz_ore', 'life_blood_ore'] },
    { regionId: 'silentdivine', id: 'silentdivine_votive_mine', name: '아오이 지하광산', level: 900, rawMineralIds: ['void_opal_ore', 'prayerstone_ore'] },
    { regionId: 'originboundary', id: 'originboundary_firstvein_mine', name: '아르케 광산', level: 1000, rawMineralIds: ['origin_prism_ore', 'timeglass_ore'] },
]);

export interface HighLevelFishingSpotDefinition {
    readonly regionId: string;
    readonly id: string;
    readonly name: string;
    readonly level: number;
}

export const HIGH_LEVEL_FISHING_SPOTS: readonly HighLevelFishingSpotDefinition[] = Object.freeze([
    { regionId: 'abyssglass', id: 'abyssglass_pressure_lagoon', name: '네레이아 푸른석호', level: 575 },
    { regionId: 'dreamarchive', id: 'dreamarchive_inkwater_pool', name: '미르엔 잉크연못', level: 625 },
    { regionId: 'rustworld', id: 'rustworld_mercury_reservoir', name: '루스카 은빛저수지', level: 725 },
    { regionId: 'silentdivine', id: 'silentdivine_prayer_spring', name: '아오이 기도샘', level: 875 },
    { regionId: 'originboundary', id: 'originboundary_genesis_tide', name: '아르케 물결터', level: 975 },
]);

function connect(locationId: string, condition?: string): LocationData['connections'][number] {
    return condition ? { locationId, condition } : { locationId };
}

function spawn(dataId: string, maxCount = 2): LocationData['objects'][number] {
    return { type: 'monster', dataId, maxCount, respawnTime: 30 };
}

function rotateMapOffset(x: number, y: number, quarterTurns: AscendantRegionLayout['quarterTurns']): [number, number] {
    if (quarterTurns === 1) return [-y, x];
    if (quarterTurns === 2) return [-x, -y];
    if (quarterTurns === 3) return [y, -x];
    return [x, y];
}

/** 분기·교차·순환·막다른 보물방과 선택형 보스 가지를 가진 권역 장소를 생성한다. */
export function buildAscendantLocations(): LocationData[] {
    return ASCENDANT_REGIONS.flatMap((region, index) => {
        const id = region.id;
        const x = 8_200 + index * 1_050;
        const y = (index % 2 === 0 ? -1 : 1) * (720 + index * 90);
        const z = index * 120;
        const regionTag = `location:${id}`;
        const commonTags: TagId[] = [GameTags.LOCATION_WILDERNESS, regionTag, ...region.propertyTags];
        const monsterIds = [`${id}_vanguard`, `${id}_keeper`, `${id}_stalker`] as const;
        const previous = ASCENDANT_REGIONS[index - 1];
        const next = ASCENDANT_REGIONS[index + 1];

        const locations: LocationData[] = [
            {
                id: `${id}_threshold`, name: `${region.name} 들머리`,
                x, y, z, mapColor: region.mapColor, zoneType: 'neutral', tags: commonTags,
                npcIds: [], objects: [spawn(monsterIds[0], 2)],
                connections: [
                    ...(previous ? [connect(`${previous.id}_transition`)] : []),
                    connect(`${id}_waystation`),
                    connect(`${id}_outer_fork`),
                ],
            },
            {
                id: `${id}_waystation`, name: `${region.name} 쉼터`,
                x: x + 120, y: y - 160, z, mapColor: region.mapColor, mapIcon: 'town-plaza',
                zoneType: 'safe', shopId: `${id}_waystation_store`, tags: [GameTags.LOCATION_SAFE, GameTags.LOCATION_SHOP, regionTag],
                npcIds: [],
                objects: [{ type: 'resource', dataId: `${id}_dimensional_rift`, maxCount: 1, respawnTime: 0 }],
                connections: [connect(`${id}_threshold`), connect(`${id}_outer_fork`)],
            },
            {
                id: `${id}_outer_fork`, name: `${region.name} 바깥 갈림길`,
                x: x + 250, y, z, mapColor: region.mapColor, zoneType: 'hostile', tags: commonTags,
                npcIds: [], objects: [spawn(monsterIds[0], 3)],
                connections: [connect(`${id}_threshold`), connect(`${id}_waystation`), connect(`${id}_upper_bend`), connect(`${id}_lower_bend`)],
            },
            {
                id: `${id}_upper_bend`, name: `${region.name} 높은길 굽이`,
                x: x + 410, y: y - 170, z: z + 35, mapColor: region.mapColor, zoneType: 'hostile', tags: commonTags,
                npcIds: [], objects: [spawn(monsterIds[0], 2), spawn(monsterIds[1], 1)],
                connections: [
                    connect(`${id}_outer_fork`),
                    connect(`${id}_upper_gallery`),
                    connect(`${id}_lower_gallery`),
                    connect(`${id}_west_rise`),
                ],
            },
            {
                id: `${id}_upper_gallery`, name: `${region.name} 윗길 회랑`,
                x: x + 590, y: y - 230, z: z + 65, mapColor: region.mapColor, zoneType: 'hostile', tags: commonTags,
                npcIds: [], objects: [spawn(monsterIds[1], 3)],
                connections: [
                    connect(`${id}_upper_bend`),
                    connect(`${id}_inner_crossroads`),
                    connect(`${id}_reliquary`),
                    connect(`${id}_north_fork`),
                ],
            },
            {
                id: `${id}_lower_bend`, name: `${region.name} 낮은길 굽이`,
                x: x + 410, y: y + 180, z: z - 40, mapColor: region.mapColor, zoneType: 'hostile', tags: commonTags,
                npcIds: [], objects: [spawn(monsterIds[0], 2), spawn(monsterIds[2], 1)],
                connections: [connect(`${id}_outer_fork`), connect(`${id}_lower_gallery`), connect(`${id}_broken_span`)],
            },
            {
                id: `${id}_lower_gallery`, name: `${region.name} 아랫길 회랑`,
                x: x + 600, y: y + 240, z: z - 70, mapColor: region.mapColor, zoneType: 'hostile', tags: commonTags,
                npcIds: [], objects: [spawn(monsterIds[2], 3)],
                connections: [
                    connect(`${id}_lower_bend`),
                    connect(`${id}_upper_bend`),
                    connect(`${id}_inner_crossroads`),
                    connect(`${id}_reliquary`),
                    connect(`${id}_south_fork`),
                ],
            },
            {
                id: `${id}_inner_crossroads`, name: `${region.name} 중심 갈림길`,
                x: x + 760, y, z, mapColor: region.mapColor, zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON],
                npcIds: [], objects: [spawn(monsterIds[1], 2), spawn(monsterIds[2], 2)],
                connections: [
                    connect(`${id}_upper_gallery`),
                    connect(`${id}_lower_gallery`),
                    connect(`${id}_deep_loop`),
                    connect(`${id}_north_loop`),
                    connect(`${id}_south_loop`),
                    connect(`${id}_spiral_entry`),
                ],
            },
            {
                id: `${id}_west_rise`, name: `${region.name} 외곽 오름길`,
                x: x + 350, y: y - 330, z: z + 55, mapColor: region.mapColor,
                zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON],
                npcIds: [], objects: [spawn(monsterIds[0], 1)],
                connections: [connect(`${id}_upper_bend`), connect(`${id}_echo_balcony`)],
            },
            {
                id: `${id}_echo_balcony`, name: `${region.name} 메아리 발코니`,
                x: x + 200, y, z: z + 90, mapColor: region.mapColor,
                zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON],
                npcIds: [], objects: [],
                connections: [connect(`${id}_west_rise`), connect(`${id}_broken_span`)],
            },
            {
                id: `${id}_broken_span`, name: `${region.name} 무너진 다리`,
                x: x + 350, y: y + 330, z: z - 55, mapColor: region.mapColor,
                zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON],
                npcIds: [], objects: [spawn(monsterIds[2], 1)],
                connections: [connect(`${id}_echo_balcony`), connect(`${id}_lower_bend`)],
            },
            {
                id: `${id}_north_fork`, name: `${region.name} 북쪽 갈림방`,
                x: x + 650, y: y - 390, z: z + 105, mapColor: region.mapColor,
                zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON],
                npcIds: [], objects: [spawn(monsterIds[1], 1)],
                connections: [connect(`${id}_upper_gallery`), connect(`${id}_north_archive`)],
            },
            {
                id: `${id}_north_archive`, name: `${region.name} 북쪽 잔향 창고`,
                x: x + 800, y: y - 500, z: z + 135, mapColor: region.mapColor,
                zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON],
                npcIds: [], objects: [spawn(monsterIds[1], 1)],
                connections: [
                    connect(`${id}_north_fork`),
                    connect(`${id}_north_loop`),
                    connect(`${id}_hunter_cache`),
                ],
            },
            {
                id: `${id}_north_loop`, name: `${region.name} 북쪽 돌아가는 길`,
                x: x + 900, y: y - 330, z: z + 75, mapColor: region.mapColor,
                zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON],
                npcIds: [], objects: [],
                connections: [connect(`${id}_north_archive`), connect(`${id}_inner_crossroads`)],
            },
            {
                id: `${id}_south_fork`, name: `${region.name} 남쪽 갈림방`,
                x: x + 650, y: y + 400, z: z - 105, mapColor: region.mapColor,
                zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON],
                npcIds: [], objects: [spawn(monsterIds[2], 1)],
                connections: [connect(`${id}_lower_gallery`), connect(`${id}_south_archive`)],
            },
            {
                id: `${id}_south_archive`, name: `${region.name} 남쪽 잔향 창고`,
                x: x + 810, y: y + 510, z: z - 135, mapColor: region.mapColor,
                zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON],
                npcIds: [], objects: [spawn(monsterIds[2], 1)],
                connections: [
                    connect(`${id}_south_fork`),
                    connect(`${id}_south_loop`),
                    connect(`${id}_material_cache`),
                ],
            },
            {
                id: `${id}_south_loop`, name: `${region.name} 남쪽 돌아가는 길`,
                x: x + 910, y: y + 330, z: z - 75, mapColor: region.mapColor,
                zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON],
                npcIds: [], objects: [],
                connections: [connect(`${id}_south_archive`), connect(`${id}_inner_crossroads`)],
            },
            {
                id: `${id}_hunter_cache`, name: `${region.name} 길잃은 자의 비밀 창고`,
                x: x + 970, y: y - 540, z: z + 165, mapColor: region.mapColor,
                zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON],
                npcIds: [], objects: [{ type: 'resource', dataId: `${id}_reliquary`, maxCount: 1, respawnTime: 0 }],
                connections: [connect(`${id}_north_archive`)],
            },
            {
                id: `${id}_material_cache`, name: `${region.name} 침전물 비밀 창고`,
                x: x + 980, y: y + 550, z: z - 165, mapColor: region.mapColor,
                zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON],
                npcIds: [], objects: [{ type: 'resource', dataId: `${id}_reliquary`, maxCount: 1, respawnTime: 0 }],
                connections: [connect(`${id}_south_archive`)],
            },
            {
                id: `${id}_spiral_entry`, name: `${region.name} 나선 입구`,
                x: x + 820, y: y + 95, z: z - 10, mapColor: region.mapColor,
                zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON],
                npcIds: [], objects: [spawn(monsterIds[0], 1)],
                connections: [
                    connect(`${id}_inner_crossroads`),
                    connect(`${id}_spiral_upper`),
                    connect(`${id}_spiral_lower`),
                ],
            },
            {
                id: `${id}_spiral_upper`, name: `${region.name} 나선 윗길`,
                x: x + 930, y: y - 75, z: z + 55, mapColor: region.mapColor,
                zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON],
                npcIds: [], objects: [],
                connections: [connect(`${id}_spiral_entry`), connect(`${id}_spiral_nexus`)],
            },
            {
                id: `${id}_spiral_lower`, name: `${region.name} 나선 아랫길`,
                x: x + 940, y: y + 260, z: z - 65, mapColor: region.mapColor,
                zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON],
                npcIds: [], objects: [],
                connections: [connect(`${id}_spiral_entry`), connect(`${id}_spiral_nexus`)],
            },
            {
                id: `${id}_spiral_nexus`, name: `${region.name} 나선 합류점`,
                x: x + 1_010, y: y + 95, z: z - 15, mapColor: region.mapColor,
                zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON],
                npcIds: [], objects: [spawn(monsterIds[1], 1)],
                connections: [
                    connect(`${id}_spiral_upper`),
                    connect(`${id}_spiral_lower`),
                    connect(`${id}_deep_loop`),
                ],
            },
            {
                id: `${id}_altar_antechamber`, name: `${region.name} 제단 앞방`,
                x: x + 1_000, y: y + 380, z: z - 120, mapColor: region.mapColor,
                zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON, GameTags.LOCATION_HIDDEN],
                npcIds: [], objects: [],
                connections: [connect(`${id}_deep_loop`), connect(`${id}_sealed_altar`)],
            },
            {
                id: `${id}_final_fork`, name: `${region.name} 끝자락 갈림길`,
                x: x + 1_030, y: y - 80, z: z - 40, mapColor: region.mapColor,
                zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON],
                npcIds: [], objects: [],
                connections: [
                    connect(`${id}_deep_loop`),
                    connect(`${id}_transition`),
                    connect(`${id}_false_end`),
                ],
            },
            {
                id: `${id}_false_end`, name: `${region.name} 막다른 가짜방`,
                x: x + 1_120, y: y + 150, z: z - 95, mapColor: region.mapColor,
                zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON],
                npcIds: [], objects: [spawn(monsterIds[2], 2)],
                connections: [connect(`${id}_final_fork`)],
            },
            {
                id: `${id}_sealed_altar`, name: `${region.name} 숨은 제단`,
                x: x + 930, y: y + 390, z: z - 160, mapColor: region.mapColor,
                zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON, GameTags.LOCATION_HIDDEN],
                npcIds: [], objects: [{ type: 'resource', dataId: `${id}_altar`, maxCount: 1, respawnTime: 0 }],
                connections: [connect(`${id}_altar_antechamber`)],
            },
            {
                id: `${id}_deep_loop`, name: `${region.name} 깊은 순환길`,
                x: x + 900, y: y + 120, z: z - 25, mapColor: region.mapColor, zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON],
                npcIds: [], objects: [spawn(monsterIds[2], 3)],
                connections: [
                    connect(`${id}_inner_crossroads`),
                    connect(`${id}_reliquary`),
                    connect(`${id}_spiral_nexus`),
                    connect(`${id}_altar_antechamber`),
                    connect(`${id}_final_fork`),
                ],
            },
            {
                id: `${id}_reliquary`, name: `${region.name} 잠긴 보물방`,
                x: x + 770, y: y + 340, z: z - 90, mapColor: region.mapColor,
                zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON],
                npcIds: [], objects: [{ type: 'resource', dataId: `${id}_reliquary`, maxCount: 1, respawnTime: 0 }],
                connections: [connect(`${id}_upper_gallery`), connect(`${id}_lower_gallery`), connect(`${id}_deep_loop`)],
            },
            {
                id: `${id}_transition`, name: `${region.name} 다음 경계`,
                x: x + 1_030, y, z, mapColor: region.mapColor, zoneType: 'hostile', tags: commonTags,
                npcIds: [], objects: [spawn(monsterIds[1], 2)],
                connections: [
                    connect(`${id}_final_fork`),
                    connect(`${id}_boss_sanctum`),
                    ...(next ? [connect(`${next.id}_threshold`, `level_${next.startLevel}`)] : []),
                ],
            },
            {
                id: `${id}_boss_sanctum`, name: `${region.name} 군주의 은신처`,
                x: x + 1_000, y: y - 300, z: z - 120, mapColor: region.mapColor,
                zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON, GameTags.LOCATION_BOSS_ROOM],
                npcIds: [], objects: [{ type: 'monster', dataId: `${id}_sovereign`, maxCount: 1, respawnTime: 1_800 }],
                connections: [connect(`${id}_transition`)],
            },
        ];
        const mine = HIGH_LEVEL_MINES.find(candidate => candidate.regionId === id);
        if (mine) {
            locations.find(location => location.id === `${id}_outer_fork`)!.connections.push(connect(`${mine.id}_entrance`));
            const mineTags: TagId[] = [
                GameTags.LOCATION_WILDERNESS,
                GameTags.LOCATION_MINE,
                GameTags.LOCATION_DUNGEON,
                regionTag,
                GameTags.PROPERTY_STONE,
                ...region.propertyTags,
            ];
            locations.push(
                {
                    id: `${mine.id}_entrance`, name: `${mine.name} 입구`,
                    x: x + 180, y: y + 370, z: z - 90, mapColor: region.mapColor, mapIcon: 'mine-entrance',
                    zoneType: 'hostile', tags: mineTags, npcIds: [], objects: [spawn(monsterIds[0], 1)],
                    connections: [connect(`${id}_outer_fork`), connect(`${mine.id}_fork`)],
                },
                {
                    id: `${mine.id}_fork`, name: `${mine.name} 갱도 분기`,
                    x: x + 370, y: y + 470, z: z - 170, mapColor: region.mapColor,
                    zoneType: 'hostile', tags: mineTags, npcIds: [],
                    objects: [
                        spawn(monsterIds[1], 1),
                        { type: 'resource', dataId: `${mine.id}_ore_vein`, maxCount: 2, respawnTime: 180 },
                    ],
                    connections: [connect(`${mine.id}_entrance`), connect(`${mine.id}_deep`), connect(`${mine.id}_crystal_chamber`)],
                },
                {
                    id: `${mine.id}_deep`, name: `${mine.name} 심층 채굴장`,
                    x: x + 560, y: y + 420, z: z - 260, mapColor: region.mapColor,
                    zoneType: 'hostile', tags: mineTags, npcIds: [], objects: [
                        spawn(monsterIds[2], 2),
                        { type: 'resource', dataId: `${mine.id}_ore_vein`, maxCount: 3, respawnTime: 180 },
                    ],
                    connections: [connect(`${mine.id}_fork`), connect(`${mine.id}_crystal_chamber`)],
                },
                {
                    id: `${mine.id}_crystal_chamber`, name: `${mine.name} 희귀맥 공동`,
                    x: x + 510, y: y + 610, z: z - 300, mapColor: region.mapColor,
                    zoneType: 'hostile', tags: [...mineTags, GameTags.LOCATION_HIDDEN], npcIds: [], objects: [
                        { type: 'resource', dataId: `${mine.id}_ore_vein`, maxCount: 4, respawnTime: 180 },
                    ],
                    connections: [connect(`${mine.id}_fork`), connect(`${mine.id}_deep`)],
                },
            );
        }
        const fishingSpot = HIGH_LEVEL_FISHING_SPOTS.find(candidate => candidate.regionId === id);
        if (fishingSpot) {
            const equipmentTier = getFishingEquipmentTierByLocation(fishingSpot.id);
            if (!equipmentTier) throw new Error(`Missing fishing equipment tier: ${fishingSpot.id}`);
            // 네레이아·루스카의 기존 330 오프셋은 회전 뒤 앞 권역 나선 입구와 15만큼만
            // 떨어졌다. 물길 분기를 조금 더 바깥으로 빼 노드와 라벨을 분리한다.
            const fishingBranchOffsetY = id === 'abyssglass' || id === 'rustworld' ? 410 : 330;
            locations.find(location => location.id === `${id}_waystation`)!.connections.push(connect(fishingSpot.id));
            locations.push({
                id: fishingSpot.id,
                name: fishingSpot.name,
                x: x - 80,
                y: y - fishingBranchOffsetY,
                z: z - 25,
                mapColor: region.mapColor,
                mapIcon: 'fishing-spot',
                zoneType: 'neutral',
                shopId: equipmentTier.shopId,
                tags: [
                    GameTags.LOCATION_WILDERNESS,
                    GameTags.LOCATION_FISHING,
                    GameTags.LOCATION_SHOP,
                    regionTag,
                    GameTags.PROPERTY_WATER,
                    ...region.propertyTags,
                ],
                npcIds: [],
                objects: [{
                    type: 'resource',
                    dataId: equipmentTier.cacheResourceId,
                    maxCount: 1,
                    respawnTime: 0,
                }],
                connections: [connect(`${id}_waystation`)],
            });
        }
        const layout = ASCENDANT_REGION_LAYOUTS[index];
        if (!layout) throw new Error(`Missing ascendant region layout: ${region.id}`);
        return locations.map(location => {
            const [mapX, mapY] = rotateMapOffset(location.x - x, location.y - y, layout.quarterTurns);
            return {
                ...location,
                x: layout.x + mapX,
                y: layout.y + mapY,
            };
        });
    });
}

/** JSON 원본에 생성 권역을 합치고 기존 Lv.500 종점과 첫 권역을 양방향 연결한다. */
export function mergeAscendantLocations(baseLocations: readonly LocationData[]): LocationData[] {
    const generated = buildAscendantLocations();
    const merged = baseLocations.map(location => ({
        ...location,
        npcIds: [...location.npcIds],
        objects: location.objects.map(object => ({ ...object })),
        connections: location.connections.map(connection => ({ ...connection })),
        tags: [...location.tags],
    }));
    const knownIds = new Set(merged.map(location => location.id));
    for (const location of generated) {
        if (!knownIds.has(location.id)) {
            merged.push(location);
            knownIds.add(location.id);
        }
    }

    const oldFinale = merged.find(location => location.id === 'endstar_last_constellation');
    const firstThreshold = merged.find(location => location.id === 'skygrave_threshold');
    if (oldFinale && !oldFinale.connections.some(connection => connection.locationId === 'skygrave_threshold')) {
        oldFinale.connections.push(connect('skygrave_threshold', 'level_500'));
    }
    if (firstThreshold && !firstThreshold.connections.some(connection => connection.locationId === 'endstar_last_constellation')) {
        firstThreshold.connections.push(connect('endstar_last_constellation'));
    }
    return merged;
}
