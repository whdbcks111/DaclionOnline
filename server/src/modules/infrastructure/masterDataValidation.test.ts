import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { LocationData } from '../../../../shared/types.js';
import '../../data/economy/items.js';
import '../../data/combat/statusEffects.js';
import '../../data/professions/alchemy.js';
import '../../data/combat/projectiles.js';
import '../../data/world/resources.js';
import '../../data/economy/shops.js';
import '../../data/combat/tagEffects.js';
import '../../data/progression/jobs.js';
import '../../data/progression/progress.js';
import '../../data/progression/titles.js';
import '../../data/combat/skills.js';
import '../../data/professions/crafting.js';
import '../../data/progression/quests.js';
import '../../data/world/npcs.js';
import '../../data/world/monsters.js';
import '../../data/combat/bossPatterns.js';
import '../../data/professions/fishing.js';
import { getAllAlchemyFormulas, getAllAlchemyReagents } from '../../models/professions/Alchemy.js';
import { validateAlchemyMasterData, validateMasterData } from './masterDataValidation.js';

const locations = JSON.parse(readFileSync(new URL('../../data/world/locations.json', import.meta.url), 'utf8')) as LocationData[];

test('현재 마스터 데이터의 참조와 필수 아이콘은 모두 유효하다', () => {
    assert.deepEqual(validateMasterData({ locations }), []);
});

test('마스터 데이터 validator는 잘못된 장소 연결을 가공된 issue로 반환한다', () => {
    const broken = locations.map((location, index) => index === 0
        ? { ...location, connections: [...location.connections, { locationId: 'missing_location' }] }
        : location);
    assert.ok(validateMasterData({ locations: broken }).some(issue => issue.scope === 'location' && issue.message.includes('missing_location')));
});

test('연금술 validator는 재료·결과·상태효과 참조와 양수 수량·사용 handler를 검사한다', () => {
    const formulas = getAllAlchemyFormulas();
    const statusFormula = formulas.find(formula => formula.effect.statusEffectId);
    assert.ok(statusFormula);
    const brokenFormulas = [
        {
            ...formulas[0],
            id: 'broken-result-handler',
            resultItemDataId: 'iron_ore',
            ingredients: [{ itemDataId: 'missing_alchemy_reagent_item', count: 0 }],
        },
        {
            ...formulas[0],
            id: 'broken-result-item',
            resultItemDataId: 'missing_alchemy_result_item',
        },
        {
            ...statusFormula,
            id: 'broken-status-effect',
            effect: { ...statusFormula.effect, statusEffectId: 'missing_alchemy_status' },
        },
    ];
    const issues = validateAlchemyMasterData(getAllAlchemyReagents(), brokenFormulas);
    assert.ok(issues.every(issue => issue.scope === 'alchemy'));
    assert.ok(issues.some(issue => issue.id === 'broken-result-handler'
        && issue.message.includes('사용 handler')));
    assert.ok(issues.some(issue => issue.id === 'broken-result-handler'
        && issue.message.includes('양의 정수')));
    assert.ok(issues.some(issue => issue.id === 'broken-result-handler'
        && issue.message.includes('재료 아이템')));
    assert.ok(issues.some(issue => issue.id === 'broken-result-item'
        && issue.message.includes('결과 아이템')));
    assert.ok(issues.some(issue => issue.id === 'broken-status-effect'
        && issue.message.includes('missing_alchemy_status')));
});
