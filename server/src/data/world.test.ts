import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import Entity from '../models/Entity.js';
import { getAllLocations, getLocation, normalizeLocationInput, reloadAllLocations } from '../models/Location.js';
import { getAllMonsterData, getMonsterData } from '../models/Monster.js';
import { getResourceData } from '../models/Resource.js';
import { getItemData } from '../models/Item.js';
import { getShop } from '../models/Shop.js';
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
import { rollLabyrinthCacheReward, rollTreasureReward } from './resources.js';
import { MonsterAiDisposition } from '../models/Threat.js';
import {
    getIronrootCrystalProtectionMultiplier,
    getSilverwebBroodProtectionMultiplier,
} from './bossPatterns.js';
import { GameTags } from '../../../shared/tags.js';

const locations = JSON.parse(
    readFileSync(new URL('./locations.json', import.meta.url), 'utf-8'),
) as LocationData[];

test('월드 맵 연결과 오브젝트 정의가 유효하고 고블린이 남아 있지 않다', () => {
    const ids = new Set(locations.map(location => location.id));
    assert.equal(locations.length, 61);
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
    assert.deepEqual(
        Object.fromEntries(['safe', 'neutral', 'hostile'].map(zoneType => [
            zoneType,
            locations.filter(location => location.zoneType === zoneType).length,
        ])),
        { safe: 6, neutral: 25, hostile: 30 },
    );
    for (const id of ['tempest_peak', 'nightwood_heart', 'dawn_sanctum', 'necropolis_depths', 'ironroot_core', 'astral_nexus']) {
        assert.equal(locations.find(location => location.id === id)?.zoneType, 'hostile');
    }
    assert.equal(locations.filter(location => location.mapColor).length, locations.length);
    assert.ok(locations.every(location => /^#[0-9a-f]{6}$/i.test(location.mapColor ?? '')));
    assert.deepEqual(
        locations.filter(location => location.mapIcon).map(location => location.mapIcon).sort(),
        ['general-shop', 'general-shop', 'job-hall', 'meadow-hub', 'mine-entrance', 'town-plaza'],
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
    ];

    for (const ids of regions) {
        const colors = new Set(ids.map(id => locations.find(location => location.id === id)?.mapColor));
        assert.equal(colors.size, 1, ids.join(', '));
        assert.notEqual([...colors][0], undefined, ids.join(', '));
    }
});

test('1~210레벨 월드는 모든 속성을 관찰 가능하고 동급 일반 몬스터 보상은 5%로 수렴한다', () => {
    const monsters = getAllMonsterData();
    const levelOne = getMonsterData('slime');
    const midLevelNormal = getMonsterData('spark_moth');
    const levelTwoHundred = getMonsterData('eclipse_watcher');

    assert.equal(Math.min(...monsters.map(monster => monster.level)), 1);
    assert.equal(Math.max(...monsters.map(monster => monster.level)), 210);
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
    assert.equal(bosses[bosses.length - 1].level, 210);
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
