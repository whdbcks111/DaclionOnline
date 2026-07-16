import { registerCommand } from '../modules/bot.js'
import { sendBotMessageToUser } from '../modules/message.js'
import { getTagEffectAffinitySnapshots } from '../models/TagEffect.js'
import type { TagEffectDisplayRelation } from '../models/TagEffect.js'
import { chat } from '../utils/chatBuilder.js'

function appendRelations(
    builder: ReturnType<typeof chat>,
    label: string,
    color: string,
    relations: readonly TagEffectDisplayRelation[],
): void {
    if (relations.length === 0) return
    builder.color(color, part => part.text(`${label} `))
    relations.forEach((relation, index) => {
        if (index > 0) builder.text(', ')
        builder.icon(relation.icon).text(`${relation.label} x${relation.modifier}`)
    })
    builder.text('  ')
}

export function initAffinityCommands(): void {
    registerCommand({
        name: '속성표',
        aliases: ['affinity'],
        showCommandUse: 'private',
        description: '속성별 단방향 우세·취약·저항·면역 관계를 확인합니다.',
        handler(userId) {
            const message = chat()
                .text('[ 속성표 ]  ')
                .hide('상성표 보기', builder => {
                    builder.text('[ 속성표 ]\n')
                        .color('$text-tertiary', part => part.text('→ 공격 대상  ·  ← 해당 속성으로부터 피격\n'))

                    for (const affinity of getTagEffectAffinitySnapshots()) {
                        builder.icon(affinity.icon)
                            .weight('bold', part => part.text(`${affinity.label} `))
                            .color('$text-tertiary', part => part.text(`(${affinity.tag})\n`))

                        builder.text('  공격  ')
                        const hasAttackRelation = affinity.attackAdvantages.length
                            || affinity.attackDisadvantages.length
                            || affinity.attackImmunities.length
                        appendRelations(builder, '우세 →', '$warning', affinity.attackAdvantages)
                        appendRelations(builder, '열세 →', '$danger', affinity.attackDisadvantages)
                        appendRelations(builder, '무효 →', '$text-tertiary', affinity.attackImmunities)
                        if (!hasAttackRelation) builder.color('$text-tertiary', part => part.text('중립'))
                        builder.text('\n  방어  ')

                        const hasDefenseRelation = affinity.defenseVulnerabilities.length
                            || affinity.defenseResistances.length
                            || affinity.defenseImmunities.length
                        appendRelations(builder, '취약 ←', '$danger', affinity.defenseVulnerabilities)
                        appendRelations(builder, '저항 ←', '$info', affinity.defenseResistances)
                        appendRelations(builder, '면역 ←', '$text-tertiary', affinity.defenseImmunities)
                        if (!hasDefenseRelation) builder.color('$text-tertiary', part => part.text('중립'))
                        builder.text('\n')
                    }

                    return builder
                })
                .build()

            sendBotMessageToUser(userId, message)
        },
    })
}
