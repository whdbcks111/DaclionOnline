import { registerCommand } from '../../modules/communication/bot.js';
import { sendBotMessageToUser, sendNotificationToUser } from '../../modules/communication/message.js';
import { getPlayerByUserId } from '../../modules/player/player.js';
import { chat } from '../../utils/chatBuilder.js';
import { parseChatMessage } from '../../utils/chatParser.js';
import type { CompletionItem } from '../../../../shared/types.js';
import type Skill from '../../models/progression/Skill.js';
import { performSkillBreakthrough } from '../../modules/player/skillBreakthrough.js';
import logger from '../../utils/logger.js';
import {
    getPassiveTrainingSnapshot,
    setPassiveTrainingFocus,
} from '../../modules/player/passiveTraining.js';

interface SkillListStatus {
    label: string;
    color: string;
}

function visibleSkillCompletions(userId: number): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    if (!player) return [];
    return player.skills.getVisible().map(skill => ({
        value: skill.name,
        description: `Lv.${skill.level} · ${skill.formatCost(player).replace(/\[[^\]]+\]/g, '')}`,
    }));
}

function activeSkillCompletions(userId: number): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    if (!player) return [];
    return player.skills.getVisible()
        .filter(skill => !skill.isPassive)
        .map(skill => ({
            value: skill.name,
            description: `Lv.${skill.level} · ${skill.formatCost(player).replace(/\[[^\]]+\]/g, '')}`,
        }));
}

function skillBreakthroughCompletions(userId: number): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    if (!player) return [];
    return player.skills.getMaxLevelBreakthroughSnapshots()
        .filter(snapshot => snapshot.remainingMaxLevelBonus > 0)
        .map(snapshot => ({
            value: snapshot.name,
            description: `최대 Lv.${snapshot.maxLevel} · 돌파 +${snapshot.maxLevelBonus}/${snapshot.maxLevelBonusCap}`,
        }));
}

function passiveTrainingCompletions(userId: number): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    if (!player) return [];
    return [
        { value: '자동', description: '성장 가능한 패시브 중 하나를 성공할 때마다 무작위 선택' },
        ...player.skills.getTrainablePassiveSnapshots().map(snapshot => ({
            value: snapshot.name,
            description: `Lv.${snapshot.level}/${snapshot.maxLevel} · 1회 +${snapshot.experienceGain} 경험치`,
        })),
    ];
}

function getSkillListStatus(skill: Skill): SkillListStatus | null {
    if (skill.isPassive) return { label: '패시브', color: 'cyan' };
    if (skill.isActive) return { label: '발동 중', color: 'gold' };
    const remaining = skill.getRemainingCooldown();
    if (remaining > 0) {
        return { label: `재사용 대기 ${remaining.toFixed(1)}초`, color: 'red' };
    }
    return null;
}

export function initSkillCommands(): void {
    registerCommand({
        name: '스킬목록',
        aliases: ['skilllist', 'sl'],
        description: '현재 표시 가능한 보유 스킬 목록을 확인합니다.',
        showCommandUse: 'hide',
        information: true,
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const skills = player.skills.getVisible();
            const builder = chat()
                .color('gray', b => b.text(`[ 스킬 목록 ]  ${skills.length}개`));

            if (skills.length === 0) {
                builder.text('\n현재 표시 가능한 보유 스킬이 없습니다.');
            } else {
                for (const [index, skill] of skills.entries()) {
                    const status = getSkillListStatus(skill);
                    builder.text('\n')
                        .color('gray', b => b.text(`${index + 1}. `))
                        .icon(skill.data.icon)
                        .weight('bold', b => b.color('gold', b2 => b2.text(skill.name)))
                        .text(`  Lv.${skill.level}`);
                    if (status) {
                        builder.text('  ').color(status.color, b => b.text(status.label));
                    }
                    builder.text('  ').closeButton(`/스킬정보 ${skill.name}`, b => b.text('[정보]'));
                    if (!skill.isPassive) builder.text(' ')
                        .closeButton(`/스킬 ${skill.name}`, b => b.color('gold', b2 => b2.text('[사용]')));
                }
            }
            sendBotMessageToUser(userId, builder.build());
        },
    });

    registerCommand({
        name: '스킬',
        aliases: ['skill', 'su', 'k'],
        description: '보유한 스킬을 이름으로 발동합니다.',
        showCommandUse: 'hide',
        args: [{
            name: '스킬이름',
            description: '발동할 스킬 이름',
            required: true,
            isText: true,
            completions: activeSkillCompletions,
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const outcome = player.skills.activateByInput(args[0] ?? '');
            if (outcome.matched) return;
            const reason = outcome.reason ?? '발동할 스킬을 찾을 수 없습니다.';
            sendNotificationToUser(userId, { key: 'skill-not-found', message: reason });
            sendBotMessageToUser(userId, reason);
        },
    });

    registerCommand({
        name: '스킬정보',
        aliases: ['skillinfo', 'si'],
        description: '보유한 스킬의 상세 정보를 확인합니다.',
        showCommandUse: 'hide',
        information: true,
        args: [{
            name: '스킬이름',
            description: '확인할 스킬 이름',
            required: true,
            isText: true,
            completions: visibleSkillCompletions,
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const skill = player.skills.findVisibleByInput(args[0] ?? '');
            if (!skill) {
                sendBotMessageToUser(userId, '보유하고 있거나 현재 표시 가능한 스킬이 아닙니다.');
                return;
            }

            const requiredExperience = skill.getRequiredExperience(player);
            const tagInfo = skill.getInformationTagsSnapshot();
            const classificationBuilder = chat();
            if (tagInfo.groups.length > 0) {
                classificationBuilder.color('gray', b => b.text('계열  '));
                for (const tag of tagInfo.groups) classificationBuilder.icon(tag.icon).text(` ${tag.label}  `);
                classificationBuilder.text('\n');
            }
            if (tagInfo.affinities.length > 0) {
                classificationBuilder.color('gray', b => b.text('속성  '));
                for (const tag of tagInfo.affinities) classificationBuilder.icon(tag.icon).text(` ${tag.label}  `);
                classificationBuilder.text('\n');
            }
            const sharedCooldownBuilder = chat();
            for (const [index, cooldown] of tagInfo.sharedCooldowns.entries()) {
                if (index > 0) sharedCooldownBuilder.text('\n');
                sharedCooldownBuilder.icon(cooldown.icon)
                    .text(` ${cooldown.label} 보유 스킬  `)
                    .color('gold', b => b.text(`최소 ${cooldown.seconds}초`));
            }
            const experienceNodes = skill.level >= skill.maxLevel
                ? chat()
                    .color('gray', b => b.text('경험치  '))
                    .weight('bold', b => b.color('gold', b2 => b2.text('MAX')))
                    .text('\n')
                    .build()
                : chat()
                    .color('gray', b => b.text('경험치  '))
                    .color('gold', b => b.text(`${skill.experience} / ${requiredExperience}`))
                    .text('  ')
                    .progress({
                        value: requiredExperience > 0 ? skill.experience / requiredExperience : 1,
                        length: '8em',
                        color: 'gold',
                        thickness: 6,
                    })
                    .text('\n')
                    .build();
            const breakthroughNodes = skill.maxLevelBonus > 0
                ? chat()
                    .color('gray', b => b.text('돌파  '))
                    .color('gold', b => b.text(`+${skill.maxLevelBonus}/${skill.maxLevelBonusCap}`))
                    .text(skill.isPassive
                        ? ' · 낚시·요리 패시브 수련 가능\n'
                        : ` · 돌파 레벨 계수 성장 ×2 · 현재 효과 계수 Lv.${skill.coefficientLevel}\n`)
                    .build()
                : [];

            const nodes = [
                ...chat()
                    .color('gray', b => b.text('[ 스킬 정보 ]  '))
                    .icon(skill.data.icon)
                    .weight('bold', b => b.color('gold', b2 => b2.text(skill.name)))
                    .text(`  Lv.${skill.level} / ${skill.maxLevel}\n`)
                    .build(),
                ...experienceNodes,
                ...breakthroughNodes,
                ...(tagInfo.groups.length > 0 || tagInfo.affinities.length > 0
                    ? [
                        ...chat().divider('스킬 분류').build(),
                        ...classificationBuilder.build(),
                    ] : []),
                ...chat().divider('효과').build(),
                ...parseChatMessage(skill.formatDescription(player)),
                ...chat().divider('소모값').build(),
                ...parseChatMessage(skill.formatCost(player)),
                ...chat()
                    .divider('재사용 대기시간')
                    .color('gold', b => b.text(skill.isPassive ? '없음' : skill.format('{{maxCooldown}}초', player)))
                    .build(),
                ...(tagInfo.sharedCooldowns.length > 0 ? [
                    ...chat().divider('공유 재사용 대기시간').build(),
                    ...sharedCooldownBuilder.build(),
                ] : []),
                ...chat().divider('발동 조건').build(),
                ...parseChatMessage(skill.formatActivationCondition(player)),
                ...(!skill.isPassive ? chat()
                    .text('\n')
                    .closeButton(`/스킬 ${skill.name}`, b => b.color('gold', b2 => b2.text('[사용]')))
                    .build() : []),
            ];
            sendBotMessageToUser(userId, nodes);
        },
    });

    registerCommand({
        name: '패시브수련',
        aliases: ['패시브훈련', 'passivetraining', 'pt'],
        description: '낚시·요리 성공 시 경험치를 받을 패시브를 확인하거나 지정합니다.',
        showCommandUse: 'private',
        information: true,
        args: [{
            name: '대상',
            description: '자동 또는 집중 수련할 성장 가능한 패시브',
            isText: true,
            completions: passiveTrainingCompletions,
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            if (args[0]) {
                const changed = setPassiveTrainingFocus(player, args[0]);
                if (!changed.changed) {
                    sendNotificationToUser(userId, { key: 'passive-training-denied', message: changed.message });
                    sendBotMessageToUser(userId, changed.message);
                    return;
                }
            }
            const snapshot = getPassiveTrainingSnapshot(player);
            const builder = chat()
                .weight('bold', nested => nested.text('[ 패시브 수련 ]'))
                .text(`\n수련 방식: ${snapshot.automatic ? '성공할 때마다 무작위' : `${snapshot.focusSkillName} 집중`}`)
                .text(`\n오늘 획득: ${snapshot.gainedToday}/${snapshot.dailyCap} EXP`)
                .text(`\n남은 한도: ${snapshot.remainingToday} EXP`)
                .text('\n\n낚시 1회 또는 요리 1개 성공마다 선택된 패시브의 설정 경험치를 획득합니다.');
            if (snapshot.candidates.length === 0) {
                builder.text('\n현재 성장 가능한 패시브가 없습니다. 최대 레벨 돌파 뒤 다시 확인할 수 있습니다.');
            } else {
                builder.text('\n\n').closeButton('/패시브수련 자동', nested => nested.text('[자동 선택]'));
                for (const candidate of snapshot.candidates) {
                    builder.text('\n')
                        .icon(candidate.icon)
                        .text(` ${candidate.name} Lv.${candidate.level}/${candidate.maxLevel}`)
                        .text(` · ${candidate.experience}/${candidate.requiredExperience} EXP`)
                        .text(' ')
                        .closeButton(`/패시브수련 ${candidate.name}`, nested => nested.text('[집중]'));
                }
            }
            sendBotMessageToUser(userId, builder.build());
        },
    });

    registerCommand({
        name: '스킬돌파',
        aliases: ['숙련돌파', 'skillbreak'],
        description: '숙련의 정수 10개로 선택한 보유 스킬의 최대 레벨을 1 높입니다.',
        showCommandUse: 'private',
        args: [{
            name: '스킬이름',
            description: '최대 레벨을 돌파할 보유 스킬 이름',
            required: true,
            isText: true,
            completions: skillBreakthroughCompletions,
        }],
        async handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            try {
                const result = await performSkillBreakthrough(player, args[0] ?? '');
                if (!result.success) {
                    sendBotMessageToUser(userId, result.message);
                    sendNotificationToUser(userId, {
                        key: `skill-breakthrough-denied:${result.code}`,
                        message: result.message,
                    });
                    return;
                }
                const message = `[ ${result.snapshot.name} ] 최대 레벨 돌파 성공! `
                    + `Lv.${result.previousMaxLevel} → Lv.${result.snapshot.maxLevel} `
                    + `(돌파 +${result.snapshot.maxLevelBonus}/${result.snapshot.maxLevelBonusCap}, 숙련의 정수 ${result.consumed}개 소모)`
                    + (!result.snapshot.isPassive ? ' · 돌파 레벨은 기존 계수 증가량의 2배로 성장합니다.' : '')
                    + (result.saveDeferred ? ' 저장은 자동으로 다시 시도됩니다.' : '');
                sendBotMessageToUser(userId, chat()
                    .color('gold', builder => builder.weight('bold', bold => bold.text(message)))
                    .build());
                sendNotificationToUser(userId, {
                    key: `skill-breakthrough:${result.snapshot.id}`,
                    message,
                });
            } catch (error) {
                logger.error(`스킬 돌파 명령 실패: ${userId}`, error);
                sendBotMessageToUser(userId, '스킬 돌파 결과를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.');
            }
        },
    });
}
