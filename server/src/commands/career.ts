import { registerCommand } from '../modules/bot.js';
import { sendBotMessageToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';
import { getAllJobs, getJob } from '../models/Job.js';
import { chat } from '../utils/chatBuilder.js';
import type { CompletionItem } from '../../../shared/types.js';
import { getSkillData } from '../models/Skill.js';

export function initCareerCommands(): void {
    registerCommand({
        name: '직업', aliases: ['career', 'job'], description: '현재 직업과 다음 전직 조건을 확인합니다.',
        showCommandUse: 'private',
        information: true,
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const career = player.career;
            const main = career.effectiveMainJob;
            const builder = chat().text('[ 직업 ]\n').hide('상세 보기', b => {
                b.color('gray', x => x.text('─── 메인 직업 ───\n'));
                if (main) b.icon(main.icon).weight('bold', x => x.color('gold', y => y.text(main.name)))
                    .text(career.eliteJob ? ` · ${career.mainJob?.name} 계보` : '').text('\n').text(`${main.description}\n`);
                else b.color('gray', x => x.text(`(미선택 · Lv.20부터 전직소에서 선택)\n`));
                b.color('gray', x => x.text('─── 서브 직업 ───\n'));
                if (career.subJob) b.icon(career.subJob.icon).weight('bold', x => x.text(career.subJob!.name)).text(`\n${career.subJob.description}\n`);
                else b.color('gray', x => x.text(`(미선택 · Lv.50부터 메인과 다른 직업 선택)\n`));
                b.color('gray', x => x.text('─── 엘리트 전직 ───\n'));
                if (career.eliteJob) b.icon(career.eliteJob.icon).color('gold', x => x.weight('bold', y => y.text(career.eliteJob!.name))).text('\n');
                else b.text('Lv.200에 메인·서브 조합에 따라 자동 전직\n');
                return b;
            });
            sendBotMessageToUser(userId, builder.build());
        },
    });

    registerCommand({
        name: '직업정보', aliases: ['careerinfo', 'ji'], description: '직업의 설명과 획득 스킬을 확인합니다.',
        showCommandUse: 'private',
        information: true,
        args: [{
            name: '직업이름', description: '확인할 직업', required: true, isText: true,
            completions: (): CompletionItem[] => getAllJobs().map(job => ({ value: job.name, description: job.tier.label })),
        }],
        handler(userId, args) {
            const input = args[0]?.trim().toLowerCase() ?? '';
            const job = getAllJobs().find(candidate => candidate.id === input || candidate.name.toLowerCase() === input)
                ?? (input ? getJob(input) : undefined);
            if (!job) { sendBotMessageToUser(userId, '직업을 찾을 수 없습니다.'); return; }
            const builder = chat().text('[ 직업 정보 ]  ').icon(job.icon).color('gold', b => b.weight('bold', x => x.text(job.name)))
                .text(` · ${job.tier.label}\n`).text(`${job.description}\n`)
                .color('gray', b => b.text('─── 획득 스킬 ───\n'));
            if (job.grantedSkills.length === 0) builder.color('gray', b => b.text('(별도 엘리트 전용 스킬 없음)'));
            else for (const grant of job.grantedSkills) builder.text(`• ${getSkillData(grant.skillDataId)?.name ?? grant.skillDataId} Lv.${grant.level ?? 1}\n`);
            sendBotMessageToUser(userId, builder.build());
        },
    });
}
