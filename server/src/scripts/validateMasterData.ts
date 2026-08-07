import { readFileSync } from 'node:fs';
import type { LocationData } from '../../../shared/types.js';
import '../data/economy/items.js';
import '../data/combat/statusEffects.js';
import '../data/professions/alchemy.js';
import '../data/combat/projectiles.js';
import '../data/world/resources.js';
import '../data/economy/shops.js';
import '../data/combat/tagEffects.js';
import '../data/progression/jobs.js';
import '../data/progression/progress.js';
import '../data/progression/titles.js';
import '../data/combat/skills.js';
import '../data/professions/crafting.js';
import '../data/progression/quests.js';
import '../data/world/npcs.js';
import '../data/world/monsters.js';
import '../data/combat/bossPatterns.js';
import '../data/professions/fishing.js';
import '../data/world/ascendantFrontier.js';
import { mergeAscendantLocations } from '../data/world/ascendantRegions.js';
import { validateMasterData } from '../modules/infrastructure/masterDataValidation.js';

const locations = mergeAscendantLocations(
    JSON.parse(readFileSync(new URL('../data/world/locations.json', import.meta.url), 'utf8')) as LocationData[],
);
const issues = validateMasterData({ locations });
if (issues.length > 0) {
    for (const issue of issues) console.error(`[${issue.scope}] ${issue.id}: ${issue.message}`);
    console.error(`마스터 데이터 검증 실패: ${issues.length}개`);
    process.exitCode = 1;
} else {
    console.log('마스터 데이터 검증 완료: 참조와 아이콘이 유효합니다.');
}
