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
import './shops.js';
import './fishing.js';
import { rollTreasureReward } from './resources.js';
import { MonsterAiDisposition } from '../models/Threat.js';

const locations = JSON.parse(
    readFileSync(new URL('./locations.json', import.meta.url), 'utf-8'),
) as LocationData[];

test('월드 맵 연결과 오브젝트 정의가 유효하고 고블린이 남아 있지 않다', () => {
    const ids = new Set(locations.map(location => location.id));
    assert.equal(locations.length, 25);
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

test('1~50레벨 동급 몬스터 성장 곡선은 처치당 20%에서 5%로 낮아진다', () => {
    const monsters = getAllMonsterData();
    const levelOne = getMonsterData('slime');
    const levelFifty = getMonsterData('caldera_beast');

    assert.equal(Math.min(...monsters.map(monster => monster.level)), 1);
    assert.equal(Math.max(...monsters.map(monster => monster.level)), 50);
    assert.equal(Entity.getMaxExpOfLevel(1), 100);
    assert.equal(Entity.getMaxExpOfLevel(50), 20_000);
    assert.equal(levelOne!.expReward / Entity.getMaxExpOfLevel(1), 0.2);
    assert.equal(levelFifty!.expReward / Entity.getMaxExpOfLevel(50), 0.05);
    assert.ok(monsters
        .filter(monster => !monster.tags.includes('entity:boss'))
        .every(monster => monster.expReward === monster.level * 20));
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
    assert.ok(boss.drops.some(drop => drop.itemDataId === 'seismic_crush_skillbook' && drop.chance <= 0.05));
    assert.ok(bossLocation?.objects.some(object => object.dataId === boss.id && object.maxCount === 1));
    assert.equal(getMonsterData('slime')?.ai?.disposition, MonsterAiDisposition.LAST_ATTACKER);
    assert.equal(boss.ai?.disposition, MonsterAiDisposition.THREAT);
    assert.ok((boss.ai?.weights?.healing ?? 0) > (boss.ai?.weights?.damage ?? 0));
    assert.ok((boss.ai?.tauntResistance ?? 0) >= 0.75);
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
