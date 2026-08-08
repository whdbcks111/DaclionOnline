import type Player from '../../models/actors/Player.js';
import NPC from '../../models/actors/NPC.js';
import { GameEventIds, subscribeGameEvent, type GameEvent } from '../../models/core/GameEvent.js';
import {
    awardNpcFavor,
    type NpcFavorAwardResult,
} from '../../models/progression/NpcRelationship.js';
import { sendBotMessageToUser, sendNotificationToUser } from '../communication/message.js';
import { chat } from '../../utils/chatBuilder.js';

let eventUnsubscribers: Array<() => void> = [];

function resolvePlayer(event: GameEvent): Player | undefined {
    const owner = event.actor?.attackOwner;
    return owner?.isPlayer && 'progress' in owner ? owner as Player : undefined;
}

function notifyFavor(player: Player, result: NpcFavorAwardResult): void {
    if (result.gained <= 0) return;
    const snapshot = result.snapshot;
    const message = `${snapshot.npcName} 호감도 +${result.gained} (${snapshot.favor}/${snapshot.maxFavor})`;
    sendNotificationToUser(player.userId, {
        key: `npc-favor:${snapshot.npcId}`,
        message,
        length: 2_500,
    });
    if (!result.tierChanged && !result.maxRewardGranted) return;
    const builder = chat()
        .color('gold', nested => nested.weight('bold', inner => inner.text(
            `🤝 ${snapshot.npcName} 관계가 [${snapshot.tierLabel}] 단계가 되었습니다.`,
        )));
    if (result.maxRewardGranted) {
        builder.text('\n진심의 답례로 Gold 25,000과 대용량 체력·마나 포션 3개씩을 받았습니다.')
            .color('$text-tertiary', nested => nested.text('\n제작 의뢰 보상이 최대 1.5배로 증가합니다.'));
    }
    sendBotMessageToUser(player.userId, builder.build());
}

function recordDialogueFavor(event: GameEvent): void {
    const player = resolvePlayer(event);
    const npcId = event.data.npcId;
    const npc = typeof npcId === 'string' ? NPC.getNpc(npcId) : undefined;
    if (!player || !npc) return;
    notifyFavor(player, awardNpcFavor(
        player,
        npc,
        event.id === GameEventIds.NPC_DIALOGUE_STARTED ? 2 : 1,
    ));
}

export function initNpcRelationshipEventTracking(): void {
    if (eventUnsubscribers.length > 0) return;
    eventUnsubscribers = [
        subscribeGameEvent(GameEventIds.NPC_DIALOGUE_STARTED, recordDialogueFavor),
        subscribeGameEvent(GameEventIds.NPC_DIALOGUE_CHOICE, recordDialogueFavor),
    ];
}

export function resetNpcRelationshipEventTracking(): void {
    for (const unsubscribe of eventUnsubscribers) unsubscribe();
    eventUnsubscribers = [];
}
