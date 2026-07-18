import { registerCommand } from '../modules/bot.js';
import { sendBotMessageToUser } from '../modules/message.js';
import {
    analyzeAllFirstJobs,
    analyzeJobBalance,
    analyzeSkillBalance,
    createBalanceScenario,
    findSkillDataForBalance,
    type JobBalanceReport,
    type SkillBalanceReport,
} from '../models/Balance.js';
import { getAllJobs, getJob, JobTier } from '../models/Job.js';
import { getAllSkillData } from '../models/Skill.js';
import type { CompletionItem } from '../../../shared/types.js';
import { chat } from '../utils/chatBuilder.js';

const DEFAULT_LEVEL = 50;

export function initBalanceCommands(): void {
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
