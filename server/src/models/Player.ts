import prisma from "../config/prisma.js";
import Entity from "./Entity.js";
import Inventory from "./Inventory.js";
import Equipment from "./Equipment.js";
import type { StatRecord } from "./Stat.js";

const DEFAULT_BASE_ATTRIBUTE = {
    maxLife:      100,
    maxMentality: 50,
    atk:          10,
    def:          5,
} as const;

export default class Player extends Entity {
    readonly id: number;
    readonly userId: number;
    readonly inventory: Inventory;

    private _nickname: string;
    private _maxWeight: number;
    private _dirty = false;
    private _moving = false;

    private constructor(
        id: number, userId: number, nickname: string, level: number, exp: number,
        locationId: string, maxWeight: number, inventory: Inventory, equipment: Equipment,
        statPoints?: Partial<StatRecord>,
    ) {
        super(level, exp, locationId, DEFAULT_BASE_ATTRIBUTE, equipment, statPoints);
        this.id = id;
        this.userId = userId;
        this._nickname = nickname;
        this._maxWeight = maxWeight;
        this.inventory = inventory;
    }

    override get name() { return this._nickname; }
    set name(val: string) { this._nickname = val; }

    override get isPlayer() { return true; }

    get moving() { return this._moving; }
    set moving(val: boolean) { this._moving = val; }

    // -- Getters / Setters (dirty 추적) --

    override get level() { return this._level; }
    override set level(val: number) { this._level = val; this._dirty = true; }

    override get exp() { return this._exp; }
    override set exp(val: number) { this._exp = val; this._dirty = true; }

    override get locationId() { return this._locationId; }
    override set locationId(val: string) { this._locationId = val; this._dirty = true; }

    get maxWeight() { return this._maxWeight; }
    set maxWeight(val: number) {
        this._maxWeight = val;
        this.inventory.maxWeight = val;
        this._dirty = true;
    }

    get dirty() { return this._dirty || this.inventory.dirty || this.equipment.dirty; }

    // -- DB 연동 --

    /** DB에서 플레이어 로드 */
    static async loadByUserId(userId: number): Promise<Player | null> {
        const data = await prisma.player.findUnique({
            where: { userId },
            include: { user: { select: { nickname: true } } },
        });
        if (!data) return null;
        const inventory = await Inventory.load(data.id, data.maxWeight);
        const equipment = await Equipment.load(data.id);
        const stats = data.stats as Partial<StatRecord> | null;
        return new Player(data.id, data.userId, data.user.nickname, data.level, data.exp, data.locationId, data.maxWeight, inventory, equipment, stats ?? undefined);
    }
    
    static async load(id: number): Promise<Player | null> {
        const data = await prisma.player.findUnique({
            where: { id },
            include: { user: { select: { nickname: true } } },
        });
        if (!data) return null;
        const inventory = await Inventory.load(data.id, data.maxWeight);
        const equipment = await Equipment.load(data.id);
        const stats = data.stats as Partial<StatRecord> | null;
        return new Player(data.id, data.userId, data.user.nickname, data.level, data.exp, data.locationId, data.maxWeight, inventory, equipment, stats ?? undefined);
    }

    /** 새 플레이어 생성 */
    static async create(userId: number): Promise<Player> {
        const data = await prisma.player.create({
            data: { userId },
            include: { user: { select: { nickname: true } } },
        });
        const inventory = await Inventory.load(data.id, data.maxWeight);
        const equipment = await Equipment.load(data.id);
        return new Player(data.id, data.userId, data.user.nickname, data.level, data.exp, data.locationId, data.maxWeight, inventory, equipment);
    }

    /** 변경된 데이터 DB에 저장 */
    async save(): Promise<void> {
        if (this._dirty) {
            await prisma.player.update({
                where: { id: this.id },
                data: {
                    level: this._level,
                    exp: this._exp,
                    maxWeight: this._maxWeight,
                    locationId: this._locationId,
                    stats: this.stat.points as any,
                },
            });
            this._dirty = false;
        }
        await this.inventory.save();
        await this.equipment.save();
    }
}
