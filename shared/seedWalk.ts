/** SEED WALK map/physics v1. Changing generation requires a new version. */
export const SEED_WALK_VERSION = 1;
export const SEED_WALK_SIZE = 64;
export const SEED_WALK_TILE = 32;
export const SEED_WALK_SPEED = 180;
export const SEED_WALK_RADIUS = 10;

export class SeedWalkTerrain {
    private static readonly all: SeedWalkTerrain[] = [];
    static readonly GRASS = new SeedWalkTerrain('grass', 0, '풀밭', 0x90b77d, true);
    static readonly WATER = new SeedWalkTerrain('water', 1, '연못', 0x588f9b, false);
    static readonly ROCK = new SeedWalkTerrain('rock', 2, '바위', 0x727e7e, false);
    static readonly PATH = new SeedWalkTerrain('path', 3, '산책로', 0xd5c49a, true);
    readonly key: string;
    readonly code: number;
    readonly label: string;
    readonly color: number;
    readonly walkable: boolean;
    private constructor(key: string, code: number, label: string, color: number, walkable: boolean) {
        this.key = key; this.code = code; this.label = label; this.color = color; this.walkable = walkable;
        SeedWalkTerrain.all.push(this);
    }
    static values(): readonly SeedWalkTerrain[] { return [...this.all]; }
    static fromKey(key: string): SeedWalkTerrain | undefined { return this.all.find(value => value.key === key); }
    static fromInput(input: string): SeedWalkTerrain | undefined { return this.fromKey(input) ?? this.all.find(value => value.label === input); }
    static fromCode(code: number): SeedWalkTerrain { return this.all.find(value => value.code === code) ?? this.ROCK; }
}

export interface SeedWalkMap { readonly seed: string; readonly version: number; readonly tiles: readonly number[] }
export interface SeedWalkInput { seq: number; x: number; y: number }
export interface SeedWalkerSnapshot { id: number; name: string; x: number; y: number; color: number }
export interface SeedWalkSnapshot { worldId: string; seed: string; version: number; tick: number; players: SeedWalkerSnapshot[] }
export type SeedWalkJoinResult = { ok: true; selfId: number; state: SeedWalkSnapshot } | { ok: false; error: string };

export function normalizeSeedWalkSeed(input: unknown): string | undefined {
    if (typeof input !== 'string') return undefined;
    const seed = input.normalize('NFC').trim() || 'gamebox';
    return seed.length <= 48 && !/[\u0000-\u001f\u007f]/.test(seed) ? seed : undefined;
}

export function seedWalkHash(text: string): number {
    let value = 2166136261;
    for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
    return value >>> 0;
}

export function createSeedWalkMap(seed: string): SeedWalkMap {
    const normalized = normalizeSeedWalkSeed(seed);
    if (normalized === undefined) throw new Error('시드는 48자 이하의 텍스트로 입력해주세요.');
    const size = SEED_WALK_SIZE;
    const tiles: number[] = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const patch = seedWalkHash(`${normalized}:${Math.floor(x / 4)}:${Math.floor(y / 4)}`) % 100;
        let terrain = patch < 19 ? SeedWalkTerrain.WATER : patch > 86 && seedWalkHash(`${normalized}:${x}:${y}`) % 4 !== 0 ? SeedWalkTerrain.ROCK : SeedWalkTerrain.GRASS;
        if (x % 12 <= 1 || y % 12 <= 1 || Math.abs(x - 32) <= 2 || Math.abs(y - 32) <= 2) terrain = SeedWalkTerrain.PATH;
        if (x === 0 || y === 0 || x === size - 1 || y === size - 1) terrain = SeedWalkTerrain.ROCK;
        tiles.push(terrain.code);
    }
    // Keep every walkable tile connected to the central spawn.
    const visited = new Set<number>([32 * size + 32]);
    const queue = [32 * size + 32];
    for (let i = 0; i < queue.length; i++) {
        const index = queue[i];
        const x = index % size, y = Math.floor(index / size);
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
            const next = ny * size + nx;
            if (nx < 0 || ny < 0 || nx >= size || ny >= size || visited.has(next) || !SeedWalkTerrain.fromCode(tiles[next]).walkable) continue;
            visited.add(next); queue.push(next);
        }
    }
    for (let i = 0; i < tiles.length; i++) if (!visited.has(i) && SeedWalkTerrain.fromCode(tiles[i]).walkable) tiles[i] = SeedWalkTerrain.WATER.code;
    return { seed: normalized, version: SEED_WALK_VERSION, tiles };
}

export function canSeedWalkerOccupy(map: SeedWalkMap, x: number, y: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const radius = SEED_WALK_RADIUS;
    const left = Math.floor((x - radius) / SEED_WALK_TILE), right = Math.floor((x + radius) / SEED_WALK_TILE);
    const top = Math.floor((y - radius) / SEED_WALK_TILE), bottom = Math.floor((y + radius) / SEED_WALK_TILE);
    if (left < 0 || top < 0 || right >= SEED_WALK_SIZE || bottom >= SEED_WALK_SIZE) return false;
    for (let ty = top; ty <= bottom; ty++) for (let tx = left; tx <= right; tx++) {
        if (!SeedWalkTerrain.fromCode(map.tiles[ty * SEED_WALK_SIZE + tx]).walkable) return false;
    }
    return true;
}

/** Axis sliding with bounded substeps prevents crossing obstacles, even after a delayed tick. */
export function moveSeedWalker(map: SeedWalkMap, x: number, y: number, axisX: number, axisY: number, seconds: number): { x: number; y: number } {
    if (![x, y, axisX, axisY, seconds].every(Number.isFinite) || seconds < 0) return { x, y };
    const magnitude = Math.hypot(axisX, axisY);
    if (!magnitude) return { x, y };
    const distance = SEED_WALK_SPEED * Math.min(seconds, .2) * Math.min(1, magnitude);
    const steps = Math.max(1, Math.ceil(distance / 8));
    const dx = axisX / magnitude * distance / steps, dy = axisY / magnitude * distance / steps;
    for (let i = 0; i < steps; i++) {
        if (canSeedWalkerOccupy(map, x + dx, y)) x += dx;
        if (canSeedWalkerOccupy(map, x, y + dy)) y += dy;
    }
    return { x, y };
}

export function isSeedWalkInput(input: unknown): input is SeedWalkInput {
    if (!input || typeof input !== 'object') return false;
    const { seq, x, y } = input as SeedWalkInput;
    return Number.isSafeInteger(seq) && seq >= 0 && Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= 1 && Math.abs(y) <= 1;
}

/** Seeded 2D gradient (Perlin) noise. Cosmetic only; terrain/physics version is unchanged. */
export function seedWalkGrassNoise(seed: string, x: number, y: number): number {
    const gx = Math.floor(x), gy = Math.floor(y), fx = x - gx, fy = y - gy;
    const fade = (v: number) => v * v * v * (v * (v * 6 - 15) + 10);
    const gradient = (ix: number, iy: number, dx: number, dy: number): number => {
        switch (seedWalkHash(`${seed}:grass:${ix}:${iy}`) & 7) {
            case 0: return dx; case 1: return -dx; case 2: return dy; case 3: return -dy;
            case 4: return (dx + dy) * Math.SQRT1_2; case 5: return (dx - dy) * Math.SQRT1_2;
            case 6: return (-dx + dy) * Math.SQRT1_2; default: return (-dx - dy) * Math.SQRT1_2;
        }
    };
    const blend = (a: number, b: number, t: number) => a + (b - a) * t;
    return blend(
        blend(gradient(gx, gy, fx, fy), gradient(gx + 1, gy, fx - 1, fy), fade(fx)),
        blend(gradient(gx, gy + 1, fx, fy - 1), gradient(gx + 1, gy + 1, fx - 1, fy - 1), fade(fx)),
        fade(fy),
    );
}

export function seedWalkGrassColor(seed: string, tileX: number, tileY: number): number {
    const x = tileX + .5, y = tileY + .5;
    const noise = .65 * seedWalkGrassNoise(seed, x / 12, y / 12)
        + .25 * seedWalkGrassNoise(seed, x / 6, y / 6)
        + .1 * seedWalkGrassNoise(seed, x / 3, y / 3);
    const shade = Math.round(noise * 30);
    return ((144 + shade) << 16) | ((183 + shade) << 8) | (125 + Math.round(shade * .7));
}
