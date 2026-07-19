import type Player from '../models/Player.js';
import {
    canStackItemSnapshots,
    getItemSnapshotDisplay,
    type ItemSnapshot,
} from '../models/Item.js';
import logger from '../utils/logger.js';

export const TRADE_INVITATION_TTL_MS = 30_000;
export const TRADE_SESSION_TTL_MS = 10 * 60_000;

interface TradeOffer {
    readonly player: Player;
    items: ItemSnapshot[];
    gold: number;
    confirmed: boolean;
}

interface TradeInvitation {
    readonly id: string;
    readonly inviter: Player;
    readonly target: Player;
    readonly expiresAt: number;
}

interface TradeSession {
    readonly id: string;
    readonly first: TradeOffer;
    readonly second: TradeOffer;
    readonly createdAt: number;
    readonly expiresAt: number;
}

export interface TradeOfferItemSnapshot extends ItemSnapshot {
    readonly name: string;
    readonly image: string;
}

export interface TradeOfferSnapshot {
    readonly userId: number;
    readonly name: string;
    readonly items: readonly TradeOfferItemSnapshot[];
    readonly gold: number;
    readonly confirmed: boolean;
}

export interface TradeSessionSnapshot {
    readonly id: string;
    readonly first: TradeOfferSnapshot;
    readonly second: TradeOfferSnapshot;
    readonly expiresAt: number;
}

export interface TradeInvitationSnapshot {
    readonly id: string;
    readonly inviterUserId: number;
    readonly inviterName: string;
    readonly targetUserId: number;
    readonly targetName: string;
    readonly expiresAt: number;
}

export type TradeEvent =
    | { type: 'invitation-created'; invitation: TradeInvitationSnapshot }
    | { type: 'invitation-ended'; invitation: TradeInvitationSnapshot; message?: string }
    | { type: 'session-updated'; session: TradeSessionSnapshot }
    | { type: 'session-ended'; sessionId: string; userIds: readonly number[]; message: string; completed: boolean };

export interface TradeResult {
    readonly success: boolean;
    readonly reason?: string;
}

type TradeEventHandler = (event: TradeEvent) => void;

function cloneItemSnapshot(snapshot: ItemSnapshot, count = snapshot.count): ItemSnapshot {
    return {
        itemDataId: snapshot.itemDataId,
        count,
        durability: snapshot.durability,
        metadataDelta: snapshot.metadataDelta ? { ...snapshot.metadataDelta } : null,
        tags: [...snapshot.tags],
    };
}

function offerSnapshot(offer: TradeOffer): TradeOfferSnapshot {
    return {
        userId: offer.player.userId,
        name: offer.player.name,
        items: offer.items.map(item => ({ ...cloneItemSnapshot(item), ...getItemSnapshotDisplay(item) })),
        gold: offer.gold,
        confirmed: offer.confirmed,
    };
}

function invitationSnapshot(invitation: TradeInvitation): TradeInvitationSnapshot {
    return {
        id: invitation.id,
        inviterUserId: invitation.inviter.userId,
        inviterName: invitation.inviter.name,
        targetUserId: invitation.target.userId,
        targetName: invitation.target.name,
        expiresAt: invitation.expiresAt,
    };
}

export class TradeManager {
    private readonly invitations = new Map<string, TradeInvitation>();
    private readonly sessionsByUserId = new Map<number, TradeSession>();
    private readonly handlers = new Set<TradeEventHandler>();
    private nextId = 1;

    subscribe(handler: TradeEventHandler): () => void {
        this.handlers.add(handler);
        return () => { this.handlers.delete(handler); };
    }

    hasActiveSession(userId: number): boolean {
        return this.sessionsByUserId.has(userId);
    }

    getSessionSnapshot(userId: number): TradeSessionSnapshot | undefined {
        const session = this.sessionsByUserId.get(userId);
        return session ? this.snapshotSession(session) : undefined;
    }

    invite(inviter: Player, target: Player, now = Date.now()): TradeResult {
        const reason = this.validatePair(inviter, target);
        if (reason) return { success: false, reason };
        if (this.findInvitationFor(inviter.userId) || this.findInvitationFor(target.userId)) {
            return { success: false, reason: '두 사람 중 한 명에게 이미 처리 중인 거래 요청이 있습니다.' };
        }
        const invitation: TradeInvitation = {
            id: `trade-request-${now.toString(36)}-${this.nextId++}`,
            inviter,
            target,
            expiresAt: now + TRADE_INVITATION_TTL_MS,
        };
        this.invitations.set(invitation.id, invitation);
        this.emit({ type: 'invitation-created', invitation: invitationSnapshot(invitation) });
        return { success: true };
    }

    accept(target: Player, now = Date.now()): TradeResult {
        const invitation = this.findInvitationTo(target.userId);
        if (!invitation) return { success: false, reason: '받은 거래 요청이 없습니다.' };
        const reason = now >= invitation.expiresAt
            ? '거래 요청이 만료되었습니다.'
            : this.validatePair(invitation.inviter, target);
        if (reason) {
            this.endInvitation(invitation, reason);
            return { success: false, reason };
        }
        this.endInvitation(invitation);
        const session: TradeSession = {
            id: `trade-${now.toString(36)}-${this.nextId++}`,
            first: { player: invitation.inviter, items: [], gold: 0, confirmed: false },
            second: { player: target, items: [], gold: 0, confirmed: false },
            createdAt: now,
            expiresAt: now + TRADE_SESSION_TTL_MS,
        };
        this.sessionsByUserId.set(session.first.player.userId, session);
        this.sessionsByUserId.set(session.second.player.userId, session);
        this.emitUpdated(session);
        return { success: true };
    }

    decline(target: Player): TradeResult {
        const invitation = this.findInvitationTo(target.userId);
        if (!invitation) return { success: false, reason: '받은 거래 요청이 없습니다.' };
        this.endInvitation(invitation, `${target.name}님이 거래 요청을 거절했습니다.`);
        return { success: true };
    }

    addItem(player: Player, inventoryIndex: number, count: number): TradeResult {
        const session = this.sessionsByUserId.get(player.userId);
        if (!session) return { success: false, reason: '진행 중인 거래가 없습니다.' };
        const item = player.inventory.getItemByIndex(inventoryIndex);
        if (!item) return { success: false, reason: '해당 인벤토리 번호에 아이템이 없습니다.' };
        if (!Number.isSafeInteger(count) || count <= 0 || count > item.count) {
            return { success: false, reason: `추가 개수는 1~${item.count} 사이여야 합니다.` };
        }
        const snapshot = item.snapshot(count);
        if (!player.inventory.removeItemInstance(item, count)) {
            return { success: false, reason: '아이템을 거래 제안으로 옮기지 못했습니다.' };
        }
        const offer = this.offerFor(session, player.userId)!;
        const stacked = offer.items.find(existing => canStackItemSnapshots(existing, snapshot));
        if (stacked) stacked.count += count;
        else offer.items.push(cloneItemSnapshot(snapshot));
        this.resetConfirmations(session);
        this.emitUpdated(session);
        return { success: true };
    }

    removeItem(player: Player, offerIndex: number, count?: number): TradeResult {
        const session = this.sessionsByUserId.get(player.userId);
        if (!session) return { success: false, reason: '진행 중인 거래가 없습니다.' };
        const offer = this.offerFor(session, player.userId)!;
        const offered = offer.items[offerIndex];
        if (!offered) return { success: false, reason: '해당 거래 아이템 번호가 없습니다.' };
        const amount = count ?? offered.count;
        if (!Number.isSafeInteger(amount) || amount <= 0 || amount > offered.count) {
            return { success: false, reason: `회수 개수는 1~${offered.count} 사이여야 합니다.` };
        }
        const returning = cloneItemSnapshot(offered, amount);
        if (!player.inventory.addItemSnapshot(returning)) {
            return { success: false, reason: '인벤토리 중량이 부족해 제안 아이템을 회수할 수 없습니다.' };
        }
        offered.count -= amount;
        if (offered.count === 0) offer.items.splice(offerIndex, 1);
        this.resetConfirmations(session);
        this.emitUpdated(session);
        return { success: true };
    }

    /** 추가/회수 대신 현재 제안할 골드 총액을 한 번에 설정한다. */
    setGold(player: Player, amount: number): TradeResult {
        const session = this.sessionsByUserId.get(player.userId);
        if (!session) return { success: false, reason: '진행 중인 거래가 없습니다.' };
        if (!Number.isSafeInteger(amount) || amount < 0) {
            return { success: false, reason: '거래 골드는 0 이상의 정수로 입력해주세요.' };
        }
        const offer = this.offerFor(session, player.userId)!;
        const delta = amount - offer.gold;
        if (delta > player.gold) return { success: false, reason: '보유 골드가 부족합니다.' };
        player.gold -= delta;
        offer.gold = amount;
        this.resetConfirmations(session);
        this.emitUpdated(session);
        return { success: true };
    }

    confirm(player: Player): TradeResult {
        const session = this.sessionsByUserId.get(player.userId);
        if (!session) return { success: false, reason: '진행 중인 거래가 없습니다.' };
        const offer = this.offerFor(session, player.userId)!;
        if (offer.confirmed) return { success: false, reason: '이미 거래 내용을 확인했습니다.' };
        offer.confirmed = true;
        if (!session.first.confirmed || !session.second.confirmed) {
            this.emitUpdated(session);
            return { success: true };
        }
        const capacityReason = this.validateReceiveCapacity(session);
        if (capacityReason) {
            this.resetConfirmations(session);
            this.emitUpdated(session);
            return { success: false, reason: capacityReason };
        }
        this.complete(session);
        return { success: true };
    }

    unconfirm(player: Player): TradeResult {
        const session = this.sessionsByUserId.get(player.userId);
        if (!session) return { success: false, reason: '진행 중인 거래가 없습니다.' };
        const offer = this.offerFor(session, player.userId)!;
        if (!offer.confirmed) return { success: false, reason: '아직 거래 내용을 확인하지 않았습니다.' };
        offer.confirmed = false;
        this.emitUpdated(session);
        return { success: true };
    }

    cancel(player: Player, reason = `${player.name}님이 거래를 취소했습니다.`): TradeResult {
        const session = this.sessionsByUserId.get(player.userId);
        if (!session) return { success: false, reason: '진행 중인 거래가 없습니다.' };
        this.cancelSession(session, reason);
        return { success: true };
    }

    cancelForPlayer(player: Player, reason: string): void {
        for (const invitation of [...this.invitations.values()]) {
            if (invitation.inviter.userId === player.userId || invitation.target.userId === player.userId) {
                this.endInvitation(invitation, reason);
            }
        }
        const session = this.sessionsByUserId.get(player.userId);
        if (session) this.cancelSession(session, reason);
    }

    update(activePlayers: readonly Player[], now = Date.now()): void {
        const activeIds = new Set(activePlayers.map(player => player.userId));
        for (const invitation of [...this.invitations.values()]) {
            const invalid = now >= invitation.expiresAt
                || !activeIds.has(invitation.inviter.userId)
                || !activeIds.has(invitation.target.userId)
                || invitation.inviter.isDefeated
                || invitation.target.isDefeated
                || invitation.inviter.locationId !== invitation.target.locationId;
            if (invalid) this.endInvitation(invitation, '거래 요청이 만료되었거나 조건을 만족하지 않아 취소되었습니다.');
        }
        const unique = new Set(this.sessionsByUserId.values());
        for (const session of unique) {
            const invalid = now >= session.expiresAt
                || !activeIds.has(session.first.player.userId)
                || !activeIds.has(session.second.player.userId)
                || session.first.player.isDefeated
                || session.second.player.isDefeated
                || session.first.player.locationId !== session.second.player.locationId;
            if (invalid) this.cancelSession(session, '접속·생존·장소 조건이 달라져 거래가 자동으로 취소되었습니다.');
        }
    }

    private validatePair(first: Player, second: Player): string | undefined {
        if (first === second || first.userId === second.userId) return '자기 자신과는 거래할 수 없습니다.';
        if (first.isDefeated || second.isDefeated) return '생존한 플레이어끼리만 거래할 수 있습니다.';
        if (first.locationId !== second.locationId) return '같은 장소에 있는 플레이어와만 거래할 수 있습니다.';
        if (this.hasActiveSession(first.userId) || this.hasActiveSession(second.userId)) {
            return '두 사람 중 한 명이 이미 거래 중입니다.';
        }
        return undefined;
    }

    private validateReceiveCapacity(session: TradeSession): string | undefined {
        if (!session.first.player.inventory.canAddSnapshots(session.second.items)) {
            return `${session.first.player.name}님의 인벤토리 중량이 부족합니다.`;
        }
        if (!session.second.player.inventory.canAddSnapshots(session.first.items)) {
            return `${session.second.player.name}님의 인벤토리 중량이 부족합니다.`;
        }
        return undefined;
    }

    private complete(session: TradeSession): void {
        for (const item of session.second.items) session.first.player.inventory.addItemSnapshot(item);
        for (const item of session.first.items) session.second.player.inventory.addItemSnapshot(item);
        session.first.player.gold += session.second.gold;
        session.second.player.gold += session.first.gold;
        session.first.items = [];
        session.second.items = [];
        session.first.gold = 0;
        session.second.gold = 0;
        this.removeSession(session);
        void Promise.all([session.first.player.save(), session.second.player.save()])
            .catch(error => logger.error('완료된 거래 즉시 저장 실패:', error));
        this.emit({
            type: 'session-ended',
            sessionId: session.id,
            userIds: [session.first.player.userId, session.second.player.userId],
            message: '양쪽 확인이 완료되어 거래가 성사되었습니다.',
            completed: true,
        });
    }

    private cancelSession(session: TradeSession, reason: string): void {
        for (const offer of [session.first, session.second]) {
            offer.player.gold += offer.gold;
            offer.gold = 0;
            for (const item of offer.items) {
                offer.player.inventory.restoreItemSnapshot(item);
            }
            offer.items = [];
        }
        this.removeSession(session);
        this.emit({
            type: 'session-ended',
            sessionId: session.id,
            userIds: [session.first.player.userId, session.second.player.userId],
            message: reason,
            completed: false,
        });
    }

    private resetConfirmations(session: TradeSession): void {
        session.first.confirmed = false;
        session.second.confirmed = false;
    }

    private offerFor(session: TradeSession, userId: number): TradeOffer | undefined {
        if (session.first.player.userId === userId) return session.first;
        if (session.second.player.userId === userId) return session.second;
        return undefined;
    }

    private findInvitationFor(userId: number): TradeInvitation | undefined {
        return [...this.invitations.values()].find(invitation =>
            invitation.inviter.userId === userId || invitation.target.userId === userId);
    }

    private findInvitationTo(userId: number): TradeInvitation | undefined {
        return [...this.invitations.values()].find(invitation => invitation.target.userId === userId);
    }

    private endInvitation(invitation: TradeInvitation, message?: string): void {
        this.invitations.delete(invitation.id);
        this.emit({ type: 'invitation-ended', invitation: invitationSnapshot(invitation), ...(message ? { message } : {}) });
    }

    private snapshotSession(session: TradeSession): TradeSessionSnapshot {
        return {
            id: session.id,
            first: offerSnapshot(session.first),
            second: offerSnapshot(session.second),
            expiresAt: session.expiresAt,
        };
    }

    private emitUpdated(session: TradeSession): void {
        this.emit({ type: 'session-updated', session: this.snapshotSession(session) });
    }

    private removeSession(session: TradeSession): void {
        this.sessionsByUserId.delete(session.first.player.userId);
        this.sessionsByUserId.delete(session.second.player.userId);
    }

    private emit(event: TradeEvent): void {
        for (const handler of [...this.handlers]) handler(event);
    }
}

export const tradeManager = new TradeManager();
