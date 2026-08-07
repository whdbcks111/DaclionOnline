import { GameTags, type TagId } from '../../../../shared/tags.js';
import { defineResource, registerResourceInteraction } from '../../models/actors/Resource.js';
import { defineInstanceDungeon } from '../../models/world/InstanceDungeon.js';
import { MonsterRank, MonsterStatProfile } from '../../models/actors/MonsterStats.js';
import { instanceDungeonManager } from '../../modules/world/instanceDungeon.js';
import { ASCENDANT_REGIONS } from './ascendantRegions.js';
import { defineWorldMonster } from './monsters.js';

interface RiftFamilyDefinition {
    readonly key: string;
    readonly dungeonName: string;
    readonly gateId: string;
    readonly gateName: string;
    readonly recommendedLevel: number;
    readonly bossLevel: number;
    readonly durationSeconds: number;
    readonly propertyTags: readonly TagId[];
    readonly names: readonly [string, string, string, string];
    readonly icons: readonly [string, string, string, string];
    readonly statusEffectId: string;
    readonly dropItemId: string;
    readonly monsterIds?: readonly [string, string, string, string];
}

const lowerRiftFamilies: readonly RiftFamilyDefinition[] = [
    {
        key: 'distorted_meadow', dungeonName: '뒤틀린 초원 균열',
        gateId: 'unstable_dimensional_rift', gateName: '불안정한 차원 균열',
        recommendedLevel: 10, bossLevel: 15, durationSeconds: 5 * 60,
        propertyTags: [GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_DARK],
        names: ['원형질 균열 슬라임', '무광 점액 수문장', '자색 균열 추적체', '열화 이전의 늪핵'],
        icons: ['grass_slime', 'bog_slime', 'purple_slime', 'swamp_core'],
        statusEffectId: 'poison', dropItemId: 'health_potion',
        monsterIds: ['rift_slime_vanguard', 'distorted_meadow_rift_keeper', 'rift_slime_stalker', 'rift_prime_core'],
    },
    {
        key: 'eternal_caldera', dungeonName: '꺼지지 않는 화구 균열',
        gateId: 'eternal_caldera_dimensional_rift', gateName: '타오르는 차원 균열',
        recommendedLevel: 50, bossLevel: 60, durationSeconds: 6 * 60,
        propertyTags: [GameTags.PROPERTY_FIRE, GameTags.PROPERTY_EARTH],
        names: ['태초화염 도롱뇽', '용암갑주 집행체', '화구맥 추적수', '불멸화구 심장'],
        icons: ['flame_salamander', 'lava_armor', 'caldera_beast', 'crater_heart'],
        statusEffectId: 'fire', dropItemId: 'ember_ore',
    },
    {
        key: 'primal_glassdune', dungeonName: '태양 이전의 유리사막 균열',
        gateId: 'primal_glassdune_dimensional_rift', gateName: '굴절하는 차원 균열',
        recommendedLevel: 100, bossLevel: 115, durationSeconds: 6 * 60,
        propertyTags: [GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_EARTH],
        names: ['원시 유리각충', '일광결정 수문장', '신기루 포식자', '첫 태양의 거상'],
        icons: ['glassdune_skitterer', 'sun_shard_elemental', 'mirage_jackal', 'sun_vault_colossus'],
        statusEffectId: 'blindness', dropItemId: 'glass_sand',
    },
    {
        key: 'everfrost_loom', dungeonName: '영구동결 직조 균열',
        gateId: 'everfrost_loom_dimensional_rift', gateName: '얼어붙은 차원 균열',
        recommendedLevel: 145, bossLevel: 160, durationSeconds: 6 * 60,
        propertyTags: [GameTags.PROPERTY_ICE, GameTags.PROPERTY_NATURAL],
        names: ['백빙 송곳니', '만년빙벽 수문장', '빙사 직조추적자', '태고서리 여왕'],
        icons: ['rimeclaw_wolf', 'glacier_golem', 'icesilk_spider', 'frostglass_queen'],
        statusEffectId: 'slowness', dropItemId: 'rime_crystal',
    },
    {
        key: 'clockwork_origin', dungeonName: '최초 시계공방 균열',
        gateId: 'clockwork_origin_dimensional_rift', gateName: '역행하는 차원 균열',
        recommendedLevel: 220, bossLevel: 240, durationSeconds: 7 * 60,
        propertyTags: [GameTags.PROPERTY_METAL, GameTags.PROPERTY_ELECTRIC],
        names: ['기원 톱니탐식자', '시간강 백인대장', '역설 사냥기', '원초설계자'],
        icons: ['gearmite_scavenger', 'scrap_centurion', 'clockwork_hound', 'paradox_architect'],
        statusEffectId: 'paralytic_poison', dropItemId: 'chronosteel_shard',
    },
    {
        key: 'uncrowned_void', dungeonName: '왕관 없는 공허 균열',
        gateId: 'uncrowned_void_dimensional_rift', gateName: '빛을 삼키는 차원 균열',
        recommendedLevel: 300, bossLevel: 325, durationSeconds: 7 * 60,
        propertyTags: [GameTags.PROPERTY_DARK, GameTags.PROPERTY_METAL],
        names: ['무관의 심연기사', '공허기록 수문장', '왕관포식 키메라', '태초공허 섭정'],
        icons: ['abyssal_knight', 'crown_archivist', 'crown_chimera', 'voidcrown_regent'],
        statusEffectId: 'silence', dropItemId: 'void_silk',
    },
    {
        key: 'first_worldroot', dungeonName: '첫 세계수의 뿌리 균열',
        gateId: 'first_worldroot_dimensional_rift', gateName: '맥동하는 차원 균열',
        recommendedLevel: 370, bossLevel: 395, durationSeconds: 8 * 60,
        propertyTags: [GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_HOLY],
        names: ['태초수피 허물', '기억호박 수문장', '역근 포식자', '시원심목 아르보르'],
        icons: ['skyroot_husk', 'memory_amber_moth', 'inverse_root_devourer', 'primordial_heart_arbor'],
        statusEffectId: 'decay', dropItemId: 'skyroot_bark',
    },
    {
        key: 'starbirth_orbit', dungeonName: '별탄생 궤도 균열',
        gateId: 'starbirth_orbit_dimensional_rift', gateName: '공전하는 차원 균열',
        recommendedLevel: 410, bossLevel: 440, durationSeconds: 8 * 60,
        propertyTags: [GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_ELECTRIC],
        names: ['원성운 가오리', '혜성핵 수문장', '궤도절단 추적체', '첫 성운의 군주'],
        icons: ['stardust_manta', 'comet_iron_knight', 'orbit_ripper', 'nebula_sovereign'],
        statusEffectId: 'blindness', dropItemId: 'comet_iron',
    },
    {
        key: 'preterminal_constellation', dungeonName: '종말 이전 성좌 균열',
        gateId: 'preterminal_constellation_dimensional_rift', gateName: '소멸하는 차원 균열',
        recommendedLevel: 490, bossLevel: 520, durationSeconds: 9 * 60,
        propertyTags: [GameTags.PROPERTY_FIRE, GameTags.PROPERTY_DARK],
        names: ['종성 이전의 재령', '성좌사슬 수문장', '엔트로피 추적천사', '마지막 이전의 성좌'],
        icons: ['ash_wraith', 'constellation_hunter', 'entropy_seraph', 'last_constellation'],
        statusEffectId: 'curse', dropItemId: 'endstar_ash',
    },
];

const ascendantStatusEffects = [
    'paralytic_poison', 'slowness', 'blindness', 'fire', 'defense_reduction',
    'silence', 'overmaster', 'decay', 'curse', 'bind',
] as const;

const ascendantRiftFamilies: readonly RiftFamilyDefinition[] = ASCENDANT_REGIONS.map((region, index) => ({
    key: `${region.id}_origin`,
    dungeonName: `${region.name} 원형 균열`,
    gateId: `${region.id}_dimensional_rift`,
    gateName: `${region.name} 원형 차원 균열`,
    recommendedLevel: region.startLevel + 10,
    bossLevel: region.startLevel + 30,
    durationSeconds: 9 * 60,
    propertyTags: region.propertyTags,
    names: [
        `원형 ${region.normalNames[0]}`,
        `원형 ${region.normalNames[1]}`,
        `원형 ${region.normalNames[2]}`,
        `열화 이전의 ${region.bossName}`,
    ],
    icons: [
        `${region.id}_vanguard`, `${region.id}_keeper`,
        `${region.id}_stalker`, `${region.id}_sovereign`,
    ],
    statusEffectId: ascendantStatusEffects[index]!,
    dropItemId: `${region.id}_material`,
}));

export const RIFT_FAMILIES: readonly RiftFamilyDefinition[] = Object.freeze([
    ...lowerRiftFamilies,
    ...ascendantRiftFamilies,
]);

const dungeonIdByGateResourceId = new Map<string, string>();

function resolveMonsterIds(family: RiftFamilyDefinition): readonly [string, string, string, string] {
    return family.monsterIds ?? [
        `${family.key}_rift_vanguard`,
        `${family.key}_rift_keeper`,
        `${family.key}_rift_stalker`,
        `${family.key}_rift_sovereign`,
    ];
}

function defineRiftFamily(family: RiftFamilyDefinition): void {
    const monsterIds = resolveMonsterIds(family);
    const normalLevels = [
        family.recommendedLevel,
        Math.round((family.recommendedLevel + family.bossLevel) / 2),
        Math.max(family.recommendedLevel + 1, family.bossLevel - 3),
    ] as const;
    const monsterTags = [
        GameTags.ENTITY_ELEMENTAL,
        GameTags.TRAIT_INANIMATE,
        ...family.propertyTags,
        GameTags.PROPERTY_DARK,
        'monster:dimensional-rift-origin',
    ];
    const profiles = [MonsterStatProfile.BRUISER, MonsterStatProfile.TANK, MonsterStatProfile.SKIRMISHER] as const;

    for (const index of [0, 1, 2] as const) {
        const level = normalLevels[index];
        defineWorldMonster({
            id: monsterIds[index],
            name: family.names[index],
            description: `루미나르에 나타난 동족보다 원형에 가까운 균열 개체. 무리를 이뤄 침입자의 전선을 분산시킨다.`,
            icon: `monsters/${family.icons[index]}`, // TODO(art): 각 균열 개체의 전용 아이콘으로 교체.
            level,
            statProfile: profiles[index],
            statRank: index === 1 ? MonsterRank.ELITE : MonsterRank.NORMAL,
            statWeights: index === 0
                ? { maxLife: 1.15, atk: 1.08 }
                : index === 1
                    ? { maxLife: 1.18, def: 1.1, magicDef: 1.1 }
                    : { atk: 1.12, magicForce: 1.08, speed: 1.08 },
            drops: [{
                itemDataId: family.dropItemId,
                minCount: 1,
                maxCount: level >= 500 ? 2 : 1,
                chance: index === 1 ? 0.45 : 0.28,
            }],
            goldReward: { min: Math.max(10, level * 2), max: Math.max(20, level * 4) },
            attack: index === 2 ? {
                damageType: 'magic',
                effect: {
                    statusEffectId: family.statusEffectId,
                    chance: 0.22,
                    duration: 5,
                    level: Math.max(1, Math.floor(level / 50)),
                },
            } : undefined,
            tags: monsterTags,
        });
    }

    defineWorldMonster({
        id: monsterIds[3],
        name: family.names[3],
        description: `대마녀 다클레비스의 균열에 보존된 원형 지배자. 두 명 이상의 침입자가 공명을 나누지 않으면 권능이 한 사람에게 중첩된다.`,
        icon: `monsters/${family.icons[3]}`, // TODO(art): 각 균열 지배자의 전용 아이콘으로 교체.
        level: family.bossLevel,
        statProfile: MonsterStatProfile.HYBRID,
        statRank: MonsterRank.BOSS,
        statWeights: { maxLife: 1.18, atk: 1.1, magicForce: 1.1, def: 1.05, magicDef: 1.05 },
        expReward: family.bossLevel * 20 * 8,
        drops: [
            { itemDataId: family.dropItemId, minCount: 2, maxCount: family.bossLevel >= 500 ? 6 : 4, chance: 1 },
            { itemDataId: 'large_health_potion', minCount: 1, maxCount: 3, chance: 0.6 },
        ],
        goldReward: { min: family.bossLevel * 10, max: family.bossLevel * 16 },
        challengePattern: {
            handler: 'rift:twofold-resonance',
            initialDelay: 5,
            interval: { min: 14, max: 18 },
        },
        tags: [GameTags.ENTITY_BOSS, ...monsterTags, `monster:${family.key}-rift-sovereign`],
    });

    defineResource({
        id: family.gateId,
        name: family.gateName,
        level: family.recommendedLevel,
        baseAttribute: { maxLife: 1 },
        hardness: 0,
        drops: [],
        expReward: { min: 0, max: 0 },
        interaction: 'enter_dimensional_rift',
        attackable: false,
        tags: [...family.propertyTags, GameTags.PROPERTY_DARK, 'resource:dimensional-rift'],
    });

    const dungeonId = `${family.key}_rift`;
    dungeonIdByGateResourceId.set(family.gateId, dungeonId);
    defineInstanceDungeon({
        id: dungeonId,
        name: family.dungeonName,
        recommendedLevel: family.recommendedLevel,
        gateOpenSeconds: 10,
        durationSeconds: family.durationSeconds,
        maxPlayers: 5,
        tags: [...family.propertyTags, GameTags.PROPERTY_DARK],
        rooms: [
            {
                key: 'threshold', name: '뒤틀린 경계',
                objects: [{ type: 'monster', dataId: monsterIds[0], maxCount: 4, respawnTime: 0 }],
            },
            {
                key: 'split_front', name: '갈라진 전선',
                objects: [
                    { type: 'monster', dataId: monsterIds[1], maxCount: 2, respawnTime: 0 },
                    { type: 'monster', dataId: monsterIds[2], maxCount: 3, respawnTime: 0 },
                ],
            },
            {
                key: 'confluence', name: '원형의 합류점',
                objects: [
                    { type: 'monster', dataId: monsterIds[0], maxCount: 2, respawnTime: 0 },
                    { type: 'monster', dataId: monsterIds[1], maxCount: 2, respawnTime: 0 },
                    { type: 'monster', dataId: monsterIds[2], maxCount: 2, respawnTime: 0 },
                ],
            },
            {
                key: 'core', name: '균열의 핵',
                objects: [{ type: 'monster', dataId: monsterIds[3], maxCount: 1, respawnTime: 0 }],
            },
        ],
    });
}

for (const family of RIFT_FAMILIES) defineRiftFamily(family);

defineResource({
    id: 'dimensional_return_rift',
    name: '귀환 차원 균열',
    level: 1,
    baseAttribute: { maxLife: 1 },
    hardness: 0,
    drops: [],
    expReward: { min: 0, max: 0 },
    interaction: 'exit_dimensional_rift',
    attackable: false,
    tags: [GameTags.PROPERTY_DARK, 'resource:dimensional-rift', 'resource:return-rift'],
});

registerResourceInteraction('enter_dimensional_rift', (resource, player) => {
    const dungeonId = dungeonIdByGateResourceId.get(resource.resourceDataId);
    if (!dungeonId) return;
    instanceDungeonManager.enterFromGate(resource, player, dungeonId);
});

registerResourceInteraction('exit_dimensional_rift', (resource, player) => (
    instanceDungeonManager.escapeThroughReturnRift(resource, player)
));
