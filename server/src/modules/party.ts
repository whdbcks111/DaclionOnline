import type { PartyHudData, ShieldBarSegment } from '../../../shared/types.js';
import { getOnlinePlayer } from './playerRegistry.js';
import { isUserOnline } from './login.js';

export const PARTY_MAX_MEMBERS = 5;
export const PARTY_INVITATION_TTL_MS = 60_000;

export interface PartyParticipant {
    readonly userId: number;
    readonly name: string;
    readonly level: number;
    readonly locationId: string;
    readonly isDefeated: boolean;
    readonly life: number;
    readonly maxLife: number;
    getShieldBarSegments?(): ShieldBarSegment[];
    readonly mentality: number;
    readonly maxMentality: number;
    readonly maxExp: number;
    gainExp(amount: number): number[];
}

export interface PartySnapshot {
    id: string;
    leaderUserId: number;
    memberUserIds: number[];
}

export interface PartyInvitationSnapshot {
    inviterUserId: number;
    targetUserId: number;
    expiresAt: number;
}

export interface PartyActionResult {
    success: boolean;
    reason?: string;
    party?: PartySnapshot;
    invitation?: PartyInvitationSnapshot;
    affectedUserIds?: number[];
}

export interface PartyExpGrant {
    userId: number;
    nickname: string;
    amount: number;
    levelGap: number;
    multiplier: number;
    levelsGained: number[];
}

interface PartyState {
    id: string;
    leaderUserId: number;
    memberUserIds: number[];
}

interface PartyInvitationState {
    inviterUserId: number;
    targetUserId: number;
    expiresAt: number;
}

type PlayerResolver = (userId: number) => PartyParticipant | undefined;

/** 파티의 초대·구성·보상 대상을 소유하는 비영속 런타임 매니저. */
function resolveOnlinePlayer(userId: number): PartyParticipant | undefined {
    return isUserOnline(userId) ? getOnlinePlayer(userId) : undefined;
}

export class PartyManager {
    private readonly parties = new Map<string, PartyState>();
    private readonly partyIdByMember = new Map<number, string>();
    private readonly invitationsByTarget = new Map<number, PartyInvitationState>();
    private nextPartyId = 1;

    constructor(private readonly resolvePlayer: PlayerResolver = resolveOnlinePlayer) {}

    getParty(playerOrUserId: PartyParticipant | number): PartySnapshot | undefined {
        const userId = typeof playerOrUserId === 'number' ? playerOrUserId : playerOrUserId.userId;
        const party = this.getPartyState(userId);
        return party ? this.toSnapshot(party) : undefined;
    }

    areInSameParty(leftUserId: number, rightUserId: number): boolean {
        const partyId = this.partyIdByMember.get(leftUserId);
        return Boolean(partyId && partyId === this.partyIdByMember.get(rightUserId));
    }

    getInvitation(targetUserId: number, now = Date.now()): PartyInvitationSnapshot | undefined {
        this.pruneExpiredInvitations(now);
        const invitation = this.invitationsByTarget.get(targetUserId);
        return invitation ? { ...invitation } : undefined;
    }

    invite(inviter: PartyParticipant, target: PartyParticipant, now = Date.now()): PartyActionResult {
        this.pruneExpiredInvitations(now);
        if (inviter.userId === target.userId) return failure('자기 자신은 파티에 초대할 수 없습니다.');
        if (this.getPartyState(target.userId)) return failure('대상은 이미 파티에 소속되어 있습니다.');

        const inviterParty = this.getPartyState(inviter.userId);
        if (inviterParty && inviterParty.leaderUserId !== inviter.userId) {
            return failure('파티장만 파티원을 초대할 수 있습니다.');
        }
        if (inviterParty && inviterParty.memberUserIds.length >= PARTY_MAX_MEMBERS) {
            return failure(`파티 정원은 최대 ${PARTY_MAX_MEMBERS}명입니다.`);
        }
        if (this.invitationsByTarget.has(target.userId)) {
            return failure('대상에게 이미 처리 대기 중인 파티 초대가 있습니다.');
        }

        const invitation = {
            inviterUserId: inviter.userId,
            targetUserId: target.userId,
            expiresAt: now + PARTY_INVITATION_TTL_MS,
        };
        this.invitationsByTarget.set(target.userId, invitation);
        return { success: true, invitation: { ...invitation } };
    }

    accept(target: PartyParticipant, now = Date.now()): PartyActionResult {
        this.pruneExpiredInvitations(now);
        const invitation = this.invitationsByTarget.get(target.userId);
        if (!invitation) return failure('수락할 파티 초대가 없습니다.');
        this.invitationsByTarget.delete(target.userId);
        if (this.getPartyState(target.userId)) return failure('이미 파티에 소속되어 있습니다.');

        const inviter = this.resolvePlayer(invitation.inviterUserId);
        if (!inviter) return failure('초대한 플레이어가 오프라인입니다.');
        let party = this.getPartyState(inviter.userId);
        if (party && party.leaderUserId !== inviter.userId) {
            return failure('초대한 플레이어가 더 이상 파티장이 아닙니다.');
        }
        if (party && party.memberUserIds.length >= PARTY_MAX_MEMBERS) {
            return failure(`파티 정원은 최대 ${PARTY_MAX_MEMBERS}명입니다.`);
        }
        if (!party) {
            party = {
                id: `party-${this.nextPartyId++}`,
                leaderUserId: inviter.userId,
                memberUserIds: [inviter.userId],
            };
            this.parties.set(party.id, party);
            this.partyIdByMember.set(inviter.userId, party.id);
        }
        party.memberUserIds.push(target.userId);
        this.partyIdByMember.set(target.userId, party.id);
        this.clearInvitationsFrom(target.userId);
        return { success: true, party: this.toSnapshot(party), affectedUserIds: [...party.memberUserIds] };
    }

    decline(targetUserId: number, now = Date.now()): PartyActionResult {
        this.pruneExpiredInvitations(now);
        const invitation = this.invitationsByTarget.get(targetUserId);
        if (!invitation) return failure('거절할 파티 초대가 없습니다.');
        this.invitationsByTarget.delete(targetUserId);
        return { success: true, invitation: { ...invitation }, affectedUserIds: [invitation.inviterUserId, targetUserId] };
    }

    leave(member: PartyParticipant): PartyActionResult {
        const party = this.getPartyState(member.userId);
        if (!party) return failure('파티에 소속되어 있지 않습니다.');
        const affectedUserIds = [...party.memberUserIds];
        this.removeMember(party, member.userId);
        return { success: true, party: this.parties.has(party.id) ? this.toSnapshot(party) : undefined, affectedUserIds };
    }

    disband(leader: PartyParticipant): PartyActionResult {
        const party = this.getPartyState(leader.userId);
        if (!party) return failure('파티에 소속되어 있지 않습니다.');
        if (party.leaderUserId !== leader.userId) return failure('파티장만 파티를 해산할 수 있습니다.');
        const affectedUserIds = [...party.memberUserIds];
        this.deleteParty(party);
        return { success: true, affectedUserIds };
    }

    kick(leader: PartyParticipant, target: PartyParticipant): PartyActionResult {
        const party = this.getPartyState(leader.userId);
        if (!party) return failure('파티에 소속되어 있지 않습니다.');
        if (party.leaderUserId !== leader.userId) return failure('파티장만 파티원을 강퇴할 수 있습니다.');
        if (target.userId === leader.userId) return failure('자기 자신은 강퇴할 수 없습니다. 파티나가기 또는 파티해산을 사용하세요.');
        if (this.partyIdByMember.get(target.userId) !== party.id) return failure('같은 파티원이 아닙니다.');
        const affectedUserIds = [...party.memberUserIds];
        this.removeMember(party, target.userId);
        return { success: true, party: this.parties.has(party.id) ? this.toSnapshot(party) : undefined, affectedUserIds };
    }

    /** 실제 unload 때 파티와 자신이 보낸/받은 초대를 함께 정리한다. */
    removeDisconnectedPlayer(player: PartyParticipant): PartyActionResult | undefined {
        this.invitationsByTarget.delete(player.userId);
        this.clearInvitationsFrom(player.userId);
        return this.getPartyState(player.userId) ? this.leave(player) : undefined;
    }

    /** 몬스터 경험치를 같은 장소의 생존 파티원에게 지급하고 적용 결과만 반환한다. */
    distributeMonsterExp(killer: PartyParticipant, baseExp: number, locationId: string): PartyExpGrant[] {
        const normalizedExp = Math.max(0, Math.floor(baseExp));
        const party = this.getPartyState(killer.userId);
        const participants = party
            ? party.memberUserIds
                .flatMap(userId => {
                    const player = this.resolvePlayer(userId);
                    return player && player.locationId === locationId && !player.isDefeated ? [player] : [];
                })
            : [killer];
        if (!participants.some(player => player.userId === killer.userId)) participants.push(killer);
        const highestLevel = Math.max(...participants.map(player => player.level));

        return participants.map(player => {
            const levelGap = Math.max(0, highestLevel - player.level);
            const { amount, multiplier } = calculatePartyExpGrant(normalizedExp, levelGap, player.maxExp);
            return {
                userId: player.userId,
                nickname: player.name,
                amount,
                levelGap,
                multiplier,
                levelsGained: player.gainExp(amount),
            };
        });
    }

    getHudData(viewer: PartyParticipant): PartyHudData | null {
        const party = this.getPartyState(viewer.userId);
        if (!party) return null;
        return {
            partyId: party.id,
            leaderUserId: party.leaderUserId,
            members: party.memberUserIds.flatMap(userId => {
                const member = this.resolvePlayer(userId);
                return member ? [{
                    userId: member.userId,
                    nickname: member.name,
                    level: member.level,
                    life: member.life,
                    maxLife: member.maxLife,
                    shields: member.getShieldBarSegments?.() ?? [],
                    mentality: member.mentality,
                    maxMentality: member.maxMentality,
                    isLeader: member.userId === party.leaderUserId,
                    sameLocation: member.locationId === viewer.locationId,
                }] : [];
            }),
        };
    }

    private getPartyState(userId: number): PartyState | undefined {
        const id = this.partyIdByMember.get(userId);
        return id ? this.parties.get(id) : undefined;
    }

    private removeMember(party: PartyState, userId: number): void {
        party.memberUserIds = party.memberUserIds.filter(memberId => memberId !== userId);
        this.partyIdByMember.delete(userId);
        this.invitationsByTarget.delete(userId);
        this.clearInvitationsFrom(userId);
        if (party.memberUserIds.length < 2) {
            this.deleteParty(party);
            return;
        }
        if (party.leaderUserId === userId) party.leaderUserId = party.memberUserIds[0];
    }

    private deleteParty(party: PartyState): void {
        this.parties.delete(party.id);
        for (const userId of party.memberUserIds) this.partyIdByMember.delete(userId);
        for (const invitation of [...this.invitationsByTarget.values()]) {
            if (party.memberUserIds.includes(invitation.inviterUserId)) {
                this.invitationsByTarget.delete(invitation.targetUserId);
            }
        }
    }

    private clearInvitationsFrom(inviterUserId: number): void {
        for (const invitation of [...this.invitationsByTarget.values()]) {
            if (invitation.inviterUserId === inviterUserId) this.invitationsByTarget.delete(invitation.targetUserId);
        }
    }

    private pruneExpiredInvitations(now: number): void {
        for (const invitation of [...this.invitationsByTarget.values()]) {
            if (invitation.expiresAt <= now) this.invitationsByTarget.delete(invitation.targetUserId);
        }
    }

    private toSnapshot(party: PartyState): PartySnapshot {
        return { id: party.id, leaderUserId: party.leaderUserId, memberUserIds: [...party.memberUserIds] };
    }
}

export function calculatePartyExpGrant(baseExp: number, levelGap: number, maxExp: number): { amount: number; multiplier: number } {
    const multiplier = levelGap >= 30 ? 0.1 : levelGap >= 20 ? 0.2 : levelGap >= 10 ? 0.5 : 1;
    let amount = Math.max(0, Math.floor(baseExp * multiplier));
    if (levelGap >= 30) amount = Math.min(amount, Math.max(0, Math.floor(maxExp * 0.1)));
    return { amount, multiplier };
}

function failure(reason: string): PartyActionResult {
    return { success: false, reason };
}

export const partyManager = new PartyManager();
