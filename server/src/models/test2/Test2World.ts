import { randomUUID } from 'node:crypto';
import { TEST2_MAP, TEST2_VERSION, TEST2_BUFFER, validTest2Input, stepJumper, type Test2Input, type Test2Player, type Test2Snapshot, type JumpBody } from '../../../../shared/test2.js';
import { normalizeSeedWalkChat, SEED_WALK_BUBBLE_MS, seedWalkHash } from '../../../../shared/seedWalk.js';
interface Runner { state: Test2Player; body: JumpBody; connections: Map<string, { seq: number; jump: number }>; axis: number; inputAt: number; bubbleUntil: number; controller?: string }
export class Test2World {
    readonly id = randomUUID();
    private readonly players = new Map<number, Runner>();
    private tick = 0;
    get size() { return this.players.size; }
    hasPlayer(id: number) { return this.players.has(id); }
    join(id: number, name: string, connection: string) {
        const previous = this.players.get(id);
        if (previous) { previous.connections.set(connection, { seq: -1, jump: 0 }); return; }
        if (this.size >= 32) throw new Error('맵이 가득 찼습니다.');
        const x = 90 + this.size % 8 * 28, y = TEST2_MAP[0].y - 14;
        const colors = [0xe9b35f, 0x79b4e8, 0xe08eaa, 0x7dc9aa, 0xbc9cdd];
        this.players.set(id, { state: { id, name, x, y, color: colors[seedWalkHash(String(id)) % colors.length], checkpoint: 0, finished: false, deaths: 0 }, body: { x, y, vy: 0, grounded: true, coyote: .1, buffer: 0 }, connections: new Map([[connection, { seq: -1, jump: 0 }]]), axis: 0, inputAt: 0, bubbleUntil: 0 });
    }
    leave(id: number, connection: string) {
        const player = this.players.get(id); if (!player) return;
        player.connections.delete(connection);
        if (player.controller === connection) { player.axis = 0; player.body.buffer = 0; }
        if (!player.connections.size) this.players.delete(id);
    }
    input(id: number, connection: string, input: Test2Input, now: number) {
        const player = this.players.get(id), last = player?.connections.get(connection);
        if (!player || !last || !validTest2Input(input) || input.seq <= last.seq || input.jump < last.jump) return false;
        if (input.jump > last.jump) player.body.buffer = TEST2_BUFFER;
        player.connections.set(connection, { seq: input.seq, jump: input.jump });
        player.axis = input.x; player.inputAt = now; player.controller = connection;
        return true;
    }
    respawn(id: number, connection: string): boolean {
        const p = this.players.get(id); if (!p?.connections.has(connection)) return false;
        const platform = TEST2_MAP.find(row => row.checkpoint === p.state.checkpoint)!;
        Object.assign(p.body, { x: platform.x + 70, y: platform.y - 14, vy: 0, grounded: true, coyote: .1, buffer: 0 });
        p.state.x = p.body.x; p.state.y = p.body.y; p.axis = 0; p.state.deaths++;
        return true;
    }
    say(id: number, connection: string, input: unknown, now: number) {
        const p = this.players.get(id), text = normalizeSeedWalkChat(input);
        if (!p?.connections.has(connection) || text === undefined) return false;
        p.state.bubble = { text }; p.bubbleUntil = now + SEED_WALK_BUBBLE_MS; return true;
    }
    update(dt: number, now: number) {
        for (const p of this.players.values()) {
            if (p.bubbleUntil <= now) delete p.state.bubble;
            const landed = stepJumper(p.body, now - p.inputAt > 300 ? 0 : p.axis, dt);
            if (landed && landed.checkpoint > p.state.checkpoint) p.state.checkpoint = landed.checkpoint;
            if (landed?.finish) p.state.finished = true;
            if (p.body.y > 1100) this.respawn(p.state.id, p.connections.keys().next().value!);
            p.state.x = p.body.x; p.state.y = p.body.y;
        }
        this.tick++;
    }
    snapshot(): Test2Snapshot {
        return { worldId: this.id, seed: 'test2', version: TEST2_VERSION, tick: this.tick, players: [...this.players.values()].map(p => ({ ...p.state, ...(p.state.bubble ? { bubble: { ...p.state.bubble } } : {}) })) };
    }
}
