import prisma from "../config/prisma.js";
import Entity from "./Entity.js";
import Inventory from "./Inventory.js";
import Equipment from "./Equipment.js";
import { StatType } from "./Stat.js";
import type { StatRecord } from "./Stat.js";
import { AttributeType } from "./Attribute.js";
import { getLocation, getRespawnLocation } from "./Location.js";
import { sendBotMessageToUser, sendNotificationToUser } from "../modules/message.js";
import { chat } from "../utils/chatBuilder.js";
import { GameTags } from "../../../shared/tags.js";
import type { TagId } from "../../../shared/tags.js";
import { executeItemAttackOverride } from "../modules/itemAttack.js";
import { defineProgress, PlayerProgress, ProgressType } from "./Progress.js";
import SkillBook from "./SkillBook.js";
import { updateCraftingRecipeDiscovery } from "./Crafting.js";
import { DialogueEndReason, endNpcDialogue } from "./NpcDialogue.js";
import { StatusEffectRemovalReason, StatusEffectType } from './StatusEffect.js';
import QuestBook from './QuestBook.js';
import { markLocationVisited } from './WorldMap.js';
import CareerProfile from './Career.js';
import { Item } from './Item.js';
import { SLOT_MAX, type EquipSlot } from './Equipment.js';
import {
    RankingVisibility,
    createRankingMetricRecord,
    createStoredPlayerRankingMetricRecord,
    isCompleteRankingMetricRecord,
    parseRankingMetricRecord,
    parseRankingVisibility,
    type RankingMetricRecord,
    type StoredPlayerRankingSnapshot,
} from './Ranking.js';
import { DEFAULT_PLAYER_BASE_ATTRIBUTE } from './PlayerDefaults.js';
import { partyManager } from '../modules/party.js';
import { emitGameEvent, GameEventIds } from './GameEvent.js';

export const LEVEL_UP_FREE_STAT_POINTS = 3;

export const PlayerRuntimeProgressIds = Object.freeze({
    /** 사망 패널티 적용 완료 여부와 오프라인 동안 정지할 남은 부활 시간을 함께 나타낸다. */
    DEATH_REMAINING: 'runtime:death_remaining_seconds',
});

defineProgress({
    id: PlayerRuntimeProgressIds.DEATH_REMAINING,
    type: ProgressType.STATE,
    label: '남은 부활 대기시간',
    description: '재접속 시 사망 처리를 반복하지 않고 남은 부활 대기시간을 복원하는 내부 상태입니다.',
    visible: false,
});

export interface PlayerLevelAdjustmentResult {
    readonly previousLevel: number;
    readonly level: number;
    readonly levelDelta: number;
    readonly statPointDelta: number;
    readonly statDeltas: Readonly<StatRecord>;
}

interface PlayerLevelAdjustmentPlan extends PlayerLevelAdjustmentResult {
    readonly stats: Readonly<StatRecord>;
    readonly statPoint: number;
}

/** 상승은 현재 분배를 건드리지 않고 지급분만 더하며, 하락만 성장 규칙을 역산하는 순수 계산 API. */
export function calculatePlayerLevelAdjustment(
    currentLevel: number,
    targetLevel: number,
    currentStats: Readonly<StatRecord>,
    currentStatPoint: number,
): PlayerLevelAdjustmentPlan {
    if (!Number.isInteger(targetLevel) || targetLevel < 1 || targetLevel > 10_000) {
        throw new Error('조정할 레벨은 1~10000 사이의 정수여야 합니다.');
    }
    const levelDelta = targetLevel - currentLevel;
    const beforeStats = { ...currentStats };

    if (levelDelta > 0) {
        const stats = { ...currentStats };
        const statDeltas = {} as StatRecord;
        for (const stat of StatType.values()) {
            statDeltas[stat.key] = levelDelta;
            stats[stat.key] = currentStats[stat.key] + levelDelta;
        }
        const statPointDelta = levelDelta * LEVEL_UP_FREE_STAT_POINTS;
        return {
            previousLevel: currentLevel,
            level: targetLevel,
            levelDelta,
            statPointDelta,
            statDeltas,
            stats,
            statPoint: currentStatPoint + statPointDelta,
        };
    }

    const stats = { ...currentStats };
    let statPoint = Math.max(0, Math.floor(currentStatPoint));
    if (levelDelta < 0) {
        const lostLevels = -levelDelta;
        for (const stat of StatType.values()) stats[stat.key] = Math.max(0, stats[stat.key] - lostLevels);

        let remaining = lostLevels * LEVEL_UP_FREE_STAT_POINTS;
        const availableRemoval = Math.min(statPoint, remaining);
        statPoint -= availableRemoval;
        remaining -= availableRemoval;
        const automaticFloor = Math.max(0, targetLevel - 1);
        while (remaining > 0) {
            const removable = StatType.values().map(stat => ({
                stat,
                amount: Math.max(0, stats[stat.key] - automaticFloor),
            }));
            const total = removable.reduce((sum, entry) => sum + entry.amount, 0);
            if (total <= 0) break;
            let removedThisPass = 0;
            for (const entry of removable) {
                if (entry.amount <= 0 || remaining <= 0) continue;
                const share = Math.max(1, Math.floor(remaining * entry.amount / total));
                const amount = Math.min(entry.amount, share, remaining);
                stats[entry.stat.key] -= amount;
                remaining -= amount;
                removedThisPass += amount;
            }
            if (removedThisPass === 0) break;
        }
    }

    const statDeltas = {} as StatRecord;
    for (const stat of StatType.values()) statDeltas[stat.key] = stats[stat.key] - beforeStats[stat.key];
    return {
        previousLevel: currentLevel,
        level: targetLevel,
        levelDelta,
        statPointDelta: statPoint - currentStatPoint,
        statDeltas,
        stats,
        statPoint,
    };
}

export interface PlayerDeathPenaltySnapshot {
    readonly zoneLabel: string;
    readonly experienceLost: number;
    readonly goldLost: number;
}

export default class Player extends Entity {
    readonly userId: number;
    readonly inventory: Inventory;
    readonly progress: PlayerProgress;
    readonly skills: SkillBook;
    readonly quests: QuestBook;
    readonly career: CareerProfile;
    readonly rankingVisibility: RankingVisibility;

    private _nickname: string;
    private _gold = 0;
    private _dirty = false;
    private _moving = false;
    private _statPoint = 0;
    private _deathNotifTimer = 0;
    private _craftingDiscoveryTimer = 0;
    private _savePromise: Promise<void> | null = null;
    private _saveRequested = false;

    private constructor(
        userId: number, nickname: string, level: number, exp: number,
        locationId: string, maxWeight: number, inventory: Inventory, equipment: Equipment,
        progress: PlayerProgress, skills: SkillBook, quests: QuestBook,
        statPoints?: Partial<StatRecord>,
        life?: number, mentality?: number, thirsty?: number, hungry?: number,
        statPoint = 0, gold = 0,
        persistentTags: readonly TagId[] = [],
        rankingMetrics?: unknown,
        rankingVisibility?: unknown,
    ) {
        super(
            level,
            exp,
            locationId,
            { ...DEFAULT_PLAYER_BASE_ATTRIBUTE, maxWeight },
            equipment,
            statPoints,
            [GameTags.ENTITY_PLAYER, GameTags.TRAIT_LIVING],
            persistentTags,
        );
        this.userId = userId;
        this._nickname = nickname;
        this.inventory = inventory;
        this.progress = progress;
        markLocationVisited(this, locationId);
        this.skills = skills;
        this.skills.bindOwner(this);
        this.quests = quests;
        this.quests.bindOwner(this);
        this.career = new CareerProfile(this);
        this.career.initialize();
        this.inventory.subscribeChanges(() => this.quests.refreshSnapshotObjectives());
        this.progress.subscribeChanges(() => this.quests.refreshSnapshotObjectives());
        this._statPoint = statPoint;
        this._gold = gold;
        this.rankingVisibility = new RankingVisibility(rankingVisibility);
        if (!isCompleteRankingMetricRecord(rankingMetrics)) this._dirty = true;

        // inventory에 계산된 maxWeight 동기화
        this.inventory.maxWeight = this.attribute.get(AttributeType.MAX_WEIGHT);

        if (life      !== undefined) this._life      = life;
        if (mentality !== undefined) this._mentality = mentality;
        if (thirsty   !== undefined) this._thirsty   = thirsty;
        if (hungry    !== undefined) this._hungry    = hungry;
        this.restorePersistedDeathState();
    }

    override get name() { return this._nickname; }
    set name(val: string) { this._nickname = val; }

    override get isPlayer() { return true; }
    override get playerUserId(): number { return this.userId; }

    get moving() { return this._moving; }
    set moving(val: boolean) {
        if (val && !this._moving) endNpcDialogue(this, DialogueEndReason.MOVED);
        this._moving = val;
    }

    // -- Getters / Setters (dirty 추적) --

    override get level() { return this._level; }
    override set level(val: number) {
        this._level = val;
        this._dirty = true;
        this.career?.evaluateElitePromotion();
        this.quests?.refreshSnapshotObjectives();
    }

    override get exp() { return this._exp; }
    override set exp(val: number) { this._exp = val; this._dirty = true; }

    override get locationId() { return this._locationId; }
    override set locationId(val: string) {
        if (val !== this._locationId) endNpcDialogue(this, DialogueEndReason.MOVED);
        this._locationId = val;
        this._dirty = true;
        if (this.progress) markLocationVisited(this, val);
        this.quests?.refreshSnapshotObjectives();
    }

    override get life() { return this._life; }
    override set life(val: number) { this._life = val; this._dirty = true; }

    override get mentality() { return this._mentality; }
    override set mentality(val: number) { this._mentality = val; this._dirty = true; }

    override get thirsty() { return this._thirsty; }
    override set thirsty(val: number) { this._thirsty = val; this._dirty = true; }

    override get hungry() { return this._hungry; }
    override set hungry(val: number) { this._hungry = val; this._dirty = true; }

    /** 계산된 최대 중량 (base + modifier) */
    get maxWeight() { return this.attribute.get(AttributeType.MAX_WEIGHT); }

    /** 기본 최대 중량 직접 설정 (DB 저장 대상) */
    set maxWeight(val: number) {
        this.attribute.setBase(AttributeType.MAX_WEIGHT, val);
        this.inventory.maxWeight = this.attribute.get(AttributeType.MAX_WEIGHT);
        this._dirty = true;
    }

    get statPoint() { return this._statPoint; }
    set statPoint(val: number) { this._statPoint = val; this._dirty = true; }

    get gold() { return this._gold; }
    set gold(val: number) { this._gold = Math.max(0, val); this._dirty = true; }

    /** 관리자 레벨 조정: 실제 레벨업 지급분과 분배 포인트를 함께 증감한다. */
    adjustLevel(targetLevel: number, expPercent = 0): PlayerLevelAdjustmentResult {
        if (!Number.isFinite(expPercent) || expPercent < 0 || expPercent >= 100) {
            throw new Error('경험치 비율은 0 이상 100 미만이어야 합니다.');
        }
        const plan = calculatePlayerLevelAdjustment(
            this.level,
            targetLevel,
            this.stat.points,
            this.statPoint,
        );
        for (const stat of StatType.values()) this.stat.set(stat, plan.stats[stat.key]);
        this._statPoint = plan.statPoint;
        this.level = targetLevel;
        this.exp = Math.floor(this.maxExp * expPercent / 100);
        this.stat.applyModifiers(this);
        this._dirty = true;
        return plan;
    }

    /** 순위 서비스가 raw Player 상태에 접근하지 않도록 제공하는 불변 계산값 snapshot. */
    getRankingMetricSnapshot(): Readonly<RankingMetricRecord> {
        return Object.freeze(createRankingMetricRecord(this));
    }

    get dirty() {
        return this._dirty || this.stat.dirty || this.inventory.dirty || this.rankingVisibility.dirty
            || this.equipment.dirty || this.progress.dirty || this.skills.dirty || this.quests.dirty;
    }

    protected override onPersistentTagsChanged(): void { this._dirty = true; }

    override get deathDuration(): number {
        let baseDuration = 10;

        if(this.level >= 50) baseDuration = 60 * 5;
        else if(this.level >= 10) baseDuration = 30;

        const location = getLocation(this.locationId);
        return location ? location.riskPolicy.calculateRespawnDuration(baseDuration) : baseDuration;
    }

    override getAttackDeniedReason(attacker: Entity): string | undefined {
        const baseReason = super.getAttackDeniedReason(attacker);
        if (baseReason) return baseReason;
        if (!attacker.isPlayer || attacker.playerUserId === undefined) return undefined;
        if (attacker === this) return '자기 자신은 공격할 수 없습니다.';
        if (attacker.locationId !== this.locationId) return '같은 장소의 플레이어만 공격할 수 있습니다.';
        const location = getLocation(this.locationId);
        if (!location) return '현재 장소의 PVP 규칙을 확인할 수 없습니다.';
        if (!location.riskPolicy.pvpAllowed) return `${location.riskPolicy.label}에서는 플레이어를 공격할 수 없습니다.`;
        if (partyManager.areInSameParty(attacker.playerUserId, this.userId)) return '같은 파티원은 공격할 수 없습니다.';
        return undefined;
    }

    // -- 게임 루프 --

    override earlyUpdate(dt: number): void {
        super.earlyUpdate(dt);
        if (!this.isDefeated) {
            this.depleteSurvivalNeeds(dt);
            this.syncSurvivalStatusEffects();
        }
        if (!getLocation(this._locationId)) {
            const respawn = getRespawnLocation();
            if (respawn) this.locationId = respawn.id;
        }

        // attribute modifier로 maxWeight가 바뀔 수 있으므로 매 프레임 동기화
        this.inventory.maxWeight = this.attribute.get(AttributeType.MAX_WEIGHT);

        if (this.isDead) {
            this._deathNotifTimer -= dt;
            if (this._deathNotifTimer <= 0) {
                this._deathNotifTimer = 1;
                const remaining = Math.ceil(this.deathTimer);
                sendNotificationToUser(this.userId, {
                    key: 'player-dead',
                    message: chat()
                        .color('red', b => b.text('사망'))
                        .text(` 리스폰까지 ${remaining}초`)
                        .build(),
                    length: 1500,
                    editExists: true,
                });
            }
        }
    }

    private syncSurvivalStatusEffects(): void {
        const sync = (type: StatusEffectType, depleted: boolean) => {
            if (depleted) {
                if (!this.hasStatusEffect(type)) this.applyStatusEffect(type, 86_400, 1);
            } else if (this.hasStatusEffect(type)) {
                this.removeStatusEffect(type, StatusEffectRemovalReason.INVALID_TARGET);
            }
        };
        sync(StatusEffectType.HUNGER, this.hungry <= 0);
        sync(StatusEffectType.THIRST, this.thirsty <= 0);
    }

    override update(dt: number): void {
        super.update(dt);
        this.skills.update(dt);
        this._craftingDiscoveryTimer -= dt;
        if (this._craftingDiscoveryTimer <= 0) {
            this._craftingDiscoveryTimer = 0.5;
            updateCraftingRecipeDiscovery(this);
        }
    }

    override onDeath(): void {
        super.onDeath();
        this.persistDeathState();
        const location = getLocation(this.locationId);
        const killer = this.lastDamageCause?.causeEntity?.attackOwner;
        if (killer?.isPlayer && killer !== this) {
            emitGameEvent(GameEventIds.PVP_KILL, {
                actor: killer,
                subject: this,
                data: { zoneType: location?.data.zoneType ?? 'unknown' },
            });
        }
        endNpcDialogue(this, DialogueEndReason.DEFEATED);
        this._deathNotifTimer = 0;
        const penalty = this.applyRegionDeathPenalty();
        const message = chat()
            .color('red', b => b.text('사망했습니다.'))
            .text(` ${penalty.zoneLabel} 규칙이 적용됩니다.\n`);
        if (penalty.experienceLost > 0 || penalty.goldLost > 0) {
            message.text('손실: ')
                .text(penalty.experienceLost > 0 ? `경험치 ${penalty.experienceLost.toLocaleString()}` : '')
                .text(penalty.experienceLost > 0 && penalty.goldLost > 0 ? ' · ' : '')
                .text(penalty.goldLost > 0 ? `${penalty.goldLost.toLocaleString()}G` : '')
                .text('\n');
        } else {
            message.color('$text-tertiary', b => b.text('사망 재화 손실은 없습니다.\n'));
        }
        message.text(`${this.deathTimer.toFixed(0)}초 후 리스폰됩니다.`);
        sendBotMessageToUser(this.userId, message.build());
    }

    applyRegionDeathPenalty(): PlayerDeathPenaltySnapshot {
        const policy = getLocation(this.locationId)?.riskPolicy;
        if (!policy) return { zoneLabel: '알 수 없는 구역', experienceLost: 0, goldLost: 0 };
        const experienceLost = policy.calculateExperienceLoss(this.exp, this.maxExp, this.level);
        const goldLost = policy.calculateGoldLoss(this.gold, this.level);
        if (experienceLost > 0) this.exp = this.exp - experienceLost;
        if (goldLost > 0) this.gold = this.gold - goldLost;
        return { zoneLabel: policy.label, experienceLost, goldLost };
    }

    override respawn(): void {
        super.respawn();
        this.progress.reset(PlayerRuntimeProgressIds.DEATH_REMAINING);
        const respawnLoc = getRespawnLocation();
        if (respawnLoc) this.locationId = respawnLoc.id;
        sendBotMessageToUser(this.userId, '리스폰했습니다.');
    }

    // -- 게임 로직 --

    /** 주무기 metadata의 기본 공격 오버라이드를 실행하고, 미처리 시 직접 근접 공격한다. */
    performBasicAttack(target: Entity): void {
        const weapon = this.equipment.getEquipped('mainHand');
        const overrideKey = weapon?.basicAttackOverrideKey;
        if (weapon && overrideKey && executeItemAttackOverride(overrideKey, {
            attacker: this,
            target,
            weapon,
            inventory: this.inventory,
        })) return;
        this.attack(target);
    }

    /** 인벤토리 아이템을 장착하고 밀려난 장비는 다시 인벤토리로 돌려보낸다. */
    equipInventoryItem(item: Item, targetSlotIndex?: number): { slot: EquipSlot; slotIndex: number; displaced: Item | null } | null {
        const slot = item.equipSlot as EquipSlot | null;
        if (!slot || this.inventory.getItem(item.id) !== item) return null;

        let slotIndex = targetSlotIndex;
        if (slotIndex === undefined) {
            let firstEmpty = -1;
            let lastOccupied = -1;
            for (let index = 0; index < SLOT_MAX[slot]; index++) {
                if (this.equipment.getEquipped(slot, index)) lastOccupied = index;
                else if (firstEmpty === -1) firstEmpty = index;
            }
            slotIndex = firstEmpty !== -1 ? firstEmpty : lastOccupied;
        }
        if (slotIndex < 0 || slotIndex >= SLOT_MAX[slot]) return null;

        const current = this.equipment.getEquipped(slot, slotIndex);
        const equipCount = item.stackable ? item.count : 1;
        if (current && this.inventory.currentWeight - item.weight * equipCount
            + current.weight * current.count > this.inventory.maxWeight) return null;

        const equippedCopy = Item.fromSnapshot(item.snapshot(equipCount));
        const displaced = this.equipment.equipSwap(slot, equippedCopy, this.attribute, slotIndex);
        if (displaced === undefined) return null;
        if (!this.inventory.removeItemInstance(item, equipCount)) {
            this.equipment.unequip(slot, slotIndex, this.attribute);
            if (displaced) this.equipment.equipSwap(slot, displaced, this.attribute, slotIndex);
            return null;
        }
        if (displaced && !this.inventory.addItemSnapshot(displaced.snapshot(displaced.count))) {
            throw new Error(`장착 해제 아이템을 인벤토리에 복원하지 못했습니다: ${displaced.itemDataId}`);
        }
        return { slot, slotIndex, displaced };
    }

    canSpendMentality(amount: number): boolean {
        return Number.isFinite(amount) && amount >= 0 && this.mentality >= amount;
    }

    spendMentality(amount: number): boolean {
        if (!this.canSpendMentality(amount)) return false;
        this.mentality -= amount;
        return true;
    }

    /** 경험치 획득 및 레벨업 처리. 레벨업한 레벨 목록을 반환 */
    gainExp(amount: number): number[] {
        this._exp += Math.floor(amount * this.getExperienceGainModifier());
        this._dirty = true;

        const levelsGained: number[] = [];
        while (this._exp >= this.maxExp) {
            this._exp -= this.maxExp;
            this._level++;
            levelsGained.push(this._level);

            // 레벨업 보너스: 모든 스탯 +1, 가용 포인트 +3
            for (const stat of StatType.values()) {
                this.stat.add(stat, 1);
            }
            this._statPoint += 3;
            this.stat.applyModifiers(this);
        }
        if (levelsGained.length > 0) this.quests.refreshSnapshotObjectives();
        if (levelsGained.length > 0) this.career.evaluateElitePromotion();
        return levelsGained;
    }

    /** 스탯 포인트 분배. 성공 여부를 반환 */
    allocateStat(statType: StatType, amount: number): boolean {
        if (this._statPoint < amount) return false;
        this.stat.add(statType, amount);
        this._statPoint -= amount;
        this.stat.applyModifiers(this);
        this._dirty = true;
        return true;
    }

    // -- DB 연동 --

    /** DB에서 플레이어 로드 */
    static async loadByUserId(userId: number): Promise<Player | null> {
        const data = await prisma.player.findUnique({
            where: { userId },
            include: { user: { select: { nickname: true } } },
        });
        if (!data) return null;
        const [inventory, equipment, progress, skills, quests] = await Promise.all([
            Inventory.load(data.userId, data.maxWeight),
            Equipment.load(data.userId),
            PlayerProgress.load(data.userId),
            SkillBook.load(data.userId),
            QuestBook.load(data.userId),
        ]);
        const stats = data.stats as Partial<StatRecord> | null;
        return new Player(data.userId, data.user.nickname, data.level, data.exp, data.locationId, data.maxWeight, inventory, equipment, progress, skills, quests, stats ?? undefined, data.life, data.mentality, data.thirsty, data.hungry, data.statPoint, data.gold, (data.tags as TagId[] | null) ?? [], data.rankingMetrics, data.rankingVisibility);
    }

    /** 새 플레이어 생성 */
    static async create(userId: number): Promise<Player> {
        const data = await prisma.player.create({
            data: { userId },
            include: { user: { select: { nickname: true } } },
        });
        const inventory = await Inventory.load(data.userId, data.maxWeight);
        const equipment = await Equipment.load(data.userId);
        const progress = PlayerProgress.createEmpty(data.userId);
        const skills = SkillBook.createEmpty(data.userId);
        const quests = QuestBook.createEmpty(data.userId);
        return new Player(data.userId, data.user.nickname, data.level, data.exp, data.locationId, data.maxWeight, inventory, equipment, progress, skills, quests);
    }

    /** 순위 서비스에 Player DB row를 노출하지 않고 마지막 저장 snapshot DTO만 반환한다. */
    static async getPersistedRankingSnapshots(): Promise<StoredPlayerRankingSnapshot[]> {
        const rows = await prisma.player.findMany({
            select: {
                userId: true,
                level: true,
                gold: true,
                maxWeight: true,
                stats: true,
                rankingMetrics: true,
                rankingVisibility: true,
                user: { select: { nickname: true } },
            },
        });
        return rows.map(row => {
            const fallback = createStoredPlayerRankingMetricRecord({
                level: row.level,
                gold: row.gold,
                maxWeight: row.maxWeight,
                stats: (row.stats as Partial<StatRecord> | null) ?? undefined,
                baseAttribute: DEFAULT_PLAYER_BASE_ATTRIBUTE,
            });
            return {
                userId: row.userId,
                nickname: row.user.nickname,
                metrics: parseRankingMetricRecord(row.rankingMetrics, fallback),
                visibility: parseRankingVisibility(row.rankingVisibility),
            };
        });
    }

    /** 변경된 데이터 DB에 저장 */
    async save(): Promise<void> {
        this._saveRequested = true;
        if (this._savePromise) return this._savePromise;
        this._savePromise = (async () => {
            while (this._saveRequested) {
                this._saveRequested = false;
                await this.saveDirtyState();
            }
        })();
        try {
            await this._savePromise;
        } finally {
            this._savePromise = null;
        }
    }

    private async saveDirtyState(): Promise<void> {
        // 오프라인 동안 카운트하지 않을 정확한 잔여 시간을 unload/주기 저장 시점에 스냅샷한다.
        if (this.isDead) this.persistDeathState();
        if (this._dirty || this.stat.dirty || this.equipment.dirty || this.skills.dirty || this.rankingVisibility.dirty) {
            await prisma.player.update({
                where: { userId: this.userId },
                data: {
                    level: this._level,
                    exp: this._exp,
                    maxWeight: this.attribute.getBase(AttributeType.MAX_WEIGHT),
                    locationId: this._locationId,
                    stats: this.stat.points as any,
                    life: this._life,
                    mentality: this._mentality,
                    thirsty: this._thirsty,
                    hungry: this._hungry,
                    statPoint: this._statPoint,
                    gold: this._gold,
                    tags: this.tags.persistentValues(),
                    rankingMetrics: this.getRankingMetricSnapshot() as any,
                    rankingVisibility: this.rankingVisibility.toPersistence() as any,
                } as any,
            });
            this._dirty = false;
            this.stat.resetDirty();
            this.rankingVisibility.resetDirty();
        }
        await this.inventory.save();
        await this.equipment.save();
        await this.progress.save();
        await this.skills.save();
        await this.quests.save();
    }

    /** DB에서 life=0을 읽은 뒤 이미 처리된 사망이라면 onDeath를 다시 호출하지 않도록 런타임 상태를 복원한다. */
    restorePersistedDeathState(): boolean {
        const stored = this.progress.getState(PlayerRuntimeProgressIds.DEATH_REMAINING);
        const parsedRemaining = Number(stored);
        if (this.life > 0) {
            if (stored) this.progress.reset(PlayerRuntimeProgressIds.DEATH_REMAINING);
            return false;
        }
        // 구버전 저장에는 death state가 없으므로 life=0 자체를 이미 처리된 사망으로 간주한다.
        // 이 편이 재접속 시 패널티를 중복 부과하는 것보다 안전하다.
        const remaining = stored && Number.isFinite(parsedRemaining) && parsedRemaining > 0
            ? parsedRemaining
            : this.deathDuration;
        this.isDead = true;
        this.deathTimer = remaining;
        this._deathNotifTimer = 0;
        this.persistDeathState();
        return true;
    }

    private persistDeathState(): void {
        if (!this.isDead || !Number.isFinite(this.deathTimer) || this.deathTimer <= 0) {
            this.progress.reset(PlayerRuntimeProgressIds.DEATH_REMAINING);
            return;
        }
        this.progress.setState(
            PlayerRuntimeProgressIds.DEATH_REMAINING,
            Math.max(0.001, this.deathTimer).toFixed(3),
        );
    }
}
