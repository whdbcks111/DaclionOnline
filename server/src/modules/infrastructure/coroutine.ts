/** 코루틴 yield 가능한 명령 */
export type YieldInstruction = WaitInstruction;

interface WaitInstruction {
    type: 'wait';
    remaining: number; // 남은 시간 (초)
}

/** 지정된 시간(초)만큼 대기. 0이면 다음 프레임까지 대기. */
export function Wait(seconds: number): WaitInstruction {
    return { type: 'wait', remaining: seconds };
}

export type CoroutineGenerator = Generator<YieldInstruction, void, void>;

interface CoroutineEntry {
    gen: CoroutineGenerator;
    current: YieldInstruction | null;
}

const coroutines: CoroutineEntry[] = [];

/** 코루틴 시작 (전역) */
export function startCoroutine(gen: CoroutineGenerator): void {
    const result = gen.next();
    if (result.done) return;
    coroutines.push({ gen, current: result.value });
}

/** 매 프레임 게임 루프에서 호출 */
export function tickCoroutines(dt: number): void {
    for (let i = coroutines.length - 1; i >= 0; i--) {
        const entry = coroutines[i];
        const instr = entry.current;

        if (!instr) {
            coroutines.splice(i, 1);
            continue;
        }

        if (instr.type === 'wait') {
            instr.remaining -= dt;
            if (instr.remaining > 0) continue;

            // 대기 완료 → 다음 yield로 진행
            const result = entry.gen.next();
            if (result.done) {
                coroutines.splice(i, 1);
            } else {
                entry.current = result.value;
            }
        }
    }
}
