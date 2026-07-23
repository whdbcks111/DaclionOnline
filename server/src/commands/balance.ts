import { registerCommand } from '../modules/bot.js';
import { sendBotMessageToUser } from '../modules/message.js';
import {
    analyzeAllBalanceProfiles,
    analyzeAllFirstJobs,
    analyzeBalanceProfile,
    analyzeJobBalance,
    analyzeItemBalance,
    analyzeSkillBalance,
    createBalanceScenario,
    findSkillDataForBalance,
    findItemDataForBalance,
    getAllBalanceItemData,
    BALANCE_PROFILE_LEVELS,
    type ItemBalanceReport,
    type JobBalanceReport,
    type BalanceProfileReport,
    type CombatRotationReport,
    type SkillBalanceReport,
} from '../models/Balance.js';
import { getAllJobs, getJob, JobTier } from '../models/Job.js';
import { getAllSkillData } from '../models/Skill.js';
import type { CompletionItem } from '../../../shared/types.js';
import { chat } from '../utils/chatBuilder.js';

const DEFAULT_LEVEL = 50;

export function initBalanceCommands(): void {
    registerCommand({
        name: '밸런스프로파일',
        aliases: ['balanceprofile', 'bp'],
        permission: 10,
        showCommandUse: 'private',
        description: '실제 장비와 성장 스킬을 적용해 평타·전체 스킬 로테이션으로 동레벨 일반/보스전을 비교합니다.',
        args: [
            { name: '레벨', description: `분석 레벨 또는 전체 (생략 시 Lv.${DEFAULT_LEVEL})`, required: false,
                completions: [{ value: '전체', description: `Lv.${BALANCE_PROFILE_LEVELS.join('/')} 구간 비교` }] },
            { name: '메인직업', description: '생략 또는 전체 입력 시 모든 1차 직업 비교', required: false,
                completions: [{ value: '전체', description: '모든 1차 직업 비교' }, ...getFirstJobCompletions()] },
            { name: '서브직업', description: 'Lv.200 엘리트 조합 분석', required: false, completions: getFirstJobCompletions() },
        ],
        handler(userId, args) {
            try {
                if (args[0] === '전체') {
                    sendBotMessageToUser(userId, buildLevelBandProfileMessage(
                        BALANCE_PROFILE_LEVELS.flatMap(analyzeAllBalanceProfiles),
                    ));
                    return;
                }
                const level = parsePositiveInteger(args[0], DEFAULT_LEVEL);
                const mainJobId = resolveFirstJobId(args[1]);
                const subJobId = resolveFirstJobId(args[2]);
                if (!mainJobId || args[1] === '전체') {
                    sendBotMessageToUser(userId, buildProfileComparisonMessage(analyzeAllBalanceProfiles(level)));
                    return;
                }
                sendBotMessageToUser(userId, buildBalanceProfileMessage(analyzeBalanceProfile(level, mainJobId, subJobId)));
            } catch (error) {
                sendBotMessageToUser(userId, error instanceof Error ? error.message : '밸런스 프로파일 분석에 실패했습니다.');
            }
        },
    });

    registerCommand({
        name: '스킬밸런스',
        aliases: ['skillbalance', 'sb'],
        permission: 10,
        showCommandUse: 'private',
        description: '동일 레벨 표준 대상 기준으로 스킬의 실제 계산식 결과를 분석합니다.',
        args: [
            {
                name: '스킬', description: '스킬 이름/ID 또는 전체', required: true,
                completions: [
                    { value: '전체', description: '등록된 모든 스킬의 분석 지원 여부' },
                    ...getAllSkillData().map((skill): CompletionItem => ({ value: skill.name, description: skill.id })),
                ],
            },
            { name: '스킬레벨', description: '생략 시 최대 레벨', required: false },
            { name: '캐릭터레벨', description: `생략 시 Lv.${DEFAULT_LEVEL}`, required: false },
            {
                name: '직업', description: '계산에 사용할 1차 직업', required: false,
                completions: getFirstJobCompletions(),
            },
        ],
        handler(userId, args) {
            if (args[0] === '전체') {
                const supported = getAllSkillData().filter(skill => skill.balance).length;
                sendBotMessageToUser(userId, chat()
                    .text('[ 스킬 밸런스 계산 지원 현황 ]\n')
                    .text(`전체 ${getAllSkillData().length}개 · 계산 메타데이터 ${supported}개 · 미지원 ${getAllSkillData().length - supported}개\n`)
                    .color('$text-tertiary', b => b.text('미지원 스킬은 임의 점수로 추정하지 않고 명시적으로 제외됩니다.'))
                    .build());
                return;
            }
            const data = findSkillDataForBalance(args[0] ?? '');
            if (!data) {
                sendBotMessageToUser(userId, '스킬을 찾을 수 없습니다.');
                return;
            }
            const skillLevel = parsePositiveInteger(args[1], data.maxLevel);
            const characterLevel = parsePositiveInteger(args[2], DEFAULT_LEVEL);
            const mainJobId = resolveFirstJobId(args[3]) ?? data.jobRequirement?.anyOf[0] ?? 'career:warrior';
            try {
                const scenario = createBalanceScenario(characterLevel, mainJobId);
                const report = analyzeSkillBalance(scenario, data.id, skillLevel);
                sendBotMessageToUser(userId, buildSkillBalanceMessage(report, scenario.effectiveJob.name, characterLevel));
            } catch (error) {
                sendBotMessageToUser(userId, error instanceof Error ? error.message : '스킬 밸런스 분석에 실패했습니다.');
            }
        },
    });

    registerCommand({
        name: '아이템밸런스',
        aliases: ['itembalance', 'ib'],
        permission: 10,
        showCommandUse: 'private',
        description: '무기·방어구·버프 아이템을 실제 능력치와 전투식으로 적용해 전후 차이를 분석합니다.',
        args: [
            {
                name: '아이템', description: '분석할 장비 또는 버프 아이템', required: true,
                completions: getAllBalanceItemData().map(item => ({ value: item.name, description: item.id })),
            },
            { name: '캐릭터레벨', description: `생략 시 Lv.${DEFAULT_LEVEL}`, required: false },
            {
                name: '직업', description: '계산에 사용할 1차 직업', required: false,
                completions: getFirstJobCompletions(),
            },
        ],
        handler(userId, args) {
            const data = findItemDataForBalance(args[0] ?? '');
            if (!data) {
                sendBotMessageToUser(userId, '분석 가능한 아이템을 찾을 수 없습니다.');
                return;
            }
            const level = parsePositiveInteger(args[1], DEFAULT_LEVEL);
            const mainJobId = resolveFirstJobId(args[2])
                ?? data.balance?.recommendedJobIds?.[0]
                ?? 'career:warrior';
            try {
                sendBotMessageToUser(userId, buildItemBalanceMessage(analyzeItemBalance(level, mainJobId, data.id)));
            } catch (error) {
                sendBotMessageToUser(userId, error instanceof Error ? error.message : '아이템 밸런스 분석에 실패했습니다.');
            }
        },
    });

    registerCommand({
        name: '직업밸런스',
        aliases: ['jobbalance', 'jb'],
        permission: 10,
        showCommandUse: 'private',
        description: '동일 레벨·동일 총 스탯·무장비 기준으로 직업 전투 지표를 비교합니다.',
        args: [
            { name: '레벨', description: `비교 레벨 (생략 시 Lv.${DEFAULT_LEVEL})`, required: false },
            {
                name: '메인직업', description: '생략 또는 전체 입력 시 4개 1차 직업 비교', required: false,
                completions: [{ value: '전체', description: '4개 1차 직업 비교' }, ...getFirstJobCompletions()],
            },
            {
                name: '서브직업', description: 'Lv.200 엘리트 조합을 분석할 때 사용', required: false,
                completions: getFirstJobCompletions(),
            },
        ],
        handler(userId, args) {
            const level = parsePositiveInteger(args[0], DEFAULT_LEVEL);
            const requestedMain = args[1];
            try {
                if (!requestedMain || requestedMain === '전체') {
                    sendBotMessageToUser(userId, buildJobComparisonMessage(analyzeAllFirstJobs(level)));
                    return;
                }
                const mainJobId = resolveFirstJobId(requestedMain);
                const subJobId = resolveFirstJobId(args[2]);
                if (!mainJobId) {
                    sendBotMessageToUser(userId, '분석할 1차 직업을 찾을 수 없습니다.');
                    return;
                }
                sendBotMessageToUser(userId, buildJobDetailMessage(analyzeJobBalance(level, mainJobId, subJobId)));
            } catch (error) {
                sendBotMessageToUser(userId, error instanceof Error ? error.message : '직업 밸런스 분석에 실패했습니다.');
            }
        },
    });
}

function buildBalanceProfileMessage(report: BalanceProfileReport) {
    const builder = chat()
        .text(`[ 밸런스 프로파일 ] Lv.${report.level} ${report.name}\n`)
        .color('$text-tertiary', b => b.text(`${report.allocationLabel} · 추천 장비 · 공유 시간/정신력 · 60초 결정론적 로테이션\n`));
    appendRotation(builder, report.monster);
    appendRotation(builder, report.boss);
    return builder.divider('계산 원칙')
        .text('평타를 최소 3행동마다 섞고 모든 사용 가능 스킬을 순환합니다. 지속 피해·제어·회피는 직접 피해와 분리됩니다.')
        .build();
}

function appendRotation(builder: ReturnType<typeof chat>, rotation: CombatRotationReport): void {
    const source = rotation.targetNormalized ? ` · 원본 Lv.${rotation.targetSourceLevel} 환산` : '';
    builder.divider(rotation.encounter.label)
        .text(`대상 Lv.${rotation.targetLevel} ${rotation.targetName}${source}\n`)
        .text(`장비 ${rotation.loadoutName} · ${rotation.basicAttackType === 'magic' ? '마법' : '물리'} 평타\n`)
        .text(`속도 ${format(rotation.currentSpeed)} : ${format(rotation.targetSpeed)} · 대상 회피 ${format(rotation.evasionChance * 100)}%\n`)
        .text(`90% 회피 기준 속도 ${format(rotation.evasionCapSpeed)} · 필요 민첩 ${rotation.evasionCapAgility}${rotation.evasionCapReached ? ' (현재 도달)' : ''}\n`)
        .text(`${rotation.basicAttackType === 'magic' ? '마법 관통' : '방어 관통'} ${format(rotation.penetration)} · 대상 방어 ${format(rotation.targetDefense)} → 유효 ${format(rotation.effectiveDefense)}\n`)
        .weight('bold', b => b.text(`DPS ${format(rotation.dps)} · 예상 처치 ${formatSeconds(rotation.estimatedKillSeconds)}\n`))
        .text(`평타 ${rotation.basicAttacks}회 / 피해 ${format(rotation.basicDamage)} (${format(rotation.basicDamageShare * 100)}%)\n`)
        .text(`스킬 ${rotation.skillCasts}회 / 피해 ${format(rotation.skillDamage)} / 종료 정신력 ${format(rotation.endingMentality)}\n`);
    for (const skill of rotation.skills) {
        builder.text(`- ${skill.name} Lv.${skill.skillLevel}: ${skill.casts}회`)
            .text(skill.damage > 0 ? ` · 피해 ${format(skill.damage)}` : '')
            .text(skill.healing > 0 ? ` · 회복 ${format(skill.healing)}` : '')
            .text(skill.shield > 0 ? ` · 보호막 ${format(skill.shield)}` : '')
            .text('\n');
    }
}

function buildProfileComparisonMessage(reports: readonly BalanceProfileReport[]) {
    const builder = chat()
        .text(`[ 밸런스 프로파일 비교 ] Lv.${reports[0]?.level ?? DEFAULT_LEVEL}\n`)
        .color('$text-tertiary', b => b.text('추천 장비 · 동레벨 일반/보스 · 평타+전체 스킬 60초 로테이션\n'))
        .divider('직업별 결과');
    for (const report of reports) {
        builder.weight('bold', b => b.text(report.name))
            .text(`  일반 DPS ${format(report.monster.dps)} / ${formatSeconds(report.monster.estimatedKillSeconds)}`)
            .text(`  보스 DPS ${format(report.boss.dps)} / ${formatSeconds(report.boss.estimatedKillSeconds)}`)
            .text(`  평타 ${format(report.boss.basicDamageShare * 100)}%\n`);
    }
    return builder.build();
}

function buildLevelBandProfileMessage(reports: readonly BalanceProfileReport[]) {
    const builder = chat().text('[ 레벨 구간 밸런스 프로파일 ]\n');
    for (const level of [...new Set(reports.map(report => report.level))]) {
        builder.divider(`Lv.${level}`);
        for (const report of reports.filter(value => value.level === level)) {
            builder.text(`${report.name}: 일반 ${format(report.monster.dps)} DPS · 보스 ${format(report.boss.dps)} DPS · 보스 처치 ${formatSeconds(report.boss.estimatedKillSeconds)}\n`);
        }
    }
    return builder.build();
}

function buildItemBalanceMessage(report: ItemBalanceReport) {
    const attackDps = report.attackType === 'magic' ? 'magicBasicDps' : 'physicalBasicDps';
    const builder = chat()
        .text(`[ 아이템 밸런스 ] ${report.name}\n`)
        .color('$text-tertiary', b => b.text(`Lv.${report.level} ${report.jobName} · 동레벨 균형형 대상 · 실제 modifier/상태효과 적용\n`))
        .divider('분석 조건')
        .text(`분류 ${report.role}`)
        .text(report.recommendedJobNames.length ? `  |  추천 ${report.recommendedJobNames.join(', ')}` : '')
        .text('\n');
    if (report.statusEffect) {
        builder.text(`적용 효과 ${report.statusEffect.label} Lv.${report.statusEffect.level} · ${format(report.statusEffect.duration)}초\n`);
    }
    builder.divider('전후 실측')
        .text(`공격력 ${formatPair(report.before.attack, report.after.attack)}  마법력 ${formatPair(report.before.magicForce, report.after.magicForce)}\n`)
        .text(`방어 ${formatPair(report.before.defense, report.after.defense)}  마법저항 ${formatPair(report.before.magicDefense, report.after.magicDefense)}\n`)
        .text(`생명력 ${formatPair(report.before.maxLife, report.after.maxLife)}  이동속도 ${formatPair(report.before.speed, report.after.speed)}\n`)
        .text(`${report.attackType === 'magic' ? '마법' : '물리'} 기본 DPS ${formatPair(report.before[attackDps], report.after[attackDps])}\n`)
        .text(`물리 생존 ${formatPair(report.before.physicalSurvivalSeconds, report.after.physicalSurvivalSeconds, '초')}\n`)
        .text(`마법 생존 ${formatPair(report.before.magicSurvivalSeconds, report.after.magicSurvivalSeconds, '초')}\n`);
    if (report.notes.length) {
        builder.divider('분리한 효과');
        for (const note of report.notes) builder.text(`- ${note}\n`);
    }
    return builder.build();
}

function buildSkillBalanceMessage(report: SkillBalanceReport, jobName: string, characterLevel: number) {
    const builder = chat()
        .text(`[ 스킬 밸런스 ] ${report.name} Lv.${report.skillLevel}\n`)
        .color('$text-tertiary', b => b.text(`Lv.${characterLevel} ${jobName} · 무장비 · 동레벨 균형형 대상 · 중립 속성 · 60초 전투\n`))
        .divider('실측 계산')
        .text(`분류 ${report.role}  |  계산 지원 ${coverageLabel(report.coverage)}\n`)
        .text(`재사용 ${format(report.cooldown)}초  |  정신력 ${format(report.manaCost)}\n`);
    if (report.rawDamage > 0) {
        builder.text(`방어 전 1타 ${format(report.rawDamage)}\n`)
            .text(`대상 1명 기대 피해 ${format(report.expectedDamagePerTarget)}\n`)
            .text(`1회 총 기대 피해 ${format(report.expectedTotalDamage)}\n`)
            .text(`60초 시전 ${report.sustainableCasts}회 (쿨다운 ${report.cooldownLimitedCasts} / 자원 ${report.resourceLimitedCasts})\n`)
            .weight('bold', b => b.text(`60초 기대 피해 ${format(report.sustainableDpm)}\n`));
    }
    if (report.healing > 0) builder.text(`1회 회복 ${format(report.healing)}\n`);
    if (report.shield > 0) builder.text(`1회 보호막 ${format(report.shield)}\n`);
    if (report.notes.length > 0) {
        builder.divider('계산에서 분리한 효과');
        for (const note of report.notes) builder.text(`- ${note}\n`);
    }
    return builder.build();
}

function buildJobComparisonMessage(reports: readonly JobBalanceReport[]) {
    const builder = chat()
        .text(`[ 직업 밸런스 비교 ] Lv.${reports[0]?.level ?? DEFAULT_LEVEL}\n`)
        .color('$text-tertiary', b => b.text('동일 총 스탯 · 직업별 공개 배분 프리셋 · 무장비 · 동레벨 균형형 대상 · 중립 속성\n'))
        .divider('기대 전투 지표');
    for (const report of reports) {
        const best = report.skillReports[0];
        builder.weight('bold', b => b.text(`${report.name}`))
            .text(`  기본 DPS ${format(report.basicPhysicalDps)}`)
            .text(`  물리생존 ${formatSeconds(report.physicalSurvivalSeconds)}`)
            .text(`  마법생존 ${formatSeconds(report.magicSurvivalSeconds)}`)
            .text(`  최고 스킬DPM ${best ? `${best.name} ${format(best.sustainableDpm)}` : '미측정'}\n`);
    }
    return builder.divider('해석 원칙')
        .text('제어·회피·은신·광역 대상 수 같은 상황 의존 효과는 임의 점수로 합산하지 않습니다.\n')
        .text('격차가 발견되면 실제 스킬식과 성장 프리셋을 수정한 뒤 같은 명령으로 재측정합니다.')
        .build();
}

function buildJobDetailMessage(report: JobBalanceReport) {
    const builder = chat()
        .text(`[ 직업 밸런스 ] Lv.${report.level} ${report.name}\n`)
        .color('$text-tertiary', b => b.text(`${report.allocationLabel} · 무장비 · 동레벨 균형형 대상 · 중립 속성\n`))
        .divider('스탯 배분')
        .text(`근력 ${report.stats.strength}  민첩 ${report.stats.agility}  체력 ${report.stats.vitality}\n`)
        .text(`감각 ${report.stats.sensibility}  정신력 ${report.stats.mentality}\n`)
        .divider('능력치')
        .text(`공격력 ${format(report.attack)}  마법력 ${format(report.magicForce)}  생명력 ${format(report.maxLife)}\n`)
        .text(`방어 ${format(report.defense)}  마법저항 ${format(report.magicDefense)}  속도 ${format(report.speed)}\n`)
        .divider('기대 전투 지표')
        .text(`기본 물리 DPS ${format(report.basicPhysicalDps)}\n`)
        .text(`표준 물리 공격 생존 ${formatSeconds(report.physicalSurvivalSeconds)}\n`)
        .text(`표준 마법 공격 생존 ${formatSeconds(report.magicSurvivalSeconds)}\n`);
    for (const skill of report.skillReports) {
        builder.text(`- ${skill.name}: ${skill.sustainableDpm > 0 ? `60초 피해 ${format(skill.sustainableDpm)}` : skill.role}`)
            .text(` (${coverageLabel(skill.coverage)})\n`);
    }
    return builder.build();
}

function getFirstJobCompletions(): CompletionItem[] {
    return getAllJobs().filter(job => job.tier === JobTier.FIRST)
        .map(job => ({ value: job.name, description: job.id }));
}

function resolveFirstJobId(input: string | undefined): string | undefined {
    if (!input?.trim()) return undefined;
    const direct = getJob(input);
    if (direct?.tier === JobTier.FIRST) return direct.id;
    const normalized = input.trim().toLowerCase();
    return getAllJobs().find(job => job.tier === JobTier.FIRST
        && (job.name === input.trim() || job.id === `career:${normalized}`))?.id;
}

function parsePositiveInteger(input: string | undefined, fallback: number): number {
    if (!input?.trim()) return fallback;
    const value = Number.parseInt(input, 10);
    return Number.isInteger(value) && value > 0 ? value : fallback;
}

function coverageLabel(value: SkillBalanceReport['coverage']): string {
    return value === 'complete' ? '완전' : value === 'partial' ? '부분' : '미지원';
}

function format(value: number): string {
    if (!Number.isFinite(value)) return '∞';
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function formatSeconds(value: number): string { return `${format(value)}초`; }

function formatPair(before: number, after: number, suffix = ''): string {
    const delta = after - before;
    const deltaText = Math.abs(delta) < 0.0001 ? '변화 없음' : `${delta > 0 ? '+' : ''}${format(delta)}${suffix}`;
    return `${format(before)}${suffix} → ${format(after)}${suffix} (${deltaText})`;
}
