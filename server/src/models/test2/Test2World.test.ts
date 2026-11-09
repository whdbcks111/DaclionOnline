import assert from 'node:assert/strict';
import test from 'node:test';
import { TEST2_MAP, TEST2_BUFFER, stepJumper, validTest2Input, type JumpBody } from '../../../../shared/test2.js';
import { Test2World } from './Test2World.js';
const dt = 1 / 60;
const body = (x = 90, y = 406): JumpBody => ({ x, y, vy: 0, grounded: true, coyote: .1, buffer: 0 });
test('241개 발판과 20개 체크포인트의 전체 코스는 실제 점프 궤적으로 건널 수 있다', () => {
    assert.equal(TEST2_MAP.length, 241); assert.ok(TEST2_MAP.at(-1)!.x > 65000);
    assert.equal(TEST2_MAP.filter(p => p.checkpoint > 0).length, 20);
    for (let i = 0; i < 240; i++) {
        const from = TEST2_MAP[i], target = TEST2_MAP[i + 1], b = body(from.x + from.width - 8, from.y - 14); b.buffer = TEST2_BUFFER;
        let reached = false;
        for (let n = 0; n < 120; n++) if (stepJumper(b, b.x < target.x + 25 ? 1 : 0, dt, [from, target])?.id === target.id) { reached = true; break; }
        assert.ok(reached, `platform ${i} → ${i + 1}`);
    }
});
test('코요테 시간 안에만 점프를 허용하고 공중 재점프를 막는다', () => {
    const b = body(); b.grounded = false; b.coyote = .08; b.buffer = TEST2_BUFFER;
    stepJumper(b, 0, dt, []); assert.ok(b.vy < -500);
    b.buffer = TEST2_BUFFER; const vy = b.vy; stepJumper(b, 0, dt, []); assert.ok(b.vy > vy);
    const expired = body(); expired.grounded = false; expired.coyote = .005; expired.buffer = TEST2_BUFFER;
    stepJumper(expired, 0, dt, []); assert.ok(expired.vy > 0);
});
test('착지 직전 점프 버퍼는 즉시 실행하고 오래된 버퍼는 만료한다', () => {
    const b = body(90, 399); b.grounded = false; b.coyote = 0; b.vy = 500; b.buffer = TEST2_BUFFER;
    stepJumper(b, 0, dt); assert.ok(b.vy < 0); assert.equal(b.grounded, false);
    const expired = body(90, 200); expired.grounded = false; expired.coyote = 0; expired.buffer = .01;
    for (let i = 0; i < 90; i++) stepJumper(expired, 0, dt);
    assert.equal(expired.grounded, true); assert.equal(expired.vy, 0);
});
test('연결과 입력 순서 검증, 점프 유지 중 재점프 방지, 말풍선 복사와 만료', () => {
    const w = new Test2World(); w.join(1, '점프', 'a');
    assert.equal(w.input(1, 'other', { seq: 1, x: 1, jump: 1 }, 0), false);
    assert.equal(validTest2Input({ seq: 1, x: 99, jump: 1 }), false);
    for (let i = 1; i <= 120; i++) { w.input(1, 'a', { seq: i, x: 0, jump: 1 }, i * 16); w.update(dt, i * 16); }
    assert.equal(w.snapshot().players[0].y, 406);
    assert.equal(w.input(1, 'a', { seq: 1, x: 1, jump: 2 }, 2000), false);
    assert.equal(w.say(1, 'other', '위조', 0), false); w.say(1, 'a', '안녕', 2000);
    const copy = w.snapshot(); copy.players[0].bubble!.text = '변조'; assert.equal(w.snapshot().players[0].bubble?.text, '안녕');
    w.update(dt, 7001); assert.equal(w.snapshot().players[0].bubble, undefined);
});
test('공개 입력으로 체크포인트를 획득하고 추락 복귀와 다중 탭 정리를 처리한다', () => {
    const w = new Test2World(); w.join(1, '점프', 'a'); w.join(1, '점프', 'b'); assert.equal(w.size, 1);
    let seq = 0, jump = 0, now = 0;
    const tick = (axis: number) => { w.input(1, 'a', { seq: ++seq, x: axis, jump }, now); w.update(dt, now += 1000 / 60); };
    for (let i = 0; i < 12; i++) {
        const from = TEST2_MAP[i], target = TEST2_MAP[i + 1];
        for (let n = 0; n < 1000 && w.snapshot().players[0].x < from.x + from.width - 8; n++) tick(1);
        jump++;
        for (let n = 0; n < 120; n++) {
            tick(w.snapshot().players[0].x < target.x + 25 ? 1 : 0);
            const p = w.snapshot().players[0]; if (p.x > target.x && Math.abs(p.y - target.y + 14) < .01) break;
        }
    }
    assert.equal(w.snapshot().players[0].checkpoint, 1);
    assert.equal(w.respawn(1, 'other'), false); w.respawn(1, 'a'); assert.equal(w.snapshot().players[0].x, TEST2_MAP[12].x + 70);
    const before = w.snapshot().players[0].deaths;
    for (let n = 0; n < 300 && w.snapshot().players[0].deaths === before; n++) tick(1);
    assert.equal(w.snapshot().players[0].deaths, before + 1); assert.equal(w.snapshot().players[0].checkpoint, 1);
    w.leave(1, 'a'); assert.equal(w.size, 1); w.leave(1, 'b'); assert.equal(w.size, 0);
});
