import prisma from '../config/prisma.js';
import type Entity from './Entity.js';
import type Player from './Player.js';
import Skill, {
    SkillFinishReason,
    acceptSkill,
    createSkillContext,
    getAllSkillData,
} from './Skill.js';
import type {
    SkillCheckResult,
    SkillFinishContext,
    SkillStartResult,
    SkillUpdateContext,
} from './Skill.js';
import { emitGameEvent, GameEventIds } from './GameEvent.js';
import {
    sendBotMessageToUser,
    sendNotificationToUser,
    sendPrivatePlayerTextToCurrentChannel,
    sendPrivateBotMessageToUser,
} from '../modules/message.js';
import { chat } from '../utils/chatBuilder.js';
import logger from '../utils/logger.js';
import type { TagId } from '../../../shared/tags.js';
import type { SkillHudData } from '../../../shared/types.js';
import { ActionType } from './Action.js';

export interface SkillActivationOutcome {
    matched: boolean;
    activated: boolean;
    reason?: string;
    skill?: Skill;
}

export interface RuntimeSkillEntry {
    skillDataId: string;
    level?: number;
}

export default class SkillBook {
    readonly playerId: number | null;
    private owner?: Entity;
    private readonly skills = new Map<string, Skill>();
    private readonly dirtyVersions = new Map<string, number>();
    private readonly deletedSkills = new Set<string>();
    private version = 0;
    private autoAcquireTimer = 0;
    private autoActivateTimer = 0;
    private fullAutoAcquireCheck = true;
    private readonly changedProgress = new Set<string>();

    private constructor(playerId: number | null) {
        this.playerId = playerId;
    }

    static createEmpty(playerId: number): SkillBook {
        return new SkillBook(playerId);
    }

    /** DB 저장 없이 Entity 수명 동안만 유지되는 몬스터/NPC용 스킬북. */
    static createRuntime(owner: Entity, entries: readonly RuntimeSkillEntry[] = []): SkillBook {
        const book = new SkillBook(null);
        book.bindOwner(owner);
        for (const entry of entries) {
            book.grant(entry.skillDataId, 'runtime', entry.level ?? 1);
        }
        return book;
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
                    experience: row.experience,
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

    bindOwner(owner: Entity): void {
        if (this.playerId !== null && owner.playerUserId !== this.playerId) {
            throw new Error('SkillBook owner mismatch');
        }
        if (this.owner && this.owner !== owner) throw new Error('SkillBook owner is already bound');
        this.owner = owner;
        const player = this.getPlayerOwner();
        player?.progress.subscribeChanges(id => this.changedProgress.add(id));
    }

    has(skillDataId: string): boolean {
        return this.skills.has(skillDataId.trim().toLowerCase());
    }

    get(skillDataId: string): Skill | undefined {
        return this.skills.get(skillDataId.trim().toLowerCase());
    }

    /** 관리자·보상 기능이 내부 Map을 직접 다루지 않고 보유 스킬 레벨을 설정한다. */
    setLevel(skillDataId: string, level: number): number | null {
        const skill = this.get(skillDataId);
        return skill ? skill.setLevel(level) : null;
    }

    getAll(): readonly Skill[] {
        return [...this.skills.values()];
    }

    /** 아이템·버프가 raw Skill 목록을 수정하지 않고 모든 진행 중 쿨다운을 감소시킨다. */
    reduceCooldowns(seconds: number, now = Date.now()): { affected: number; reducedSeconds: number } {
        if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Cooldown reduction must be positive');
        let affected = 0;
        let reducedSeconds = 0;
        for (const skill of this.skills.values()) {
            const remaining = skill.getRemainingCooldown(now);
            if (remaining <= 0) continue;
            const reduced = Math.min(remaining, seconds);
            skill.startCooldown(remaining - reduced, now);
            affected++;
            reducedSeconds += reduced;
        }
        return { affected, reducedSeconds };
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

    /** HUD가 내부 Skill Map을 읽지 않고 표시 가능한 스킬과 쿨다운을 받는 불변 DTO. */
    getHudSnapshots(now = Date.now()): SkillHudData[] {
        const owner = this.requireOwner();
        return this.getVisible().filter(skill => !skill.isPassive).map(skill => {
            const remainingCooldown = skill.getRemainingCooldown(now);
            return {
                id: skill.skillDataId,
                name: skill.name,
                icon: skill.data.icon,
                level: skill.level,
                isActive: skill.isActive,
                remainingCooldown,
                maxCooldown: skill.getMaxCooldown(owner),
            };
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

    grant(skillDataId: string, acquisitionSource = 'system', level = 1): { skill: Skill; acquired: boolean } {
        const existing = this.get(skillDataId);
        if (existing) return { skill: existing, acquired: false };
        const owner = this.requireOwner();
        const skill = new Skill({
            playerId: this.playerId,
            skillDataId,
            level,
            acquisitionSource,
        });
        this.attach(skill);
        this.deletedSkills.delete(skill.skillDataId);
        this.markDirty(skill.skillDataId);

        const context = createSkillContext(owner, skill);
        try {
            skill.data.onAcquire?.(context);
        } catch (error) {
            logger.error(`스킬 획득 초기화 실패: ${skill.skillDataId}`, error);
        }

        const player = this.getPlayerOwner();
        if (player) {
            const acquiredText = `스킬 [ ${skill.name} ] 를 획득했습니다!`;
            sendBotMessageToUser(player.userId, chat()
                .color('gold', b => b.weight('bold', b2 => b2.text(acquiredText)))
                .build());
            sendNotificationToUser(player.userId, {
                key: `skill-acquired:${skill.skillDataId}`,
                message: acquiredText,
            });
            emitGameEvent(GameEventIds.SKILL_ACQUIRED, {
                actor: owner,
                data: { skillDataId: skill.skillDataId, source: acquisitionSource },
            });
        }
        return { skill, acquired: true };
    }

    /** 보유 스킬을 제거하고 영속 삭제 대상으로 표시한다. */
    revoke(skillDataId: string): boolean {
        const skill = this.get(skillDataId);
        if (!skill) return false;
        if (skill.isActive) this.finish(skill, SkillFinishReason.CANCELLED);
        try {
            skill.data.onPassiveInactive?.(createSkillContext(this.requireOwner(), skill));
        } catch (error) {
            logger.error(`스킬 패시브 제거 정리 실패: ${skill.skillDataId}`, error);
        }
        this.skills.delete(skill.skillDataId);
        this.dirtyVersions.delete(skill.skillDataId);
        if (this.playerId !== null) this.deletedSkills.add(skill.skillDataId);
        return true;
    }

    activateByInput(input: string): SkillActivationOutcome {
        const skill = this.findVisibleByInput(input);
        return skill
            ? this.activate(skill, true)
            : { matched: false, activated: false, reason: '보유하고 있거나 현재 표시 가능한 스킬이 아닙니다.' };
    }

    /** 보유한 스킬 ID를 직접 발동한다. 몬스터 패턴과 서버 자동 로직의 진입점이다. */
    activateById(skillDataId: string): SkillActivationOutcome {
        const skill = this.get(skillDataId);
        return skill
            ? this.activate(skill, false)
            : { matched: false, activated: false, reason: '보유한 스킬이 아닙니다.' };
    }

    hasActiveSkill(): boolean {
        return this.getAll().some(skill => skill.isActive);
    }

    activateFromMessage(message: string): SkillActivationOutcome {
        const owner = this.requireOwner();
        for (const skill of this.getVisible()) {
            try {
                const phrase = skill.data.activationPhrase ?? skill.data.activationMessage;
                if ((phrase && message.trim() === phrase.trim())
                    || skill.data.activateOnMessage?.({ ...createSkillContext(owner, skill), message })) {
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
        const player = this.getPlayerOwner();
        this.autoAcquireTimer -= dt;
        this.autoActivateTimer -= dt;

        if (player && this.autoAcquireTimer <= 0) {
            this.autoAcquireTimer = 0.5;
            this.evaluateAutoAcquire();
        }

        if (this.autoActivateTimer <= 0) {
            this.autoActivateTimer = 0.25;
            for (const skill of this.getVisible()) {
                try {
                    if (skill.data.autoActivate?.(createSkillContext(owner, skill))) {
                        this.activate(skill, false);
                    }
                } catch (error) {
                    logger.error(`스킬 자동 발동 조건 실패: ${skill.skillDataId}`, error);
                }
            }
        }

        for (const skill of this.getAll()) {
            try {
                const visible = skill.isVisibleTo(owner);
                const usable = skill.checkUsable(owner);
                if (visible && usable.accepted) {
                    skill.data.onPassiveUpdate?.(createSkillContext(owner, skill), dt);
                } else {
                    skill.data.onPassiveInactive?.(createSkillContext(owner, skill));
                }
            } catch (error) {
                try {
                    skill.data.onPassiveInactive?.(createSkillContext(owner, skill));
                } catch (cleanupError) {
                    logger.error(`스킬 패시브 오류 정리 실패: ${skill.skillDataId}`, cleanupError);
                }
                logger.error(`스킬 패시브 조건 또는 업데이트 실패: ${skill.skillDataId}`, error);
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
        const playerId = this.playerId;
        if (playerId === null || (!this.dirty && this.deletedSkills.size === 0)) return;
        const deleted = [...this.deletedSkills];
        const snapshots = [...this.dirtyVersions].flatMap(([id, version]) => {
            const skill = this.skills.get(id);
            return skill ? [{ id, version, skill }] : [];
        });
        const operations = snapshots.map(({ skill }) => prisma.playerSkill.upsert({
            where: { playerId_skillDataId: { playerId, skillDataId: skill.skillDataId } },
            create: {
                playerId,
                skillDataId: skill.skillDataId,
                level: skill.level,
                experience: skill.experience,
                cooldownEndsAt: skill.getCooldownEndDate(),
                metadata: skill.getPersistedMetadata() as never,
                tags: skill.tags.persistentValues(),
                acquisitionSource: skill.acquisitionSource,
                acquiredAt: skill.acquiredAt,
            },
            update: {
                level: skill.level,
                experience: skill.experience,
                cooldownEndsAt: skill.getCooldownEndDate(),
                metadata: skill.getPersistedMetadata() as never,
                tags: skill.tags.persistentValues(),
                acquisitionSource: skill.acquisitionSource,
            },
        }));
        const deletes = deleted.map(skillDataId => prisma.playerSkill.deleteMany({
            where: { playerId, skillDataId },
        }));
        if (operations.length > 0 || deletes.length > 0) await prisma.$transaction([...operations, ...deletes]);
        for (const snapshot of snapshots) {
            if (this.dirtyVersions.get(snapshot.id) === snapshot.version) {
                this.dirtyVersions.delete(snapshot.id);
            }
        }
        for (const skillDataId of deleted) this.deletedSkills.delete(skillDataId);
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
            const player = this.getPlayerOwner();
            if (notifyDenied && player) sendNotificationToUser(player.userId, {
                key: `skill-denied:${skill.skillDataId}`,
                message: denied.reason,
            });
            return { matched: true, activated: false, reason: denied.reason, skill };
        }

        const player = this.getPlayerOwner();
        if (player && skill.data.activationMessage) {
            sendPrivatePlayerTextToCurrentChannel(player.userId, skill.format(skill.data.activationMessage, owner));
        }

        let startResult: SkillStartResult | void;
        try {
            startResult = skill.data.onStart?.(createSkillContext(owner, skill));
            skill.beginActive(startResult ?? {});
            skill.startCooldown(skill.getMaxCooldown(owner));
        } catch (error) {
            logger.error(`스킬 시작 실패: ${skill.skillDataId}`, error);
            const reason = '스킬 발동 중 오류가 발생했습니다.';
            if (notifyDenied && player) sendNotificationToUser(player.userId, {
                key: `skill-error:${skill.skillDataId}`,
                message: reason,
            });
            return { matched: true, activated: false, reason, skill };
        }

        if (player && skill.data.activationFeedback) {
            try {
                const feedback = skill.data.activationFeedback(createSkillContext(owner, skill));
                sendPrivateBotMessageToUser(player.userId, feedback);
                sendNotificationToUser(player.userId, {
                    key: `skill-activated:${skill.skillDataId}`,
                    message: feedback,
                    length: 3000,
                });
            } catch (error) {
                logger.error(`스킬 발동 피드백 생성 실패: ${skill.skillDataId}`, error);
            }
        }

        if (player) {
            try {
                this.awardSuccessfulActivationExperience(player, skill);
            } catch (error) {
                logger.error(`스킬 경험치 지급 실패: ${skill.skillDataId}`, error);
            }
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
        if (!owner.canPerformAction(ActionType.SKILL)) {
            return { accepted: false, reason: '현재 스킬을 사용할 수 없는 상태입니다.' };
        }
        if (skill.isActive) return { accepted: false, reason: '이미 발동 중인 스킬입니다.' };
        const remaining = skill.getRemainingCooldown();
        if (remaining > 0) {
            return { accepted: false, reason: `재사용 대기시간이 ${remaining.toFixed(1)}초 남았습니다.` };
        }
        const usable = skill.checkUsable(owner);
        if (!usable.accepted) return usable;
        return skill.data.canActivate?.(createSkillContext(owner, skill)) ?? acceptSkill();
    }

    private awardSuccessfulActivationExperience(player: Player, skill: Skill): void {
        const result = skill.addExperience(player, skill.getExperienceGain(player));
        if (result.levelsGained <= 0) return;
        const message = `스킬 [ ${skill.name} ] 레벨이 올랐습니다! (Lv.${result.level})`;
        sendBotMessageToUser(player.userId, chat()
            .color('gold', b => b.weight('bold', b2 => b2.text(message)))
            .build());
        sendNotificationToUser(player.userId, {
            key: `skill-level-up:${skill.skillDataId}`,
            message,
        });
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
        const player = this.getPlayerOwner();
        if (!player || this.playerId === null) return;
        const changed = new Set(this.changedProgress);
        this.changedProgress.clear();
        for (const data of getAllSkillData()) {
            if (this.has(data.id) || !data.autoAcquire) continue;
            if (!this.fullAutoAcquireCheck
                && !data.autoAcquire.alwaysEvaluate
                && !data.autoAcquire.watchedProgress.some(key => changed.has(key))) continue;
            const preview = new Skill({ playerId: this.playerId, skillDataId: data.id });
            try {
                if (data.autoAcquire.check(createSkillContext(owner, preview))) {
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
            ...createSkillContext(this.requireOwner(), skill),
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
        if (this.playerId === null) return;
        this.dirtyVersions.set(id, ++this.version);
    }

    private requireOwner(): Entity {
        if (!this.owner) throw new Error(`SkillBook owner is not bound: ${this.playerId}`);
        return this.owner;
    }

    private getPlayerOwner(): Player | null {
        const owner = this.owner;
        return owner?.isPlayer ? owner as Player : null;
    }
}
