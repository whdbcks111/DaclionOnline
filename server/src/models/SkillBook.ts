import prisma from '../config/prisma.js';
import type Player from './Player.js';
import Skill, {
    SkillFinishReason,
    acceptSkill,
    getAllSkillData,
} from './Skill.js';
import type {
    SkillCheckResult,
    SkillFinishContext,
    SkillStartResult,
    SkillUpdateContext,
} from './Skill.js';
import { emitGameEvent, GameEventIds } from './GameEvent.js';
import { sendBotMessageToUser, sendNotificationToUser, sendPlayerTextToCurrentChannel } from '../modules/message.js';
import { chat } from '../utils/chatBuilder.js';
import logger from '../utils/logger.js';
import type { TagId } from '../../../shared/tags.js';

export interface SkillActivationOutcome {
    matched: boolean;
    activated: boolean;
    reason?: string;
    skill?: Skill;
}

export default class SkillBook {
    readonly playerId: number;
    private owner?: Player;
    private readonly skills = new Map<string, Skill>();
    private readonly dirtyVersions = new Map<string, number>();
    private version = 0;
    private autoAcquireTimer = 0;
    private autoActivateTimer = 0;
    private fullAutoAcquireCheck = true;
    private readonly changedProgress = new Set<string>();

    private constructor(playerId: number) {
        this.playerId = playerId;
    }

    static createEmpty(playerId: number): SkillBook {
        return new SkillBook(playerId);
    }

    static async load(playerId: number): Promise<SkillBook> {
        const book = new SkillBook(playerId);
        const rows = await prisma.playerSkill.findMany({ where: { playerId } });
        for (const row of rows) {
            try {
                const skill = Skill.fromPersistence({
                    playerId,
                    skillDataId: row.skillDataId,
                    level: row.level,
                    cooldownEndsAt: row.cooldownEndsAt,
                    metadata: row.metadata,
                    tags: (row.tags as TagId[] | null) ?? [],
                    acquiredAt: row.acquiredAt,
                    acquisitionSource: row.acquisitionSource ?? undefined,
                });
                book.attach(skill);
            } catch (error) {
                logger.warn(`로드할 수 없는 스킬 보존: ${playerId}/${row.skillDataId}`, error);
            }
        }
        return book;
    }

    get dirty(): boolean { return this.dirtyVersions.size > 0; }

    bindOwner(player: Player): void {
        if (player.userId !== this.playerId) throw new Error('SkillBook owner mismatch');
        if (this.owner && this.owner !== player) throw new Error('SkillBook owner is already bound');
        this.owner = player;
        player.progress.subscribeChanges(id => {
            this.changedProgress.add(id);
        });
    }

    has(skillDataId: string): boolean {
        return this.skills.has(skillDataId.trim().toLowerCase());
    }

    get(skillDataId: string): Skill | undefined {
        return this.skills.get(skillDataId.trim().toLowerCase());
    }

    getAll(): readonly Skill[] {
        return [...this.skills.values()];
    }

    getVisible(): readonly Skill[] {
        const owner = this.requireOwner();
        return this.getAll().filter(skill => {
            try {
                return skill.isVisibleTo(owner);
            } catch (error) {
                logger.error(`스킬 표시 조건 실패: ${skill.skillDataId}`, error);
                return false;
            }
        });
    }

    findVisibleByInput(input: string): Skill | undefined {
        const normalized = input.trim().toLowerCase();
        return this.getVisible().find(skill => skill.skillDataId === normalized
            || skill.name.toLowerCase() === normalized
            || skill.data.aliases?.some(alias => alias.toLowerCase() === normalized));
    }

    getActivationStatus(skill: Skill): SkillCheckResult {
        if (this.skills.get(skill.skillDataId) !== skill) {
            return { accepted: false, reason: '보유한 스킬이 아닙니다.' };
        }
        try {
            return this.checkActivation(skill);
        } catch (error) {
            logger.error(`스킬 발동 상태 확인 실패: ${skill.skillDataId}`, error);
            return { accepted: false, reason: '스킬 발동 조건을 확인할 수 없습니다.' };
        }
    }

    grant(skillDataId: string, acquisitionSource = 'system'): { skill: Skill; acquired: boolean } {
        const existing = this.get(skillDataId);
        if (existing) return { skill: existing, acquired: false };
        const owner = this.requireOwner();
        const skill = new Skill({
            playerId: this.playerId,
            skillDataId,
            acquisitionSource,
        });
        this.attach(skill);
        this.markDirty(skill.skillDataId);

        const context = { player: owner, skill };
        try {
            skill.data.onAcquire?.(context);
        } catch (error) {
            logger.error(`스킬 획득 초기화 실패: ${skill.skillDataId}`, error);
        }

        const acquiredText = `스킬 [ ${skill.name} ] 를 획득했습니다!`;
        sendBotMessageToUser(owner.userId, chat()
            .color('gold', b => b.weight('bold', b2 => b2.text(acquiredText)))
            .build());
        sendNotificationToUser(owner.userId, {
            key: `skill-acquired:${skill.skillDataId}`,
            message: acquiredText,
        });
        emitGameEvent(GameEventIds.SKILL_ACQUIRED, {
            actor: owner,
            data: { skillDataId: skill.skillDataId, source: acquisitionSource },
        });
        return { skill, acquired: true };
    }

    activateByInput(input: string): SkillActivationOutcome {
        const skill = this.findVisibleByInput(input);
        return skill
            ? this.activate(skill, true)
            : { matched: false, activated: false, reason: '보유하고 있거나 현재 표시 가능한 스킬이 아닙니다.' };
    }

    activateFromMessage(message: string): SkillActivationOutcome {
        const owner = this.requireOwner();
        for (const skill of this.getVisible()) {
            try {
                if (skill.data.activateOnMessage?.({ player: owner, skill, message })) {
                    return this.activate(skill, true);
                }
            } catch (error) {
                logger.error(`스킬 메시지 발동 조건 실패: ${skill.skillDataId}`, error);
            }
        }
        return { matched: false, activated: false };
    }

    update(dt: number): void {
        const owner = this.requireOwner();
        this.autoAcquireTimer -= dt;
        this.autoActivateTimer -= dt;

        if (this.autoAcquireTimer <= 0) {
            this.autoAcquireTimer = 0.5;
            this.evaluateAutoAcquire();
        }

        if (this.autoActivateTimer <= 0) {
            this.autoActivateTimer = 0.25;
            for (const skill of this.getVisible()) {
                try {
                    if (skill.data.autoActivate?.({ player: owner, skill })) {
                        this.activate(skill, false);
                    }
                } catch (error) {
                    logger.error(`스킬 자동 발동 조건 실패: ${skill.skillDataId}`, error);
                }
            }
        }

        for (const skill of this.getAll()) {
            let usable: SkillCheckResult;
            try {
                usable = skill.checkUsable(owner);
            } catch (error) {
                logger.error(`스킬 사용 조건 실패: ${skill.skillDataId}`, error);
                continue;
            }
            if (usable.accepted) {
                try {
                    skill.data.onPassiveUpdate?.({ player: owner, skill }, dt);
                } catch (error) {
                    logger.error(`스킬 패시브 업데이트 실패: ${skill.skillDataId}`, error);
                }
            }

            if (!skill.isActive) continue;
            if (owner.isDefeated) {
                this.finish(skill, SkillFinishReason.OWNER_DEFEATED);
                continue;
            }
            const expired = skill.advanceActive(dt);
            const context = this.createUpdateContext(skill);
            try {
                const result = skill.data.onUpdate?.(context, dt);
                if (result === 'finish' || expired) this.finish(skill, SkillFinishReason.COMPLETED);
            } catch (error) {
                logger.error(`스킬 업데이트 실패: ${skill.skillDataId}`, error);
                this.finish(skill, SkillFinishReason.ERROR);
            }
        }
    }

    finishAll(reason = SkillFinishReason.UNLOADED): void {
        for (const skill of this.getAll()) {
            if (skill.isActive) this.finish(skill, reason);
        }
    }

    async save(): Promise<void> {
        if (!this.dirty) return;
        const snapshots = [...this.dirtyVersions].flatMap(([id, version]) => {
            const skill = this.skills.get(id);
            return skill ? [{ id, version, skill }] : [];
        });
        const operations = snapshots.map(({ skill }) => prisma.playerSkill.upsert({
            where: { playerId_skillDataId: { playerId: this.playerId, skillDataId: skill.skillDataId } },
            create: {
                playerId: this.playerId,
                skillDataId: skill.skillDataId,
                level: skill.level,
                cooldownEndsAt: skill.getCooldownEndDate(),
                metadata: skill.getPersistedMetadata() as never,
                tags: skill.tags.persistentValues(),
                acquisitionSource: skill.acquisitionSource,
                acquiredAt: skill.acquiredAt,
            },
            update: {
                level: skill.level,
                cooldownEndsAt: skill.getCooldownEndDate(),
                metadata: skill.getPersistedMetadata() as never,
                tags: skill.tags.persistentValues(),
                acquisitionSource: skill.acquisitionSource,
            },
        }));
        if (operations.length > 0) await prisma.$transaction(operations);
        for (const snapshot of snapshots) {
            if (this.dirtyVersions.get(snapshot.id) === snapshot.version) {
                this.dirtyVersions.delete(snapshot.id);
            }
        }
    }

    private activate(skill: Skill, notifyDenied: boolean): SkillActivationOutcome {
        const owner = this.requireOwner();
        let denied: SkillCheckResult;
        try {
            denied = this.checkActivation(skill);
        } catch (error) {
            logger.error(`스킬 발동 조건 실패: ${skill.skillDataId}`, error);
            denied = { accepted: false, reason: '스킬 발동 조건을 확인할 수 없습니다.' };
        }
        if (!denied.accepted) {
            if (notifyDenied) sendNotificationToUser(owner.userId, {
                key: `skill-denied:${skill.skillDataId}`,
                message: denied.reason,
            });
            return { matched: true, activated: false, reason: denied.reason, skill };
        }

        if (skill.data.activationMessage) {
            sendPlayerTextToCurrentChannel(owner.userId, skill.format(skill.data.activationMessage, owner));
        }

        let startResult: SkillStartResult | void;
        try {
            startResult = skill.data.onStart?.({ player: owner, skill });
            skill.beginActive(startResult ?? {});
            skill.startCooldown(skill.getMaxCooldown(owner));
        } catch (error) {
            logger.error(`스킬 시작 실패: ${skill.skillDataId}`, error);
            const reason = '스킬 발동 중 오류가 발생했습니다.';
            if (notifyDenied) sendNotificationToUser(owner.userId, {
                key: `skill-error:${skill.skillDataId}`,
                message: reason,
            });
            return { matched: true, activated: false, reason, skill };
        }

        emitGameEvent(GameEventIds.SKILL_STARTED, {
            actor: owner,
            data: { skillDataId: skill.skillDataId },
        });
        if (skill.activeDuration === 0) this.finish(skill, SkillFinishReason.COMPLETED);
        return { matched: true, activated: true, skill };
    }

    private checkActivation(skill: Skill): SkillCheckResult {
        const owner = this.requireOwner();
        if (!skill.isVisibleTo(owner)) return { accepted: false, reason: '현재 표시되지 않는 스킬입니다.' };
        if (owner.isDefeated) return { accepted: false, reason: '사망 상태에서는 스킬을 사용할 수 없습니다.' };
        if (skill.isActive) return { accepted: false, reason: '이미 발동 중인 스킬입니다.' };
        const remaining = skill.getRemainingCooldown();
        if (remaining > 0) {
            return { accepted: false, reason: `재사용 대기시간이 ${remaining.toFixed(1)}초 남았습니다.` };
        }
        const usable = skill.checkUsable(owner);
        if (!usable.accepted) return usable;
        return skill.data.canActivate?.({ player: owner, skill }) ?? acceptSkill();
    }

    private finish(skill: Skill, reason: SkillFinishReason): void {
        if (!skill.isActive) return;
        const owner = this.requireOwner();
        const context: SkillFinishContext = {
            ...this.createUpdateContext(skill),
            reason,
        };
        try {
            skill.data.onFinish?.(context);
        } catch (error) {
            logger.error(`스킬 종료 처리 실패: ${skill.skillDataId}`, error);
        } finally {
            skill.clearActive();
        }
        emitGameEvent(GameEventIds.SKILL_FINISHED, {
            actor: owner,
            data: { skillDataId: skill.skillDataId, reason: reason.key },
        });
    }

    private evaluateAutoAcquire(): void {
        const owner = this.requireOwner();
        const changed = new Set(this.changedProgress);
        this.changedProgress.clear();
        for (const data of getAllSkillData()) {
            if (this.has(data.id) || !data.autoAcquire) continue;
            if (!this.fullAutoAcquireCheck
                && !data.autoAcquire.watchedProgress.some(key => changed.has(key))) continue;
            const preview = new Skill({ playerId: this.playerId, skillDataId: data.id });
            try {
                if (data.autoAcquire.check({ player: owner, skill: preview })) {
                    this.grant(data.id, 'automatic');
                }
            } catch (error) {
                logger.error(`스킬 자동 획득 조건 실패: ${data.id}`, error);
            }
        }
        this.fullAutoAcquireCheck = false;
    }

    private createUpdateContext(skill: Skill): SkillUpdateContext {
        return {
            player: this.requireOwner(),
            skill,
            state: skill.getActiveStateSnapshot(),
            elapsed: skill.activeElapsed,
            duration: skill.activeDuration,
        };
    }

    private attach(skill: Skill): void {
        skill.setPersistentChangeHandler(() => this.markDirty(skill.skillDataId));
        this.skills.set(skill.skillDataId, skill);
    }

    private markDirty(id: string): void {
        this.dirtyVersions.set(id, ++this.version);
    }

    private requireOwner(): Player {
        if (!this.owner) throw new Error(`SkillBook owner is not bound: ${this.playerId}`);
        return this.owner;
    }
}
