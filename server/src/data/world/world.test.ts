import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import Entity from '../../models/core/Entity.js';
import Equipment from '../../models/economy/Equipment.js';
import Inventory from '../../models/economy/Inventory.js';
import type Player from '../../models/actors/Player.js';
import { getAllLocations, getLocation, normalizeLocationInput, reloadAllLocations } from '../../models/world/Location.js';
import { getAllMonsterData, getMonsterData } from '../../models/actors/Monster.js';
import { getResourceData } from '../../models/actors/Resource.js';
import {
    createAcquisitionRequirements,
    getAllItemData,
    getItemData,
    MAX_STACKABLE_ITEM_COUNT,
} from '../../models/economy/Item.js';
import { getShop } from '../../models/economy/Shop.js';
import { getAllCraftingRecipes } from '../../models/professions/Crafting.js';
import { getAllQuestData } from '../../models/progression/Quest.js';
import NPC from '../../models/actors/NPC.js';
import type { LocationData } from '../../../../shared/types.js';
import '../economy/items.js';
import '../combat/skills.js';
import './monsters.js';
import './resources.js';
import './npcs.js';
import './locations.js';
import './dungeonPuzzles.js';
import '../combat/bossPatterns.js';
import './instanceDungeons.js';
import '../economy/shops.js';
import '../professions/fishing.js';
import './ascendantFrontier.js';
import '../professions/crafting.js';
import {
    ASCENDANT_REGIONS,
    HIGH_LEVEL_FISHING_SPOTS,
    HIGH_LEVEL_MINES,
    buildAscendantLocations,
    mergeAscendantLocations,
} from './ascendantRegions.js';
import {
    rollAshenReliquaryReward,
    rollEclipseReliquaryReward,
    rollFrostveilReliquaryReward,
    rollFishingSupplyCacheReward,
    rollGlassduneReliquaryReward,
    rollLabyrinthCacheReward,
    rollMisttideReliquaryReward,
    rollParadoxReliquaryReward,
    rollTreasureReward,
    rollTwilightReliquaryReward,
    rollVoidcrownReliquaryReward,
    rollWorldrootReliquaryReward,
} from './resources.js';
import { FISHING_EQUIPMENT_TIERS } from '../professions/fishingEquipmentCatalog.js';
import { MonsterAiDisposition } from '../../models/combat/Threat.js';
import {
    getIronrootCrystalProtectionMultiplier,
    getGlassduneMirrorProtectionMultiplier,
    getSilverwebBroodProtectionMultiplier,
    getParadoxAnchorProtectionMultiplier,
    getVoidcrownPillarProtectionMultiplier,
    getWhiteNightMirrorProtectionMultiplier,
    getPrimordialSeedProtectionMultiplier,
} from '../combat/bossPatterns.js';
import { GameTags } from '../../../../shared/tags.js';
import {
    calculateMonsterBaseAttributes,
    MonsterRank,
    MonsterStatProfile,
} from '../../models/actors/MonsterStats.js';
import { StatusEffectType } from '../../models/combat/StatusEffect.js';
import { getFishingTreasureTable } from '../../models/professions/Fishing.js';

const baseLocations = JSON.parse(
    readFileSync(new URL('./locations.json', import.meta.url), 'utf-8'),
) as LocationData[];
const locations = mergeAscendantLocations(baseLocations);

class TestBossRoomPlayer extends Entity {
    override readonly name = '보스방 침입자';
    override get isPlayer(): boolean { return true; }
    override get playerUserId(): number | undefined { return this.userId; }

    constructor(locationId: string, readonly userId?: number) {
        super(200, 0, locationId, { maxLife: 100_000, speed: 2 }, Equipment.createEmpty());
    }
}

test('일반 스택 아이템은 중량 한도까지 하나의 사실상 무제한 스택을 사용한다', () => {
    const stackableItems = getAllItemData().filter(item => item.stackable);
    assert.ok(stackableItems.length > 0);
    assert.ok(stackableItems.every(item => item.maxStack === MAX_STACKABLE_ITEM_COUNT));

    const inventory = Inventory.createEmpty(0, 1_000);
    assert.equal(inventory.addItem('wooden_arrow', 250), true);
    assert.equal(inventory.items.length, 1);
    assert.equal(inventory.items[0].count, 250);
});

test('월드 맵 연결과 오브젝트 정의가 유효하고 고블린이 남아 있지 않다', () => {
    const ids = new Set(locations.map(location => location.id));
    assert.equal(locations.length, baseLocations.length + buildAscendantLocations().length);
    assert.equal(ids.size, locations.length);

    for (const location of locations) {
        for (const connection of location.connections) {
            assert.ok(ids.has(connection.locationId), `${location.id} -> ${connection.locationId}`);
            const target = locations.find(candidate => candidate.id === connection.locationId);
            assert.ok(target?.connections.some(candidate => candidate.locationId === location.id),
                `${location.id} <-> ${connection.locationId}`);
        }
        for (const object of location.objects) {
            assert.ok(object.type === 'monster'
                ? getMonsterData(object.dataId)
                : getResourceData(object.dataId), `${location.id}/${object.dataId}`);
            assert.notEqual(object.dataId, 'goblin');
        }
    }

    assert.equal(getMonsterData('goblin'), undefined);
    assert.ok(locations.some(location => location.tags.includes('location:swamp')));
    assert.ok(locations.some(location => location.tags.includes('location:volcanic')));
    assert.ok(locations.some(location => location.tags.includes('location:fishing')));
    assert.ok(locations.filter(location => location.tags.includes('location:mine')).length >= 9);
    assert.ok(locations.find(location => location.id === 'field')?.objects.some(
        object => object.type === 'resource' && object.dataId === 'tutorial_training_dummy',
    ));
    assert.equal(locations.filter(location => location.tags.includes(GameTags.LOCATION_BOSS_ROOM)).length, 41);
    assert.ok(locations
        .filter(location => location.tags.includes(GameTags.LOCATION_BOSS_ROOM))
        .every(location => location.objects.some(object =>
            object.type === 'monster' && getMonsterData(object.dataId)?.tags.includes(GameTags.ENTITY_BOSS))));
    assert.deepEqual(
        Object.fromEntries(['safe', 'neutral', 'hostile'].map(zoneType => [
            zoneType,
            locations.filter(location => location.zoneType === zoneType).length,
        ])),
        { safe: 29, neutral: 69, hostile: 526 },
    );
    for (const id of ['tempest_peak', 'nightwood_heart', 'dawn_sanctum', 'necropolis_depths', 'ironroot_core', 'astral_nexus']) {
        assert.equal(locations.find(location => location.id === id)?.zoneType, 'hostile');
    }
    assert.equal(locations.filter(location => location.mapColor).length, locations.length);
    assert.ok(locations.every(location => /^#[0-9a-f]{6}$/i.test(location.mapColor ?? '')));
    assert.equal(locations.filter(location => location.mapIcon === 'town-plaza').length, 11);
    assert.equal(locations.filter(location => location.tags.includes(GameTags.LOCATION_FISHING)).length, 11);
    assert.ok(locations
        .filter(location => location.tags.includes(GameTags.LOCATION_FISHING))
        .every(location => location.mapIcon === 'fishing-spot'));
    const mapWidth = Math.max(...locations.map(location => location.x))
        - Math.min(...locations.map(location => location.x));
    const mapHeight = Math.max(...locations.map(location => location.y))
        - Math.min(...locations.map(location => location.y));
    assert.ok(mapWidth / mapHeight >= 0.75 && mapWidth / mapHeight <= 1.25);
    assert.equal(new Set(locations.map(location => `${location.x}:${location.y}`)).size, locations.length);
    for (const icon of new Set(locations.flatMap(location => location.mapIcon ? [location.mapIcon] : []))) {
        const png = readFileSync(new URL(`../../../../client/public/icons/map/${icon}.png`, import.meta.url));
        assert.equal(png.readUInt32BE(16), 128, icon);
        assert.equal(png.readUInt32BE(20), 128, icon);
        assert.equal(png[25], 6, `${icon} must be RGBA`);
    }

    reloadAllLocations(locations);
    assert.equal(getAllLocations().length, locations.length);
    assert.equal(normalizeLocationInput('바람결 초원 3 · 맑은-샘터'), '바람결초원3맑은샘터');
    assert.equal(
        getLocation('meadow_2')?.findAvailableConnection({ level: 50 } as never, '초원3')?.locationId,
        'meadow_3',
    );
    assert.equal(
        getLocation('meadow_2')?.findAvailableConnection({ level: 50 } as never, 'MEADOW_3')?.locationId,
        'meadow_3',
    );
    assert.equal(
        getLocation('town_square')?.findAvailableConnection({ level: 50 } as never, '1')?.locationId,
        'field',
    );
    assert.equal(
        getLocation('town_square')?.findAvailableConnection({ level: 50 } as never, '2')?.locationId,
        'shop_street',
    );
    assert.deepEqual(
        getLocation('town_square')?.findAvailableConnection({ level: 50 } as never, '5'),
        {
            locationId: 'luminous_pond',
            name: '루미나르 물빛 연못',
            status: 'visible',
        },
    );
    assert.deepEqual(
        getLocation('town_square')?.findAvailableConnection({ level: 50 } as never, '6'),
        {
            locationId: 'dawn_order_chapel',
            name: '새벽교단 예배당',
            status: 'visible',
        },
    );
    assert.equal(getLocation('town_square')?.findAvailableConnection({ level: 50 } as never, '7'), undefined);
    const chapel = locations.find(location => location.id === 'dawn_order_chapel');
    assert.equal(chapel?.zoneType, 'safe');
    assert.ok(chapel?.tags.includes(GameTags.PROPERTY_HOLY));
    assert.ok(chapel?.tags.includes(GameTags.PROPERTY_LIGHT));
    assert.deepEqual(chapel?.npcIds, ['cleric_preceptor']);
    assert.equal(NPC.getNpc('cleric_preceptor')?.name, '새벽교단 교리사제 엘리안');
    assert.deepEqual(
        getLocation('deep_shaft')?.findAvailableConnection({ level: 1 } as never, '수정왕좌'),
        {
            locationId: 'crystal_throne',
            name: '피버릭 갱도 수정 왕좌',
            status: 'locked',
            lockReason: '필요 레벨: Lv.28',
        },
    );
});

test('승천 후반 권역은 기존 권역을 되감지 않고 지도 노드 간격을 유지한다', () => {
    const generated = buildAscendantLocations();
    const regionIdOf = (locationId: string) => ASCENDANT_REGIONS
        .find(region => locationId.startsWith(`${region.id}_`))?.id;

    for (let index = 1; index < ASCENDANT_REGIONS.length; index++) {
        const previous = generated.find(location =>
            location.id === `${ASCENDANT_REGIONS[index - 1].id}_transition`);
        const threshold = generated.find(location =>
            location.id === `${ASCENDANT_REGIONS[index].id}_threshold`);
        assert.ok(previous && threshold);
        assert.equal(Math.hypot(previous.x - threshold.x, previous.y - threshold.y), 120);
    }

    for (let leftIndex = 0; leftIndex < generated.length; leftIndex++) {
        for (let rightIndex = leftIndex + 1; rightIndex < generated.length; rightIndex++) {
            const left = generated[leftIndex];
            const right = generated[rightIndex];
            if (regionIdOf(left.id) === regionIdOf(right.id)) continue;
            const distance = Math.hypot(left.x - right.x, left.y - right.y);
            assert.ok(distance >= 40, `${left.id} / ${right.id}: ${distance.toFixed(2)}`);
        }
    }

    const earlierLocations = locations.filter(location =>
        !['silentdivine', 'nulllibrary', 'originboundary'].includes(regionIdOf(location.id) ?? ''));
    const reroutedLocations = generated.filter(location =>
        ['silentdivine', 'nulllibrary', 'originboundary'].includes(regionIdOf(location.id) ?? ''));
    for (const later of reroutedLocations) {
        for (const earlier of earlierLocations) {
            const distance = Math.hypot(later.x - earlier.x, later.y - earlier.y);
            assert.ok(distance >= 40, `${later.id} / ${earlier.id}: ${distance.toFixed(2)}`);
        }
    }
});

test('성장 구간별 대체 사냥터는 기존 관문을 건너뛰지 않는 양방향 루프를 이룬다', () => {
    const loops = [
        ['ember_foothills', 'ember_hunt_ashplain', 'ember_hunt_basalt', 'volcanic_slope'],
        ['glassdune_border', 'glassdune_hunt_drysea', 'glassdune_hunt_mirage', 'glassdune_sea'],
        ['frostveil_pass', 'frostveil_hunt_whitewood', 'frostveil_hunt_iceweb', 'frostveil_pinewood'],
        ['paradox_foundry_threshold', 'paradox_hunt_scrapfield', 'paradox_hunt_geargrave', 'paradox_rusted_conveyor'],
        ['voidcrown_threshold', 'voidcrown_hunt_drymoat', 'voidcrown_hunt_brokenwall', 'voidcrown_lower_court'],
        ['worldroot_threshold', 'worldroot_hunt_skygrove', 'worldroot_hunt_rotgrove', 'worldroot_lower_fork'],
        ['chronofrost_threshold', 'chronofrost_hunt_secondfield', 'chronofrost_hunt_icegear', 'chronofrost_lower_fork'],
        ['endstar_threshold', 'endstar_hunt_ashorbit', 'endstar_hunt_fallenzodiac', 'endstar_lower_fork'],
    ];

    for (const [entry, firstHunt, secondHunt, rejoin] of loops) {
        const route = [entry, firstHunt, secondHunt, rejoin];
        for (let index = 0; index < route.length - 1; index++) {
            const from = locations.find(location => location.id === route[index]);
            const to = locations.find(location => location.id === route[index + 1]);
            assert.ok(from?.connections.some(connection => connection.locationId === to?.id), `${from?.id} -> ${to?.id}`);
            assert.ok(to?.connections.some(connection => connection.locationId === from?.id), `${to?.id} -> ${from?.id}`);
        }
        for (const huntingId of [firstHunt, secondHunt]) {
            const huntingLocation = locations.find(location => location.id === huntingId);
            assert.ok(huntingLocation?.objects.some(object => object.type === 'monster'), huntingId);
            assert.ok(huntingLocation?.objects
                .filter(object => object.type === 'monster')
                .every(object => object.respawnTime === 30), huntingId);
        }
    }
});

test('모든 몬스터는 데이터 ID별 64px RGBA 전용 아이콘을 제공한다', () => {
    const monsters = getAllMonsterData();
    const icons = new Set<string>();

    assert.equal(monsters.length, 198);
    for (const monster of monsters) {
        const icon = monster.icon ?? `monsters/${monster.id}`;
        assert.equal(icon, `monsters/${monster.id}`);
        assert.equal(icons.has(icon), false, icon);
        icons.add(icon);

        const png = readFileSync(new URL(`../../../../client/public/icons/${icon}.png`, import.meta.url));
        assert.equal(png.readUInt32BE(16), 64, icon);
        assert.equal(png.readUInt32BE(20), 64, icon);
        assert.equal(png[25], 6, `${icon} must be RGBA`);
    }
});

test('Lv.380 이후 역할 장비는 감정 가능한 고유 전투 효과를 제공한다', () => {
    const ids = [
        'nebula_edge', 'gravity_arc_bow', 'orbit_fang', 'starwell_staff', 'meteor_bulwark',
        'chronoblade', 'pendulum_bow', 'yesterglass_dagger', 'zero_hour_staff', 'aeon_bulwark',
        'endstar_edge', 'constellation_bow', 'entropy_fang', 'genesis_staff', 'horizon_bulwark',
    ];

    for (const id of ids) {
        const item = getItemData(id);
        assert.ok(item, id);
        assert.ok(item.gameplayEffects?.length, `${id} gameplay effect`);
        assert.ok(item.onBasicAttackHit || item.onDamageTaken, `${id} gameplay callback`);
    }
});

test('같은 월드 권역은 지도에서 하나의 바이옴 대표색을 공유한다', () => {
    const regions = [
        ['field', 'meadow_2', 'meadow_3'],
        ['silverweb_trail', 'silverweb_outpost', 'red_mane_hill', 'silverweb_grove',
            'silverweb_cavern', 'silverweb_queen_nest'],
        ['swamp_edge', 'swamp_basin', 'swamp_reedway', 'swamp_heart'],
        ['ember_foothills', 'volcanic_slope', 'ember_ravine', 'obsidian_shelf', 'volcanic_crater',
            'volcanic_core', 'ember_hunt_ashplain', 'ember_hunt_basalt'],
        ['feveric_mine', 'feveric_mine_shop', 'mine_junction', 'mine_east_tunnel', 'mine_west_tunnel',
            'abandoned_rail', 'flooded_tunnel', 'crystal_gallery', 'deep_shaft', 'crystal_throne'],
        ['tempest_gate', 'conductor_ridge', 'storm_nest', 'lightning_spur', 'tempest_peak'],
        ['nightwood_edge', 'nightwood_maze', 'nightwood_heart'],
        ['dawn_border', 'dawn_cloister', 'dawn_sanctum'],
        ['necropolis_gate', 'necropolis_east_crypt', 'necropolis_west_crypt', 'ossuary_crossing', 'necropolis_depths'],
        ['ironroot_edge', 'ironroot_labyrinth', 'ironroot_question_hall', 'ironroot_false_archive',
            'ironroot_echo_vault', 'ironroot_gate_gallery', 'ironroot_core', 'ironroot_crystal_sanctum'],
        ['rift_edge', 'eclipse_crossroads', 'astral_nexus'],
        ['twilight_memorial_road', 'twilight_lantern_camp', 'twilight_tomb_gate',
            'twilight_bone_gallery', 'twilight_knight_crypt', 'twilight_whisper_catacomb',
            'twilight_crown_hall', 'twilight_oath_hall', 'twilight_secret_ossuary'],
        ['glassdune_border', 'glassdune_caravan', 'glassdune_sea', 'glassdune_mirage_path',
            'glassdune_sunken_colonnade', 'glassdune_scorpion_nest', 'glassdune_observatory',
            'glassdune_glass_canyon', 'glassdune_sun_vault', 'glassdune_hidden_oasis',
            'glassdune_hunt_drysea', 'glassdune_hunt_mirage'],
        ['frostveil_pass', 'frostveil_outpost', 'frostveil_pinewood', 'frostveil_hunting_field',
            'frostveil_frozen_lake', 'frostveil_ravine', 'frostveil_spider_nest', 'frostveil_palace_gate',
            'frostveil_mirror_hall', 'frostveil_arsenal', 'frostveil_oracle_gallery', 'frostveil_throne',
            'frostveil_hidden_grotto', 'frostveil_aurora_bridge',
            'frostveil_hunt_whitewood', 'frostveil_hunt_iceweb'],
        ['misttide_headland', 'misttide_harbor', 'misttide_saltwind_flats', 'misttide_wreckshore',
            'misttide_kelp_inlet', 'misttide_blackcoral_reef', 'misttide_fogbank_channel',
            'misttide_siren_shallows', 'misttide_siren_amphitheater', 'misttide_tidewatch_cliffs',
            'misttide_clock_cove', 'misttide_hidden_grotto', 'misttide_drowned_gate',
            'misttide_drowned_causeway', 'misttide_drowned_market', 'misttide_drowned_archive',
            'misttide_abyssal_barracks', 'misttide_leviathan_trench', 'misttide_drowned_throne'],
        ['paradox_foundry_threshold', 'paradox_relay_station', 'paradox_rusted_conveyor',
            'paradox_lens_corridor', 'paradox_scrap_reservoir', 'paradox_gear_chapel',
            'paradox_crow_gantry', 'paradox_logic_archive', 'paradox_mirrored_assembly',
            'paradox_chronosteel_foundry', 'paradox_fracture_junction', 'paradox_memory_gallery',
            'paradox_lost_workshop', 'paradox_equation_bridge', 'paradox_inverse_hall',
            'paradox_causality_lock', 'paradox_hidden_prototype_vault', 'paradox_stage',
            'paradox_puppet_hall', 'paradox_abandoned_test_chamber', 'paradox_architect_core',
            'paradox_endless_observatory', 'paradox_hunt_scrapfield', 'paradox_hunt_geargrave'],
        ['ashen_gate_chasm', 'ashen_waystation', 'ashen_dead_valley_west', 'ashen_dead_valley_east',
            'ashen_lament_basin', 'ashen_hollowfang_den', 'ashen_bonewind_ravine',
            'ashen_three_maw_gate', 'ashen_blackflame_outer_fork', 'ashen_soot_cloister',
            'ashen_ember_furnace', 'ashen_ossuary_turn', 'ashen_night_iron_gallery',
            'ashen_seal_chapel', 'ashen_hidden_reliquary', 'ashen_ash_spiral',
            'ashen_general_parade', 'ashen_castle_barbican', 'ashen_lower_barracks',
            'ashen_cursebone_range', 'ashen_gargoyle_rampart', 'ashen_mourning_hall',
            'ashen_execution_court', 'ashen_crown_stair', 'ashen_sovereign_throne'],
        ['voidcrown_threshold', 'voidcrown_waystation', 'voidcrown_lower_court',
            'voidcrown_west_battlement', 'voidcrown_starved_garden', 'voidcrown_broken_aqueduct',
            'voidcrown_east_battlement', 'voidcrown_gatehouse', 'voidcrown_foundry',
            'voidcrown_archive', 'voidcrown_inner_crossing', 'voidcrown_mirror_gallery',
            'voidcrown_silent_barracks', 'voidcrown_observatory', 'voidcrown_voidwell',
            'voidcrown_crownworkshop', 'voidcrown_oath_chapel', 'voidcrown_hidden_vault',
            'voidcrown_upper_stair', 'voidcrown_celestial_balcony', 'voidcrown_null_library',
            'voidcrown_guardian_hall', 'voidcrown_crown_spire', 'voidcrown_throne_antechamber',
            'voidcrown_throne', 'voidcrown_hunt_drymoat', 'voidcrown_hunt_brokenwall'],
        ['eclipse_threshold', 'eclipse_dock', 'eclipse_lower_crossing', 'eclipse_luminous_reef',
            'eclipse_drowned_convoy', 'eclipse_brine_shelf', 'eclipse_silver_sink',
            'eclipse_tide_confluence', 'eclipse_deep_gate', 'eclipse_kelp_cloister',
            'eclipse_black_current', 'eclipse_basin', 'eclipse_sanctuary_threshold',
            'eclipse_choir_gallery', 'eclipse_floodgate_engine', 'eclipse_tide_altar',
            'eclipse_sunken_reliquary', 'eclipse_mirror_causeway', 'eclipse_white_night_nave',
            'eclipse_oracle_apse', 'eclipse_drowned_belfry', 'eclipse_final_crossing',
            'eclipse_altar_vestibule', 'eclipse_white_night_altar'],
        ['worldroot_threshold', 'worldroot_waystation', 'worldroot_lower_fork', 'worldroot_luminous_root',
            'worldroot_rot_hollow', 'worldroot_sap_aqueduct', 'worldroot_fossil_bark',
            'worldroot_devourer_gate', 'worldroot_inner_gate', 'worldroot_spore_garden',
            'worldroot_amber_channel', 'worldroot_memory_grove', 'worldroot_heart_threshold',
            'worldroot_vein_gallery', 'worldroot_seed_archive', 'worldroot_memory_altar',
            'worldroot_hidden_reliquary', 'worldroot_root_bridge', 'worldroot_holy_canopy',
            'worldroot_dark_canopy', 'worldroot_forgotten_ring', 'worldroot_pulse_chamber',
            'worldroot_heart_antechamber', 'worldroot_primordial_heart',
            'worldroot_hunt_skygrove', 'worldroot_hunt_rotgrove'],
        ['nebula_threshold', 'nebula_waystation', 'nebula_lower_fork', 'nebula_stardust_terrace',
            'nebula_comet_foundry', 'nebula_echo_archive', 'nebula_silent_orbit',
            'nebula_gravity_confluence', 'nebula_meteor_warden_hall', 'nebula_upper_fork',
            'nebula_aurora_bridge', 'nebula_darkmatter_channel', 'nebula_crown_approach',
            'nebula_sovereign_throne'],
        ['chronofrost_threshold', 'chronofrost_refuge', 'chronofrost_lower_fork',
            'chronofrost_frozen_minute', 'chronofrost_pendulum_glacier',
            'chronofrost_hourglass_cemetery', 'chronofrost_reversed_snowfield',
            'chronofrost_pendulum_confluence', 'chronofrost_sentinel_court',
            'chronofrost_upper_fork', 'chronofrost_yesterday_gallery',
            'chronofrost_tomorrow_vault', 'chronofrost_zero_antechamber',
            'chronofrost_zero_throne', 'chronofrost_hunt_secondfield', 'chronofrost_hunt_icegear'],
        ['endstar_threshold', 'endstar_bastion', 'endstar_lower_fork', 'endstar_ash_field',
            'endstar_broken_constellation', 'endstar_silent_sun', 'endstar_oath_comet',
            'endstar_confluence', 'endstar_herald_ring', 'endstar_upper_fork',
            'endstar_genesis_lane', 'endstar_entropy_lane', 'endstar_last_horizon',
            'endstar_final_approach', 'endstar_last_constellation',
            'endstar_hunt_ashorbit', 'endstar_hunt_fallenzodiac'],
    ];

    for (const ids of regions) {
        const colors = new Set(ids.map(id => locations.find(location => location.id === id)?.mapColor));
        assert.equal(colors.size, 1, ids.join(', '));
        assert.notEqual([...colors][0], undefined, ids.join(', '));
    }
});

test('1~1000레벨 월드는 모든 속성을 관찰 가능하고 Lv.200 이후 성장 난도가 점진적으로 높아진다', () => {
    const monsters = getAllMonsterData();
    const levelOne = getMonsterData('slime');
    const midLevelNormal = getMonsterData('spark_moth');
    const levelTwoHundred = getMonsterData('eclipse_watcher');

    assert.equal(Math.min(...monsters.map(monster => monster.level)), 1);
    assert.equal(Math.max(...monsters.map(monster => monster.level)), 1000);
    assert.equal(Entity.getMaxExpOfLevel(1), 100);
    assert.equal(Entity.getMaxExpOfLevel(50), 20_000);
    assert.equal(Entity.getMaxExpOfLevel(200), 80_000);
    assert.equal(Entity.getMaxExpOfLevel(380), 760_000);
    assert.equal(Entity.getMaxExpOfLevel(500), 1_921_326);
    assert.ok(Entity.getMaxExpOfLevel(1000) > Entity.getMaxExpOfLevel(500));
    assert.equal(levelOne!.expReward / Entity.getMaxExpOfLevel(1), 0.2);
    assert.equal(midLevelNormal!.expReward / Entity.getMaxExpOfLevel(midLevelNormal!.level), 0.05);
    assert.equal(levelTwoHundred!.expReward / Entity.getMaxExpOfLevel(200), 0.05);
    assert.equal(Entity.getStandardMonsterExpOfLevel(380) / Entity.getMaxExpOfLevel(380), 0.01);
    assert.equal(levelOne?.statProfile, MonsterStatProfile.BRUISER);
    assert.equal(levelOne?.statRank, MonsterRank.NORMAL);
    assert.ok((levelOne?.baseAttribute.maxLife ?? 0) >= 28);
    assert.ok(monsters
        .filter(monster => !monster.tags.includes('entity:boss'))
        .every(monster => monster.expReward === monster.level * 20));

    const monsterTags = new Set(monsters.flatMap(monster => monster.tags));
    for (const tag of [
        'property:fire', 'property:water', 'property:ice', 'property:natural', 'property:poison',
        'property:electric', 'property:stone', 'property:dark', 'property:light', 'property:undead',
        'property:holy', 'property:insect', 'property:metal', 'property:earth',
    ]) assert.ok(monsterTags.has(tag), tag);
});

test('모든 월드 몬스터의 생명력과 일반 몬스터 공격력은 공용 성장 계산값과 일치한다', () => {
    for (const monster of getAllMonsterData()) {
        assert.ok(monster.statProfile, `${monster.id}: statProfile`);
        assert.ok(monster.statRank, `${monster.id}: statRank`);
        const expected = calculateMonsterBaseAttributes({
            level: monster.level,
            profile: monster.statProfile!,
            rank: monster.statRank!,
            weights: monster.statWeights,
        });
        assert.equal(monster.baseAttribute.maxLife, expected.maxLife, monster.id);
        if (monster.statRank === MonsterRank.NORMAL || monster.statRank === MonsterRank.ELITE) {
            assert.equal(monster.baseAttribute.atk, expected.atk, `${monster.id}: atk`);
            assert.equal(monster.baseAttribute.magicForce, expected.magicForce, `${monster.id}: magicForce`);
            assert.ok(
                Math.max(monster.baseAttribute.atk ?? 0, monster.baseAttribute.magicForce ?? 0) >= 1,
                `${monster.id}: offense`,
            );
        }
    }

    const legacy = getMonsterData('silverweb_briar_wolf');
    assert.notEqual(legacy?.baseAttribute.maxLife, 120);
    assert.equal(legacy?.baseAttribute.atk, calculateMonsterBaseAttributes({
        level: legacy!.level,
        profile: legacy!.statProfile!,
        rank: legacy!.statRank!,
        weights: legacy!.statWeights,
    }).atk);
    assert.equal(legacy?.baseAttribute.def, 7);
    assert.equal(legacy?.baseAttribute.speed, 1.55);
});

test('성장 구간 보스는 Lv.500까지 30레벨, 이후 50레벨 간격이며 일반몹보다 높은 경험치를 준다', () => {
    const bosses = getAllMonsterData()
        .filter(monster => monster.tags.includes(GameTags.ENTITY_BOSS))
        .sort((left, right) => left.level - right.level);

    assert.ok(bosses[0].level <= 32);
    assert.equal(bosses[bosses.length - 1].level, 1000);
    for (let index = 1; index < bosses.length; index++) {
        const previous = bosses[index - 1];
        const current = bosses[index];
        const maximumGap = previous.level >= 500 ? 50 : 30;
        assert.ok(current.level - previous.level <= maximumGap,
            `${bosses[index - 1].name} Lv.${bosses[index - 1].level} → ${bosses[index].name} Lv.${bosses[index].level}`);
    }
    for (const boss of bosses) {
        assert.ok(boss.expReward >= boss.level * 20 * 5, `${boss.name} 보스 경험치`);
        assert.equal(boss.bossNarrative?.introDuration, 3, `${boss.name} 도입 무적`);
        assert.deepEqual(boss.bossNarrative?.phases.map(phase => phase.lifeRatio), [0.7, 0.35],
            `${boss.name} 체력 구간 대사`);
        const placements = locations.flatMap(location => location.objects
            .filter(object => object.type === 'monster' && object.dataId === boss.id)
            .map(object => ({ location, object })));
        assert.ok(placements.some(placement => placement.object.maxCount === 1), `${boss.name} 전용 보스 장소`);
    }
    assert.ok(bosses.filter(boss => boss.skillPattern?.randomOrder).length >= 3);
});

test('안개수렁·홍염산지·천둥마루는 일자 대신 분기와 재합류 경로를 가진다', () => {
    for (const [entryId, branchId, mergeId] of [
        ['swamp_edge', 'swamp_reedway', 'swamp_heart'],
        ['ember_foothills', 'ember_ravine', 'volcanic_crater'],
        ['volcanic_slope', 'obsidian_shelf', 'volcanic_core'],
        ['tempest_gate', 'storm_nest', 'tempest_peak'],
        ['conductor_ridge', 'lightning_spur', 'tempest_peak'],
        ['silverweb_trail', 'red_mane_hill', 'silverweb_grove'],
    ] as const) {
        const entry = locations.find(location => location.id === entryId)!;
        const branch = locations.find(location => location.id === branchId)!;
        assert.ok(entry.connections.some(connection => connection.locationId === branchId), `${entryId} → ${branchId}`);
        assert.ok(branch.connections.some(connection => connection.locationId === mergeId), `${branchId} → ${mergeId}`);
    }

    for (const entranceId of ['volcanic_slope', 'ember_ravine', 'obsidian_shelf']) {
        const entrance = locations.find(location => location.id === entranceId)!;
        assert.equal(
            entrance.connections.find(connection => connection.locationId === 'volcanic_crater')?.condition,
            'level_36',
            `${entranceId} → volcanic_crater Lv.36 제한`,
        );
    }
});

test('은빛그물 숲은 두 보스·사냥꾼 상점·알주머니 보호 기믹을 하나의 초반 우회 동선으로 연결한다', () => {
    const wolfKing = getMonsterData('red_mane_wolf_king');
    const spiderQueen = getMonsterData('silverweb_spider_queen');
    const store = getShop('silverweb_hunter_store');
    assert.equal(wolfKing?.level, 15);
    assert.equal(spiderQueen?.level, 24);
    assert.ok(wolfKing?.tags.includes(GameTags.ENTITY_BOSS));
    assert.ok(spiderQueen?.skillPattern?.randomOrder);
    assert.ok(store?.data.buyList.some(entry => entry.create().itemDataId === 'forest_antidote'));
    assert.equal(getItemData('silverweb_hunter_bow')?.image, 'items/silverweb_hunter_bow');
    assert.equal(getResourceData('silverweb_egg_cluster')?.attackable, undefined);

    reloadAllLocations(locations);
    const nest = getLocation('silverweb_queen_nest');
    nest?.update(0.05);
    const queen = nest?.getMonstersByDataId('silverweb_spider_queen')[0];
    assert.equal(getSilverwebBroodProtectionMultiplier(), 0.65);
    assert.equal(queen?.getDamageReceivedModifier(), 0.65);
    for (const cluster of nest?.getResourcesByDataId('silverweb_egg_cluster') ?? []) {
        cluster.damage(cluster.maxLife, 'absolute', { type: 'void', causeEntity: null, fixedDamage: true });
    }
    nest?.update(0.05);
    assert.equal(getSilverwebBroodProtectionMultiplier(), 1);
    assert.equal(queen?.getDamageReceivedModifier(), 1);
});

test('보스방은 입장한 플레이어를 선공 대상으로 삼고 필드 보스는 기존처럼 대기한다', () => {
    reloadAllLocations(locations);
    const nest = getLocation('silverweb_queen_nest');
    const hill = getLocation('red_mane_hill');
    const intruder = new TestBossRoomPlayer('silverweb_queen_nest');
    const fieldVisitor = new TestBossRoomPlayer('red_mane_hill');

    assert.equal(nest?.isBossRoom, true);
    assert.equal(hill?.isBossRoom, false);

    nest?.update(0.05, [intruder as unknown as Player]);
    const queen = nest?.getMonstersByDataId('silverweb_spider_queen')[0];
    assert.equal(queen?.currentTarget, intruder);
    assert.equal(queen?.getThreatContributions().length, 1);

    nest?.update(0.05, [intruder as unknown as Player]);
    assert.equal(queen?.getThreatContributions().length, 1);

    hill?.update(0.05, [fieldVisitor as unknown as Player]);
    const wolfKing = hill?.getMonstersByDataId('red_mane_wolf_king')[0];
    assert.equal(wolfKing?.currentTarget, null);
});

test('몬스터는 최초 공격자에게 교전이 선점되고 선점자가 이탈하면 다시 공격할 수 있다', () => {
    reloadAllLocations(locations);
    const queen = getLocation('silverweb_queen_nest')?.getMonstersByDataId('silverweb_spider_queen')[0];
    const claimant = new TestBossRoomPlayer('silverweb_queen_nest', 990_011);
    const outsider = new TestBossRoomPlayer('silverweb_queen_nest', 990_012);

    assert.equal(queen?.acquireCombatTarget(claimant), true);
    assert.deepEqual(queen?.getCombatClaimUserIds(), [claimant.userId!]);
    assert.equal(queen?.getAttackDeniedReason(claimant), undefined);
    assert.match(queen?.getAttackDeniedReason(outsider) ?? '', /다른 플레이어 또는 파티/);

    claimant.locationId = 'town_square';
    queen?.update(0.05);
    assert.deepEqual(queen?.getCombatClaimUserIds(), []);
    assert.equal(queen?.getAttackDeniedReason(outsider), undefined);
});

test('은빛그물 보스는 모든 직업이 배울 수 있는 전승 스킬북을 낮은 확률로 드롭한다', () => {
    for (const [bossId, bookId, skillDataId, chance] of [
        ['red_mane_wolf_king', 'predator_pounce_skillbook', 'predator_pounce', 0.035],
        ['silverweb_spider_queen', 'silverweb_snare_skillbook', 'silverweb_snare', 0.03],
    ] as const) {
        const boss = getMonsterData(bossId);
        const drop = boss?.drops.find(candidate => candidate.itemDataId === bookId);
        const book = getItemData(bookId);
        assert.equal(drop?.chance, chance, bossId);
        assert.equal(book?.onUse, 'learn_skill', bookId);
        assert.equal(book?.baseMetadata?.skillDataId, skillDataId, bookId);
        assert.equal(book?.image, `items/${bookId}`, bookId);
    }
});

test('황혼왕릉은 두 왕좌·질문문·유물함·상점·연속 퀘스트를 가진 중레벨 우회 권역이다', () => {
    const region = locations.filter(location => location.id.startsWith('twilight_'));
    const skeletonKing = getMonsterData('hollow_skeleton_king');
    const knightKing = getMonsterData('fallen_knight_king');
    const store = getShop('twilight_memorial_store');
    const recipes = getAllCraftingRecipes().filter(recipe => recipe.id.startsWith('twilight:'));
    const quests = getAllQuestData().filter(quest => quest.id.startsWith('twilight-tomb:'));

    assert.equal(region.length, 9);
    assert.equal(new Set(region.map(location => location.mapColor)).size, 1);
    assert.ok(region.every(location => location.tags.includes('location:tomb')));
    assert.equal(skeletonKing?.level, 45);
    assert.equal(knightKing?.level, 58);
    assert.ok(skeletonKing?.tags.includes(GameTags.ENTITY_BOSS));
    assert.ok(knightKing?.skillPattern?.randomOrder);
    assert.ok((skeletonKing?.ai?.weights?.healing ?? 0) > (skeletonKing?.ai?.weights?.damage ?? 0));
    assert.ok((knightKing?.ai?.tauntResistance ?? 0) >= 0.8);
    assert.deepEqual(skeletonKing?.skillPattern?.sequence, ['bone_crown_decree']);
    assert.deepEqual(knightKing?.skillPattern?.sequence, ['fallen_oath_execution', 'bone_crown_decree']);

    const crownHall = locations.find(location => location.id === 'twilight_crown_hall');
    const oathHall = locations.find(location => location.id === 'twilight_oath_hall');
    const tempestGate = locations.find(location => location.id === 'tempest_gate');
    assert.ok(crownHall?.objects.some(object => object.dataId === 'twilight_riddle_door'));
    assert.ok(crownHall?.connections.some(connection => connection.condition === 'twilight_tomb_riddle_solved'));
    assert.equal(
        oathHall?.connections.find(connection => connection.locationId === 'tempest_gate')?.condition,
        'level_50',
    );
    assert.equal(
        tempestGate?.connections.find(connection => connection.locationId === 'twilight_oath_hall')?.condition,
        'level_50',
    );
    assert.deepEqual(getResourceData('twilight_reliquary')?.interactionCooldown, {
        min: 4 * 60 * 60,
        max: 6 * 60 * 60,
    });
    assert.equal(rollTwilightReliquaryReward(() => 0).itemDataId, 'graveward_tonic');
    assert.equal(rollTwilightReliquaryReward(() => 0.999).itemDataId, 'gravekeeper_shield');

    for (const itemId of ['oathiron_sword', 'requiem_bow', 'mourning_staff', 'gravekeeper_shield']) {
        assert.ok(store?.data.buyList.some(entry => entry.create().itemDataId === itemId), itemId);
        assert.ok(getItemData(itemId)?.balance, `${itemId} balance`);
    }
    assert.equal(recipes.length, 5);
    assert.equal(quests.length, 2);
    assert.equal(NPC.getNpc('twilight_keeper')?.name, '마지막 묘지기 이벤');
});

test('유리모래 사막은 분기·필드 보스·해시계·거울 기둥·대상단 경제를 연결한다', () => {
    const region = locations.filter(location => location.id.startsWith('glassdune_'));
    const scorpionQueen = getMonsterData('dune_scorpion_queen');
    const colossus = getMonsterData('sun_vault_colossus');
    const store = getShop('glassdune_caravan_store');
    const recipes = getAllCraftingRecipes().filter(recipe => recipe.id.startsWith('glassdune:'));
    const quests = getAllQuestData().filter(quest => quest.id.startsWith('glassdune:'));

    assert.equal(region.length, 12);
    assert.equal(new Set(region.map(location => location.mapColor)).size, 1);
    assert.ok(region.every(location => location.tags.includes('location:desert')));
    assert.equal(scorpionQueen?.level, 82);
    assert.equal(colossus?.level, 110);
    assert.ok(scorpionQueen?.skillPattern?.randomOrder);
    assert.deepEqual(colossus?.skillPattern?.sequence, ['petrifying_sun_gaze', 'sun_vault_flare']);
    assert.ok((colossus?.ai?.tauntResistance ?? 0) >= 0.8);

    const sea = locations.find(location => location.id === 'glassdune_sea');
    const observatory = locations.find(location => location.id === 'glassdune_observatory');
    const canyon = locations.find(location => location.id === 'glassdune_glass_canyon');
    assert.ok(sea?.connections.some(connection => connection.locationId === 'glassdune_mirage_path'));
    assert.ok(sea?.connections.some(connection => connection.locationId === 'glassdune_sunken_colonnade'));
    assert.ok(observatory?.connections.some(connection => connection.condition === 'glassdune_sundial_solved'));
    assert.ok(canyon?.connections.some(connection => connection.locationId === 'dawn_cloister'));
    assert.deepEqual(getResourceData('glassdune_reliquary')?.interactionCooldown, {
        min: 3 * 60 * 60,
        max: 5 * 60 * 60,
    });
    assert.equal(rollGlassduneReliquaryReward(() => 0).itemDataId, 'shade_canteen');
    assert.equal(rollGlassduneReliquaryReward(() => 0.999).itemDataId, 'sunmirror_shield');

    for (const itemId of [
        'dunebreaker_sword', 'sunwire_bow', 'mirage_fang_dagger', 'helioglass_staff', 'sunmirror_shield',
    ]) {
        assert.ok(store?.data.buyList.some(entry => entry.create().itemDataId === itemId), itemId);
        assert.ok(getItemData(itemId)?.balance, `${itemId} balance`);
    }
    assert.equal(recipes.length, 6);
    assert.equal(quests.length, 2);
    assert.equal(NPC.getNpc('glassdune_chronicler')?.name, '대상단 기록관 마온');

    reloadAllLocations(locations);
    const vault = getLocation('glassdune_sun_vault');
    vault?.update(0.05);
    const boss = vault?.getMonstersByDataId('sun_vault_colossus')[0];
    assert.equal(getGlassduneMirrorProtectionMultiplier(), 0.3);
    assert.equal(boss?.getDamageReceivedModifier(), 0.3);
    for (const mirror of vault?.getResourcesByDataId('sun_mirror_pillar') ?? []) {
        mirror.damage(mirror.maxLife, 'absolute', { type: 'void', causeEntity: null, fixedDamage: true });
    }
    vault?.update(0.05);
    assert.equal(getGlassduneMirrorProtectionMultiplier(), 1);
    assert.equal(boss?.getDamageReceivedModifier(), 1);
});

test('서리잔향 설원과 빙경궁은 두 보스·분광 퍼즐·왕실 유물·초소 경제를 연결한다', () => {
    const region = locations.filter(location => location.id.startsWith('frostveil_'));
    const spiderQueen = getMonsterData('hoarfrost_spider_queen');
    const frostglassQueen = getMonsterData('frostglass_queen');
    const store = getShop('frostveil_outpost_store');
    const recipes = getAllCraftingRecipes().filter(recipe => recipe.id.startsWith('frostveil:'));
    const quests = getAllQuestData().filter(quest => quest.id.startsWith('frostveil:'));

    assert.equal(region.length, 16);
    assert.equal(new Set(region.map(location => location.mapColor)).size, 1);
    assert.ok(region.every(location => location.tags.includes('location:frozen')));
    assert.equal(spiderQueen?.level, 136);
    assert.equal(frostglassQueen?.level, 152);
    assert.ok(spiderQueen?.skillPattern?.randomOrder);
    assert.deepEqual(frostglassQueen?.skillPattern?.sequence, [
        'mirror_frost_lance', 'aurora_silence', 'hoarfrost_web_barrage',
    ]);
    assert.ok((frostglassQueen?.ai?.tauntResistance ?? 0) >= 0.85);

    const lake = locations.find(location => location.id === 'frostveil_frozen_lake');
    const mirrorHall = locations.find(location => location.id === 'frostveil_mirror_hall');
    const bridge = locations.find(location => location.id === 'frostveil_aurora_bridge');
    assert.ok(lake?.objects.some(object => object.dataId === 'rime_crystal_vein'));
    assert.ok(mirrorHall?.connections.some(connection => connection.condition === 'frostveil_prism_solved'));
    assert.ok(bridge?.connections.some(connection => connection.locationId === 'necropolis_gate'));
    assert.deepEqual(getResourceData('frostveil_reliquary')?.interactionCooldown, {
        min: 4 * 60 * 60,
        max: 6 * 60 * 60,
    });
    assert.equal(rollFrostveilReliquaryReward(() => 0).itemDataId, 'winter_trail_ration');
    assert.equal(rollFrostveilReliquaryReward(() => 0.999).itemDataId, 'frostglass_bulwark');

    for (const itemId of [
        'rimecleaver_sword', 'icesilk_longbow', 'mirrorfang_dagger', 'auroraprism_staff', 'frostglass_bulwark',
    ]) {
        assert.ok(store?.data.buyList.some(entry => entry.create().itemDataId === itemId), itemId);
        assert.ok(getItemData(itemId)?.balance, `${itemId} balance`);
    }
    assert.equal(recipes.length, 7);
    assert.equal(quests.length, 2);
    assert.equal(NPC.getNpc('frostveil_warden')?.name, '설원 파수대장 베른');
});

test('안개파도 해안과 침몰왕도는 분기 항로·두 지휘자·조류시계·항구 경제를 연결한다', () => {
    const region = locations.filter(location => location.id.startsWith('misttide_'));
    const siren = getMonsterData('mist_siren_matriarch');
    const admiral = getMonsterData('drowned_admiral');
    const store = getShop('misttide_harbor_store');
    const recipes = getAllCraftingRecipes().filter(recipe => recipe.id.startsWith('misttide:'));
    const quests = getAllQuestData().filter(quest => quest.id.startsWith('misttide:'));

    assert.equal(region.length, 19);
    assert.equal(new Set(region.map(location => location.mapColor)).size, 1);
    assert.ok(region.every(location => location.tags.includes(GameTags.LOCATION_COAST)));
    assert.equal(siren?.level, 171);
    assert.equal(admiral?.level, 186);
    assert.ok(siren?.skillPattern?.randomOrder);
    assert.deepEqual(admiral?.skillPattern?.sequence, [
        'admiral_abyss_anchor', 'drowned_fleet_command', 'undertow_silence',
    ]);
    assert.ok((admiral?.ai?.tauntResistance ?? 0) >= 0.9);

    const channel = locations.find(location => location.id === 'misttide_fogbank_channel');
    const causeway = locations.find(location => location.id === 'misttide_drowned_causeway');
    const clockCove = locations.find(location => location.id === 'misttide_clock_cove');
    const throne = locations.find(location => location.id === 'misttide_drowned_throne');
    assert.ok(channel?.connections.some(connection => connection.locationId === 'misttide_siren_shallows'));
    assert.ok(channel?.connections.some(connection => connection.locationId === 'misttide_tidewatch_cliffs'));
    assert.ok(causeway?.connections.some(connection => connection.locationId === 'misttide_drowned_market'));
    assert.ok(causeway?.connections.some(connection => connection.locationId === 'misttide_drowned_archive'));
    assert.ok(clockCove?.connections.some(connection => connection.condition === 'misttide_clock_solved'));
    assert.ok(throne?.objects.some(object => object.dataId === 'drowned_admiral' && object.maxCount === 1));
    assert.deepEqual(getResourceData('misttide_reliquary')?.interactionCooldown, {
        min: 5 * 60 * 60,
        max: 7 * 60 * 60,
    });
    assert.equal(rollMisttideReliquaryReward(() => 0).itemDataId, 'brine_trail_ration');
    assert.equal(rollMisttideReliquaryReward(() => 0.999).itemDataId, 'drowned_admiral_shield');

    for (const itemId of [
        'tidebreaker_sword', 'mistcurrent_bow', 'blackcoral_sting', 'deeppearl_staff', 'drowned_admiral_shield',
    ]) {
        assert.ok(store?.data.buyList.some(entry => entry.create().itemDataId === itemId), itemId);
        assert.ok(getItemData(itemId)?.balance, `${itemId} balance`);
    }
    assert.equal(recipes.length, 8);
    assert.equal(quests.length, 2);
    assert.equal(NPC.getNpc('misttide_navigator')?.name, '염등 항로지기 소마');
});

test('카이로스 공방도시는 분기 조립선·인과 퍼즐·시제품고·고정자 보스 기믹과 지역 경제를 연결한다', () => {
    const region = locations.filter(location => location.id.startsWith('paradox_'));
    const colossus = getMonsterData('chronosteel_colossus');
    const architect = getMonsterData('paradox_architect');
    const store = getShop('paradox_relay_store');
    const recipes = getAllCraftingRecipes().filter(recipe => recipe.id.startsWith('paradox:'));
    const quests = getAllQuestData().filter(quest => quest.id.startsWith('paradox:'));

    assert.equal(region.length, 24);
    assert.equal(new Set(region.map(location => location.mapColor)).size, 1);
    assert.ok(region.every(location => location.tags.includes(GameTags.LOCATION_CLOCKWORK)));
    assert.equal(colossus?.level, 220);
    assert.equal(architect?.level, 235);
    assert.deepEqual(colossus?.skillPattern?.sequence, ['clockwork_overrun', 'chronosteel_time_lock']);
    assert.ok(architect?.skillPattern?.randomOrder);
    assert.ok((architect?.ai?.tauntResistance ?? 0) >= 0.9);

    const conveyor = locations.find(location => location.id === 'paradox_rusted_conveyor');
    const bridge = locations.find(location => location.id === 'paradox_equation_bridge');
    const lock = locations.find(location => location.id === 'paradox_causality_lock');
    const hiddenVault = locations.find(location => location.id === 'paradox_hidden_prototype_vault');
    const core = locations.find(location => location.id === 'paradox_architect_core');
    assert.ok(conveyor?.connections.some(connection => connection.locationId === 'paradox_scrap_reservoir'));
    assert.ok(conveyor?.connections.some(connection => connection.locationId === 'paradox_lens_corridor'));
    assert.ok(bridge?.connections.some(connection => connection.locationId === 'paradox_inverse_hall'));
    assert.ok(bridge?.connections.some(connection => connection.locationId === 'paradox_stage'));
    assert.ok(lock?.connections.some(connection => connection.condition === 'paradox_causality_solved'));
    assert.ok(hiddenVault?.tags.includes(GameTags.LOCATION_HIDDEN));
    assert.equal(core?.objects.find(object => object.dataId === 'paradox_anchor')?.maxCount, 3);
    assert.ok(core?.objects.some(object => object.dataId === 'paradox_architect' && object.maxCount === 1));
    assert.deepEqual(getResourceData('prototype_reliquary')?.interactionCooldown, {
        min: 6 * 60 * 60,
        max: 8 * 60 * 60,
    });
    assert.equal(rollParadoxReliquaryReward(() => 0).itemDataId, 'cogwork_ration');
    assert.equal(rollParadoxReliquaryReward(() => 0.999).itemDataId, 'causality_aegis');

    for (const itemId of [
        'paradox_edge', 'photon_repeater', 'voidspring_dagger', 'logic_core_staff', 'causality_aegis',
    ]) {
        assert.ok(store?.data.buyList.some(entry => entry.create().itemDataId === itemId), itemId);
        assert.ok(getItemData(itemId)?.balance, `${itemId} balance`);
    }
    assert.equal(recipes.length, 9);
    assert.equal(quests.length, 2);
    assert.equal(NPC.getNpc('paradox_curator')?.name, '기록보존관 이델');

    reloadAllLocations(locations);
    const runtimeCore = getLocation('paradox_architect_core');
    runtimeCore?.update(0.05);
    const runtimeArchitect = runtimeCore?.getMonstersByDataId('paradox_architect')[0];
    assert.equal(getParadoxAnchorProtectionMultiplier(), 0.25);
    assert.equal(runtimeArchitect?.getDamageReceivedModifier(), 0.25);
    for (const anchor of runtimeCore?.getResourcesByDataId('paradox_anchor') ?? []) {
        anchor.damage(anchor.maxLife, 'absolute', { type: 'void', causeEntity: null, fixedDamage: true });
    }
    runtimeCore?.update(0.05);
    assert.equal(getParadoxAnchorProtectionMultiplier(), 1);
    assert.equal(runtimeArchitect?.getDamageReceivedModifier(), 1);
});

test('아셴바흐 심연은 다중 분기·세 보스·봉인 퍼즐·밤쇠 경제를 카르모르 성까지 연결한다', () => {
    const region = locations.filter(location => location.id.startsWith('ashen_'));
    const gatekeeper = getMonsterData('three_maw_gatekeeper');
    const general = getMonsterData('blackflame_general');
    const sovereign = getMonsterData('ashen_sovereign');
    const store = getShop('ashen_waystation_store');
    const recipes = getAllCraftingRecipes().filter(recipe => recipe.id.startsWith('ashen:'));
    const quests = getAllQuestData().filter(quest => quest.id.startsWith('ashen-abyss:'));

    assert.equal(region.length, 25);
    assert.equal(new Set(region.map(location => location.mapColor)).size, 1);
    assert.ok(region.every(location => location.tags.includes(GameTags.LOCATION_ASHEN_ABYSS)));
    assert.deepEqual(
        [gatekeeper?.level, general?.level, sovereign?.level],
        [248, 260, 275],
    );
    assert.deepEqual(gatekeeper?.skillPattern?.sequence, [
        'gatekeeper_cinder_breath', 'gatekeeper_triple_maul',
    ]);
    assert.ok(general?.skillPattern?.randomOrder);
    assert.deepEqual(sovereign?.skillPattern?.sequence, [
        'sovereign_crownfall', 'sovereign_ash_sentence', 'blackflame_general_march',
    ]);
    assert.ok((general?.ai?.weights?.healing ?? 0) > (general?.ai?.weights?.damage ?? 0));
    assert.ok((sovereign?.ai?.tauntResistance ?? 0) >= 0.95);

    const gate = locations.find(location => location.id === 'ashen_gate_chasm');
    const valleyWest = locations.find(location => location.id === 'ashen_dead_valley_west');
    const valleyEast = locations.find(location => location.id === 'ashen_dead_valley_east');
    const outerFork = locations.find(location => location.id === 'ashen_blackflame_outer_fork');
    const sealChapel = locations.find(location => location.id === 'ashen_seal_chapel');
    const hiddenReliquary = locations.find(location => location.id === 'ashen_hidden_reliquary');
    const barbican = locations.find(location => location.id === 'ashen_castle_barbican');
    const throne = locations.find(location => location.id === 'ashen_sovereign_throne');
    assert.ok(gate?.connections.some(connection => connection.locationId === valleyWest?.id));
    assert.ok(gate?.connections.some(connection => connection.locationId === valleyEast?.id));
    assert.ok(outerFork?.connections.some(connection => connection.locationId === 'ashen_soot_cloister'));
    assert.ok(outerFork?.connections.some(connection => connection.locationId === 'ashen_ember_furnace'));
    assert.ok(sealChapel?.connections.some(connection => connection.condition === 'ashen_seal_solved'));
    assert.ok(hiddenReliquary?.tags.includes(GameTags.LOCATION_HIDDEN));
    assert.ok(barbican?.connections.some(connection => connection.locationId === 'ashen_lower_barracks'));
    assert.ok(barbican?.connections.some(connection => connection.locationId === 'ashen_gargoyle_rampart'));
    assert.ok(throne?.objects.some(object => object.dataId === 'ashen_sovereign' && object.maxCount === 1));
    assert.equal(getResourceData('night_iron_vein')?.hardness, 410);
    assert.deepEqual(getResourceData('ashen_reliquary')?.interactionCooldown, {
        min: 7 * 60 * 60,
        max: 10 * 60 * 60,
    });
    assert.equal(rollAshenReliquaryReward(() => 0).itemDataId, 'ashmarch_ration');
    assert.equal(rollAshenReliquaryReward(() => 0.999).itemDataId, 'ashguard_bulwark');

    for (const itemId of [
        'sootcleaver_sword', 'hornstring_bow', 'gloamfang_dagger', 'blackflame_staff', 'ashguard_bulwark',
    ]) {
        assert.ok(store?.data.buyList.some(entry => entry.create().itemDataId === itemId), itemId);
        assert.ok(getItemData(itemId)?.balance, `${itemId} balance`);
    }
    assert.equal(recipes.length, 8);
    assert.equal(quests.length, 2);
    assert.equal(NPC.getNpc('ashen_wayfinder')?.name, '회색불길 길잡이 타렌');
});

test('벨카인 요새는 27개 분기 층·서약 퍼즐·기둥 보호 보스·지역 경제를 연결한다', () => {
    const region = locations.filter(location => location.id.startsWith('voidcrown_'));
    const castellan = getMonsterData('crownless_castellan');
    const regent = getMonsterData('voidcrown_regent');
    const store = getShop('voidcrown_waystation_store');
    const recipes = getAllCraftingRecipes().filter(recipe => recipe.id.startsWith('voidcrown:'));
    const quests = getAllQuestData().filter(quest => quest.id.startsWith('voidcrown:'));

    assert.equal(region.length, 27);
    assert.equal(new Set(region.map(location => location.mapColor)).size, 1);
    assert.ok(region.every(location => location.tags.includes(GameTags.LOCATION_VOIDCROWN)));
    assert.equal(castellan?.level, 290);
    assert.equal(regent?.level, 310);
    assert.deepEqual(castellan?.skillPattern?.sequence, ['castellan_void_lance', 'castellan_rampart_break']);
    assert.equal(castellan?.skillPattern?.randomOrder, undefined);
    assert.ok(regent?.skillPattern?.randomOrder);
    assert.ok((regent?.ai?.weights?.healing ?? 0) > (regent?.ai?.weights?.damage ?? 0));
    assert.ok((regent?.ai?.tauntResistance ?? 0) >= 0.95);

    const lowerCourt = locations.find(location => location.id === 'voidcrown_lower_court');
    const gatehouse = locations.find(location => location.id === 'voidcrown_gatehouse');
    const chapel = locations.find(location => location.id === 'voidcrown_oath_chapel');
    const vault = locations.find(location => location.id === 'voidcrown_hidden_vault');
    const throne = locations.find(location => location.id === 'voidcrown_throne');
    assert.ok(lowerCourt?.connections.some(connection => connection.locationId === 'voidcrown_west_battlement'));
    assert.ok(lowerCourt?.connections.some(connection => connection.locationId === 'voidcrown_starved_garden'));
    assert.ok(gatehouse?.connections.some(connection => connection.locationId === 'voidcrown_foundry'));
    assert.ok(gatehouse?.connections.some(connection => connection.locationId === 'voidcrown_archive'));
    assert.ok(chapel?.connections.some(connection => connection.condition === 'voidcrown_oath_solved'));
    assert.ok(vault?.tags.includes(GameTags.LOCATION_HIDDEN));
    assert.equal(throne?.objects.find(object => object.dataId === 'voidcrown_pillar')?.maxCount, 3);
    assert.equal(getResourceData('nullsilver_vein')?.hardness, 470);
    assert.deepEqual(getResourceData('voidcrown_reliquary')?.interactionCooldown, {
        min: 8 * 60 * 60,
        max: 11 * 60 * 60,
    });
    assert.equal(rollVoidcrownReliquaryReward(() => 0).itemDataId, 'voidcrown_ration');
    assert.equal(rollVoidcrownReliquaryReward(() => 0.999).itemDataId, 'regent_aegis');

    for (const itemId of [
        'nullsilver_greatsword', 'crownstring_longbow', 'voidsilk_stiletto', 'starless_scepter', 'regent_aegis',
    ]) {
        assert.ok(store?.data.buyList.some(entry => entry.create().itemDataId === itemId), itemId);
        assert.ok(getItemData(itemId)?.balance, `${itemId} balance`);
    }
    assert.equal(recipes.length, 7);
    assert.equal(quests.length, 2);
    assert.equal(NPC.getNpc('voidcrown_warden')?.name, '빈 왕관 기록수호자 세린');

    reloadAllLocations(locations);
    const runtimeThrone = getLocation('voidcrown_throne');
    runtimeThrone?.update(0.05);
    const runtimeRegent = runtimeThrone?.getMonstersByDataId('voidcrown_regent')[0];
    assert.equal(getVoidcrownPillarProtectionMultiplier(), 0.4);
    assert.equal(runtimeRegent?.getDamageReceivedModifier(), 0.4);
    for (const pillar of runtimeThrone?.getResourcesByDataId('voidcrown_pillar') ?? []) {
        pillar.damage(pillar.maxLife, 'absolute', { type: 'void', causeEntity: null, fixedDamage: true });
    }
    runtimeThrone?.update(0.05);
    assert.equal(getVoidcrownPillarProtectionMultiplier(), 1);
    assert.equal(runtimeRegent?.getDamageReceivedModifier(), 1);
});

test('루나리스 해구는 24개 분기 수로·조류제단·거울 보호 보스·지역 경제를 연결한다', () => {
    const region = locations.filter(location => location.tags.includes(GameTags.LOCATION_ECLIPSE_TRENCH));
    const leviathan = getMonsterData('moon_tide_leviathan');
    const hierophant = getMonsterData('white_night_hierophant');
    const store = getShop('eclipse_dock_store');
    const recipes = getAllCraftingRecipes().filter(recipe => recipe.id.startsWith('eclipse:'));
    const quests = getAllQuestData().filter(quest => quest.id.startsWith('eclipse-trench:'));

    assert.equal(region.length, 24);
    assert.equal(new Set(region.map(location => location.mapColor)).size, 1);
    assert.equal(leviathan?.level, 325);
    assert.equal(hierophant?.level, 345);
    assert.deepEqual(leviathan?.skillPattern?.sequence, ['leviathan_moon_tide', 'leviathan_depth_crush']);
    assert.equal(leviathan?.skillPattern?.randomOrder, undefined);
    assert.ok(hierophant?.skillPattern?.randomOrder);
    assert.ok((hierophant?.ai?.weights?.healing ?? 0) > (hierophant?.ai?.weights?.damage ?? 0));
    assert.ok((hierophant?.ai?.tauntResistance ?? 0) >= 0.95);

    const crossing = locations.find(location => location.id === 'eclipse_lower_crossing');
    const basin = locations.find(location => location.id === 'eclipse_basin');
    const altar = locations.find(location => location.id === 'eclipse_tide_altar');
    const vault = locations.find(location => location.id === 'eclipse_sunken_reliquary');
    const bossAltar = locations.find(location => location.id === 'eclipse_white_night_altar');
    assert.ok(crossing?.connections.some(connection => connection.locationId === 'eclipse_luminous_reef'));
    assert.ok(crossing?.connections.some(connection => connection.locationId === 'eclipse_drowned_convoy'));
    assert.ok(basin?.connections.some(connection => connection.locationId === 'eclipse_kelp_cloister'));
    assert.ok(basin?.connections.some(connection => connection.locationId === 'eclipse_black_current'));
    assert.ok(altar?.connections.some(connection => connection.condition === 'eclipse_tide_solved'));
    assert.ok(vault?.tags.includes(GameTags.LOCATION_HIDDEN));
    assert.equal(bossAltar?.objects.find(object => object.dataId === 'white_night_tide_mirror')?.maxCount, 3);
    assert.equal(getResourceData('drowned_silver_vein')?.hardness, 520);
    assert.deepEqual(getResourceData('eclipse_reliquary')?.interactionCooldown, {
        min: 8 * 60 * 60,
        max: 12 * 60 * 60,
    });
    assert.equal(rollEclipseReliquaryReward(() => 0).itemDataId, 'eclipse_ration');
    assert.equal(rollEclipseReliquaryReward(() => 0.999).itemDataId, 'white_night_bulwark');

    for (const itemId of [
        'drowned_edge', 'mooncurrent_bow', 'nightpearl_knife', 'eclipse_oracle_staff', 'white_night_bulwark',
    ]) {
        assert.ok(store?.data.buyList.some(entry => entry.create().itemDataId === itemId), itemId);
        assert.ok(getItemData(itemId)?.balance, `${itemId} balance`);
    }
    assert.equal(recipes.length, 7);
    assert.equal(quests.length, 2);
    assert.equal(NPC.getNpc('eclipse_navigator')?.name, '조류항해사 미레나');

    reloadAllLocations(locations);
    const runtimeAltar = getLocation('eclipse_white_night_altar');
    runtimeAltar?.update(0.05);
    const runtimeBoss = runtimeAltar?.getMonstersByDataId('white_night_hierophant')[0];
    assert.equal(getWhiteNightMirrorProtectionMultiplier(), 0.35);
    assert.equal(runtimeBoss?.getDamageReceivedModifier(), 0.35);
    for (const mirror of runtimeAltar?.getResourcesByDataId('white_night_tide_mirror') ?? []) {
        mirror.damage(mirror.maxLife, 'absolute', { type: 'void', causeEntity: null, fixedDamage: true });
    }
    runtimeAltar?.update(0.05);
    assert.equal(getWhiteNightMirrorProtectionMultiplier(), 1);
    assert.equal(runtimeBoss?.getDamageReceivedModifier(), 1);
});

test('카미하라 숲은 26개 분기 뿌리·기억 제단·씨앗 보호 보스·최종 지역 경제를 연결한다', () => {
    const region = locations.filter(location => location.tags.includes(GameTags.LOCATION_WORLDROOT));
    const devourer = getMonsterData('inverse_root_devourer');
    const heart = getMonsterData('primordial_heart_arbor');
    const store = getShop('worldroot_waystation_store');
    const recipes = getAllCraftingRecipes().filter(recipe => recipe.id.startsWith('worldroot:'));
    const quests = getAllQuestData().filter(quest => quest.id.startsWith('worldroot:'));

    assert.equal(region.length, 26);
    assert.equal(new Set(region.map(location => location.mapColor)).size, 1);
    assert.equal(devourer?.level, 360);
    assert.equal(heart?.level, 380);
    assert.deepEqual(devourer?.skillPattern?.sequence, [
        'root_devourer_downfall', 'root_devourer_rot_breath',
    ]);
    assert.equal(devourer?.skillPattern?.randomOrder, undefined);
    assert.ok(heart?.skillPattern?.randomOrder);
    assert.ok((heart?.ai?.weights?.healing ?? 0) > (heart?.ai?.weights?.damage ?? 0));
    assert.ok((heart?.ai?.tauntResistance ?? 0) >= 0.99);

    const fork = locations.find(location => location.id === 'worldroot_lower_fork');
    const innerGate = locations.find(location => location.id === 'worldroot_inner_gate');
    const altar = locations.find(location => location.id === 'worldroot_memory_altar');
    const vault = locations.find(location => location.id === 'worldroot_hidden_reliquary');
    const chamber = locations.find(location => location.id === 'worldroot_primordial_heart');
    assert.ok(fork?.connections.some(connection => connection.locationId === 'worldroot_luminous_root'));
    assert.ok(fork?.connections.some(connection => connection.locationId === 'worldroot_rot_hollow'));
    assert.ok(innerGate?.connections.some(connection => connection.locationId === 'worldroot_spore_garden'));
    assert.ok(innerGate?.connections.some(connection => connection.locationId === 'worldroot_amber_channel'));
    assert.ok(altar?.connections.some(connection => connection.condition === 'worldroot_memory_solved'));
    assert.ok(vault?.tags.includes(GameTags.LOCATION_HIDDEN));
    assert.equal(chamber?.objects.find(object => object.dataId === 'primordial_heart_seed')?.maxCount, 3);
    assert.equal(getResourceData('rootbone_vein')?.hardness, 580);
    assert.deepEqual(getResourceData('worldroot_reliquary')?.interactionCooldown, {
        min: 9 * 60 * 60,
        max: 13 * 60 * 60,
    });
    assert.equal(rollWorldrootReliquaryReward(() => 0).itemDataId, 'worldroot_ration');
    assert.equal(rollWorldrootReliquaryReward(() => 0.999).itemDataId, 'canopy_heartshield');

    for (const itemId of [
        'rootbone_cleaver', 'heartstring_greatbow', 'amber_memory_fang',
        'origin_heart_staff', 'canopy_heartshield',
    ]) {
        assert.ok(store?.data.buyList.some(entry => entry.create().itemDataId === itemId), itemId);
        assert.ok(getItemData(itemId)?.balance, `${itemId} balance`);
    }
    assert.equal(recipes.length, 7);
    assert.equal(quests.length, 2);
    assert.equal(NPC.getNpc('worldroot_keeper')?.name, '기억수호자 오르넬');

    reloadAllLocations(locations);
    const runtimeHeart = getLocation('worldroot_primordial_heart');
    runtimeHeart?.update(0.05);
    const runtimeBoss = runtimeHeart?.getMonstersByDataId('primordial_heart_arbor')[0];
    assert.equal(getPrimordialSeedProtectionMultiplier(), 0.3);
    assert.equal(runtimeBoss?.getDamageReceivedModifier(), 0.3);
    for (const seed of runtimeHeart?.getResourcesByDataId('primordial_heart_seed') ?? []) {
        seed.damage(seed.maxLife, 'absolute', { type: 'void', causeEntity: null, fixedDamage: true });
    }
    runtimeHeart?.update(0.05);
    assert.equal(getPrimordialSeedProtectionMultiplier(), 1);
    assert.equal(runtimeBoss?.getDamageReceivedModifier(), 1);
});

test('Lv.380~500 세 후반 권역은 분기 동선·지역 경제·연속 퀘스트·25레벨 이내 보스를 제공한다', () => {
    const regions = [
        {
            tag: GameTags.LOCATION_NEBULA_CORRIDOR,
            material: GameTags.MATERIAL_NEBULA_CORRIDOR,
            count: 14,
            storeId: 'nebula_waystation_store',
            recipePrefix: 'nebula:',
            questPrefix: 'nebula-corridor:',
            npcId: 'nebula_navigator',
            oreId: 'comet_iron_vein',
            oreHardness: 650,
            itemIds: ['nebula_edge', 'gravity_arc_bow', 'orbit_fang', 'starwell_staff', 'meteor_bulwark'],
            bosses: [['meteor_warden', 400], ['nebula_sovereign', 420]] as const,
        },
        {
            tag: GameTags.LOCATION_CHRONOFROST,
            material: GameTags.MATERIAL_CHRONOFROST,
            count: 16,
            storeId: 'chronofrost_refuge_store',
            recipePrefix: 'chronofrost:',
            questPrefix: 'chronofrost:',
            npcId: 'chronofrost_keeper',
            oreId: 'pendulum_steel_vein',
            oreHardness: 730,
            itemIds: ['chronoblade', 'pendulum_bow', 'yesterglass_dagger', 'zero_hour_staff', 'aeon_bulwark'],
            bosses: [['frostclock_sentinel', 440], ['zero_hour_queen', 460]] as const,
        },
        {
            tag: GameTags.LOCATION_ENDSTAR,
            material: GameTags.MATERIAL_ENDSTAR,
            count: 17,
            storeId: 'endstar_bastion_store',
            recipePrefix: 'endstar:',
            questPrefix: 'endstar:',
            npcId: 'endstar_observer',
            oreId: 'entropy_metal_vein',
            oreHardness: 820,
            itemIds: ['endstar_edge', 'constellation_bow', 'entropy_fang', 'genesis_staff', 'horizon_bulwark'],
            bosses: [['endstar_herald', 480], ['last_constellation', 500]] as const,
        },
    ] as const;

    for (const regionData of regions) {
        const region = locations.filter(location => location.tags.includes(regionData.tag));
        const store = getShop(regionData.storeId);
        const recipes = getAllCraftingRecipes().filter(recipe => recipe.id.startsWith(regionData.recipePrefix));
        const quests = getAllQuestData().filter(quest => quest.id.startsWith(regionData.questPrefix));
        assert.equal(region.length, regionData.count, regionData.tag);
        assert.equal(new Set(region.map(location => location.mapColor)).size, 1, regionData.tag);
        assert.ok(region.some(location => location.shopId === regionData.storeId), regionData.storeId);
        assert.equal(recipes.length, 7, regionData.recipePrefix);
        assert.equal(quests.length, 2, regionData.questPrefix);
        assert.ok(NPC.getNpc(regionData.npcId), regionData.npcId);
        assert.equal(getResourceData(regionData.oreId)?.hardness, regionData.oreHardness);
        for (const itemId of regionData.itemIds) {
            assert.ok(getItemData(itemId)?.tags.includes(regionData.material), `${itemId} material`);
            assert.ok(getItemData(itemId)?.balance, `${itemId} balance`);
            assert.ok(store?.data.buyList.some(entry => entry.create().itemDataId === itemId), `${itemId} store`);
        }
        for (const [bossId, level] of regionData.bosses) {
            const boss = getMonsterData(bossId);
            assert.equal(boss?.level, level, bossId);
            assert.ok(boss?.tags.includes(GameTags.ENTITY_BOSS), bossId);
            assert.ok((boss?.skills?.length ?? 0) >= 2, `${bossId} skills`);
        }
    }

    assert.ok(getMonsterData('nebula_sovereign')?.skillPattern?.randomOrder);
    assert.ok(getMonsterData('zero_hour_queen')?.skillPattern?.randomOrder);
    assert.ok(getMonsterData('last_constellation')?.skillPattern?.randomOrder);
    assert.equal(
        locations.find(location => location.id === 'worldroot_primordial_heart')
            ?.connections.find(connection => connection.locationId === 'nebula_threshold')?.condition,
        'level_380',
    );
    assert.equal(
        locations.find(location => location.id === 'nebula_sovereign_throne')
            ?.connections.find(connection => connection.locationId === 'chronofrost_threshold')?.condition,
        'level_420',
    );
    assert.equal(
        locations.find(location => location.id === 'chronofrost_zero_throne')
            ?.connections.find(connection => connection.locationId === 'endstar_threshold')?.condition,
        'level_460',
    );
});

test('Lv.500~1000 승천 권역은 50레벨 단위 미궁·선택형 보스·환경 효과·숨은 제단을 제공한다', () => {
    assert.equal(ASCENDANT_REGIONS.length, 10);
    assert.deepEqual(ASCENDANT_REGIONS.map(region => region.bossLevel), [
        550, 600, 650, 700, 750, 800, 850, 900, 950, 1000,
    ]);
    const mapDirections = new Set<string>();

    for (const [index, regionData] of ASCENDANT_REGIONS.entries()) {
        const regionTag = `location:${regionData.id}`;
        const regionLocations = locations.filter(location => location.tags.includes(regionTag));
        const transition = locations.find(location => location.id === `${regionData.id}_transition`);
        const bossRoom = locations.find(location => location.id === `${regionData.id}_boss_sanctum`);
        const altar = locations.find(location => location.id === `${regionData.id}_sealed_altar`);
        const reliquary = locations.find(location => location.id === `${regionData.id}_reliquary`);
        const innerCrossroads = locations.find(location => location.id === `${regionData.id}_inner_crossroads`);
        const spiralEntry = locations.find(location => location.id === `${regionData.id}_spiral_entry`);
        const spiralNexus = locations.find(location => location.id === `${regionData.id}_spiral_nexus`);
        const hunterCache = locations.find(location => location.id === `${regionData.id}_hunter_cache`);
        const materialCache = locations.find(location => location.id === `${regionData.id}_material_cache`);
        const finalFork = locations.find(location => location.id === `${regionData.id}_final_fork`);
        const falseEnd = locations.find(location => location.id === `${regionData.id}_false_end`);
        const boss = getMonsterData(`${regionData.id}_sovereign`);
        const store = getShop(`${regionData.id}_waystation_store`);

        const extraMineLocations = HIGH_LEVEL_MINES.some(mine => mine.regionId === regionData.id) ? 4 : 0;
        const extraFishingLocations = HIGH_LEVEL_FISHING_SPOTS.some(spot => spot.regionId === regionData.id) ? 1 : 0;
        assert.equal(regionLocations.length, 31 + extraMineLocations + extraFishingLocations, regionData.id);
        if (transition) {
            const threshold = locations.find(location => location.id === `${regionData.id}_threshold`);
            assert.ok(threshold);
            mapDirections.add(`${Math.sign(transition.x - threshold.x)}:${Math.sign(transition.y - threshold.y)}`);
        }
        assert.ok(regionLocations.every(location => location.mapColor === regionData.mapColor), regionData.id);
        assert.ok(regionLocations.filter(location => location.tags.includes(GameTags.LOCATION_DUNGEON)).length >= 23);
        assert.ok(transition?.connections.some(connection => connection.locationId === bossRoom?.id));
        assert.ok(bossRoom?.connections.some(connection => connection.locationId === transition?.id));
        assert.ok(innerCrossroads?.connections.some(connection => connection.locationId === spiralEntry?.id));
        assert.ok(spiralEntry?.connections.some(connection => connection.locationId === `${regionData.id}_spiral_upper`));
        assert.ok(spiralEntry?.connections.some(connection => connection.locationId === `${regionData.id}_spiral_lower`));
        assert.ok(spiralNexus?.connections.some(connection => connection.locationId === `${regionData.id}_spiral_upper`));
        assert.ok(spiralNexus?.connections.some(connection => connection.locationId === `${regionData.id}_spiral_lower`));
        assert.deepEqual(hunterCache?.connections.map(connection => connection.locationId), [`${regionData.id}_north_archive`]);
        assert.deepEqual(materialCache?.connections.map(connection => connection.locationId), [`${regionData.id}_south_archive`]);
        assert.ok(hunterCache?.objects.some(object => object.dataId === `${regionData.id}_reliquary`));
        assert.ok(materialCache?.objects.some(object => object.dataId === `${regionData.id}_reliquary`));
        assert.ok(finalFork?.connections.some(connection => connection.locationId === transition?.id));
        assert.ok(finalFork?.connections.some(connection => connection.locationId === falseEnd?.id));
        assert.deepEqual(falseEnd?.connections.map(connection => connection.locationId), [finalFork?.id]);
        assert.ok(bossRoom?.tags.includes(GameTags.LOCATION_BOSS_ROOM));
        assert.ok(altar?.tags.includes(GameTags.LOCATION_HIDDEN));
        assert.ok(altar?.objects.some(object => object.dataId === `${regionData.id}_altar`));
        assert.ok(reliquary?.objects.some(object => object.dataId === `${regionData.id}_reliquary`));
        assert.ok(getResourceData(`${regionData.id}_altar`));
        assert.ok(getResourceData(`${regionData.id}_reliquary`));
        assert.equal(boss?.level, regionData.bossLevel);
        assert.ok((boss?.skills?.length ?? 0) >= 2);
        assert.ok(boss?.drops.some(drop => drop.itemDataId === `${regionData.id}_sigil` && drop.chance === 1));
        assert.ok(store?.data.buyList.some(entry => entry.create().itemDataId === `${regionData.id}_pack`));
        assert.ok(StatusEffectType.fromKey(regionData.environment.id));

        const next = ASCENDANT_REGIONS[index + 1];
        if (next) {
            assert.equal(
                transition?.connections.find(connection => connection.locationId === `${next.id}_threshold`)?.condition,
                `level_${next.startLevel}`,
            );
        }
    }
    // 아오이 이후 동선이 기존 권역 쪽으로 되감기는 +Y 방향은 의도적으로 사용하지 않는다.
    assert.deepEqual(mapDirections, new Set(['1:0', '0:-1', '-1:0']));
});

test('고레벨 광산은 전용 희귀 광물 두 종을 낮은 확률로 제공한다', () => {
    assert.equal(HIGH_LEVEL_MINES.length, 4);
    for (const mine of HIGH_LEVEL_MINES) {
        const vein = getResourceData(`${mine.id}_ore_vein`);
        assert.ok(vein, mine.id);
        const region = ASCENDANT_REGIONS.find(candidate => candidate.id === mine.regionId);
        assert.ok(region, mine.regionId);
        const rareDrops = vein.drops.filter(drop => mine.rawMineralIds.includes(drop.itemDataId));
        assert.equal(rareDrops.length, 2, mine.id);
        assert.ok(rareDrops.every(drop => drop.weight === 3), mine.id);
        assert.equal(rareDrops.reduce((sum, drop) => sum + drop.weight, 0), 6, mine.id);
        assert.deepEqual(vein.drops, [
            { itemDataId: `${region.id}_material`, weight: 94, minCount: 2, maxCount: 5 },
            { itemDataId: mine.rawMineralIds[0], weight: 3, minCount: 1, maxCount: 1 },
            { itemDataId: mine.rawMineralIds[1], weight: 3, minCount: 1, maxCount: 1 },
        ], mine.id);
        assert.equal(vein.drops.reduce((sum, drop) => sum + drop.weight, 0), 100, mine.id);
        for (const itemDataId of mine.rawMineralIds) {
            assert.ok(getItemData(itemDataId), itemDataId);
        }
        assert.equal(
            locations.filter(location => location.id.startsWith(mine.id)).length,
            4,
            mine.id,
        );
    }
});

test('Lv.500 이전 광맥과 낚시터는 성장 구간별 희귀 재료·어종 동선을 제공한다', () => {
    const miningTiers = [
        ['glass_sand_vein', 'sun_ore_nodule', 'sunsteel'],
        ['rime_crystal_vein', 'moonfrost_ore', 'moonfrost_silver'],
        ['chronosteel_vein', 'clockwork_cobalt_ore', 'clockwork_cobalt'],
        ['drowned_silver_vein', 'tideglass_ore', 'tideglass_alloy'],
        ['entropy_metal_vein', 'endstar_adamant_ore', 'endstar_adamant'],
    ] as const;
    for (const [resourceId, rawItemDataId, refinedItemDataId] of miningTiers) {
        const vein = getResourceData(resourceId);
        assert.equal(vein?.drops.find(drop => drop.itemDataId === rawItemDataId)?.weight, 3, resourceId);
        assert.ok(getItemData(rawItemDataId), rawItemDataId);
        assert.ok(getItemData(refinedItemDataId), refinedItemDataId);
        assert.equal(vein?.drops.reduce((sum, drop) => sum + drop.weight, 0), 100, resourceId);
    }

    for (const locationId of [
        'glassdune_hidden_oasis',
        'misttide_kelp_inlet',
        'paradox_scrap_reservoir',
        'eclipse_luminous_reef',
        'endstar_silent_sun',
    ]) {
        assert.ok(getLocation(locationId)?.hasTag(GameTags.LOCATION_FISHING), locationId);
    }
});

test('화맥 광맥과 홍염강은 홍염산지 전용 채굴·제련·단조 동선을 가진다', () => {
    const emberLocations = locations.filter(location => location.objects.some(object => object.dataId === 'ember_ore_vein'));
    assert.ok(emberLocations.length >= 3);
    assert.ok(emberLocations.every(location => location.tags.includes('location:volcanic')));
    assert.equal(getItemData('ember_ore')?.image, 'items/ember_ore');
    assert.equal(getItemData('ember_alloy')?.image, 'items/ember_alloy');
    assert.equal(getResourceData('ember_ore_vein')?.hardness, 90);
});

test('사령묘는 분기·순환·합류 경로를 가지며 고레벨 직업 무기는 전용 아이콘을 사용한다', () => {
    const gate = locations.find(location => location.id === 'necropolis_gate');
    const east = locations.find(location => location.id === 'necropolis_east_crypt');
    const west = locations.find(location => location.id === 'necropolis_west_crypt');
    const crossing = locations.find(location => location.id === 'ossuary_crossing');
    assert.ok(gate?.connections.some(connection => connection.locationId === east?.id));
    assert.ok(gate?.connections.some(connection => connection.locationId === west?.id));
    assert.ok(east?.connections.some(connection => connection.locationId === west?.id));
    assert.ok(east?.connections.some(connection => connection.locationId === crossing?.id));
    assert.ok(west?.connections.some(connection => connection.locationId === crossing?.id));

    for (const id of ['windsteel_sword', 'stormstring_bow', 'nightglass_dagger', 'starwood_staff'] as const) {
        const item = getItemData(id);
        assert.equal(item?.image, `items/${id}`);
        assert.ok(item?.balance, `${id} balance`);
    }
});

test('철근미궁은 질문문·공간전이·파괴문·보스 수정 기믹을 실제 오브젝트로 연결한다', () => {
    const labyrinth = locations.find(location => location.id === 'ironroot_labyrinth');
    const echoVault = locations.find(location => location.id === 'ironroot_echo_vault');
    const gateGallery = locations.find(location => location.id === 'ironroot_gate_gallery');
    const sanctum = locations.find(location => location.id === 'ironroot_crystal_sanctum');

    assert.ok(labyrinth?.objects.some(object => object.dataId === 'ironroot_riddle_door'));
    assert.ok(labyrinth?.connections.some(connection => connection.condition === 'ironroot_riddle_solved'));
    assert.ok(echoVault?.objects.some(object => object.dataId === 'ironroot_relay_artifact'));
    assert.ok(gateGallery?.objects.some(object => object.dataId === 'ironroot_breakable_gate'));
    assert.ok(gateGallery?.connections.some(connection => connection.condition === 'ironroot_gate_destroyed'));
    assert.equal(sanctum?.objects.filter(object => object.dataId === 'ironroot_resonance_crystal').reduce(
        (total, object) => total + object.maxCount, 0,
    ), 3);
    assert.equal(getResourceData('ironroot_riddle_door')?.attackable, false);
    assert.ok((getResourceData('ironroot_breakable_gate')?.baseAttribute.maxLife ?? 0) >= 18_000);

    reloadAllLocations(locations);
    const runtimeSanctum = getLocation('ironroot_crystal_sanctum');
    runtimeSanctum?.update(0.05);
    const heartwarden = runtimeSanctum?.getMonstersByDataId('ironroot_heartwarden')[0];
    assert.equal(getIronrootCrystalProtectionMultiplier(), 0.15);
    assert.equal(heartwarden?.getDamageReceivedModifier(), 0.15);
    for (const crystal of runtimeSanctum?.getResourcesByDataId('ironroot_resonance_crystal') ?? []) {
        crystal.damage(crystal.maxLife, 'absolute', { type: 'void', causeEntity: null, fixedDamage: true });
    }
    runtimeSanctum?.update(0.05);
    assert.equal(getIronrootCrystalProtectionMultiplier(), 1);
    assert.equal(heartwarden?.getDamageReceivedModifier(), 1);
});

test('광산 보스는 높은 체력과 느린 공격, 실제 스킬 패턴과 스킬북 보상을 가진다', () => {
    const boss = getMonsterData('crystal_vein_overlord');
    const nearbyMonster = getMonsterData('deep_guardian');
    const bossLocation = locations.find(location => location.id === 'crystal_throne');

    assert.ok(boss);
    assert.ok(nearbyMonster);
    assert.ok((boss.baseAttribute.maxLife ?? 0) >= (nearbyMonster.baseAttribute.maxLife ?? 0) * 5);
    assert.ok((boss.baseAttribute.attackSpeed ?? 1) <= 0.25);
    assert.deepEqual(boss.skills, [{ skillDataId: 'seismic_crush', level: 3 }]);
    assert.deepEqual(boss.skillPattern?.sequence, ['seismic_crush']);
    assert.equal(boss.challengePattern?.handler, 'crystal:cave-in');
    assert.ok(boss.drops.some(drop => drop.itemDataId === 'seismic_crush_skillbook' && drop.chance <= 0.05));
    assert.ok(bossLocation?.objects.some(object => object.dataId === boss.id && object.maxCount === 1));
    assert.equal(getMonsterData('slime')?.ai?.disposition, MonsterAiDisposition.LAST_ATTACKER);
    assert.equal(boss.ai?.disposition, MonsterAiDisposition.THREAT);
    assert.ok((boss.ai?.weights?.healing ?? 0) > (boss.ai?.weights?.damage ?? 0));
    assert.ok((boss.ai?.tauntResistance ?? 0) >= 0.75);
    assert.equal(getMonsterData('ironroot_heartwarden')?.challengePattern?.handler, 'ironroot:resonance-storm');
    assert.deepEqual(
        getMonsterData('ironroot_heartwarden')?.skillPattern?.sequence,
        ['ironroot_lockdown', 'seismic_crush'],
    );
    assert.equal(getMonsterData('astral_gatekeeper')?.challengePattern?.handler, 'astral:crossfire');
});

test('보물상자는 1~2시간 쿨타임과 가중치 기반 골드·아이템 보상을 가진다', () => {
    const chest = getResourceData('treasure_chest');
    assert.deepEqual(chest?.interactionCooldown, { min: 3600, max: 7200 });
    assert.equal(chest?.attackable, false);

    const coins = rollTreasureReward(() => 0);
    assert.equal(coins.label, '묵직한 동전 주머니');
    assert.equal(coins.gold, 35);

    const wideValues = [0.972, 0, 0];
    const wideRod = rollTreasureReward(() => wideValues.shift() ?? 0);
    assert.equal(wideRod.itemDataId, 'wide_net_fishing_rod');
    assert.equal(wideRod.itemCount, 1);

    const swiftValues = [0.98, 0, 0];
    const swiftRod = rollTreasureReward(() => swiftValues.shift() ?? 0);
    assert.equal(swiftRod.itemDataId, 'swift_current_fishing_rod');
    assert.equal(swiftRod.itemCount, 1);

    const pouchValues = [0.988, 0, 0];
    const pouch = rollTreasureReward(() => pouchValues.shift() ?? 0);
    assert.equal(pouch.itemDataId, 'foxtrail_pouch');
    assert.equal(pouch.itemCount, 1);

    const fadedValues = [0.999, 0, 0];
    const faded = rollTreasureReward(() => fadedValues.shift() ?? 0);
    assert.equal(faded.itemDataId, 'faded_stat_reset_ticket');
    assert.equal(faded.itemCount, 1);
});

test('미궁 보물함은 전용 로직 아이템과 전용 아이콘을 사용한다', () => {
    assert.equal(rollLabyrinthCacheReward('echo_treasure_chest', () => 0), 'echo_hourglass');
    assert.equal(rollLabyrinthCacheReward('echo_treasure_chest', () => 0.46), 'twisted_labyrinth_compass');
    assert.equal(rollLabyrinthCacheReward('crystal_treasure_chest', () => 0.9), 'twisted_labyrinth_compass');
    assert.equal(rollLabyrinthCacheReward('crystal_treasure_chest', () => 0.99), 'resonance_fold_pack');
    assert.deepEqual(getResourceData('echo_treasure_chest')?.interactionCooldown, { min: 7200, max: 10800 });
    assert.deepEqual(getResourceData('crystal_treasure_chest')?.interactionCooldown, { min: 10800, max: 18000 });

    assert.equal(getItemData('echo_hourglass')?.image, 'items/echo_hourglass');
    assert.equal(getItemData('echo_hourglass')?.onUse, 'reduce_skill_cooldowns');
    assert.equal(getItemData('twisted_labyrinth_compass')?.image, 'items/twisted_labyrinth_compass');
    assert.equal(getItemData('twisted_labyrinth_compass')?.onUse, 'labyrinth_compass');
    assert.equal(getItemData('resonance_evasion_shard')?.image, 'items/resonance_evasion_shard');
    assert.equal(getItemData('resonance_evasion_shard')?.onUse, 'grant_single_evasion');
});

test('가방은 성장 지역 상점과 희귀 보물함에서 최대 중량 장비로 제공된다', () => {
    const tiers = [
        ['general_store', 'traveler_leather_bag', 25],
        ['feveric_mine_store', 'miner_frame_pack', 50],
        ['twilight_memorial_store', 'gravecloth_field_pack', 80],
        ['glassdune_caravan_store', 'glassdune_caravan_pack', 120],
        ['frostveil_outpost_store', 'frostveil_expedition_pack', 175],
        ['misttide_harbor_store', 'misttide_cargo_pack', 230],
        ['paradox_relay_store', 'paradox_fold_pack', 300],
        ['ashen_waystation_store', 'ashroad_carrier', 365],
        ['voidcrown_waystation_store', 'voidsilk_dimension_pack', 435],
        ['eclipse_dock_store', 'eclipse_pressure_pack', 510],
        ['worldroot_waystation_store', 'worldroot_living_pack', 600],
    ] as const;

    for (const [shopId, itemDataId, capacity] of tiers) {
        const item = getItemData(itemDataId);
        assert.equal(item?.equipSlot, 'bag', itemDataId);
        assert.equal(item?.image, `items/${itemDataId}`, itemDataId);
        assert.ok(item?.tags.includes(GameTags.ITEM_BAG), itemDataId);
        assert.ok(item?.modifiers?.some(modifier =>
            modifier.attribute === 'maxWeight' && modifier.op === 'add' && modifier.value === capacity
        ), itemDataId);
        assert.ok(getShop(shopId)?.data.buyList.some(entry => entry.create().itemDataId === itemDataId), shopId);
    }

    assert.equal(getItemData('foxtrail_pouch')?.equipSlot, 'bag');
    assert.equal(getItemData('resonance_fold_pack')?.equipSlot, 'bag');
    assert.equal(rollWorldrootReliquaryReward(() => 0.83).itemDataId, 'memory_amber_bottomless_pack');

});

test('모든 아이템은 데이터 ID별 128px RGBA 전용 아이콘을 가진다', () => {
    for (const item of getAllItemData()) {
        assert.equal(item.image, `items/${item.id}`, `${item.id} dedicated icon key`);
        const png = readFileSync(new URL(`../../../../client/public/icons/items/${item.id}.png`, import.meta.url));
        assert.equal(png.readUInt32BE(16), 128, `${item.id} icon width`);
        assert.equal(png.readUInt32BE(20), 128, `${item.id} icon height`);
        assert.equal(png[25], 6, `${item.id} must be RGBA`);
    }
});

test('잡화점은 배고픔과 수분을 회복하는 음식과 음료를 판매한다', () => {
    const bread = getItemData('traveler_bread');
    const water = getItemData('fresh_water');
    const store = getShop('general_store');

    assert.equal(bread?.onUse, 'restore_survival');
    assert.equal(bread?.baseMetadata?.hunger, 35);
    assert.equal(water?.onUse, 'restore_survival');
    assert.equal(water?.baseMetadata?.thirst, 40);
    assert.ok(store?.data.buyList.some(entry => entry.create().itemDataId === 'traveler_bread'));
    assert.ok(store?.data.buyList.some(entry => entry.create().itemDataId === 'fresh_water'));

    for (const id of ['traveler_bread', 'fresh_water']) {
        const png = readFileSync(new URL(`../../../../client/public/icons/items/${id}.png`, import.meta.url));
        assert.equal(png.readUInt32BE(16), 128);
        assert.equal(png.readUInt32BE(20), 128);
        assert.equal(png[25], 6, `${id} must be RGBA`);
    }
});

test('대용량 체력·마나 포션은 후반 거점의 고가 반복 골드 소모품으로 제공된다', () => {
    const potionDefinitions = [
        ['large_health_potion', 'heal_hp', 'items/large_health_potion'],
        ['large_mana_potion', 'heal_mp', 'items/large_mana_potion'],
    ] as const;
    for (const [itemDataId, onUse, image] of potionDefinitions) {
        const item = getItemData(itemDataId);
        assert.equal(item?.onUse, onUse);
        assert.equal(item?.image, image);
        assert.equal(item?.baseMetadata?.amount, 10_000);
        assert.equal(item?.baseMetadata?.thirst, 10);
        assert.equal(item?.baseMetadata?.time, 2.5);
        assert.equal(item?.weight, 1.5);
    }

    for (const shopId of [
        'paradox_relay_store',
        'ashen_waystation_store',
        'voidcrown_waystation_store',
        'eclipse_dock_store',
        'worldroot_waystation_store',
        'nebula_waystation_store',
        'chronofrost_refuge_store',
        'endstar_bastion_store',
    ]) {
        const entries = getShop(shopId)?.data.buyList.filter(entry =>
            entry.create().itemDataId === 'large_health_potion'
            || entry.create().itemDataId === 'large_mana_potion'
        );
        assert.equal(entries?.length, 2, shopId);
        assert.ok(entries?.every(entry =>
            entry.price === 100_000 && entry.stock === 20 && entry.restockTime === 180
        ), shopId);
    }
});

test('묘지기 향약은 황혼왕릉 증량 재고와 여섯 안전 거점의 독립 재고로 공급된다', () => {
    const stores = [
        { id: 'twilight_memorial_store', stock: 24 },
        { id: 'misttide_harbor_store', stock: 12 },
        { id: 'paradox_relay_store', stock: 12 },
        { id: 'ashen_waystation_store', stock: 12 },
        { id: 'worldroot_waystation_store', stock: 12 },
        { id: 'endstar_bastion_store', stock: 12 },
        { id: 'silentdivine_waystation_store', stock: 12 },
    ] as const;

    const instances = stores.map(({ id, stock }) => {
        const shop = getShop(id);
        assert.ok(shop, id);
        const index = shop.data.buyList.findIndex(entry => entry.create().itemDataId === 'graveward_tonic');
        assert.ok(index >= 0, `${id} 향약 항목`);
        assert.equal(shop.data.buyList[index].stock, stock, `${id} 마스터 재고`);
        assert.equal(shop.data.buyList[index].restockTime, 60, `${id} 재입고`);
        assert.equal(shop.getStock(index), stock * 5, `${id} 공유 재고`);
        return shop;
    });
    assert.equal(new Set(instances).size, stores.length);
});

test('적대 귀환 두루마리는 자동 전용 아이템이며 성장 상점과 후반 낚시 보물에서 넉넉히 공급된다', () => {
    const item = getItemData('hostile_return_scroll');
    assert.equal(item?.image, 'items/hostile_return_scroll');
    assert.equal(item?.onUse, null);
    assert.equal(item?.stackable, true);
    assert.equal(item?.maxStack, MAX_STACKABLE_ITEM_COUNT);
    const png = readFileSync(new URL('../../../../client/public/icons/items/hostile_return_scroll.png', import.meta.url));
    assert.equal(png.readUInt32BE(16), 128);
    assert.equal(png.readUInt32BE(20), 128);
    assert.equal(png[25], 6, 'hostile_return_scroll must be RGBA');

    for (const shopId of [
        'twilight_memorial_store',
        'glassdune_caravan_store',
        'frostveil_outpost_store',
        'misttide_harbor_store',
        'paradox_relay_store',
        'ashen_waystation_store',
        'voidcrown_waystation_store',
        'eclipse_dock_store',
        'worldroot_waystation_store',
        'nebula_waystation_store',
        'chronofrost_refuge_store',
        'endstar_bastion_store',
    ]) {
        const shop = getShop(shopId);
        assert.ok(shop, shopId);
        const index = shop.data.buyList.findIndex(entry => entry.create().itemDataId === 'hostile_return_scroll');
        assert.ok(index >= 0, `${shopId} 두루마리 항목`);
        assert.equal(shop.data.buyList[index].stock, 16, `${shopId} 마스터 재고`);
        assert.equal(shop.data.buyList[index].restockTime, 90, `${shopId} 재입고`);
        assert.equal(shop.getStockCapacity(index), 80, `${shopId} 공유 재고`);
    }

    for (const region of ASCENDANT_REGIONS) {
        const shopId = `${region.id}_waystation_store`;
        const shop = getShop(shopId);
        assert.ok(shop, shopId);
        const index = shop.data.buyList.findIndex(entry => entry.create().itemDataId === 'hostile_return_scroll');
        assert.ok(index >= 0, `${shopId} 두루마리 항목`);
        assert.equal(shop.data.buyList[index].stock, 20, `${shopId} 마스터 재고`);
        assert.equal(shop.data.buyList[index].restockTime, 75, `${shopId} 재입고`);
        assert.equal(shop.getStockCapacity(index), 100, `${shopId} 공유 재고`);
    }

    for (const locationId of [
        'paradox_scrap_reservoir',
        'eclipse_luminous_reef',
        'endstar_silent_sun',
        'abyssglass_pressure_lagoon',
        'dreamarchive_inkwater_pool',
        'rustworld_mercury_reservoir',
        'silentdivine_prayer_spring',
        'originboundary_genesis_tide',
    ]) {
        const entry = getFishingTreasureTable(locationId)?.entries.find(
            candidate => candidate.itemDataId === 'hostile_return_scroll',
        );
        assert.deepEqual(entry, { itemDataId: 'hostile_return_scroll', weight: 10, minCount: 1, maxCount: 2 }, locationId);
    }
});

test('물빛 연못 낚시상점은 낚시 품목을 전담하고 잡화점은 초급 지팡이 성장 장비를 판매한다', () => {
    const rod = getItemData('beginner_fishing_rod');
    const refinedRod = getItemData('refined_fishing_rod');
    const wideRod = getItemData('wide_net_fishing_rod');
    const swiftRod = getItemData('swift_current_fishing_rod');
    const bait = getItemData('earthworm_bait');
    const generalStore = getShop('general_store');
    const fishingStore = getShop('fishing_store');
    const pond = locations.find(location => location.id === 'luminous_pond');

    assert.ok(rod?.tags.includes('tool:fishing'));
    assert.equal(rod?.equipSlot, 'mainHand');
    assert.ok(bait?.tags.includes('item:bait'));
    assert.equal(bait?.equipSlot, 'offHand');
    assert.equal(bait?.onUse, null);
    assert.equal(pond?.shopId, 'fishing_store');
    assert.ok(generalStore?.data.buyList.some(entry => entry.create().itemDataId === 'apprentice_staff'));
    assert.ok(generalStore?.data.buyList.some(entry =>
        entry.create().itemDataId === 'starwood_staff' && entry.price === 180));
    assert.equal(getItemData('starwood_staff')?.modifiers
        ?.find(modifier => modifier.attribute === 'magicForce')?.value, 36);
    assert.equal(getItemData('mourning_staff')?.modifiers
        ?.find(modifier => modifier.attribute === 'magicForce')?.value, 60);
    assert.ok(!generalStore?.data.buyList.some(entry => entry.create().itemDataId === 'beginner_fishing_rod'));
    assert.ok(fishingStore?.data.buyList.some(entry => entry.create().itemDataId === 'beginner_fishing_rod'));
    assert.ok(fishingStore?.data.buyList.some(entry => entry.create().itemDataId === 'refined_fishing_rod' && entry.price === 650));
    assert.ok(fishingStore?.data.buyList.some(entry => entry.create().itemDataId === 'earthworm_bait'));
    assert.equal(refinedRod?.modifiers?.find(modifier => modifier.attribute === 'fishingNetSize')?.value, 10);
    assert.equal(refinedRod?.modifiers?.find(modifier => modifier.attribute === 'fishingNetSpeed')?.value, 16);
    assert.equal(wideRod?.baseMetadata?.fishingNetShape, 'rectangle');
    assert.equal(wideRod?.modifiers?.find(modifier => modifier.attribute === 'fishingNetSize')?.value, 20);
    assert.equal(wideRod?.modifiers?.find(modifier => modifier.attribute === 'fishingNetSpeed')?.value, -6);
    assert.equal(swiftRod?.modifiers?.find(modifier => modifier.attribute === 'fishingNetSize')?.value, -4);
    assert.equal(swiftRod?.modifiers?.find(modifier => modifier.attribute === 'fishingNetSpeed')?.value, 46);
    assert.equal(fishingStore?.data.sellList.find(entry => entry.label === '신화 물고기')?.price, 8000);
});

test('모든 성장 낚시터는 현지 낚싯대·미끼 상점과 낚싯대 보급상자를 제공한다', () => {
    let previousLuck = 0;
    for (const tier of FISHING_EQUIPMENT_TIERS) {
        const location = locations.find(candidate => candidate.id === tier.locationId);
        const shop = getShop(tier.shopId);
        const rod = getItemData(tier.rod.id);
        const bait = getItemData(tier.bait.id);
        const cache = getResourceData(tier.cacheResourceId);

        assert.equal(location?.shopId, tier.shopId, tier.locationId);
        assert.ok(location?.tags.includes(GameTags.LOCATION_SHOP), tier.locationId);
        assert.ok(location?.objects.some(object =>
            object.type === 'resource' && object.dataId === tier.cacheResourceId), tier.locationId);
        assert.ok(shop?.data.buyList.some(entry => entry.create().itemDataId === tier.rod.id), tier.shopId);
        assert.ok(shop?.data.buyList.some(entry => entry.create().itemDataId === tier.bait.id), tier.shopId);
        assert.ok(rod?.tags.includes(GameTags.TOOL_FISHING), tier.rod.id);
        assert.ok(bait?.tags.includes(GameTags.ITEM_BAIT), tier.bait.id);
        assert.ok(tier.rod.luck > previousLuck, tier.rod.id);
        previousLuck = tier.rod.luck;
        assert.deepEqual(cache?.interactionCooldown, { min: 7200, max: 14400 }, tier.cacheResourceId);
        assert.equal(
            rollFishingSupplyCacheReward(tier.cacheResourceId, () => 0)?.itemDataId,
            tier.rod.id,
        );
        assert.equal(
            rollFishingSupplyCacheReward(tier.cacheResourceId, () => 0.5)?.itemDataId,
            tier.bait.id,
        );
        const shopRodRequirements = createAcquisitionRequirements(tier.rod.id, tier.level, 'shop');
        const shopBaitRequirements = createAcquisitionRequirements(tier.bait.id, tier.level, 'shop');
        assert.ok((shopRodRequirements?.stats as { sensibility?: number })?.sensibility, tier.rod.id);
        assert.deepEqual(shopBaitRequirements?.stats, {}, tier.bait.id);
    }
});

test('원거리 단조 장비는 지팡이 틀과 활·화살 부품 제작 경로를 가진다', () => {
    const recipeIds = new Set(getAllCraftingRecipes().map(recipe => recipe.id));
    const generalStore = getShop('general_store');

    for (const id of [
        'forged_staff_frame',
        'forged_staff',
        'forged_bow_limb',
        'forged_bow',
        'forged_arrowheads',
        'reinforced_bowstring',
        'hardwood_stick',
        'arrow_shaft',
    ]) {
        assert.ok(getItemData(id), id);
    }
    for (const id of [
        'artificer:reinforced_bowstring',
        'artificer:arrow_shafts',
        'artificer:forged_bow',
        'artificer:forged_arrows',
    ]) {
        assert.ok(recipeIds.has(id), id);
    }
    assert.ok(getItemData('silverweb_silk')?.tags.includes(GameTags.CRAFTING_BOWSTRING_MATERIAL));
    assert.ok(generalStore?.data.buyList.some(entry => entry.create().itemDataId === 'hardwood_stick'));
});

test('업그레이드된 부분 되돌림권은 고레벨 제작 경로와 제한 메타데이터를 가진다', () => {
    const recipeIds = new Set(getAllCraftingRecipes().map(recipe => recipe.id));
    assert.ok(recipeIds.has('utility:refined_stat_refund_ticket'));
    assert.ok(recipeIds.has('utility:restored_stat_refund_ticket'));
    assert.deepEqual(getItemData('refined_stat_refund_ticket')?.baseMetadata, {
        maxRefundPerStat: 25,
        maxRefundTotal: 100,
    });
    assert.deepEqual(getItemData('restored_stat_refund_ticket')?.baseMetadata, {
        maxRefundPerStat: 50,
        maxRefundTotal: 200,
    });
});
