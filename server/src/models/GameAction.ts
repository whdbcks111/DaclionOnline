export interface GameActionResult {
    ok: boolean
    error?: string
}

interface GameActionRequirement {
    check: () => boolean
    message: string
}

interface GameActionStep {
    apply: () => void
    rollback?: () => void
}

/** 검증 후 변경을 한 번에 적용하는 작은 동기식 트랜잭션 빌더. */
export class GameAction {
    private readonly requirements: GameActionRequirement[] = [];
    private readonly steps: GameActionStep[] = [];

    constructor(readonly name: string) {}

    require(check: boolean | (() => boolean), message: string): this {
        this.requirements.push({ check: typeof check === 'function' ? check : () => check, message });
        return this;
    }

    step(apply: () => void, rollback?: () => void): this {
        this.steps.push({ apply, rollback });
        return this;
    }

    run(): GameActionResult {
        try {
            for (const requirement of this.requirements) {
                if (!requirement.check()) return { ok: false, error: requirement.message };
            }
        } catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : `${this.name} 검증에 실패했습니다.` };
        }

        const completed: GameActionStep[] = [];
        try {
            for (const step of this.steps) {
                step.apply();
                completed.push(step);
            }
            return { ok: true };
        } catch (error) {
            for (const step of completed.reverse()) {
                try { step.rollback?.(); } catch { /* 원래 실패를 보존한다. */ }
            }
            return { ok: false, error: error instanceof Error ? error.message : `${this.name} 적용에 실패했습니다.` };
        }
    }
}

export function gameAction(name: string): GameAction {
    return new GameAction(name);
}
