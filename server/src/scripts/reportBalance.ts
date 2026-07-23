import '../data/projectiles.js';
import '../data/items.js';
import '../data/jobs.js';
import '../data/statusEffects.js';
import '../data/tagEffects.js';
import '../data/skills.js';
import '../data/monsters.js';
import {
    analyzeAllBalanceProfiles,
    analyzeAllEliteJobs,
    analyzeAllFirstJobs,
    analyzeBalanceProfile,
    analyzeItemBalance,
    analyzeSkillBalance,
    BalanceEncounterType,
    BALANCE_PROFILE_LEVELS,
    createBalanceScenario,
} from '../models/Balance.js';

const levelInput = process.argv[2] ?? '50';
const requestedLevel = Number.parseInt(levelInput, 10);
const level = Number.isInteger(requestedLevel) && requestedLevel > 0 ? requestedLevel : 50;
const reports = analyzeAllFirstJobs(level);

if (levelInput.toLowerCase() === 'all') {
    for (const band of BALANCE_PROFILE_LEVELS) printProfiles(band);
    process.exit(0);
}

printProfiles(level);

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
    ['career:warrior', 'oathiron_sword'],
    ['career:warrior', 'gravekeeper_shield'],
    ['career:archer', 'requiem_bow'],
    ['career:mage', 'mourning_staff'],
    ['career:warrior', 'dunebreaker_sword'],
    ['career:warrior', 'sunmirror_shield'],
    ['career:archer', 'sunwire_bow'],
    ['career:assassin', 'mirage_fang_dagger'],
    ['career:mage', 'helioglass_staff'],
    ['career:warrior', 'rimecleaver_sword'],
    ['career:warrior', 'frostglass_bulwark'],
    ['career:archer', 'icesilk_longbow'],
    ['career:assassin', 'mirrorfang_dagger'],
    ['career:mage', 'auroraprism_staff'],
    ['career:warrior', 'tidebreaker_sword'],
    ['career:warrior', 'drowned_admiral_shield'],
    ['career:archer', 'mistcurrent_bow'],
    ['career:assassin', 'blackcoral_sting'],
    ['career:mage', 'deeppearl_staff'],
    ['career:warrior', 'paradox_edge'],
    ['career:warrior', 'causality_aegis'],
    ['career:archer', 'photon_repeater'],
    ['career:assassin', 'voidspring_dagger'],
    ['career:mage', 'logic_core_staff'],
    ['career:warrior', 'sootcleaver_sword'],
    ['career:warrior', 'ashguard_bulwark'],
    ['career:archer', 'hornstring_bow'],
    ['career:assassin', 'gloamfang_dagger'],
    ['career:mage', 'blackflame_staff'],
    ['career:warrior', 'nullsilver_greatsword'],
    ['career:warrior', 'regent_aegis'],
    ['career:archer', 'crownstring_longbow'],
    ['career:assassin', 'voidsilk_stiletto'],
    ['career:mage', 'starless_scepter'],
    ['career:warrior', 'drowned_edge'],
    ['career:warrior', 'white_night_bulwark'],
    ['career:archer', 'mooncurrent_bow'],
    ['career:assassin', 'nightpearl_knife'],
    ['career:mage', 'eclipse_oracle_staff'],
    ['career:warrior', 'rootbone_cleaver'],
    ['career:warrior', 'canopy_heartshield'],
    ['career:archer', 'heartstring_greatbow'],
    ['career:assassin', 'amber_memory_fang'],
    ['career:mage', 'origin_heart_staff'],
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

console.log('\n지역 전승 스킬 실측');
for (const [jobId, skillId] of [
    ['career:mage', 'photon_lance'],
    ['career:mage', 'causality_lock'],
    ['career:warrior', 'gearstorm'],
    ['career:mage', 'paradox_reversal'],
    ['career:warrior', 'hellhound_charge'],
    ['career:assassin', 'blackflame_brand'],
    ['career:mage', 'sovereign_decree'],
    ['career:assassin', 'voidstep'],
    ['career:mage', 'crown_nullification'],
    ['career:assassin', 'undertow_step'],
    ['career:mage', 'eclipse_verdict'],
    ['career:warrior', 'rootbreaker_descent'],
    ['career:mage', 'primordial_sanctuary'],
] as const) {
    const scenario = createBalanceScenario(level, jobId, undefined, BalanceEncounterType.BOSS);
    const report = analyzeSkillBalance(scenario, skillId, 5);
    console.log([
        `${scenario.effectiveJob.name}/${report.name}`,
        `1회=${report.expectedTotalDamage.toFixed(2)}`,
        `60초=${report.sustainableDpm.toFixed(2)}`,
        `사용=${report.sustainableCasts}회`,
        `소모=${report.manaCost.toFixed(0)}`,
        `재사용=${report.cooldown.toFixed(1)}초`,
        `회피=${(report.evasionChance * 100).toFixed(1)}%`,
        `관통=${report.penetration.toFixed(1)}/${(report.penetration + report.effectiveDefense).toFixed(1)}→${report.effectiveDefense.toFixed(1)}`,
    ].join('  '));
}

function formatSeconds(value: number): string {
    return Number.isFinite(value) ? `${value.toFixed(2)}초` : '∞';
}

function printProfiles(profileLevel: number): void {
    console.log(`\n전투 로테이션 프로파일 · Lv.${profileLevel}`);
    console.log('조건: 추천 장비 / 동레벨 일반·보스 / 평타 최소 3행동당 1회 / 모든 사용 가능 스킬 / 공유 정신력·쿨다운 / 60초');
    for (const report of analyzeAllBalanceProfiles(profileLevel)) {
        console.log([
            report.name.padEnd(5),
            `일반=${report.monster.dps.toFixed(2)}DPS/${formatSeconds(report.monster.estimatedKillSeconds)}`,
            `보스=${report.boss.dps.toFixed(2)}DPS/${formatSeconds(report.boss.estimatedKillSeconds)}`,
            `평타=${(report.boss.basicDamageShare * 100).toFixed(1)}%`,
            `회피=${(report.boss.evasionChance * 100).toFixed(1)}%(${report.boss.currentSpeed.toFixed(2)}:${report.boss.targetSpeed.toFixed(2)})`,
            `관통=${report.boss.penetration.toFixed(1)}/${report.boss.targetDefense.toFixed(1)}→${report.boss.effectiveDefense.toFixed(1)}`,
            `스킬=${report.boss.skills.map(skill => `${skill.name}Lv.${skill.skillLevel}x${skill.casts}`).join(',')}`,
        ].join('  '));
    }
    if (profileLevel >= 200) {
        console.log('엘리트 조합 로테이션');
        for (const main of ['warrior', 'archer', 'assassin', 'mage', 'blacksmith']) {
            for (const sub of ['warrior', 'archer', 'assassin', 'mage', 'blacksmith']) {
                if (main === sub) continue;
                const report = analyzeBalanceProfile(profileLevel, `career:${main}`, `career:${sub}`);
                console.log(`${report.name.padEnd(8)} 보스=${report.boss.dps.toFixed(2)}DPS/${formatSeconds(report.boss.estimatedKillSeconds)} 평타=${(report.boss.basicDamageShare * 100).toFixed(1)}%`);
            }
        }
    }
}
