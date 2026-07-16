import type Player from './Player.js';
import type { AttributeModifier } from './Attribute.js';
import { emitGameEvent, GameEventIds } from './GameEvent.js';
import { JobSlotType, JobTier, getJob, isJobDescendant, resolveEliteJob } from './Job.js';
import { ProgressType, defineProgress } from './Progress.js';
import { sendBotMessageToUser, sendNotificationToUser } from '../modules/message.js';
import { chat } from '../utils/chatBuilder.js';

export const CareerProgressIds = Object.freeze({
    MAIN: 'career:main_job',
    SUB: 'career:sub_job',
    ELITE: 'career:elite_job',
});

for (const [id, label] of [
    [CareerProgressIds.MAIN, '메인 직업'],
    [CareerProgressIds.SUB, '서브 직업'],
    [CareerProgressIds.ELITE, '엘리트 직업'],
] as const) defineProgress({ id, type: ProgressType.STATE, label, description: `${label} ID` });

export interface CareerOperationResult { success: boolean; reason?: string }

export default class CareerProfile {
    constructor(private readonly player: Player) {}

    get mainJobId(): string { return this.player.progress.getState(CareerProgressIds.MAIN); }
    get subJobId(): string { return this.player.progress.getState(CareerProgressIds.SUB); }
    get eliteJobId(): string { return this.player.progress.getState(CareerProgressIds.ELITE); }
    get mainJob() { return getJob(this.mainJobId); }
    get subJob() { return getJob(this.subJobId); }
    get eliteJob() { return getJob(this.eliteJobId); }
    get effectiveMainJob() { return this.eliteJob ?? this.mainJob; }

    hasJob(jobId: string, slot?: JobSlotType): boolean {
        const normalizedJobId = getJob(jobId)?.id;
        if (!normalizedJobId) return false;
        if (slot === JobSlotType.SUB) return this.subJobId === normalizedJobId;
        const mainCompatible = Boolean(this.mainJobId && (this.mainJobId === normalizedJobId
            || (this.eliteJobId && isJobDescendant(this.eliteJobId, normalizedJobId))));
        if (slot === JobSlotType.MAIN) return mainCompatible;
        return mainCompatible || this.subJobId === normalizedJobId || this.eliteJobId === normalizedJobId;
    }

    canAssign(slot: JobSlotType, jobId: string): CareerOperationResult {
        const job = getJob(jobId);
        if (!job || job.tier !== JobTier.FIRST) return { success: false, reason: '선택할 수 없는 1차 직업입니다.' };
        if (this.player.level < slot.requiredLevel) {
            return { success: false, reason: `${slot.label}은 Lv.${slot.requiredLevel}부터 선택할 수 있습니다.` };
        }
        if (slot === JobSlotType.MAIN && this.mainJobId) return { success: false, reason: '이미 메인 직업이 있습니다.' };
        if (slot === JobSlotType.SUB) {
            if (!this.mainJobId) return { success: false, reason: '메인 직업을 먼저 선택해야 합니다.' };
            if (this.subJobId) return { success: false, reason: '이미 서브 직업이 있습니다.' };
            if (this.mainJobId === job.id) return { success: false, reason: '메인 직업과 같은 서브 직업은 선택할 수 없습니다.' };
        }
        return { success: true };
    }

    assign(slot: JobSlotType, jobId: string): CareerOperationResult {
        const checked = this.canAssign(slot, jobId);
        if (!checked.success) return checked;
        const job = getJob(jobId)!;
        this.player.progress.setState(slot === JobSlotType.MAIN ? CareerProgressIds.MAIN : CareerProgressIds.SUB, job.id);
        this.grantSkills(job.id, `career:${slot.key}`);
        this.refreshModifiers();
        this.notify(`${slot.label} [ ${job.name} ](으)로 전직했습니다!`, `career:${slot.key}:${job.id}`);
        emitGameEvent(GameEventIds.CAREER_ASSIGNED, { actor: this.player, data: { slot: slot.key, jobId: job.id } });
        this.evaluateElitePromotion();
        return { success: true };
    }

    evaluateElitePromotion(): boolean {
        if (this.player.level < 200 || !this.mainJobId || !this.subJobId || this.eliteJobId) return false;
        if (this.mainJobId === this.subJobId) return false;
        const elite = resolveEliteJob(this.mainJobId, this.subJobId);
        if (!elite) return false;
        this.player.progress.setState(CareerProgressIds.ELITE, elite.id);
        this.grantSkills(elite.id, 'career:elite');
        this.refreshModifiers();
        this.notify(`엘리트 직업 [ ${elite.name} ](으)로 전직했습니다!`, `career:elite:${elite.id}`);
        emitGameEvent(GameEventIds.CAREER_ELITE_PROMOTED, {
            actor: this.player,
            data: { mainJobId: this.mainJobId, subJobId: this.subJobId, eliteJobId: elite.id },
        });
        void this.player.save();
        return true;
    }

    initialize(): void {
        for (const job of [this.mainJob, this.subJob, this.eliteJob]) if (job) this.grantSkills(job.id, 'career:restore');
        this.refreshModifiers();
        this.evaluateElitePromotion();
    }

    refreshModifiers(): void {
        for (const source of ['career:main', 'career:sub', 'career:elite']) this.player.attribute.removeBySource(source);
        const add = (source: string, modifiers: readonly Omit<AttributeModifier, 'source'>[]) => {
            this.player.attribute.addModifiers(modifiers.map(modifier => ({ ...modifier, source })));
        };
        if (this.eliteJob) add('career:elite', this.eliteJob.mainModifiers);
        else if (this.mainJob) add('career:main', this.mainJob.mainModifiers);
        if (this.subJob) add('career:sub', this.subJob.subModifiers);
    }

    private grantSkills(jobId: string, source: string): void {
        for (const grant of getJob(jobId)?.grantedSkills ?? []) {
            this.player.skills.grant(grant.skillDataId, source, grant.level ?? 1);
        }
    }

    private notify(message: string, key: string): void {
        sendBotMessageToUser(this.player.userId, chat().color('gold', b => b.weight('bold', b2 => b2.text(message))).build());
        sendNotificationToUser(this.player.userId, { key, message });
    }
}
