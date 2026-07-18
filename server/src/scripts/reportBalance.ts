import '../data/projectiles.js';
import '../data/items.js';
import '../data/jobs.js';
import '../data/statusEffects.js';
import '../data/skills.js';
import { analyzeAllEliteJobs, analyzeAllFirstJobs, analyzeItemBalance } from '../models/Balance.js';

const requestedLevel = Number.parseInt(process.argv[2] ?? '50', 10);
const level = Number.isInteger(requestedLevel) && requestedLevel > 0 ? requestedLevel : 50;
const reports = analyzeAllFirstJobs(level);

console.log(`DaclionOnline 직업 밸런스 기준선 · Lv.${level}`);
console.log('조건: 동일 총 스탯 / 직업별 배분 프리셋 / 무장비 / 동레벨 균형 대상 / 중립 속성 / 60초');
for (const report of reports) {
    const best = report.skillReports[0];
    console.log([
        report.name.padEnd(5),
        `기본DPS=${report.basicPhysicalDps.toFixed(2)}`,
        `물리생존=${formatSeconds(report.physicalSurvivalSeconds)}`,
        `마법생존=${formatSeconds(report.magicSurvivalSeconds)}`,
        `최고스킬=${best ? `${best.name}:${best.sustainableDpm.toFixed(2)}` : '없음'}`,
    ].join('  '));
}

const eliteReports = analyzeAllEliteJobs(level);
if (eliteReports.length > 0) {
    console.log('\n엘리트 조합 실측');
    for (const report of eliteReports) {
        const best = report.skillReports[0];
        const technique = report.skillReports.find(skill => skill.skillId.endsWith('_technique'));
        console.log([
            report.name.padEnd(7),
            `기본DPS=${report.basicPhysicalDps.toFixed(2)}`,
            `물리생존=${formatSeconds(report.physicalSurvivalSeconds)}`,
            `마법생존=${formatSeconds(report.magicSurvivalSeconds)}`,
            `전용=${technique ? `${technique.name}:${technique.sustainableDpm.toFixed(2)}` : '없음'}`,
            `최고스킬=${best ? `${best.name}:${best.sustainableDpm.toFixed(2)}` : '없음'}`,
        ].join('  '));
    }
}

console.log('\n주력 장비·버프 아이템 실측');
const itemCases = [
    ['career:warrior', 'old_sword'],
    ['career:warrior', 'old_shield'],
    ['career:archer', 'light_bow'],
    ['career:assassin', 'venom_dagger'],
    ['career:mage', 'apprentice_staff'],
    ['career:warrior', 'battle_tonic'],
    ['career:mage', 'arcane_tonic'],
    ['career:archer', 'swift_tonic'],
] as const;
for (const [jobId, itemId] of itemCases) {
    const report = analyzeItemBalance(level, jobId, itemId);
    const dpsKey = report.attackType === 'magic' ? 'magicBasicDps' : 'physicalBasicDps';
    console.log([
        `${report.jobName}/${report.name}`,
        `DPS=${report.before[dpsKey].toFixed(2)}→${report.after[dpsKey].toFixed(2)}`,
        `물리생존=${formatSeconds(report.before.physicalSurvivalSeconds)}→${formatSeconds(report.after.physicalSurvivalSeconds)}`,
        `마법생존=${formatSeconds(report.before.magicSurvivalSeconds)}→${formatSeconds(report.after.magicSurvivalSeconds)}`,
    ].join('  '));
}

function formatSeconds(value: number): string {
    return Number.isFinite(value) ? `${value.toFixed(2)}초` : '∞';
}
