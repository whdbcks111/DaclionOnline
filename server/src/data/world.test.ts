import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import Entity from '../models/Entity.js';
import { getAllLocations, getLocation, normalizeLocationInput, reloadAllLocations } from '../models/Location.js';
import { getAllMonsterData, getMonsterData } from '../models/Monster.js';
import { getResourceData } from '../models/Resource.js';
import { getItemData } from '../models/Item.js';
import { getShop } from '../models/Shop.js';
import { getAllCraftingRecipes } from '../models/Crafting.js';
import { getAllQuestData } from '../models/Quest.js';
import NPC from '../models/NPC.js';
import type { LocationData } from '../../../shared/types.js';
import './items.js';
import './skills.js';
import './monsters.js';
import './resources.js';
import './npcs.js';
import './locations.js';
import './dungeonPuzzles.js';
import './bossPatterns.js';
import './shops.js';
import './fishing.js';
import './crafting.js';
import {
    rollAshenReliquaryReward,
    rollEclipseReliquaryReward,
    rollFrostveilReliquaryReward,
    rollGlassduneReliquaryReward,
    rollLabyrinthCacheReward,
    rollMisttideReliquaryReward,
    rollParadoxReliquaryReward,
    rollTreasureReward,
    rollTwilightReliquaryReward,
    rollVoidcrownReliquaryReward,
    rollWorldrootReliquaryReward,
} from './resources.js';
import { MonsterAiDisposition } from '../models/Threat.js';
import {
    getIronrootCrystalProtectionMultiplier,
    getGlassduneMirrorProtectionMultiplier,
    getSilverwebBroodProtectionMultiplier,
    getParadoxAnchorProtectionMultiplier,
    getVoidcrownPillarProtectionMultiplier,
    getWhiteNightMirrorProtectionMultiplier,
    getPrimordialSeedProtectionMultiplier,
} from './bossPatterns.js';
import { GameTags } from '../../../shared/tags.js';

const locations = JSON.parse(
    readFileSync(new URL('./locations.json', import.meta.url), 'utf-8'),
) as LocationData[];

test('월드 맵 연결과 오브젝트 정의가 유효하고 고블린이 남아 있지 않다', () => {
    const ids = new Set(locations.map(location => location.id));
    assert.equal(locations.length, 233);
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
    assert.deepEqual(
        Object.fromEntries(['safe', 'neutral', 'hostile'].map(zoneType => [
            zoneType,
            locations.filter(location => location.zoneType === zoneType).length,
        ])),
        { safe: 15, neutral: 46, hostile: 172 },
    );
    for (const id of ['tempest_peak', 'nightwood_heart', 'dawn_sanctum', 'necropolis_depths', 'ironroot_core', 'astral_nexus']) {
        assert.equal(locations.find(location => location.id === id)?.zoneType, 'hostile');
    }
    assert.equal(locations.filter(location => location.mapColor).length, locations.length);
    assert.ok(locations.every(location => /^#[0-9a-f]{6}$/i.test(location.mapColor ?? '')));
    assert.deepEqual(
        locations.filter(location => location.mapIcon).map(location => location.mapIcon).sort(),
        ['general-shop', 'general-shop', 'general-shop', 'general-shop', 'general-shop', 'general-shop', 'general-shop', 'general-shop', 'general-shop', 'job-hall', 'meadow-hub', 'mine-entrance', 'town-plaza'],
    );
    for (const icon of new Set(locations.flatMap(location => location.mapIcon ? [location.mapIcon] : []))) {
        const png = readFileSync(new URL(`../../../client/public/icons/map/${icon}.png`, import.meta.url));
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
    assert.equal(
        getLocation('town_square')?.findAvailableConnection({ level: 50 } as never, '6'),
        undefined,
    );
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

test('같은 월드 권역은 지도에서 하나의 바이옴 대표색을 공유한다', () => {
    const regions = [
        ['field', 'meadow_2', 'meadow_3'],
        ['silverweb_trail', 'silverweb_outpost', 'red_mane_hill', 'silverweb_grove',
            'silverweb_cavern', 'silverweb_queen_nest'],
        ['swamp_edge', 'swamp_basin', 'swamp_reedway', 'swamp_heart'],
        ['ember_foothills', 'volcanic_slope', 'ember_ravine', 'obsidian_shelf', 'volcanic_crater', 'volcanic_core'],
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
            'glassdune_glass_canyon', 'glassdune_sun_vault', 'glassdune_hidden_oasis'],
        ['frostveil_pass', 'frostveil_outpost', 'frostveil_pinewood', 'frostveil_hunting_field',
            'frostveil_frozen_lake', 'frostveil_ravine', 'frostveil_spider_nest', 'frostveil_palace_gate',
            'frostveil_mirror_hall', 'frostveil_arsenal', 'frostveil_oracle_gallery', 'frostveil_throne',
            'frostveil_hidden_grotto', 'frostveil_aurora_bridge'],
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
            'paradox_endless_observatory'],
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
            'voidcrown_throne'],
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
            'worldroot_heart_antechamber', 'worldroot_primordial_heart'],
    ];

    for (const ids of regions) {
        const colors = new Set(ids.map(id => locations.find(location => location.id === id)?.mapColor));
        assert.equal(colors.size, 1, ids.join(', '));
        assert.notEqual([...colors][0], undefined, ids.join(', '));
    }
});

test('1~380레벨 월드는 모든 속성을 관찰 가능하고 동급 일반 몬스터 보상은 5%로 수렴한다', () => {
    const monsters = getAllMonsterData();
    const levelOne = getMonsterData('slime');
    const midLevelNormal = getMonsterData('spark_moth');
    const levelTwoHundred = getMonsterData('eclipse_watcher');

    assert.equal(Math.min(...monsters.map(monster => monster.level)), 1);
    assert.equal(Math.max(...monsters.map(monster => monster.level)), 380);
    assert.equal(Entity.getMaxExpOfLevel(1), 100);
    assert.equal(Entity.getMaxExpOfLevel(50), 20_000);
    assert.equal(Entity.getMaxExpOfLevel(200), 80_000);
    assert.equal(levelOne!.expReward / Entity.getMaxExpOfLevel(1), 0.2);
    assert.equal(midLevelNormal!.expReward / Entity.getMaxExpOfLevel(midLevelNormal!.level), 0.05);
    assert.equal(levelTwoHundred!.expReward / Entity.getMaxExpOfLevel(200), 0.05);
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

test('성장 구간 보스는 최대 30레벨 간격으로 배치되고 일반몹보다 높은 경험치를 준다', () => {
    const bosses = getAllMonsterData()
        .filter(monster => monster.tags.includes(GameTags.ENTITY_BOSS))
        .sort((left, right) => left.level - right.level);

    assert.ok(bosses[0].level <= 32);
    assert.equal(bosses[bosses.length - 1].level, 380);
    for (let index = 1; index < bosses.length; index++) {
        assert.ok(bosses[index].level - bosses[index - 1].level <= 30,
            `${bosses[index - 1].name} Lv.${bosses[index - 1].level} → ${bosses[index].name} Lv.${bosses[index].level}`);
    }
    for (const boss of bosses) {
        assert.ok(boss.expReward >= boss.level * 20 * 5, `${boss.name} 보스 경험치`);
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
    assert.equal(getItemData('silverweb_hunter_bow')?.image, 'items/light_bow');
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
        assert.equal(book?.image, 'items/seismic_crush_skillbook', bookId);
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
    assert.ok(crownHall?.objects.some(object => object.dataId === 'twilight_riddle_door'));
    assert.ok(crownHall?.connections.some(connection => connection.condition === 'twilight_tomb_riddle_solved'));
    assert.ok(oathHall?.connections.some(connection => connection.locationId === 'tempest_gate'));
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

    assert.equal(region.length, 10);
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

    assert.equal(region.length, 14);
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

test('역설기계고는 분기 조립선·인과 퍼즐·시제품고·고정자 보스 기믹과 지역 경제를 연결한다', () => {
    const region = locations.filter(location => location.id.startsWith('paradox_'));
    const colossus = getMonsterData('chronosteel_colossus');
    const architect = getMonsterData('paradox_architect');
    const store = getShop('paradox_relay_store');
    const recipes = getAllCraftingRecipes().filter(recipe => recipe.id.startsWith('paradox:'));
    const quests = getAllQuestData().filter(quest => quest.id.startsWith('paradox:'));

    assert.equal(region.length, 22);
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

test('잿빛성흔 심연은 다중 분기·세 보스·봉인 퍼즐·밤쇠 경제를 잿왕성까지 연결한다', () => {
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
    assert.ok(getResourceData('night_iron_vein')?.requiredToolTags.includes(GameTags.TOOL_MINING));
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

test('공허왕관 성채는 25개 분기 층·서약 퍼즐·기둥 보호 보스·지역 경제를 연결한다', () => {
    const region = locations.filter(location => location.id.startsWith('voidcrown_'));
    const castellan = getMonsterData('crownless_castellan');
    const regent = getMonsterData('voidcrown_regent');
    const store = getShop('voidcrown_waystation_store');
    const recipes = getAllCraftingRecipes().filter(recipe => recipe.id.startsWith('voidcrown:'));
    const quests = getAllQuestData().filter(quest => quest.id.startsWith('voidcrown:'));

    assert.equal(region.length, 25);
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
    assert.ok(getResourceData('nullsilver_vein')?.requiredToolTags.includes(GameTags.TOOL_MINING));
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

test('월식해구는 24개 분기 수로·조류제단·거울 보호 보스·지역 경제를 연결한다', () => {
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
    assert.ok(getResourceData('drowned_silver_vein')?.requiredToolTags.includes(GameTags.TOOL_MINING));
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

test('역근수해는 24개 분기 뿌리·기억 제단·씨앗 보호 보스·최종 지역 경제를 연결한다', () => {
    const region = locations.filter(location => location.tags.includes(GameTags.LOCATION_WORLDROOT));
    const devourer = getMonsterData('inverse_root_devourer');
    const heart = getMonsterData('primordial_heart_arbor');
    const store = getShop('worldroot_waystation_store');
    const recipes = getAllCraftingRecipes().filter(recipe => recipe.id.startsWith('worldroot:'));
    const quests = getAllQuestData().filter(quest => quest.id.startsWith('worldroot:'));

    assert.equal(region.length, 24);
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
    assert.ok(getResourceData('rootbone_vein')?.requiredToolTags.includes(GameTags.TOOL_MINING));
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

test('화맥 광맥과 홍염강은 홍염산지 전용 채굴·제련·단조 동선을 가진다', () => {
    const emberLocations = locations.filter(location => location.objects.some(object => object.dataId === 'ember_ore_vein'));
    assert.ok(emberLocations.length >= 3);
    assert.ok(emberLocations.every(location => location.tags.includes('location:volcanic')));
    assert.equal(getItemData('ember_ore')?.image, 'items/ember_ore');
    assert.equal(getItemData('ember_alloy')?.image, 'items/ember_alloy');
    assert.ok(getResourceData('ember_ore_vein')?.requiredToolTags.includes('tool:mining'));
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

    const wideValues = [0.9875, 0, 0];
    const wideRod = rollTreasureReward(() => wideValues.shift() ?? 0);
    assert.equal(wideRod.itemDataId, 'wide_net_fishing_rod');
    assert.equal(wideRod.itemCount, 1);

    const swiftValues = [0.999999, 0, 0];
    const swiftRod = rollTreasureReward(() => swiftValues.shift() ?? 0);
    assert.equal(swiftRod.itemDataId, 'swift_current_fishing_rod');
    assert.equal(swiftRod.itemCount, 1);
});

test('미궁 보물함은 전용 로직 아이템과 전용 아이콘을 사용한다', () => {
    assert.equal(rollLabyrinthCacheReward('echo_treasure_chest', () => 0), 'echo_hourglass');
    assert.equal(rollLabyrinthCacheReward('echo_treasure_chest', () => 0.46), 'twisted_labyrinth_compass');
    assert.equal(rollLabyrinthCacheReward('crystal_treasure_chest', () => 0.99), 'twisted_labyrinth_compass');
    assert.deepEqual(getResourceData('echo_treasure_chest')?.interactionCooldown, { min: 7200, max: 10800 });
    assert.deepEqual(getResourceData('crystal_treasure_chest')?.interactionCooldown, { min: 10800, max: 18000 });

    assert.equal(getItemData('echo_hourglass')?.image, 'items/echo_hourglass');
    assert.equal(getItemData('echo_hourglass')?.onUse, 'reduce_skill_cooldowns');
    assert.equal(getItemData('twisted_labyrinth_compass')?.image, 'items/twisted_labyrinth_compass');
    assert.equal(getItemData('twisted_labyrinth_compass')?.onUse, 'labyrinth_compass');
    assert.equal(getItemData('resonance_evasion_shard')?.image, 'items/resonance_evasion_shard');
    assert.equal(getItemData('resonance_evasion_shard')?.onUse, 'grant_single_evasion');
});

test('교체한 아이템 폴백은 데이터 ID별 128px RGBA 아이콘을 가진다', () => {
    for (const id of [
        'battle_tonic', 'arcane_tonic', 'swift_tonic', 'echo_hourglass',
        'twisted_labyrinth_compass', 'resonance_evasion_shard',
        'windsteel_sword', 'stormstring_bow', 'nightglass_dagger', 'starwood_staff',
        'refined_iron', 'refined_gold', 'refined_ruby', 'refined_emerald', 'refined_diamond',
        'forged_sword', 'forged_axe', 'forged_dagger', 'forged_shield', 'forged_pickaxe',
        'enhancement_stone',
    ]) {
        assert.equal(getItemData(id)?.image, `items/${id}`);
        const png = readFileSync(new URL(`../../../client/public/icons/items/${id}.png`, import.meta.url));
        assert.equal(png.readUInt32BE(16), 128, `${id} icon width`);
        assert.equal(png.readUInt32BE(20), 128, `${id} icon height`);
        assert.equal(png[25], 6, `${id} must be RGBA`);
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
        const png = readFileSync(new URL(`../../../client/public/icons/items/${id}.png`, import.meta.url));
        assert.equal(png.readUInt32BE(16), 128);
        assert.equal(png.readUInt32BE(20), 128);
        assert.equal(png[25], 6, `${id} must be RGBA`);
    }
});

test('물빛 연못 낚시상점은 낚시 품목을 전담하고 잡화점은 견습 지팡이를 판매한다', () => {
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
