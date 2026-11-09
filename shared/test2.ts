import { seedWalkHash, type SeedWalkerSnapshot, type SeedWalkSnapshot } from './seedWalk.js';
export const TEST2_VERSION = 1;
export const TEST2_SPEED = 300;
export const TEST2_GRAVITY = 1600;
export const TEST2_JUMP = 620;
export const TEST2_BUFFER = .14;
export const TEST2_COYOTE = .1;
export interface JumpPlatform { id: number; x: number; y: number; width: number; checkpoint: number; finish: boolean }
export interface Test2Input { seq: number; x: number; jump: number }
export interface Test2Player extends SeedWalkerSnapshot { checkpoint: number; finished: boolean; deaths: number }
export interface Test2Snapshot extends SeedWalkSnapshot { players: Test2Player[] }
export type Test2JoinResult = { ok: true; selfId: number; state: Test2Snapshot } | { ok: false; error: string };
export interface JumpBody { x: number; y: number; vy: number; grounded: boolean; coyote: number; buffer: number }
export function createJumpMap(): readonly JumpPlatform[] {
    const result: JumpPlatform[] = [];
    let x = 0, y = 420;
    for (let i = 0; i <= 240; i++) {
        const hash = seedWalkHash(`test2:v1:${i}`);
        const checkpoint = i % 12 === 0 ? i / 12 : -1;
        // Bounded height steps and gaps stay inside the 620/1600 jump envelope.
        const width = checkpoint >= 0 ? 380 : 130 + hash % 90;
        if (i) y = Math.max(250, Math.min(500, y + ((hash >>> 8) % 3 - 1) * 40));
        result.push({ id: i, x, y, width, checkpoint, finish: i === 240 });
        x += width + 70 + (hash >>> 16) % 55;
    }
    return result;
}
export const TEST2_MAP = createJumpMap();
export function validTest2Input(input: unknown): input is Test2Input {
    if (!input || typeof input !== 'object') return false;
    const { seq, x, jump } = input as Test2Input;
    return Number.isSafeInteger(seq) && seq >= 0 && Number.isFinite(x) && Math.abs(x) <= 1 && Number.isSafeInteger(jump) && jump >= 0;
}
/** Feet are y+14. Platforms are one-way; crossing their top while falling lands. */
export function stepJumper(body: JumpBody, axis: number, dt: number, platforms: readonly JumpPlatform[] = TEST2_MAP): JumpPlatform | undefined {
    body.coyote = body.grounded ? TEST2_COYOTE : Math.max(0, body.coyote - dt);
    const jump = () => { body.vy = -TEST2_JUMP; body.grounded = false; body.coyote = 0; body.buffer = 0; };
    if (body.buffer > 0 && body.coyote > 0) jump();
    const previousFeet = body.y + 14;
    body.x = Math.max(12, Math.min(TEST2_MAP.at(-1)!.x + TEST2_MAP.at(-1)!.width - 12, body.x + Math.max(-1, Math.min(1, axis)) * TEST2_SPEED * dt));
    body.vy = Math.min(950, body.vy + TEST2_GRAVITY * dt);
    body.y += body.vy * dt;
    body.grounded = false;
    let landed: JumpPlatform | undefined;
    if (body.vy >= 0) for (const platform of platforms) {
        if (body.x + 11 <= platform.x || body.x - 11 >= platform.x + platform.width || previousFeet > platform.y + .01 || body.y + 14 < platform.y) continue;
        if (!landed || platform.y < landed.y) landed = platform;
    }
    if (landed) {
        body.y = landed.y - 14; body.vy = 0; body.grounded = true; body.coyote = TEST2_COYOTE;
        if (body.buffer > 0) jump();
    }
    body.buffer = Math.max(0, body.buffer - dt);
    return landed;
}
