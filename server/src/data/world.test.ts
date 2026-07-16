import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import Entity from '../models/Entity.js';
import { getAllLocations, getLocation, normalizeLocationInput, reloadAllLocations } from '../models/Location.js';
import { getAllMonsterData, getMonsterData } from '../models/Monster.js';
import { getResourceData } from '../models/Resource.js';
import type { LocationData } from '../../../shared/types.js';
import './items.js';
import './skills.js';
import './monsters.js';
import './resources.js';
import './npcs.js';
import './locations.js';
import { rollTreasureReward } from './resources.js';

const locations = JSON.parse(
    readFileSync(new URL('./locations.json', import.meta.url), 'utf-8'),
) as LocationData[];

test('월드 맵 연결과 오브젝트 정의가 유효하고 고블린이 남아 있지 않다', () => {
    const ids = new Set(locations.map(location => location.id));
    assert.equal(locations.length, 24);
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
    assert.ok(locations.filter(location => location.tags.includes('location:mine')).length >= 9);
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
});

test('보물상자는 1~2시간 쿨타임과 가중치 기반 골드·아이템 보상을 가진다', () => {
    const chest = getResourceData('treasure_chest');
    assert.deepEqual(chest?.interactionCooldown, { min: 3600, max: 7200 });
    assert.equal(chest?.attackable, false);

    const coins = rollTreasureReward(() => 0);
    assert.equal(coins.label, '묵직한 동전 주머니');
    assert.equal(coins.gold, 35);

    const values = [0.999999, 0, 0];
    const rare = rollTreasureReward(() => values.shift() ?? 0);
    assert.equal(rare.itemDataId, 'diamond');
    assert.equal(rare.itemCount, 1);
});
