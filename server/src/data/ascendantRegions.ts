import type { LocationData } from '../../../shared/types.js';
import type { TagId } from '../../../shared/tags.js';
import { GameTags } from '../../../shared/tags.js';

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

/**
 * Lv.500 이후 50레벨 단위 권역의 단일 원본.
 * 전용 아트 제작 전에는 속성·장비 카테고리 fallback을 명시적으로 재사용한다.
 */
export const ASCENDANT_REGIONS: readonly AscendantRegionDefinition[] = Object.freeze([
    {
        id: 'skygrave', name: '천공묘역', startLevel: 500, bossLevel: 550, mapColor: '#45586a',
        propertyTags: [GameTags.PROPERTY_ELECTRIC, GameTags.PROPERTY_LIGHT],
        materialName: '부유묘철', normalNames: ['낙뢰깃 망령', '부유석 장의사', '허공비늘 추적자'],
        bossName: '천장송주 아엘로스',
        environment: {
            id: 'thin_air', label: '희박한 대기',
            description: '천공묘역의 희박한 대기가 생명력 재생을 낮추지만 투사체의 비행을 가속합니다.',
            icon: 'affinities/electric',
        },
    },
    {
        id: 'abyssglass', name: '심연유리해', startLevel: 550, bossLevel: 600, mapColor: '#315869',
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
        id: 'dreamarchive', name: '몽각서고', startLevel: 600, bossLevel: 650, mapColor: '#5a4967',
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
        id: 'thunderforge', name: '뇌화천로', startLevel: 650, bossLevel: 700, mapColor: '#6a5537',
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
        id: 'rustworld', name: '적철폐계', startLevel: 700, bossLevel: 750, mapColor: '#68483d',
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
        id: 'paleeclipse', name: '백식회랑', startLevel: 750, bossLevel: 800, mapColor: '#69645b',
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
        id: 'crimsongravity', name: '홍중력원', startLevel: 800, bossLevel: 850, mapColor: '#6a3d49',
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
        id: 'silentdivine', name: '무언신림', startLevel: 850, bossLevel: 900, mapColor: '#405b4c',
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
        id: 'nulllibrary', name: '공백대서고', startLevel: 900, bossLevel: 950, mapColor: '#4d4d59',
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
        id: 'originboundary', name: '기원경계', startLevel: 950, bossLevel: 1000, mapColor: '#625a76',
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

function connect(locationId: string, condition?: string): LocationData['connections'][number] {
    return condition ? { locationId, condition } : { locationId };
}

function spawn(dataId: string, maxCount = 2): LocationData['objects'][number] {
    return { type: 'monster', dataId, maxCount, respawnTime: 30 };
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
                id: `${id}_threshold`, name: `${region.name} 경계문`,
                x, y, z, mapColor: region.mapColor, zoneType: 'neutral', tags: commonTags,
                npcIds: [], objects: [spawn(monsterIds[0], 2)],
                connections: [
                    ...(previous ? [connect(`${previous.id}_transition`)] : []),
                    connect(`${id}_waystation`),
                    connect(`${id}_outer_fork`),
                ],
            },
            {
                id: `${id}_waystation`, name: `${region.name} 전초거점`,
                x: x + 120, y: y - 160, z, mapColor: region.mapColor, mapIcon: 'town-plaza',
                zoneType: 'safe', shopId: `${id}_waystation_store`, tags: [GameTags.LOCATION_SAFE, GameTags.LOCATION_SHOP, regionTag],
                npcIds: [], objects: [], connections: [connect(`${id}_threshold`), connect(`${id}_outer_fork`)],
            },
            {
                id: `${id}_outer_fork`, name: `${region.name} 외곽 삼거리`,
                x: x + 250, y, z, mapColor: region.mapColor, zoneType: 'hostile', tags: commonTags,
                npcIds: [], objects: [spawn(monsterIds[0], 3)],
                connections: [connect(`${id}_threshold`), connect(`${id}_waystation`), connect(`${id}_upper_bend`), connect(`${id}_lower_bend`)],
            },
            {
                id: `${id}_upper_bend`, name: `${region.name} 상층 굽이`,
                x: x + 410, y: y - 170, z: z + 35, mapColor: region.mapColor, zoneType: 'hostile', tags: commonTags,
                npcIds: [], objects: [spawn(monsterIds[0], 2), spawn(monsterIds[1], 1)],
                connections: [connect(`${id}_outer_fork`), connect(`${id}_upper_gallery`), connect(`${id}_lower_gallery`)],
            },
            {
                id: `${id}_upper_gallery`, name: `${region.name} 상층 회랑`,
                x: x + 590, y: y - 230, z: z + 65, mapColor: region.mapColor, zoneType: 'hostile', tags: commonTags,
                npcIds: [], objects: [spawn(monsterIds[1], 3)],
                connections: [connect(`${id}_upper_bend`), connect(`${id}_inner_crossroads`), connect(`${id}_reliquary`)],
            },
            {
                id: `${id}_lower_bend`, name: `${region.name} 하층 굽이`,
                x: x + 410, y: y + 180, z: z - 40, mapColor: region.mapColor, zoneType: 'hostile', tags: commonTags,
                npcIds: [], objects: [spawn(monsterIds[0], 2), spawn(monsterIds[2], 1)],
                connections: [connect(`${id}_outer_fork`), connect(`${id}_lower_gallery`)],
            },
            {
                id: `${id}_lower_gallery`, name: `${region.name} 하층 회랑`,
                x: x + 600, y: y + 240, z: z - 70, mapColor: region.mapColor, zoneType: 'hostile', tags: commonTags,
                npcIds: [], objects: [spawn(monsterIds[2], 3)],
                connections: [connect(`${id}_lower_bend`), connect(`${id}_upper_bend`), connect(`${id}_inner_crossroads`), connect(`${id}_reliquary`)],
            },
            {
                id: `${id}_inner_crossroads`, name: `${region.name} 내부 교차로`,
                x: x + 760, y, z, mapColor: region.mapColor, zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON],
                npcIds: [], objects: [spawn(monsterIds[1], 2), spawn(monsterIds[2], 2)],
                connections: [connect(`${id}_upper_gallery`), connect(`${id}_lower_gallery`), connect(`${id}_deep_loop`)],
            },
            {
                id: `${id}_sealed_altar`, name: `${region.name} 봉인 제단`,
                x: x + 930, y: y + 390, z: z - 160, mapColor: region.mapColor,
                zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON, GameTags.LOCATION_HIDDEN],
                npcIds: [], objects: [{ type: 'resource', dataId: `${id}_altar`, maxCount: 1, respawnTime: 0 }],
                connections: [connect(`${id}_deep_loop`)],
            },
            {
                id: `${id}_deep_loop`, name: `${region.name} 심층 순환로`,
                x: x + 900, y: y + 120, z: z - 25, mapColor: region.mapColor, zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON],
                npcIds: [], objects: [spawn(monsterIds[2], 3)],
                connections: [connect(`${id}_inner_crossroads`), connect(`${id}_reliquary`), connect(`${id}_sealed_altar`), connect(`${id}_transition`)],
            },
            {
                id: `${id}_reliquary`, name: `${region.name} 봉인 보물실`,
                x: x + 770, y: y + 340, z: z - 90, mapColor: region.mapColor,
                zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON],
                npcIds: [], objects: [{ type: 'resource', dataId: `${id}_reliquary`, maxCount: 1, respawnTime: 0 }],
                connections: [connect(`${id}_upper_gallery`), connect(`${id}_lower_gallery`), connect(`${id}_deep_loop`)],
            },
            {
                id: `${id}_transition`, name: `${region.name} 이행단층`,
                x: x + 1_030, y, z, mapColor: region.mapColor, zoneType: 'hostile', tags: commonTags,
                npcIds: [], objects: [spawn(monsterIds[1], 2)],
                connections: [
                    connect(`${id}_deep_loop`),
                    connect(`${id}_boss_sanctum`),
                    ...(next ? [connect(`${next.id}_threshold`, `level_${next.startLevel}`)] : []),
                ],
            },
            {
                id: `${id}_boss_sanctum`, name: `${region.name} 숨은 심층`,
                x: x + 1_000, y: y - 300, z: z - 120, mapColor: region.mapColor,
                zoneType: 'hostile', tags: [...commonTags, GameTags.LOCATION_DUNGEON, GameTags.LOCATION_BOSS_ROOM],
                npcIds: [], objects: [{ type: 'monster', dataId: `${id}_sovereign`, maxCount: 1, respawnTime: 1_800 }],
                connections: [connect(`${id}_transition`)],
            },
        ];
        return locations;
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
