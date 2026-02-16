import prisma from "../config/prisma.js";

export default class Player {
    readonly id: number;
    readonly userId: number;

    private _level: number;
    private _exp: number;
    private _dirty = false;

    private constructor(id: number, userId: number, level: number, exp: number) {
        this.id = id;
        this.userId = userId;
        this._level = level;
        this._exp = exp;
    }

    // -- Getters / Setters (dirty 추적) --

    get level() { return this._level; }
    set level(val: number) { this._level = val; this._dirty = true; }

    get exp() { return this._exp; }
    set exp(val: number) { this._exp = val; this._dirty = true; }

    get dirty() { return this._dirty; }

    // -- 게임 루프 --

    earlyUpdate(dt: number): void {}
    update(dt: number): void {}
    lateUpdate(dt: number): void {}

    // -- DB 연동 --

    /** DB에서 플레이어 로드 */
    static async load(userId: number): Promise<Player | null> {
        const data = await prisma.player.findUnique({ where: { userId } });
        if (!data) return null;
        return new Player(data.id, data.userId, data.level, data.exp);
    }

    /** 새 플레이어 생성 */
    static async create(userId: number): Promise<Player> {
        const data = await prisma.player.create({ data: { userId } });
        return new Player(data.id, data.userId, data.level, data.exp);
    }

    /** 변경된 데이터 DB에 저장 */
    async save(): Promise<void> {
        if (!this._dirty) return;
        await prisma.player.update({
            where: { id: this.id },
            data: {
                level: this._level,
                exp: this._exp,
            },
        });
        this._dirty = false;
    }
}
