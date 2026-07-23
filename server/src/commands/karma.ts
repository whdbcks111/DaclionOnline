import { registerCommand } from '../modules/bot.js';
import { sendBotMessageToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';
import { KarmaRules, KarmaTier } from '../models/Karma.js';
import { chat } from '../utils/chatBuilder.js';

export function initKarmaCommands(): void {
    registerCommand({
        name: '카르마',
        aliases: ['karma', 'krm'],
        description: '현재 카르마와 악명 단계, 주요 제한을 확인합니다.',
        information: true,
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const value = player.karma;
            const tier = player.karmaTier;
            const nextTier = KarmaTier.values().find(candidate => candidate.minimum > value);
            const b = chat()
                .text('[ 카르마 ]\n')
                .divider('현재 악명')
                .weight('bold', inner => inner.color(tier.color, text => text.text(tier.label)))
                .text(`  ${value.toFixed(1)}`)
                .text(player.isKarmaMarked ? '  🥀' : '')
                .text('\n')
                .color('$text-tertiary', inner => inner
                    .text(`전투하지 않아도 시간당 ${(KarmaRules.DECAY_PER_SECOND * 3_600).toFixed(1)}씩 자연 감소합니다.\n`));
            if (nextTier) {
                b.text('다음 단계까지 ')
                    .color(nextTier.color, inner => inner.text((nextTier.minimum - value).toFixed(1)))
                    .text(` · ${nextTier.label}\n`);
            }
            b.divider('주요 기준')
                .text(`카르마 ${KarmaRules.WANTED_THRESHOLD} 이상  악명 표식·강화된 사망 패널티\n`)
                .text(`카르마 ${KarmaRules.LAWFUL_SHOP_DENIED_THRESHOLD} 이상  일부 질서 시설 거래 제한\n`)
                .text(`카르마 ${KarmaRules.SANCTUARY_DENIED_THRESHOLD} 이상  교단 성소 이용 제한`);
            sendBotMessageToUser(userId, b.build());
        },
    });
}
