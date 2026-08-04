import type { PartyHudData, ShieldBarSegment } from '../../../shared/types.js';
import { getOnlinePlayer } from './playerRegistry.js';
import { isUserOnline } from './login.js';

export const PARTY_MAX_MEMBERS = 5;
export const PARTY_INVITATION_TTL_MS = 60_000;

export interface PartyExperienceGainOptions {
    readonly protectFromPendingDeathPenalty?: boolean;
}

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
    getExperienceGainModifier(): number;
    gainExp(amount: number, options?: PartyExperienceGainOptions): number[];
}

export interface PartyMonsterContribution {
    readonly userId: number;
    readonly total: number;
}

/** 몬스터가 reset 전에 복사해 전달하는 Entity 참조 없는 처치 보상 문맥. */
export interface PartyMonsterExpContext {
    readonly claimedUserIds: readonly number[];
    readonly contributions: readonly PartyMonsterContribution[];
    readonly lastAttackOwnerUserId?: number;
    /** 서버 damage 결과가 실제 생명력을 0으로 만든 순간의 최종 공격 소유자. */
    readonly actualLethalUserId?: number;
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
    /** 레벨 차이·개인 경험치 배율을 적용하기 전 Hamilton 정수 몫. */
    poolShare: number;
    /** 전체 유효 기여도 중 이 플레이어의 비율. fallback 1인은 1이다. */
    contributionRatio: number;
    /** poolShare에 개인 레벨 차이 감쇠와 상한을 적용한 gainExp 입력값. */
    levelAdjustedShare: number;
    /** gainExp의 개인 경험치 배율까지 적용해 실제로 지급된 경험치. */
    grantedExp: number;
    levelGap: number;
    levelGapMultiplier: number;
    levelsGained: number[];
}

export interface ContributionExpShare {
    readonly userId: number;
    readonly contribution: number;
    readonly contributionRatio: number;
    readonly poolShare: number;
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

    /** 전투·스킬 피드를 공유할 audience. 파티가 없으면 본인만 반환한다. */
    getEventAudienceUserIds(userId: number): number[] {
        const party = this.getPartyState(userId);
        return party ? [...party.memberUserIds] : [userId];
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

    /** 교전 claim 안에서 실제 기여한 온라인·동일 장소·생존 인원에게만 경험치를 분배한다. */
    distributeMonsterExp(
        baseExp: number,
        locationId: string,
        context: PartyMonsterExpContext,
    ): PartyExpGrant[] {
        const claimedUserIds = new Set(context.claimedUserIds.filter(Number.isInteger));
        const contributionByUserId = new Map<number, number>();
        for (const contribution of context.contributions) {
            if (!claimedUserIds.has(contribution.userId)
                || !Number.isFinite(contribution.total)
                || contribution.total <= 0) continue;
            contributionByUserId.set(
                contribution.userId,
                (contributionByUserId.get(contribution.userId) ?? 0) + contribution.total,
            );
        }

        const resolveEligible = (userId: number): PartyParticipant | undefined => {
            if (!claimedUserIds.has(userId)) return undefined;
            const player = this.resolvePlayer(userId);
            return player && player.locationId === locationId && !player.isDefeated ? player : undefined;
        };
        const participants = [...contributionByUserId]
            .flatMap(([userId, contribution]) => {
                const player = resolveEligible(userId);
                return player ? [{ player, contribution }] : [];
            });

        // 독·출혈 등 서버 지속 피해로 다른 장소에서 막타를 낸 경우를 포함해,
        // 현장 정상 분배 대상이 아예 없을 때는 실제 생명력을 0으로 만든 소유자를 우선한다.
        if (participants.length === 0 && context.actualLethalUserId !== undefined) {
            const lethalPlayer = this.resolvePlayer(context.actualLethalUserId);
            if (lethalPlayer && !lethalPlayer.isDefeated) {
                participants.push({ player: lethalPlayer, contribution: 1 });
            }
        }
        // 실제 막타 정보가 없는 구형·환경 경로만 claim 안 마지막 공격자로 복구한다.
        if (participants.length === 0
            && contributionByUserId.size === 0
            && context.lastAttackOwnerUserId !== undefined) {
            const fallback = resolveEligible(context.lastAttackOwnerUserId);
            if (fallback) participants.push({ player: fallback, contribution: 1 });
        }
        if (participants.length === 0) return [];

        // 지급 중 레벨업이 뒤 참가자의 기준값을 바꾸지 않도록 입력을 먼저 primitive로 고정한다.
        const eligible = participants.map(({ player, contribution }) => ({
            player,
            userId: player.userId,
            nickname: player.name,
            level: player.level,
            maxExp: player.maxExp,
            experienceGainModifier: player.getExperienceGainModifier(),
            contribution,
        }));
        const highestLevel = Math.max(...eligible.map(entry => entry.level));
        const pool = calculatePartyExpPool(baseExp, eligible.length);
        const shares = allocateContributionWeightedExp(pool, eligible);
        const shareByUserId = new Map(shares.map(share => [share.userId, share]));

        return eligible.map(entry => {
            const share = shareByUserId.get(entry.userId)!;
            const levelGap = Math.max(0, highestLevel - entry.level);
            const levelGrant = calculatePartyExpGrant(share.poolShare, levelGap, entry.maxExp);
            const experienceGainModifier = Number.isFinite(entry.experienceGainModifier)
                ? Math.max(0, entry.experienceGainModifier)
                : 0;
            const grantedExp = Math.floor(levelGrant.amount * experienceGainModifier);
            return {
                userId: entry.userId,
                nickname: entry.nickname,
                poolShare: share.poolShare,
                contributionRatio: share.contributionRatio,
                levelAdjustedShare: levelGrant.amount,
                grantedExp,
                levelGap,
                levelGapMultiplier: levelGrant.multiplier,
                levelsGained: entry.player.gainExp(levelGrant.amount, { protectFromPendingDeathPenalty: true }),
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

/** 유효 인원 1명은 원래 보상, 이후 한 명마다 전체 풀을 20%씩 늘린다. */
export function calculatePartyExpPool(baseExp: number, eligibleCount: number): number {
    const normalizedBase = Number.isFinite(baseExp) ? Math.max(0, Math.floor(baseExp)) : 0;
    const count = Number.isFinite(eligibleCount) ? Math.max(0, Math.floor(eligibleCount)) : 0;
    return count > 0 ? Math.floor(normalizedBase * (1 + 0.2 * (count - 1))) : 0;
}

/** 20% 균등 몫과 80% 기여 몫을 Hamilton 최대 나머지법으로 정수 배분한다. */
export function allocateContributionWeightedExp(
    poolExp: number,
    contributions: readonly { readonly userId: number; readonly contribution: number }[],
): readonly ContributionExpShare[] {
    const pool = Number.isFinite(poolExp) ? Math.max(0, Math.floor(poolExp)) : 0;
    const contributionByUserId = new Map<number, number>();
    for (const entry of contributions) {
        if (!Number.isInteger(entry.userId)
            || !Number.isFinite(entry.contribution)
            || entry.contribution <= 0) continue;
        contributionByUserId.set(
            entry.userId,
            (contributionByUserId.get(entry.userId) ?? 0) + entry.contribution,
        );
    }
    const normalized = [...contributionByUserId]
        .map(([userId, contribution]) => ({ userId, contribution }))
        .sort((left, right) => left.userId - right.userId);
    if (normalized.length === 0) return Object.freeze([]);

    const totalContribution = normalized.reduce((sum, entry) => sum + entry.contribution, 0);
    const candidates = normalized.map(entry => {
        const contributionRatio = entry.contribution / totalContribution;
        const quota = pool * (0.2 / normalized.length + 0.8 * contributionRatio);
        const floorShare = Math.floor(quota);
        return {
            ...entry,
            contributionRatio,
            poolShare: floorShare,
            fraction: quota - floorShare,
        };
    });
    let remaining = pool - candidates.reduce((sum, entry) => sum + entry.poolShare, 0);
    const remainderOrder = [...candidates].sort((left, right) => {
        const fractionDifference = right.fraction - left.fraction;
        if (Math.abs(fractionDifference) > 1e-12) return fractionDifference;
        return right.contribution - left.contribution || left.userId - right.userId;
    });
    for (let index = 0; index < remaining; index++) {
        remainderOrder[index % remainderOrder.length]!.poolShare++;
    }

    return Object.freeze(candidates.map(entry => Object.freeze({
        userId: entry.userId,
        contribution: entry.contribution,
        contributionRatio: entry.contributionRatio,
        poolShare: entry.poolShare,
    })));
}

function failure(reason: string): PartyActionResult {
    return { success: false, reason };
}

export const partyManager = new PartyManager();
