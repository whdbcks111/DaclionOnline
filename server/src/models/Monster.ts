import Entity from "./Entity.js";
import type { DamageType } from "./Entity.js";
import Equipment from "./Equipment.js";
import { Item, getItemData } from "./Item.js";
import type { AttributeRecord } from "./Attribute.js";
import type { EquipSlot } from "./Equipment.js";
import { getLocation } from "./Location.js";
import type Player from "./Player.js";
import { chat } from "../utils/chatBuilder.js";
import { sendBotMessageToUser } from "../modules/message.js";
import { GameTags, normalizeTags } from "../../../shared/tags.js";
import type { TagId } from "../../../shared/tags.js";
import { StatusEffectType } from "./StatusEffect.js";
import SkillBook from "./SkillBook.js";
import type { RuntimeSkillEntry, SkillActivationOutcome } from "./SkillBook.js";
import { partyManager } from '../modules/party.js';
import type { ShieldBarSegment } from '../../../shared/types.js';
import { CombatStage, registerCombatHook } from './CombatPipeline.js';
import {
    MonsterAiDisposition,
    normalizeMonsterAiProfile,
    ThreatAction,
    ThreatTable,
    type MonsterAiProfileInput,
} from './Threat.js';

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

export interface MonsterChallengeContext {
    monster: Monster;
    target: Entity;
    complete: () => void;
}

export interface MonsterChallengeHandle {
    cancel?: () => void;
}

export type MonsterChallengeHandler = (context: MonsterChallengeContext) => MonsterChallengeHandle | false;

const challengeHandlers = new Map<string, MonsterChallengeHandler>();

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
    level: number;
    exp: number;
    baseAttribute: Partial<AttributeRecord>;
    drops: DropInfo[];
    expReward: number;
    goldReward?: GoldReward;
    equipments: MonsterEquipInfo[];
    attack?: MonsterAttackProfile;
    skills?: RuntimeSkillEntry[];
    skillPattern?: MonsterSkillPattern;
    challengePattern?: MonsterChallengePattern;
    /** 지능·행동별 위협 가중치·도발 저항을 포함한 AI 마스터 설정. */
    ai?: MonsterAiProfileInput;
    tags: TagId[];
}

/** `/몬스터정보`가 런타임 Monster 내부 상태를 직접 참조하지 않고 사용하는 스냅샷. */
export interface MonsterInspectionSnapshot {
    readonly monsterDataId: string;
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
    private readonly threat: ThreatTable;
    private skillPatternIndex = 0;
    private skillPatternTimer = 0;
    private challengePatternTimer = 0;
    private challengeActive = false;
    private challengeGeneration = 0;
    private challengeCancel?: () => void;

    override get deathDuration(): number { return this.respawnTime; }
    get isChallengePatternActive(): boolean { return this.challengeActive; }

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
        this.respawnTime = respawnTime;
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
        this.skillPatternTimer = this.skillPattern?.initialDelay ?? 0;
        this.challengePatternTimer = this.challengePattern?.initialDelay ?? 0;
        this.skills = SkillBook.createRuntime(this, data.skills ?? []);
        this.threat = new ThreatTable(this, normalizeMonsterAiProfile(data.ai));

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
    recordThreat(actor: Entity, action: ThreatAction, amount: number): void {
        this.threat.record(actor, action, amount);
        this.currentTarget = this.threat.selectTarget(this.currentTarget);
    }

    taunt(actor: Entity, power: number): void {
        this.recordThreat(actor, ThreatAction.TAUNT, power);
    }

    getThreatContributions() {
        return this.threat.getContributionSnapshots();
    }

    override acquireCombatTarget(attacker: Entity): boolean {
        const previous = this.currentTarget;
        this.recordThreat(attacker, ThreatAction.ATTACK, 1);
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

        const location = getLocation(this.locationId);
        if(!location) return;

        this.threat.update(dt);
        this.currentTarget = this.threat.selectTarget(this.currentTarget);
        const target = this.currentTarget;
        if (!target || target.isDefeated || target.locationId !== this.locationId) {
            this.currentTarget = null;
            this.skillPatternTimer = this.skillPattern?.initialDelay ?? 0;
            this.resetChallengePattern();
            return;
        }

        const wasSkillActive = this.skills.hasActiveSkill();
        this.skills.update(dt);
        if (wasSkillActive || this.skills.hasActiveSkill()) return;

        if (this.challengeActive) return;
        if (this.challengePattern) {
            this.challengePatternTimer -= dt;
            if (this.challengePatternTimer <= 0 && this.startChallengePattern(target)) return;
        }

        if (this.skillPattern) {
            this.skillPatternTimer -= dt;
            if (this.skillPatternTimer <= 0) {
                const skillId = this.skillPattern.sequence[this.skillPatternIndex];
                const outcome = skillId ? this.activateSkill(skillId) : undefined;
                if (outcome?.activated) {
                    this.skillPatternIndex = (this.skillPatternIndex + 1) % this.skillPattern.sequence.length;
                    this.skillPatternTimer = rollRange(this.skillPattern.interval);
                    return;
                }
                // 일반 공격 쿨다운 등 일시적 조건이면 짧게 재시도한다.
                this.skillPatternTimer = 0.5;
            }
        }
        const result = this.attack(target, this.attackProfile?.damageType ?? 'physical');
        const effect = this.attackProfile?.effect;
        if (result && !result.evaded && effect && Math.random() < effect.chance) {
            const type = StatusEffectType.fromKey(effect.statusEffectId);
            if (type) target.applyStatusEffect(type, effect.duration, effect.level);
        }
    }

    override onDeath(): void {
        this.resetChallengePattern();
        this.skills.finishAll();
        super.onDeath();

        const attackOwner = this.threat.getPrimaryContributor()
            ?? this.lastDamageCause?.causeEntity?.attackOwner;
        if(attackOwner?.isPlayer) {
            const causePlayer = attackOwner as Player;

            attackOwner.currentTarget = null;

            const drops = this.rollDrops();
            for (const drop of drops) {
                causePlayer.inventory.addItem(drop.itemDataId, drop.count);
            }
            const goldGained = this.rollGold();
            if (goldGained > 0) causePlayer.gold += goldGained;
            const expGrants = partyManager.distributeMonsterExp(causePlayer, this.expReward, this.locationId);
            const killerGrant = expGrants.find(grant => grant.userId === causePlayer.userId);
            const levelsGained = killerGrant?.levelsGained ?? [];

            const killMsg = chat()
                .color('gold', b => b.text(`${this.name} 처치 완료!\n`))
                .weight('bold', b => b.text('[ 보상 ]'))
                .text(`\nEXP +${killerGrant?.amount ?? 0}`);

            if ((killerGrant?.multiplier ?? 1) < 1) {
                killMsg.color('red', b => b.text(` (${Math.round((killerGrant?.multiplier ?? 1) * 100)}% · 레벨 차이 ${killerGrant?.levelGap})`));
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
                    .text(`\nEXP +${grant.amount}`);
                if (grant.multiplier < 1) {
                    shared.color('red', b => b.text(` (${Math.round(grant.multiplier * 100)}% · 최고 레벨과 ${grant.levelGap} 차이)`));
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
        this.threat.clear();
    }

    override respawn(): void {
        super.respawn();
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
                if (generation !== this.challengeGeneration) return;
                this.challengeActive = false;
                this.challengeCancel = undefined;
                this.challengePatternTimer = rollRange(pattern.interval);
            },
        });
        if (handle === false) {
            this.challengeActive = false;
            this.challengePatternTimer = 0.5;
            return false;
        }
        this.challengeCancel = handle.cancel;
        return true;
    }

    private resetChallengePattern(): void {
        const cancel = this.challengeCancel;
        this.challengeCancel = undefined;
        this.challengeGeneration++;
        this.challengeActive = false;
        this.challengePatternTimer = this.challengePattern?.initialDelay ?? 0;
        cancel?.();
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

registerCombatHook({
    key: 'monster:threat:damage',
    stage: CombatStage.AFTER_DAMAGE,
    filter: context => context.target instanceof Monster && Boolean(context.result),
    run: context => {
        const amount = (context.result?.lifeDamage ?? 0) + (context.result?.absorbedDamage ?? 0);
        if (amount > 0) (context.target as Monster).recordThreat(context.attacker, ThreatAction.DAMAGE, amount);
    },
});

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
    monsterDataCache.set(data.id, {
        ...data,
        baseAttribute: { ...data.baseAttribute },
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
