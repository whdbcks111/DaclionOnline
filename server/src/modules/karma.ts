import type { ZoneType } from '../../../shared/types.js';
import { GameEventIds, subscribeGameEvent, type GameEvent } from '../models/GameEvent.js';
import { getKarmaHeroReward, getPvpKarmaGain } from '../models/Karma.js';
import Player from '../models/Player.js';
import { StatusEffectType } from '../models/StatusEffect.js';
import { chat } from '../utils/chatBuilder.js';
import logger from '../utils/logger.js';
import { sendBotMessageToUser, sendNotificationToUser } from './message.js';

let initialized = false;

/** PVP 처치 이벤트를 카르마 증가 또는 현상 대상 처치 보상으로 연결한다. */
export function initKarma(): void {
    if (initialized) return;
    initialized = true;
    subscribeGameEvent(GameEventIds.PVP_KILL, handlePvpKill);
}

function handlePvpKill(event: GameEvent): void {
    if (!(event.actor instanceof Player) || !(event.subject instanceof Player)) return;
    const killer = event.actor;
    const victim = event.subject;
    const victimKarma = typeof event.data.victimKarma === 'number'
        ? event.data.victimKarma
        : victim.karma;
    const zoneType = parseZoneType(event.data.zoneType);
    const heroReward = getKarmaHeroReward(victimKarma);

    if (heroReward) {
        const hero = StatusEffectType.fromKey('hero');
        if (!hero) {
            logger.error('영웅 상태효과가 등록되지 않아 현상 대상 처치 보상을 적용하지 못했습니다.');
            return;
        }
        killer.applyStatusEffect(hero, heroReward.durationSeconds, heroReward.level);
        const message = chat()
            .color('gold', b => b.weight('bold', inner => inner.text('영웅의 증표')))
            .text(`  악명 높은 ${victim.name}을(를) 처치해 `)
            .color('lime', b => b.text(`영웅 Lv.${heroReward.level}`))
            .text(` 효과를 ${Math.ceil(heroReward.durationSeconds / 60)}분 동안 얻었습니다.`)
            .build();
        sendBotMessageToUser(killer.userId, message);
        sendNotificationToUser(killer.userId, {
            key: 'karma:hero-reward',
            message: `현상 대상을 처치해 영웅 효과를 얻었습니다! (${Math.ceil(heroReward.durationSeconds / 60)}분)`,
            length: 5_000,
        });
        return;
    }

    const karmaGain = getPvpKarmaGain(zoneType, victimKarma);
    if (karmaGain <= 0) return;
    const changed = killer.addKarma(karmaGain, `karma:pvp-kill-${zoneType}`);
    const message = `플레이어를 처치해 카르마가 ${changed.delta.toFixed(1)} 증가했습니다.`
        + ` (현재 ${changed.value.toFixed(1)} · ${killer.karmaTier.label})`;
    sendBotMessageToUser(killer.userId, chat().color('#dc5868', b => b.text(message)).build());
    sendNotificationToUser(killer.userId, {
        key: 'karma:pvp-kill',
        message,
        length: 5_000,
    });
}

function parseZoneType(value: unknown): ZoneType | 'unknown' {
    return value === 'safe' || value === 'neutral' || value === 'hostile'
        ? value
        : 'unknown';
}
