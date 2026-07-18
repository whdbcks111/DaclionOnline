import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { LocationData } from '../../../shared/types.js';
import '../data/items.js';
import '../data/projectiles.js';
import '../data/resources.js';
import '../data/shops.js';
import '../data/tagEffects.js';
import '../data/jobs.js';
import '../data/progress.js';
import '../data/skills.js';
import '../data/crafting.js';
import '../data/quests.js';
import '../data/npcs.js';
import '../data/monsters.js';
import '../data/fishing.js';
import { validateMasterData } from './masterDataValidation.js';

const locations = JSON.parse(readFileSync(new URL('../data/locations.json', import.meta.url), 'utf8')) as LocationData[];

test('현재 마스터 데이터의 참조와 필수 아이콘은 모두 유효하다', () => {
    assert.deepEqual(validateMasterData({ locations }), []);
});

test('마스터 데이터 validator는 잘못된 장소 연결을 가공된 issue로 반환한다', () => {
    const broken = locations.map((location, index) => index === 0
        ? { ...location, connections: [...location.connections, { locationId: 'missing_location' }] }
        : location);
    assert.ok(validateMasterData({ locations: broken }).some(issue => issue.scope === 'location' && issue.message.includes('missing_location')));
});
