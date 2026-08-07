import Entity, {
    getDamageCauseActorPlayerId,
    resolveDamageCauseActor,
} from "../core/Entity.js";
import type { DamageCause, DamageResult, DamageType } from "../core/Entity.js";
import Equipment from "../economy/Equipment.js";
import { Item, getItemData } from "../economy/Item.js";
import type { AttributeRecord } from "../core/Attribute.js";
import type { EquipSlot } from "../economy/Equipment.js";
import { getLocation } from "../world/Location.js";
import type Player from "./Player.js";
import { chat } from "../../utils/chatBuilder.js";
import logger from '../../utils/logger.js';
import { sendBotMessageToUser, sendBotMessageToUsers } from "../../modules/communication/message.js";
import { getOnlinePlayer, getOnlinePlayerUserIdsAtLocation } from '../../modules/player/playerRegistry.js';
import { GameTags, normalizeTags } from "../../../../shared/tags.js";
import type { TagId } from "../../../../shared/tags.js";
import StatusEffect, { ControlCategory, StatusEffectType } from "../combat/StatusEffect.js";
import SkillBook from "../progression/SkillBook.js";
import type { RuntimeSkillEntry, SkillActivationOutcome } from "../progression/SkillBook.js";
import { SkillFinishReason } from '../progression/Skill.js';
import { partyManager } from '../../modules/social/party.js';
import type { ChatNode, ShieldBarSegment } from '../../../../shared/types.js';
import {
    MonsterAiDisposition,
    normalizeMonsterAiProfile,
    ThreatAction,
    ThreatTable,
    type DefeatContributionSnapshot,
    type MonsterAiProfileInput,
} from '../combat/Threat.js';
import type { MonsterRank, MonsterStatProfile, MonsterStatWeightMap } from './MonsterStats.js';
import { emitGameEvent, GameEventIds } from '../core/GameEvent.js';

/** 드롭 아이템 정보 */
export interface DropInfo {
    itemDataId: string;
    minCount: number;
    maxCount: number;
    chance: number;  // 0.0 ~ 1.0
}

/** 몬스터 기본 장비 정보 */
export interface MonsterEquipInfo {
    slot: EquipSlot;
    slotIndex: number;
    itemDataId: string;
}

/** 골드 보상 — 고정값 또는 최소~최대 범위 */
export type GoldReward = number | { min: number; max: number };

export interface MonsterAttackEffect {
    statusEffectId: string;
    chance: number;
    duration: number;
    level: number;
}

export interface MonsterAttackProfile {
    damageType?: DamageType;
    effect?: MonsterAttackEffect;
}

export interface MonsterSkillPattern {
    /** 등록된 스킬 ID를 이 순서대로 반복한다. */
    sequence: string[];
    /** true면 매 발동마다 sequence 후보 중 하나를 무작위로 고른다. */
    randomOrder?: boolean;
    /** 전투를 시작한 뒤 첫 패턴까지 기다리는 시간(초). */
    initialDelay: number;
    /** 각 패턴 사이의 무작위 대기 범위(초). */
    interval: { min: number; max: number };
}

export interface MonsterChallengePattern {
    /** registerMonsterChallengePattern()에 등록한 서버 패턴 key. */
    handler: string;
    /** 교전 시작 뒤 첫 미니게임까지 대기 시간(초). */
    initialDelay: number;
    /** 해결 뒤 다음 미니게임까지 무작위 대기 범위(초). */
    interval: { min: number; max: number };
}

export interface BossDialoguePhase {
    /** 이 생명력 비율 이하로 내려가면 한 전투에서 한 번 출력한다. */
    lifeRatio: number;
    line: string;
}

export interface BossNarrative {
    /** 도입 대사 동안 보스가 피해를 받지 않고 행동하지 않는 시간(초). */
    introDuration: number;
    /** 보스 설명 뒤에 이어지는 첫 조우 대사. */
    introLine: string;
    /** 높은 생명력 비율부터 내림차순으로 정렬된 전투 대사. */
    phases: readonly BossDialoguePhase[];
}

export interface MonsterChallengeContext {
    monster: Monster;
    target: Entity;
    complete: () => void;
}

export interface MonsterChallengeHandle {
    cancel?: () => void;
    /** 활성 challenge가 보스의 게임 tick을 따라 결정적으로 진행할 수 있는 선택적 갱신 경계. */
    update?: (dt: number) => void;
}

export type MonsterChallengeHandler = (context: MonsterChallengeContext) => MonsterChallengeHandle | false;

const challengeHandlers = new Map<string, MonsterChallengeHandler>();

function sendBotMessageToUsersAtLocation(locationId: string, content: string | ChatNode[]): void {
    const recipients = getOnlinePlayerUserIdsAtLocation(locationId);
    if (recipients.length > 0) sendBotMessageToUsers(recipients, content);
}

export function registerMonsterChallengePattern(id: string, handler: MonsterChallengeHandler): void {
    const key = id.trim();
    if (!key) throw new Error('Monster challenge pattern id must not be empty');
    challengeHandlers.set(key, handler);
}

export function hasMonsterChallengePattern(id: string): boolean {
    return challengeHandlers.has(id.trim());
}

/** 몬스터 정의 (마스터 데이터, 코드에서 직접 정의) */
export interface MonsterData {
    id: string;
    name: string;
    description: string;
    /** /icons 아래 확장자 없는 표시 key. 생략하면 monsters/{id}. */
    icon?: string;
    level: number;
    exp: number;
    baseAttribute: Partial<AttributeRecord>;
    /** 레벨 예산을 배분한 역할과 체급. 구형 수동 마스터는 점진 이전을 위해 선택 필드다. */
    statProfile?: MonsterStatProfile;
    statRank?: MonsterRank;
    statWeights?: MonsterStatWeightMap;
    drops: DropInfo[];
    expReward: number;
    goldReward?: GoldReward;
    equipments: MonsterEquipInfo[];
    attack?: MonsterAttackProfile;
    skills?: RuntimeSkillEntry[];
    skillPattern?: MonsterSkillPattern;
    challengePattern?: MonsterChallengePattern;
    /** 보스 첫 조우 연출과 생명력 구간별 대사. */
    bossNarrative?: BossNarrative;
    /** 지능·행동별 위협 가중치·도발 저항을 포함한 AI 마스터 설정. */
    ai?: MonsterAiProfileInput;
    tags: TagId[];
}

/** `/몬스터정보`가 런타임 Monster 내부 상태를 직접 참조하지 않고 사용하는 스냅샷. */
export interface MonsterInspectionSnapshot {
    readonly monsterDataId: string;
    readonly icon: string;
    readonly name: string;
    readonly description: string;
    readonly level: number;
    readonly defeated: boolean;
    readonly defeatLabel: string;
    readonly life: number;
    readonly shields: readonly ShieldBarSegment[];
    readonly attributes: Readonly<AttributeRecord>;
    readonly tags: readonly TagId[];
    readonly attack: Readonly<MonsterAttackProfile> | null;
    readonly skills: readonly { skillDataId: string; name: string; level: number }[];
    readonly skillPattern: Readonly<MonsterSkillPattern> | null;
    readonly drops: readonly DropInfo[];
    readonly expReward: number;
    readonly goldReward: GoldReward;
    readonly equipments: readonly { slot: EquipSlot; slotIndex: number; itemDataId: string; name: string }[];
}

export interface MonsterRespawnDisplaySnapshot {
    readonly duration: number;
    readonly remaining: number;
}

export const LONG_BOSS_RESPAWN_THRESHOLD_SECONDS = 5 * 60;
/** 일반 사냥터의 몬스터 밀도가 레벨 구간에 따라 달라지지 않도록 사용하는 표준 리젠 시간. */
export const STANDARD_MONSTER_RESPAWN_SECONDS = 30;
/** 보스가 마지막 교전 대상을 잃은 뒤 회복을 시작하기까지 기다리는 시간. */
export const BOSS_RECOVERY_DELAY_SECONDS = 10;
/** 교전이 끊긴 보스가 초당 회복하는 최대 생명력 비율. */
export const BOSS_RECOVERY_RATIO_PER_SECOND = 0.1;

/** 보스의 두 공격 몫을 배분한다. 혼자면 같은 대상이 두 몫, 둘 이상이면 서로 다른 대상이 한 몫씩 받는다. */
export function allocateBossPressureTargets<T>(primary: T, candidates: readonly T[]): readonly [T, T] {
    const secondary = candidates.find(candidate => candidate !== primary) ?? primary;
    return [primary, secondary];
}

export function resolveMonsterRespawnTime(
    monsterDataId: string,
    configuredRespawnTime: number,
): number {
    const data = getMonsterData(monsterDataId);
    if (!data) throw new Error(`MonsterData not found: ${monsterDataId}`);
    if (!data.tags.includes(GameTags.ENTITY_BOSS)) return STANDARD_MONSTER_RESPAWN_SECONDS;
    return Number.isFinite(configuredRespawnTime)
        ? Math.max(0, configuredRespawnTime)
        : STANDARD_MONSTER_RESPAWN_SECONDS;
}

export default class Monster extends Entity {
    readonly monsterDataId: string;
    override readonly name: string;
    readonly drops: DropInfo[];
    readonly expReward: number;
    readonly goldReward: GoldReward;
    readonly respawnTime: number;
    /** true이면 일회성 몬스터 — 사망 시 리스폰 없이 즉시 제거 */
    readonly isOneShot: boolean;
    /** 플레이어와 동일한 SkillData를 실행하되 DB에는 저장하지 않는 런타임 스킬북. */
    readonly skills: SkillBook;
    private readonly attackProfile?: Readonly<MonsterAttackProfile>;
    private readonly skillPattern?: Readonly<MonsterSkillPattern>;
    private readonly challengePattern?: Readonly<MonsterChallengePattern>;
    private readonly bossNarrative?: Readonly<BossNarrative>;
    private readonly threat: ThreatTable;
    /** 최초로 공격한 플레이어와 당시 파티원에게만 허용되는 런타임 교전 선점. */
    private readonly combatClaimUserIds = new Set<number>();
    /** 인스턴스 참가 권한은 아직 비어 있는 방에서 위협도가 소멸해도 유지한다. */
    private readonly authorizedCombatUserIds = new Set<number>();
    private skillPatternIndex = 0;
    private skillPatternTimer = 0;
    private challengePatternTimer = 0;
    private challengeActive = false;
    private challengeGeneration = 0;
    private challengeCancel?: () => void;
    private challengeUpdate?: (dt: number) => void;
    private bossEncounterActive = false;
    private bossIntroTimer = 0;
    private readonly spokenBossPhases = new Set<number>();
    private bossRecoveryDelayTimer = 0;
    private bossRecoveryActive = false;

    override get deathDuration(): number { return this.respawnTime; }
    get isChallengePatternActive(): boolean { return this.challengeActive; }
    get isBossIntroActive(): boolean { return this.bossIntroTimer > 0; }
    get isBossRecovering(): boolean { return this.bossRecoveryActive; }
    override getDisplayIcon(): string { return getMonsterData(this.monsterDataId)?.icon ?? `monsters/${this.monsterDataId}`; }

    /** 위치 UI가 장기 리젠 보스만 가공해 표시하도록 반환하는 공개 스냅샷. */
    getRespawnDisplaySnapshot(): MonsterRespawnDisplaySnapshot | undefined {
        if (this.isOneShot
            || !this.hasTag(GameTags.ENTITY_BOSS)
            || this.respawnTime <= LONG_BOSS_RESPAWN_THRESHOLD_SECONDS) return undefined;
        return {
            duration: Math.ceil(this.respawnTime),
            remaining: Math.ceil(this.isDefeated ? Math.max(0, this.deathTimer) : this.respawnTime),
        };
    }

    constructor(monsterDataId: string, locationId = '', respawnTime = 10, isOneShot = false) {
        const data = getMonsterData(monsterDataId);
        if (!data) throw new Error(`MonsterData not found: ${monsterDataId}`);

        const equipment = Equipment.createEmpty();
        const traitTags = data.tags.includes(GameTags.TRAIT_INANIMATE) ? [] : [GameTags.TRAIT_LIVING];
        const scaledBaseAttribute = {
            ...data.baseAttribute,
            // 플레이어 이동속도는 민첩과 함께 선형 성장하므로 몬스터 원형의 상대 속도도 레벨에 맞춰 보존한다.
            speed: (data.baseAttribute.speed ?? 1) * (1 + Math.max(0, data.level - 1) / 50),
        };
        super(data.level, data.exp, locationId, scaledBaseAttribute, equipment, undefined, [GameTags.ENTITY_MONSTER, ...traitTags, ...data.tags]);

        this.monsterDataId = monsterDataId;
        this.name = data.name;
        this.drops = data.drops;
        this.expReward = data.expReward;
        this.goldReward = data.goldReward ?? 0;
        this.respawnTime = resolveMonsterRespawnTime(monsterDataId, respawnTime);
        this.isOneShot = isOneShot;
        this.attackProfile = data.attack ? {
            ...data.attack,
            effect: data.attack.effect ? { ...data.attack.effect } : undefined,
        } : undefined;
        this.skillPattern = data.skillPattern ? {
            ...data.skillPattern,
            sequence: [...data.skillPattern.sequence],
            interval: { ...data.skillPattern.interval },
        } : undefined;
        this.challengePattern = data.challengePattern ? {
            ...data.challengePattern,
            interval: { ...data.challengePattern.interval },
        } : undefined;
        this.bossNarrative = data.bossNarrative ? {
            ...data.bossNarrative,
            phases: data.bossNarrative.phases.map(phase => ({ ...phase })),
        } : undefined;
        this.skillPatternTimer = this.skillPattern?.initialDelay ?? 0;
        this.challengePatternTimer = this.challengePattern?.initialDelay ?? 0;
        this.skills = SkillBook.createRuntime(this, data.skills ?? []);
        this.threat = new ThreatTable(
            this,
            normalizeMonsterAiProfile(data.ai),
            actor => this.canRecordCombatContribution(actor),
        );

        // 기본 장비 장착
        for (const eq of data.equipments) {
            const itemData = getItemData(eq.itemDataId);
            if (!itemData) continue;
            const item = new Item(eq.itemDataId, 1, itemData.baseDurability, null);
            this.equipment.equip(eq.slot, item, this.attribute, eq.slotIndex);
        }
    }

    /** 보유한 실제 SkillData를 몬스터 AI나 외부 패턴 로직에서 직접 발동한다. */
    activateSkill(skillDataId: string): SkillActivationOutcome {
        return this.skills.activateById(skillDataId);
    }

    /** 스킬·상태효과가 raw threat table 없이 행동별 위협도를 기록하는 공개 API. */
    recordThreat(actor: Entity, action: ThreatAction, amount: number): boolean {
        if (!this.canJoinCombatClaim(actor.attackOwner)) return false;
        if (!this.threat.record(actor, action, amount)) return false;
        this.currentTarget = this.threat.selectTarget(this.currentTarget);
        return true;
    }

    taunt(actor: Entity, power: number): boolean {
        const source = actor.attackOwner;
        if (!this.recordThreat(source, ThreatAction.TAUNT, power)) return false;
        emitGameEvent(GameEventIds.MONSTER_TAUNTED, {
            actor: source,
            subject: this,
            data: { power },
        });
        return true;
    }

    getThreatContributions() {
        return this.threat.getContributionSnapshots();
    }

    /** 처치 reset 전후 Entity 수명과 무관하게 복사해서 쓸 수 있는 userId 기반 기여 원장. */
    getDefeatContributionSnapshot(): readonly DefeatContributionSnapshot[] {
        return this.threat.getDefeatContributionSnapshot();
    }

    override getDefeatCreditUserIds(): readonly number[] {
        return Object.freeze([...new Set(this.getDefeatContributionSnapshot()
            .filter(contribution => contribution.total > 0)
            .map(contribution => contribution.userId))]);
    }

    getCombatClaimUserIds(): readonly number[] {
        return [...this.combatClaimUserIds];
    }

    /** 명단 비강제 인스턴스 참가자가 파티 claim과 무관하게 같은 몬스터를 공격하도록 허용한다. */
    authorizeCombatParticipants(userIds: readonly number[]): void {
        for (const userId of userIds) {
            if (!Number.isSafeInteger(userId) || userId <= 0) continue;
            this.authorizedCombatUserIds.add(userId);
            this.combatClaimUserIds.add(userId);
        }
        this.threat.retainPlayerUserIds(this.combatClaimUserIds);
        this.currentTarget = this.threat.selectTarget(this.currentTarget);
    }

    /**
     * 보스방 감지처럼 피해가 발생하기 전 시작되는 교전을 위협도 테이블에 등록한다.
     * 이미 참여 중인 대상은 매 tick 위협도가 중복 누적되지 않는다.
     */
    engageIntruder(actor: Entity): boolean {
        const target = actor.attackOwner;
        if (this.isDefeated || target.isDefeated || target.locationId !== this.locationId
            || !this.canJoinCombatClaim(target) || this.threat.hasParticipant(target)) return false;
        this.resetBossRecovery();
        this.recordThreat(target, ThreatAction.ATTACK, 1);
        this.startBossEncounter();
        return true;
    }

    override getAttackDeniedReason(attacker: Entity): string | undefined {
        const inherited = super.getAttackDeniedReason(attacker);
        if (inherited) return inherited;
        const userId = attacker.attackOwner.playerUserId;
        return userId !== undefined && this.combatClaimUserIds.size > 0
            && !this.combatClaimUserIds.has(userId)
            ? '이미 다른 플레이어 또는 파티가 교전 중인 대상입니다.'
            : undefined;
    }

    override acquireCombatTarget(attacker: Entity): boolean {
        this.resetBossRecovery();
        this.claimCombat(attacker.attackOwner);
        const previous = this.currentTarget;
        this.recordThreat(attacker, ThreatAction.ATTACK, 1);
        this.startBossEncounter();
        return previous !== this.currentTarget;
    }

    /** 현재 능력치와 마스터 설명·공격·보상을 합친 감정용 불변 스냅샷. */
    getInspectionSnapshot(): MonsterInspectionSnapshot {
        const data = getMonsterData(this.monsterDataId);
        if (!data) throw new Error(`MonsterData not found: ${this.monsterDataId}`);
        const goldReward = typeof this.goldReward === 'number'
            ? this.goldReward
            : { ...this.goldReward };
        return {
            monsterDataId: this.monsterDataId,
            icon: this.getDisplayIcon(),
            name: this.name,
            description: data.description,
            level: this.level,
            defeated: this.isDefeated,
            defeatLabel: this.defeatLabel,
            life: this.life,
            shields: this.getShieldBarSegments(),
            attributes: { ...this.attribute.computed },
            tags: this.tags.values(),
            attack: this.attackProfile ? {
                ...this.attackProfile,
                effect: this.attackProfile.effect ? { ...this.attackProfile.effect } : undefined,
            } : null,
            skills: this.skills.getAll().map(skill => ({
                skillDataId: skill.skillDataId,
                name: skill.name,
                level: skill.level,
            })),
            skillPattern: this.skillPattern ? {
                ...this.skillPattern,
                sequence: [...this.skillPattern.sequence],
                interval: { ...this.skillPattern.interval },
            } : null,
            drops: this.drops.map(drop => ({ ...drop })),
            expReward: this.expReward,
            goldReward,
            equipments: this.equipment.getAllEquipped().map(entry => ({
                slot: entry.slot,
                slotIndex: entry.slotIndex,
                itemDataId: entry.item.itemDataId,
                name: entry.item.name || entry.item.itemDataId,
            })),
        };
    }

    /** 타겟 공격 AI */
    override update(dt: number): void {
        if (this.isDead) return;

        if (this.updateBossEncounter(dt)) return;

        const location = getLocation(this.locationId);
        if(!location) return;

        this.threat.update(dt);
        if (this.combatClaimUserIds.size > 0
            && !this.threat.hasActiveParticipantUserIds(this.combatClaimUserIds)) {
            this.combatClaimUserIds.clear();
            for (const userId of this.authorizedCombatUserIds) this.combatClaimUserIds.add(userId);
        }
        this.currentTarget = this.threat.selectTarget(this.currentTarget);
        const target = this.currentTarget;
        if (!target || target.isDefeated || target.locationId !== this.locationId) {
            this.currentTarget = null;
            this.skills.finishAll(SkillFinishReason.CANCELLED);
            this.skillPatternTimer = this.skillPattern?.initialDelay ?? 0;
            this.skillPatternIndex = 0;
            this.resetChallengePattern();
            this.resetBossEncounter();
            this.updateBossRecovery(dt);
            return;
        }

        this.resetBossRecovery();
        const wasSkillActive = this.skills.hasActiveSkill();
        this.skills.update(dt);
        if (wasSkillActive || this.skills.hasActiveSkill()) return;

        if (this.challengeActive) {
            try {
                this.challengeUpdate?.(Math.max(0, dt));
            } catch (error) {
                logger.error(`보스 challenge 갱신 실패: ${this.monsterDataId}`, error);
                this.resetChallengePattern();
            }
            return;
        }
        if (this.challengePattern) {
            this.challengePatternTimer -= dt;
            if (this.challengePatternTimer <= 0 && this.startChallengePattern(target)) return;
        }

        if (this.skillPattern) {
            this.skillPatternTimer -= dt;
            if (this.skillPatternTimer <= 0) {
                const sequence = this.skillPattern.sequence;
                const startIndex = this.skillPattern.randomOrder
                    ? Math.floor(Math.random() * sequence.length)
                    : this.skillPatternIndex;
                let outcome: SkillActivationOutcome | undefined;
                for (let offset = 0; offset < (this.skillPattern.randomOrder ? sequence.length : 1); offset++) {
                    const skillId = sequence[(startIndex + offset) % sequence.length];
                    outcome = skillId ? this.activateSkill(skillId) : undefined;
                    if (outcome?.activated) break;
                }
                if (outcome?.activated) {
                    if (!this.skillPattern.randomOrder) {
                        this.skillPatternIndex = (this.skillPatternIndex + 1) % this.skillPattern.sequence.length;
                    }
                    this.skillPatternTimer = rollRange(this.skillPattern.interval);
                    return;
                }
                // 일반 공격 쿨다운 등 일시적 조건이면 짧게 재시도한다.
                this.skillPatternTimer = 0.5;
            }
        }
        this.performBasicAttack(target);
    }

    private performBasicAttack(primaryTarget: Entity): void {
        const targets = this.hasTag(GameTags.ENTITY_BOSS)
            ? allocateBossPressureTargets(primaryTarget, this.getEligibleBossPressureTargets(primaryTarget))
            : [primaryTarget] as const;
        targets.forEach((target, index) => {
            if (target.isDefeated || target.locationId !== this.locationId) return;
            // 한 AI 행동 안의 두 몫은 하나의 공격 주기를 공유한다.
            if (index > 0) this._attackCooldown = 0;
            const result = this.attack(target, this.attackProfile?.damageType ?? 'physical');
            const effect = this.attackProfile?.effect;
            if (result && !result.evaded && effect && Math.random() < effect.chance) {
                const type = StatusEffectType.fromKey(effect.statusEffectId);
                if (type) target.applyStatusEffect(type, effect.duration, effect.level, this);
            }
        });
    }

    private getEligibleBossPressureTargets(primaryTarget: Entity): Entity[] {
        const claimed = this.combatClaimUserIds;
        const players = getOnlinePlayerUserIdsAtLocation(this.locationId)
            .filter(userId => claimed.size === 0 || claimed.has(userId))
            .flatMap(userId => {
                const player = getOnlinePlayer(userId);
                return player && player.isWorldActive && !player.isDefeated ? [player] : [];
            });
        return primaryTarget.isWorldActive && !primaryTarget.isDefeated
            ? [primaryTarget, ...players.filter(player => player !== primaryTarget)]
            : players;
    }

    override onDeath(): void {
        // 이후 super/on-shot dispose/reset이 런타임 참조를 정리해도 지급 입력이 바뀌지 않게 먼저 복사한다.
        const claimedUserIds = this.getCombatClaimUserIds();
        const contributions = this.getDefeatContributionSnapshot();
        const lethalCause = this.lastLethalDamageCause;
        const lethalOwner = resolveDamageCauseActor(lethalCause);
        const rewardOwner = this.threat.getPrimaryContributor()
            ?? lethalOwner
            ?? resolveDamageCauseActor(this.lastDamageCause);
        const lastAttackOwnerUserId = getDamageCauseActorPlayerId(this.lastDamageCause);
        const actualLethalUserId = getDamageCauseActorPlayerId(lethalCause);
        this.resetBossRecovery();
        this.resetBossEncounter();
        this.resetChallengePattern();
        this.skills.finishAll();
        super.onDeath();

        const expGrants = partyManager.distributeMonsterExp(this.expReward, this.locationId, {
            claimedUserIds,
            contributions,
            monsterLevel: this.level,
            lowLevelPenaltyEligible: !this.hasTag(GameTags.ENTITY_BOSS),
            ...(lastAttackOwnerUserId !== undefined ? { lastAttackOwnerUserId } : {}),
            ...(actualLethalUserId !== undefined ? { actualLethalUserId } : {}),
        });
        // 전리품·골드 소유자는 기존 최고 위협 기여자 semantics를 유지하고 EXP eligibility와 분리한다.
        const causePlayer = rewardOwner?.isPlayer ? rewardOwner as Player : undefined;
        if(causePlayer) {
            const attackOwner: Entity = causePlayer;

            attackOwner.currentTarget = null;
            causePlayer.titles?.refreshPassiveEffects();

            const drops = this.rollDrops();
            let groundDropCount = 0;
            for (const drop of drops) {
                if (causePlayer.receiveLoot(drop.itemDataId, drop.count) === 'ground') {
                    groundDropCount += drop.count;
                }
            }
            const goldGained = this.rollGold();
            if (goldGained > 0) causePlayer.gold += goldGained;
            const killerGrant = expGrants.find(grant => grant.userId === causePlayer.userId);
            const levelsGained = killerGrant?.levelsGained ?? [];

            const killMsg = chat()
                .color('gold', b => b.text(`${this.name} 처치 완료!\n`))
                .weight('bold', b => b.text('[ 보상 ]'))
                .text(`\nEXP +${killerGrant?.grantedExp ?? 0}`);

            if ((killerGrant?.levelGapMultiplier ?? 1) < 1) {
                killMsg.color('red', b => b.text(` (${Math.round((killerGrant?.levelGapMultiplier ?? 1) * 100)}% · 레벨 차이 ${killerGrant?.levelGap})`));
            }
            if ((killerGrant?.lowLevelMonsterMultiplier ?? 1) < 1) {
                killMsg.color('red', b => b.text(` (${Math.round((killerGrant?.lowLevelMonsterMultiplier ?? 1) * 100)}% · 저레벨 일반 몬스터)`));
            }

            if (goldGained > 0) {
                killMsg.text(`\nGold +${goldGained}`);
            }

            if (drops.length > 0) {
                const dropNames = drops.map(d => {
                    const data = getItemData(d.itemDataId);
                    return `${data?.name ?? d.itemDataId} x${d.count}`;
                }).join('\n');
                killMsg.text(`\n${dropNames}`);
            }
            if (groundDropCount > 0) {
                killMsg.color('red', b => b.text(
                    `\n인벤토리 공간이 부족해 전리품 ${groundDropCount}개가 바닥에 떨어졌습니다.`,
                ));
            }

            if (levelsGained.length > 0) {
                killMsg.text('\n')
                    .color('aqua', b => b.text(`레벨 업! Lv.${levelsGained[levelsGained.length - 1]}`))
                    .text(`  가용 스탯 포인트 +${levelsGained.length * 3} (현재 ${causePlayer.statPoint})`);
            }

            sendBotMessageToUser(causePlayer.userId, killMsg.build());

            for (const grant of expGrants) {
                if (grant.userId === causePlayer.userId) continue;
                const shared = chat()
                    .color('gold', b => b.text(`[ 파티 보상 ] ${this.name} 처치`))
                    .text(`\nEXP +${grant.grantedExp}`);
                if (grant.levelGapMultiplier < 1) {
                    shared.color('red', b => b.text(` (${Math.round(grant.levelGapMultiplier * 100)}% · 최고 레벨과 ${grant.levelGap} 차이)`));
                }
                if (grant.lowLevelMonsterMultiplier < 1) {
                    shared.color('red', b => b.text(` (${Math.round(grant.lowLevelMonsterMultiplier * 100)}% · 저레벨 일반 몬스터)`));
                }
                if (grant.levelsGained.length > 0) {
                    shared.text('\n').color('aqua', b => b.text(`레벨 업! Lv.${grant.levelsGained[grant.levelsGained.length - 1]}`));
                }
                sendBotMessageToUser(grant.userId, shared.build());
            }
        }

        if (this.isOneShot) {
            this.deathTimer = 0;
            this.threat.dispose();
            getLocation(this.locationId)?.removeObject(this);
        }
        this.combatClaimUserIds.clear();
        this.authorizedCombatUserIds.clear();
        this.threat.clear();
    }

    override respawn(): void {
        super.respawn();
        this.resetBossRecovery();
        this.resetBossEncounter();
        this.combatClaimUserIds.clear();
        this.authorizedCombatUserIds.clear();
        this.threat.clear();
        this.skillPatternTimer = this.skillPattern?.initialDelay ?? 0;
        this.skillPatternIndex = 0;
        this.resetChallengePattern();
    }

    private startChallengePattern(target: Entity): boolean {
        const pattern = this.challengePattern;
        const handler = pattern ? challengeHandlers.get(pattern.handler) : undefined;
        if (!pattern || !handler) {
            this.challengePatternTimer = 1;
            return false;
        }
        const generation = ++this.challengeGeneration;
        this.challengeActive = true;
        const handle = handler({
            monster: this,
            target,
            complete: () => {
                if (generation !== this.challengeGeneration || !this.challengeActive) return;
                this.challengeActive = false;
                this.challengeCancel = undefined;
                this.challengeUpdate = undefined;
                this.challengePatternTimer = rollRange(pattern.interval);
            },
        });
        if (handle === false) {
            this.challengeActive = false;
            this.challengePatternTimer = 0.5;
            return false;
        }
        if (generation !== this.challengeGeneration || !this.challengeActive) return true;
        this.challengeCancel = handle.cancel;
        this.challengeUpdate = handle.update;
        return true;
    }

    private resetChallengePattern(): void {
        const cancel = this.challengeCancel;
        this.challengeCancel = undefined;
        this.challengeUpdate = undefined;
        this.challengeGeneration++;
        this.challengeActive = false;
        this.challengePatternTimer = this.challengePattern?.initialDelay ?? 0;
        cancel?.();
    }

    private startBossEncounter(): void {
        const narrative = this.bossNarrative;
        if (!narrative || this.bossEncounterActive || this.isDefeated) return;
        this.bossEncounterActive = true;
        this.bossIntroTimer = narrative.introDuration;
        this.spokenBossPhases.clear();
        this.setDamageReceivedModifier('boss:introduction', 0);

        const data = getMonsterData(this.monsterDataId);
        const message = chat()
            .color('gold', builder => builder.weight('bold', nested => nested.text(`[ 보스 조우 ] ${this.name}`)))
            .text(data?.description ? `\n${data.description}` : '')
            .color('#d9b879', builder => builder.text(`\n“${narrative.introLine}”`))
            .color('$text-tertiary', builder => builder.text(`\n${narrative.introDuration}초 동안 공격이 통하지 않습니다.`))
            .build();
        sendBotMessageToUsersAtLocation(this.locationId, message);
    }

    /** 도입 무적과 체력 구간 대사를 갱신하고, 도입 중이면 AI 정지를 알린다. */
    private updateBossEncounter(dt: number): boolean {
        const narrative = this.bossNarrative;
        if (!narrative || !this.bossEncounterActive) return false;
        let target = this.currentTarget;
        if (!target || target.isDefeated || target.locationId !== this.locationId) {
            this.currentTarget = this.threat.selectTarget(null);
            target = this.currentTarget;
        }
        if (!target || target.isDefeated || target.locationId !== this.locationId) {
            this.resetBossEncounter();
            return false;
        }
        if (this.bossIntroTimer > 0) {
            this.bossIntroTimer = Math.max(0, this.bossIntroTimer - Math.max(0, dt));
            if (this.bossIntroTimer <= 0) {
                this.removeDamageReceivedModifier('boss:introduction');
                sendBotMessageToUsersAtLocation(this.locationId, chat()
                    .color('red', builder => builder.weight('bold', nested => nested.text(`[ 전투 개시 ] ${this.name}`)))
                    .text('\n보스의 무적 상태가 해제되었습니다.')
                    .build());
            }
            return true;
        }

        const lifeRatio = this.maxLife > 0 ? Math.max(0, this.life) / this.maxLife : 0;
        narrative.phases.forEach((phase, index) => {
            if (lifeRatio > phase.lifeRatio || this.spokenBossPhases.has(index)) return;
            this.spokenBossPhases.add(index);
            sendBotMessageToUsersAtLocation(this.locationId, chat()
                .color('gold', builder => builder.weight('bold', nested => nested.text(`${this.name}`)))
                .color('#d9b879', builder => builder.text(`\n“${phase.line}”`))
                .build());
        });
        return false;
    }

    private resetBossEncounter(): void {
        this.bossEncounterActive = false;
        this.bossIntroTimer = 0;
        this.spokenBossPhases.clear();
        this.removeDamageReceivedModifier('boss:introduction');
    }

    /**
     * 보스가 교전 대상을 잃고 10초가 지나면 누적 시간에 맞춰 최대 생명력의 10%/초를 회복한다.
     * 프레임 길이가 달라도 회복량과 시작 시점이 달라지지 않도록 지연을 넘긴 dt만 사용한다.
     */
    private updateBossRecovery(dt: number): void {
        if (!this.hasTag(GameTags.ENTITY_BOSS) || this.isDefeated || this.life >= this.maxLife) {
            this.resetBossRecovery();
            return;
        }

        const elapsed = Math.max(0, dt);
        const previousDelay = this.bossRecoveryDelayTimer;
        this.bossRecoveryDelayTimer += elapsed;
        if (this.bossRecoveryDelayTimer < BOSS_RECOVERY_DELAY_SECONDS) return;

        if (!this.bossRecoveryActive) {
            this.bossRecoveryActive = true;
            sendBotMessageToUsersAtLocation(this.locationId, chat()
                .color('gold', builder => builder.weight('bold', nested => nested.text(`[ 전투 이탈 ] ${this.name}`)))
                .text('\n보스가 침입자를 찾지 못해 생명력을 회복하기 시작합니다.')
                .build());
        }

        const recoverySeconds = Math.max(
            0,
            this.bossRecoveryDelayTimer - Math.max(previousDelay, BOSS_RECOVERY_DELAY_SECONDS),
        );
        if (recoverySeconds <= 0) return;
        this.life = Math.min(
            this.maxLife,
            this.life + this.maxLife * BOSS_RECOVERY_RATIO_PER_SECOND * recoverySeconds,
        );
        if (this.life < this.maxLife) return;

        this.combatClaimUserIds.clear();
        for (const userId of this.authorizedCombatUserIds) this.combatClaimUserIds.add(userId);
        this.threat.clear();
        this.resetBossRecovery();
    }

    private resetBossRecovery(): void {
        this.bossRecoveryDelayTimer = 0;
        this.bossRecoveryActive = false;
    }

    private canJoinCombatClaim(actor: Entity): boolean {
        const userId = actor.attackOwner.playerUserId;
        return userId === undefined || this.combatClaimUserIds.size === 0 || this.combatClaimUserIds.has(userId);
    }

    /** 모든 피해·치유·흡수·제어 기여가 공유하는 claim/위치 검증. */
    private canRecordCombatContribution(actor: Entity): boolean {
        const owner = actor.attackOwner;
        return owner.locationId === this.locationId && this.canJoinCombatClaim(owner);
    }

    protected override onDamageResolved(result: DamageResult, cause: DamageCause | null): void {
        const actor = cause?.causeEntity;
        const amount = result.lifeDamage + result.absorbedDamage;
        if (actor && amount > 0) {
            this.recordThreat(actor, ThreatAction.DAMAGE, amount);
            return;
        }
        const actorPlayerId = getDamageCauseActorPlayerId(cause);
        // raw source가 사라진 효과는 AI 타겟을 되살리지 않고 실제 생명력 피해만 보상 원장에 남긴다.
        if (actorPlayerId === undefined || result.lifeDamage <= 0) return;
        if (this.combatClaimUserIds.size === 0) this.combatClaimUserIds.add(actorPlayerId);
        if (!this.combatClaimUserIds.has(actorPlayerId)) return;
        this.threat.recordDetachedDamageByUserId(actorPlayerId, result.lifeDamage);
    }

    protected override onStatusEffectUptime(effect: StatusEffect, activeDuration: number): void {
        if (effect.type.controlCategory === ControlCategory.NONE || !effect.source) return;
        this.recordThreat(
            effect.source,
            ThreatAction.CONTROL,
            this.maxLife * 0.01 * activeDuration,
        );
    }

    private claimCombat(actor: Entity): void {
        const userId = actor.attackOwner.playerUserId;
        if (userId === undefined || this.combatClaimUserIds.size > 0) return;
        const party = partyManager.getParty(userId);
        for (const memberUserId of party?.memberUserIds ?? [userId]) {
            this.combatClaimUserIds.add(memberUserId);
        }
        this.threat.retainPlayerUserIds(this.combatClaimUserIds);
        this.currentTarget = this.threat.selectTarget(this.currentTarget);
    }

    /** 골드 보상을 굴려 최종 지급량 반환 */
    rollGold(): number {
        const r = this.goldReward;
        if (typeof r === 'number') return r;
        return Math.floor(Math.random() * (r.max - r.min + 1) + r.min);
    }

    /** 드롭 테이블을 굴려 드롭 아이템 목록 반환 */
    rollDrops(): { itemDataId: string; count: number }[] {
        const result: { itemDataId: string; count: number }[] = [];
        for (const drop of this.drops) {
            if (Math.random() < drop.chance) {
                const count = Math.floor(
                    Math.random() * (drop.maxCount - drop.minCount + 1) + drop.minCount
                );
                if (count > 0) {
                    result.push({ itemDataId: drop.itemDataId, count });
                }
            }
        }
        return result;
    }
}

// -- MonsterData 캐시 --

const monsterDataCache = new Map<string, MonsterData>();

/** 몬스터 정의 등록 (data/monsters.ts에서 호출) */
export function defineMonster(data: MonsterData): void {
    if (!data.id.trim() || !Number.isInteger(data.level) || data.level < 1) {
        throw new Error(`Invalid MonsterData: ${data.id}`);
    }
    const effect = data.attack?.effect;
    const pattern = data.skillPattern;
    const challengePattern = data.challengePattern;
    const bossNarrative = data.bossNarrative;
    if (effect && (!StatusEffectType.fromKey(effect.statusEffectId)
        || !Number.isFinite(effect.chance) || effect.chance < 0 || effect.chance > 1
        || !Number.isFinite(effect.duration) || effect.duration <= 0
        || !Number.isInteger(effect.level) || effect.level < 1)) {
        throw new Error(`Invalid monster attack effect: ${data.id}`);
    }
    if (pattern && (pattern.sequence.length === 0
        || pattern.sequence.some(id => !data.skills?.some(skill => skill.skillDataId === id))
        || !Number.isFinite(pattern.initialDelay) || pattern.initialDelay < 0
        || !Number.isFinite(pattern.interval.min) || !Number.isFinite(pattern.interval.max)
        || pattern.interval.min <= 0 || pattern.interval.max < pattern.interval.min)) {
        throw new Error(`Invalid monster skill pattern: ${data.id}`);
    }
    if (challengePattern && (!challengePattern.handler.trim()
        || !Number.isFinite(challengePattern.initialDelay) || challengePattern.initialDelay < 0
        || !Number.isFinite(challengePattern.interval.min) || !Number.isFinite(challengePattern.interval.max)
        || challengePattern.interval.min <= 0 || challengePattern.interval.max < challengePattern.interval.min)) {
        throw new Error(`Invalid monster challenge pattern: ${data.id}`);
    }
    if (bossNarrative && (!Number.isFinite(bossNarrative.introDuration)
        || bossNarrative.introDuration < 1 || bossNarrative.introDuration > 10
        || !bossNarrative.introLine.trim()
        || bossNarrative.phases.length === 0
        || bossNarrative.phases.some(phase => !Number.isFinite(phase.lifeRatio)
            || phase.lifeRatio <= 0 || phase.lifeRatio >= 1 || !phase.line.trim())
        || bossNarrative.phases.some((phase, index) =>
            index > 0 && phase.lifeRatio >= bossNarrative.phases[index - 1]!.lifeRatio))) {
        throw new Error(`Invalid boss narrative: ${data.id}`);
    }
    monsterDataCache.set(data.id, {
        ...data,
        baseAttribute: { ...data.baseAttribute },
        statWeights: data.statWeights ? { ...data.statWeights } : undefined,
        drops: data.drops.map(drop => ({ ...drop })),
        equipments: data.equipments.map(equipment => ({ ...equipment })),
        attack: data.attack ? {
            ...data.attack,
            effect: effect ? { ...effect } : undefined,
        } : undefined,
        skills: data.skills?.map(skill => ({ ...skill })),
        skillPattern: pattern ? {
            ...pattern,
            sequence: [...pattern.sequence],
            interval: { ...pattern.interval },
        } : undefined,
        challengePattern: challengePattern ? {
            ...challengePattern,
            interval: { ...challengePattern.interval },
        } : undefined,
        bossNarrative: bossNarrative ? {
            ...bossNarrative,
            phases: bossNarrative.phases.map(phase => ({ ...phase })),
        } : undefined,
        ai: data.ai ? {
            ...data.ai,
            weights: data.ai.weights ? { ...data.ai.weights } : undefined,
        } : undefined,
        tags: normalizeTags(data.tags),
    });
}

/** 몬스터 정의 조회 */
export function getMonsterData(id: string): MonsterData | undefined {
    return monsterDataCache.get(id);
}

/** 모든 몬스터 정의 조회 */
export function getAllMonsterData(): MonsterData[] {
    return Array.from(monsterDataCache.values());
}

function rollRange(range: { min: number; max: number }): number {
    return range.min + Math.random() * (range.max - range.min);
}
