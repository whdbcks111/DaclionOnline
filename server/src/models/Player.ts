import prisma from "../config/prisma.js";
import Inventory from "./Inventory.js";
import Equipment from "./Equipment.js";
import Attribute from "./Attribute.js";

export default class Player {
    readonly id: number;
    readonly userId: number;
    readonly inventory: Inventory;
    readonly equipment: Equipment;
    readonly attribute: Attribute;

    private _level: number;
    private _exp: number;
    private _maxWeight: number;
    private _dirty = false;

    private constructor(id: number, userId: number, level: number, exp: number, maxWeight: number, inventory: Inventory, equipment: Equipment) {
        this.id = id;
        this.userId = userId;
        this._level = level;
        this._exp = exp;
        this._maxWeight = maxWeight;
        this.inventory = inventory;
        this.equipment = equipment;
        this.attribute = new Attribute({
            hp: 100,
            mp: 50,
            atk: 10,
            def: 5,
            speed: 1,
            critRate: 0.05,
            critDmg: 1.5,
        });

        // 장비 modifier 재적용
        this.equipment.applyModifiers(this.attribute);
    }

    // -- Getters / Setters (dirty 추적) --

    get level() { return this._level; }
    set level(val: number) { this._level = val; this._dirty = true; }

    get exp() { return this._exp; }
    set exp(val: number) { this._exp = val; this._dirty = true; }

    get maxWeight() { return this._maxWeight; }
    set maxWeight(val: number) {
        this._maxWeight = val;
        this.inventory.maxWeight = val;
        this._dirty = true;
    }

    get dirty() { return this._dirty || this.inventory.dirty || this.equipment.dirty; }

    // -- 게임 루프 --

    earlyUpdate(dt: number): void {}
    update(dt: number): void {}
    lateUpdate(dt: number): void {}

    // -- DB 연동 --

    /** DB에서 플레이어 로드 */
    static async load(userId: number): Promise<Player | null> {
        const data = await prisma.player.findUnique({ where: { userId } });
        if (!data) return null;
        const inventory = await Inventory.load(data.id, data.maxWeight);
        const equipment = await Equipment.load(data.id);
        return new Player(data.id, data.userId, data.level, data.exp, data.maxWeight, inventory, equipment);
    }

    /** 새 플레이어 생성 */
    static async create(userId: number): Promise<Player> {
        const data = await prisma.player.create({ data: { userId } });
        const inventory = await Inventory.load(data.id, data.maxWeight);
        const equipment = await Equipment.load(data.id);
        return new Player(data.id, data.userId, data.level, data.exp, data.maxWeight, inventory, equipment);
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
                },
            });
            this._dirty = false;
        }
        await this.inventory.save();
        await this.equipment.save();
    }
}
