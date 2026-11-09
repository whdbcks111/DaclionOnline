import { randomUUID } from 'node:crypto';
import { normalizeSeedWalkChat, SEED_WALK_BUBBLE_MS, createSeedWalkMap, moveSeedWalker, isSeedWalkInput, seedWalkHash, SEED_WALK_TILE, type SeedWalkSnapshot, type SeedWalkerSnapshot, type SeedWalkInput } from '../../../../shared/seedWalk.js';

interface Walker {
    state: SeedWalkerSnapshot;
    connections: Map<string, number>;
    controller?: string;
    bubbleUntil?: number;
    input: { x: number; y: number; at: number };
}
const COLORS = [0xe9b35f, 0x6f9ee8, 0xd984a1, 0x79c9b6, 0xb694dc, 0xe48763];

export class SeedWalkWorld {
    readonly id = randomUUID();
    readonly map;
    private readonly players = new Map<number, Walker>();
    private tick = 0;
    constructor(readonly seed: string) { this.map = createSeedWalkMap(seed); }
    get size(): number { return this.players.size; }
    hasPlayer(userId: number): boolean { return this.players.has(userId); }

    join(userId: number, name: string, connectionId: string): void {
        const existing = this.players.get(userId);
        if (existing) { existing.connections.set(connectionId, -1); return; }
        if (this.size >= 32) throw new Error('이 맵은 32명이 산책 중입니다. 잠시 후 다시 접속해주세요.');
        const offset = this.size % 16;
        this.players.set(userId, {
            state: { id: userId, name, x: (31 + offset % 4) * SEED_WALK_TILE + 16, y: (31 + Math.floor(offset / 4)) * SEED_WALK_TILE + 16, color: COLORS[seedWalkHash(String(userId)) % COLORS.length] },
            connections: new Map([[connectionId, -1]]), input: { x: 0, y: 0, at: 0 },
        });
    }
    leave(userId: number, connectionId: string): void {
        const player = this.players.get(userId);
        if (!player) return;
        player.connections.delete(connectionId);
        if (player.controller === connectionId) player.input = { x: 0, y: 0, at: 0 };
        if (!player.connections.size) this.players.delete(userId);
    }
    input(userId: number, connectionId: string, input: SeedWalkInput, now: number): boolean {
        const player = this.players.get(userId);
        const previous = player?.connections.get(connectionId);
        if (!player || previous === undefined || !isSeedWalkInput(input) || input.seq <= previous) return false;
        player.connections.set(connectionId, input.seq);
        player.controller = connectionId;
        player.input = { x: input.x, y: input.y, at: now };
        return true;
    }
    say(userId: number, connectionId: string, input: unknown, now: number): boolean {
        const player = this.players.get(userId);
        const text = normalizeSeedWalkChat(input);
        if (!player?.connections.has(connectionId) || text === undefined) return false;
        player.state.bubble = { text };
        player.bubbleUntil = now + SEED_WALK_BUBBLE_MS;
        return true;
    }
    update(seconds: number, now: number): void {
        for (const player of this.players.values()) {
            if (player.bubbleUntil !== undefined && now >= player.bubbleUntil) { delete player.state.bubble; delete player.bubbleUntil; }
            if (now - player.input.at > 300) continue;
            const next = moveSeedWalker(this.map, player.state.x, player.state.y, player.input.x, player.input.y, seconds);
            player.state.x = next.x; player.state.y = next.y;
        }
        this.tick++;
    }
    snapshot(): SeedWalkSnapshot {
        return { worldId: this.id, seed: this.seed, version: this.map.version, tick: this.tick, players: [...this.players.values()].map(player => ({ ...player.state, ...(player.state.bubble ? { bubble: { ...player.state.bubble } } : {}) })) };
    }
}
