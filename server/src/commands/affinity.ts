import { registerCommand } from '../modules/bot.js'
import { sendBotMessageToUser } from '../modules/message.js'
import { getTagEffectAffinitySnapshots } from '../models/TagEffect.js'
import type { TagEffectDisplayRelation } from '../models/TagEffect.js'
import { chat } from '../utils/chatBuilder.js'

function appendRelationLine(
    builder: ReturnType<typeof chat>,
    label: string,
    color: string,
    relations: readonly TagEffectDisplayRelation[],
): void {
    builder.text('    ').color(color, part => part.text(`${label} `))
    if (relations.length === 0) {
        builder.color('$text-tertiary', part => part.text('없음')).text('\n')
        return
    }
    relations.forEach((relation, index) => {
        if (index > 0) builder.text(', ')
        builder.icon(relation.icon).text(`${relation.label} x${relation.modifier}`)
    })
    builder.text('\n')
}

export function initAffinityCommands(): void {
    registerCommand({
        name: '속성표',
        aliases: ['affinity'],
        showCommandUse: 'private',
        information: true,
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

                        builder.color('$text-secondary', part => part.weight('bold', text => text.text('  공격\n')))
                        appendRelationLine(builder, '├ 우세 →', '$warning', affinity.attackAdvantages)
                        appendRelationLine(builder, '├ 열세 →', '$danger', affinity.attackDisadvantages)
                        appendRelationLine(builder, '└ 무효 →', '$text-tertiary', affinity.attackImmunities)

                        builder.color('$text-secondary', part => part.weight('bold', text => text.text('  방어\n')))
                        appendRelationLine(builder, '├ 취약 ←', '$danger', affinity.defenseVulnerabilities)
                        appendRelationLine(builder, '├ 저항 ←', '$info', affinity.defenseResistances)
                        appendRelationLine(builder, '└ 면역 ←', '$text-tertiary', affinity.defenseImmunities)
                        builder.text('\n')
                    }

                    return builder
                })
                .build()

            sendBotMessageToUser(userId, message)
        },
    })
}
