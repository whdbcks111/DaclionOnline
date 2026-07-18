import '../data/projectiles.js';
import '../data/jobs.js';
import '../data/skills.js';
import { analyzeAllFirstJobs } from '../models/Balance.js';

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

function formatSeconds(value: number): string {
    return Number.isFinite(value) ? `${value.toFixed(2)}초` : '∞';
}
