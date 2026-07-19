import type { CompletionItem } from '../../../shared/types.js';
import { registerCommand } from '../modules/bot.js';
import {
    deleteMessage,
    sendNotificationToUser,
    sendPrivateBotMessageToUser,
} from '../modules/message.js';
import { getOnlinePlayers, getPlayerByUserId } from '../modules/player.js';
import { findOnlinePlayerByIdentity } from '../modules/playerRegistry.js';
import {
    TRADE_INVITATION_TTL_MS,
    tradeManager,
    type TradeEvent,
    type TradeOfferSnapshot,
    type TradeSessionSnapshot,
} from '../modules/trade.js';
import { chat } from '../utils/chatBuilder.js';

const invitationCardIds = new Map<string, Map<number, string>>();
const sessionCardIds = new Map<string, Map<number, string>>();
let presenterInitialized = false;

function sameLocationPlayerCompletions(userId: number): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    if (!player) return [];
    return getOnlinePlayers()
        .filter(target => target.userId !== userId && target.locationId === player.locationId)
        .map(target => ({ value: target.name, description: `ID ${target.userId} · Lv.${target.level}` }));
}

function inventoryCompletions(userId: number): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    return player?.inventory.getIndexedItems().map(({ index, item }) => ({
        value: String(index + 1),
        description: `${item.name} x${item.count}`,
    })) ?? [];
}

function offeredItemCompletions(userId: number): CompletionItem[] {
    const session = tradeManager.getSessionSnapshot(userId);
    const offer = session && (session.first.userId === userId ? session.first : session.second);
    return offer?.items.map((item, index) => ({
        value: String(index + 1),
        description: `${item.name} x${item.count}`,
    })) ?? [];
}

function replaceTrackedCard(
    store: Map<string, Map<number, string>>,
    ownerId: string,
    userId: number,
    content: ReturnType<ReturnType<typeof chat>['build']>,
): void {
    const cards = store.get(ownerId) ?? new Map<number, string>();
    const previous = cards.get(userId);
    if (previous) deleteMessage(previous);
    cards.set(userId, sendPrivateBotMessageToUser(userId, content));
    store.set(ownerId, cards);
}

function removeTrackedCards(store: Map<string, Map<number, string>>, ownerId: string): void {
    const cards = store.get(ownerId);
    if (!cards) return;
    for (const messageId of cards.values()) deleteMessage(messageId);
    store.delete(ownerId);
}

function appendOffer(builder: ReturnType<typeof chat>, offer: TradeOfferSnapshot, viewerUserId: number): void {
    builder.divider(offer.name)
        .color(offer.confirmed ? 'lime' : 'gray', b => b.text(offer.confirmed ? '✓ 거래 확인 완료' : '○ 확인 대기'))
        .text(`  ·  ${offer.gold.toLocaleString()}G\n`);
    if (offer.items.length === 0) {
        builder.color('gray', b => b.text('제안 아이템 없음\n'));
        return;
    }
    offer.items.forEach((item, index) => {
        builder.color('gray', b => b.text(`${index + 1}. `))
            .icon(item.image)
            .text(`${item.name} x${item.count}`);
        if (offer.userId === viewerUserId) {
            builder.text(' ').button(`/거래아이템회수 ${index + 1}`, b => b.text('[전부 회수]'));
        }
        builder.text('\n');
    });
}

function buildTradeCard(session: TradeSessionSnapshot, viewerUserId: number) {
    const viewer = session.first.userId === viewerUserId ? session.first : session.second;
    const player = getPlayerByUserId(viewerUserId);
    const builder = chat()
        .color('gold', b => b.weight('bold', x => x.text('[ 플레이어 거래 ] ')))
        .text(`${session.first.name} ↔ ${session.second.name}\n`);
    appendOffer(builder, session.first, viewerUserId);
    appendOffer(builder, session.second, viewerUserId);
    builder.divider('내 제안 관리')
        .text('골드 총액: ')
        .color('gold', b => b.text(`/거래골드 ${viewer.gold}`))
        .color('gray', b => b.text('  (0 입력 시 전부 회수)\n'));

    const inventory = player?.inventory.getIndexedItems() ?? [];
    if (inventory.length > 0) {
        builder.hide('인벤토리에서 아이템 추가', b => {
            for (const { index, item } of inventory.slice(0, 40)) {
                b.color('gray', x => x.text(`${index + 1}. `))
                    .icon(item.image)
                    .text(`${item.name} x${item.count} `)
                    .button(`/거래아이템추가 ${index + 1} 1`, x => x.text('[1개]'))
                    .text(' ')
                    .button(`/거래아이템추가 ${index + 1} 전체`, x => x.text('[전부]'))
                    .text('\n');
            }
            if (inventory.length > 40) b.color('gray', x => x.text(`외 ${inventory.length - 40}종은 명령어로 추가할 수 있습니다.\n`));
            return b;
        }).text('\n');
    }
    if (viewer.confirmed) {
        builder.button('/거래확인취소', b => b.color('gray', x => x.text('[확인 취소]')));
    } else {
        builder.button('/거래확인', b => b.color('lime', x => x.text('[거래 확인]')));
    }
    builder.text(' ').button('/거래취소', b => b.color('red', x => x.text('[거래 취소]')))
        .text('\n')
        .color('gray', b => b.text('제안을 바꾸면 양쪽 확인이 자동으로 해제됩니다.'));
    return builder.build();
}

function presentTradeEvent(event: TradeEvent): void {
    if (event.type === 'invitation-created') {
        const invitation = event.invitation;
        replaceTrackedCard(invitationCardIds, invitation.id, invitation.inviterUserId, chat()
            .color('gold', b => b.weight('bold', x => x.text('[ 거래 요청 전송 ] ')))
            .text(`${invitation.targetName}님의 응답을 기다립니다.\n`)
            .color('gray', b => b.text(`${Math.floor(TRADE_INVITATION_TTL_MS / 1_000)}초 후 자동 만료됩니다.`))
            .build());
        replaceTrackedCard(invitationCardIds, invitation.id, invitation.targetUserId, chat()
            .color('gold', b => b.weight('bold', x => x.text('[ 거래 요청 ] ')))
            .text(`${invitation.inviterName}님이 거래를 요청했습니다.\n`)
            .button('/거래수락', b => b.color('lime', x => x.text('[수락]')))
            .text(' ')
            .button('/거래거절', b => b.color('red', x => x.text('[거절]')))
            .text(`\n${Math.floor(TRADE_INVITATION_TTL_MS / 1_000)}초 안에 응답해주세요.`)
            .build());
        sendNotificationToUser(invitation.targetUserId, {
            key: 'trade-invitation', message: `${invitation.inviterName}님의 거래 요청이 도착했습니다.`, length: 3000,
        });
        return;
    }
    if (event.type === 'invitation-ended') {
        removeTrackedCards(invitationCardIds, event.invitation.id);
        if (event.message) {
            for (const userId of [event.invitation.inviterUserId, event.invitation.targetUserId]) {
                sendPrivateBotMessageToUser(userId, event.message);
            }
        }
        return;
    }
    if (event.type === 'session-updated') {
        for (const userId of [event.session.first.userId, event.session.second.userId]) {
            replaceTrackedCard(sessionCardIds, event.session.id, userId, buildTradeCard(event.session, userId));
        }
        return;
    }
    removeTrackedCards(sessionCardIds, event.sessionId);
    for (const userId of event.userIds) {
        sendPrivateBotMessageToUser(userId, event.message);
        sendNotificationToUser(userId, {
            key: 'trade-result', message: event.message, length: 3200,
        });
    }
}

function ensureTradePresenter(): void {
    if (presenterInitialized) return;
    presenterInitialized = true;
    tradeManager.subscribe(presentTradeEvent);
}

function report(userId: number, result: { success: boolean; reason?: string }): void {
    if (!result.success) sendPrivateBotMessageToUser(userId, result.reason ?? '거래 작업을 처리하지 못했습니다.');
}

function parseCount(input: string | undefined, maximum: number, defaultCount: number): number | undefined {
    if (!input) return defaultCount;
    if (input === '전체' || input.toLowerCase() === 'all') return maximum;
    const count = Number(input);
    return Number.isSafeInteger(count) && count > 0 ? count : undefined;
}

export function initTradeCommands(): void {
    ensureTradePresenter();

    registerCommand({
        name: '거래요청', aliases: ['traderequest', 'tr'], description: '같은 장소의 플레이어에게 거래를 요청합니다.',
        showCommandUse: 'hide',
        args: [{
            name: '고유번호 또는 닉네임', description: '거래할 같은 장소의 온라인 플레이어', required: true, isText: true,
            completions: sameLocationPlayerCompletions,
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            const target = findOnlinePlayerByIdentity(args[0] ?? '');
            if (!player) return;
            if (!target) { sendPrivateBotMessageToUser(userId, '해당 온라인 플레이어를 찾을 수 없습니다.'); return; }
            report(userId, tradeManager.invite(player, target));
        },
    });

    registerCommand({
        name: '거래수락', aliases: ['tradeaccept', 'ta'], description: '받은 거래 요청을 수락합니다.', showCommandUse: 'hide',
        handler(userId) { const player = getPlayerByUserId(userId); if (player) report(userId, tradeManager.accept(player)); },
    });
    registerCommand({
        name: '거래거절', aliases: ['tradedecline', 'td'], description: '받은 거래 요청을 거절합니다.', showCommandUse: 'hide',
        handler(userId) { const player = getPlayerByUserId(userId); if (player) report(userId, tradeManager.decline(player)); },
    });
    registerCommand({
        name: '거래정보', aliases: ['tradeinfo', 'ti'], description: '현재 거래 카드를 최신 정보로 다시 표시합니다.', showCommandUse: 'hide',
        handler(userId) {
            const session = tradeManager.getSessionSnapshot(userId);
            if (!session) { sendPrivateBotMessageToUser(userId, '진행 중인 거래가 없습니다.'); return; }
            replaceTrackedCard(sessionCardIds, session.id, userId, buildTradeCard(session, userId));
        },
    });
    registerCommand({
        name: '거래아이템추가', aliases: ['tradeitemadd', 'tia'], description: '인벤토리 아이템을 거래 제안에 추가합니다.', showCommandUse: 'hide',
        args: [
            { name: '인벤토리 번호', description: '추가할 아이템', required: true, completions: inventoryCompletions },
            { name: '개수', description: '추가할 개수 또는 전체', required: false },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const index = Number(args[0]) - 1;
            const item = player.inventory.getItemByIndex(index);
            const count = item && parseCount(args[1], item.count, 1);
            if (!item || count === undefined) { sendPrivateBotMessageToUser(userId, '유효한 인벤토리 번호와 개수를 입력해주세요.'); return; }
            report(userId, tradeManager.addItem(player, index, count));
        },
    });
    registerCommand({
        name: '거래아이템회수', aliases: ['tradeitemremove', 'tir'], description: '내 거래 제안의 아이템을 회수합니다.', showCommandUse: 'hide',
        args: [
            { name: '거래 아이템 번호', description: '회수할 제안 아이템', required: true, completions: offeredItemCompletions },
            { name: '개수', description: '회수할 개수, 생략 시 전부', required: false },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            const session = tradeManager.getSessionSnapshot(userId);
            if (!player || !session) { sendPrivateBotMessageToUser(userId, '진행 중인 거래가 없습니다.'); return; }
            const offer = session.first.userId === userId ? session.first : session.second;
            const index = Number(args[0]) - 1;
            const item = offer.items[index];
            const count = item && parseCount(args[1], item.count, item.count);
            if (!item || count === undefined) { sendPrivateBotMessageToUser(userId, '유효한 거래 아이템 번호와 개수를 입력해주세요.'); return; }
            report(userId, tradeManager.removeItem(player, index, count));
        },
    });
    registerCommand({
        name: '거래골드', aliases: ['tradegold', 'tg'], description: '내가 제안할 골드의 총액을 설정합니다. 0이면 전부 회수합니다.', showCommandUse: 'hide',
        args: [{ name: '총액', description: '새로 제안할 골드 총액', required: true }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (player) report(userId, tradeManager.setGold(player, Number(args[0])));
        },
    });
    registerCommand({
        name: '거래확인', aliases: ['tradeconfirm', 'tc'], description: '현재 거래 내용을 확인합니다. 양쪽이 확인하면 즉시 완료됩니다.', showCommandUse: 'hide',
        handler(userId) { const player = getPlayerByUserId(userId); if (player) report(userId, tradeManager.confirm(player)); },
    });
    registerCommand({
        name: '거래확인취소', aliases: ['tradeunconfirm', 'tcc'], description: '거래 확인을 철회합니다.', showCommandUse: 'hide',
        handler(userId) { const player = getPlayerByUserId(userId); if (player) report(userId, tradeManager.unconfirm(player)); },
    });
    registerCommand({
        name: '거래취소', aliases: ['tradecancel', 'tx'], description: '거래를 취소하고 제안한 아이템과 골드를 돌려받습니다.', showCommandUse: 'hide',
        handler(userId) { const player = getPlayerByUserId(userId); if (player) report(userId, tradeManager.cancel(player)); },
    });
}
