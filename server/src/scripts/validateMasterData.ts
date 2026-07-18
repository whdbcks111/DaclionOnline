import { readFileSync } from 'node:fs';
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
import { validateMasterData } from '../modules/masterDataValidation.js';

const locations = JSON.parse(readFileSync(new URL('../data/locations.json', import.meta.url), 'utf8')) as LocationData[];
const issues = validateMasterData({ locations });
if (issues.length > 0) {
    for (const issue of issues) console.error(`[${issue.scope}] ${issue.id}: ${issue.message}`);
    console.error(`마스터 데이터 검증 실패: ${issues.length}개`);
    process.exitCode = 1;
} else {
    console.log('마스터 데이터 검증 완료: 참조와 아이콘이 유효합니다.');
}
