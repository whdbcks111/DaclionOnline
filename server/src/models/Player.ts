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
import { PlayerProgress } from "./Progress.js";
import SkillBook from "./SkillBook.js";
import { updateCraftingRecipeDiscovery } from "./Crafting.js";
import { DialogueEndReason, endNpcDialogue } from "./NpcDialogue.js";
import { StatusEffectRemovalReason, StatusEffectType } from './StatusEffect.js';
import QuestBook from './QuestBook.js';
import { markLocationVisited } from './WorldMap.js';
import CareerProfile from './Career.js';
import { Item } from './Item.js';
import { SLOT_MAX, type EquipSlot } from './Equipment.js';

const DEFAULT_BASE_ATTRIBUTE = {
    maxLife:      100,
    maxMentality: 50,
    maxWeight:    50,
    atk:          10,
    def:          5,
} as const;

export default class Player extends Entity {
    readonly userId: number;
    readonly inventory: Inventory;
    readonly progress: PlayerProgress;
    readonly skills: SkillBook;
    readonly quests: QuestBook;
    readonly career: CareerProfile;

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
    ) {
        super(
            level,
            exp,
            locationId,
            { ...DEFAULT_BASE_ATTRIBUTE, maxWeight },
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

        // inventory에 계산된 maxWeight 동기화
        this.inventory.maxWeight = this.attribute.get(AttributeType.MAX_WEIGHT);

        if (life      !== undefined) this._life      = life;
        if (mentality !== undefined) this._mentality = mentality;
        if (thirsty   !== undefined) this._thirsty   = thirsty;
        if (hungry    !== undefined) this._hungry    = hungry;
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

    get dirty() {
        return this._dirty || this.stat.dirty || this.inventory.dirty
            || this.equipment.dirty || this.progress.dirty || this.skills.dirty || this.quests.dirty;
    }

    protected override onPersistentTagsChanged(): void { this._dirty = true; }

    override get deathDuration(): number {
        let baseDuration = 10;

        if(this.level >= 50) baseDuration = 60 * 5;
        else if(this.level >= 10) baseDuration = 30;

        return baseDuration;
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
        endNpcDialogue(this, DialogueEndReason.DEFEATED);
        this._deathNotifTimer = 0;
        sendBotMessageToUser(this.userId,
            chat().color('red', b => b.text('사망했습니다.')).text(` ${this.deathTimer.toFixed(0)}초 후 리스폰됩니다.`).build()
        );
    }

    override respawn(): void {
        super.respawn();
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
        if (current && this.inventory.currentWeight - item.weight + current.weight > this.inventory.maxWeight) return null;

        const equippedCopy = Item.fromSnapshot(item.snapshot(1));
        const displaced = this.equipment.equipSwap(slot, equippedCopy, this.attribute, slotIndex);
        if (displaced === undefined) return null;
        if (!this.inventory.removeItemInstance(item, 1)) {
            this.equipment.unequip(slot, slotIndex, this.attribute);
            if (displaced) this.equipment.equipSwap(slot, displaced, this.attribute, slotIndex);
            return null;
        }
        if (displaced && !this.inventory.addItemSnapshot(displaced.snapshot(1))) {
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
        this._exp += amount;
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
        return new Player(data.userId, data.user.nickname, data.level, data.exp, data.locationId, data.maxWeight, inventory, equipment, progress, skills, quests, stats ?? undefined, data.life, data.mentality, data.thirsty, data.hungry, data.statPoint, data.gold, (data.tags as TagId[] | null) ?? []);
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
        if (this._dirty || this.stat.dirty) {
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
                } as any,
            });
            this._dirty = false;
            this.stat.resetDirty();
        }
        await this.inventory.save();
        await this.equipment.save();
        await this.progress.save();
        await this.skills.save();
        await this.quests.save();
    }
}
