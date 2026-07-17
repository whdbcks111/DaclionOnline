import { registerCommand } from '../modules/bot.js';
import { startFishing } from '../modules/fishing.js';
import { sendBotMessageToUser } from '../modules/message.js';
import { getPlayerByUserId } from '../modules/player.js';
import { AttributeType } from '../models/Attribute.js';
import { getFishRarityChances } from '../models/Fishing.js';
import { chat } from '../utils/chatBuilder.js';

function formatProbability(probability: number): string {
    const percent = probability * 100;
    return `${percent >= 10 ? percent.toFixed(1) : percent.toFixed(2)}%`;
}

export function buildFishingRarityTable(luck: number) {
    const builder = chat()
        .text('[ 낚시 등급표 ]\n')
        .icon(AttributeType.LUCK.icon)
        .text(`현재 행운 ${luck.toFixed(1)} 기준\n\n`);
    for (const { rarity, probability } of getFishRarityChances(luck)) {
        builder.color(rarity.color, line => line.weight('bold', text => text.text(`${rarity.label}`)))
            .text(`  ${formatProbability(probability)}\n`);
    }
    return builder
        .color('$text-tertiary', line => line.text('\n장비·미끼·버프로 행운이 변하면 확률도 함께 변합니다.'))
        .build();
}

export function initFishingCommands(): void {
    registerCommand({
        name: '낚시',
        aliases: ['fish', 'f'],
        description: '낚시 가능 구역에서 낚싯대와 미끼를 사용합니다. 미끼 미장착 시 인벤토리 묶음을 자동 장착합니다.',
        showCommandUse: 'private',
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const result = startFishing(player);
            sendBotMessageToUser(userId, result.message);
        },
    });
    registerCommand({
        name: '낚시등급표',
        aliases: ['fishrate', 'fr'],
        description: '현재 행운을 반영한 물고기 등급별 실제 출현 확률을 확인합니다.',
        showCommandUse: 'private',
        information: true,
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            sendBotMessageToUser(
                userId,
                buildFishingRarityTable(player.attribute.get(AttributeType.LUCK)),
            );
        },
    });
}
