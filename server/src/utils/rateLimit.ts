export interface RateLimitDecision {
    readonly allowed: boolean
    readonly retryAfterMs: number
}

interface RateLimitEntry {
    count: number
    resetAt: number
}

/** 외부 저장소 없이 단일 서버 프로세스의 고빈도 요청을 제한하는 고정 구간 limiter. */
export class FixedWindowRateLimiter {
    private readonly entries = new Map<string, RateLimitEntry>();

    constructor(
        readonly limit: number,
        readonly windowMs: number,
        readonly maxKeys = 10_000,
    ) {
        if (!Number.isInteger(limit) || limit < 1) throw new Error('Rate limit must be a positive integer.');
        if (!Number.isFinite(windowMs) || windowMs < 1) throw new Error('Rate limit window must be positive.');
    }

    consume(key: string, now = Date.now()): RateLimitDecision {
        const normalizedKey = key.trim() || 'unknown';
        let entry = this.entries.get(normalizedKey);
        if (entry && entry.resetAt <= now) {
            this.entries.delete(normalizedKey);
            entry = undefined;
        }
        if (!entry) {
            this.prune(now);
            if (this.entries.size >= this.maxKeys) {
                return { allowed: false, retryAfterMs: this.windowMs };
            }
            this.entries.set(normalizedKey, { count: 1, resetAt: now + this.windowMs });
            return { allowed: true, retryAfterMs: 0 };
        }
        if (entry.count >= this.limit) {
            return { allowed: false, retryAfterMs: Math.max(1, entry.resetAt - now) };
        }
        entry.count += 1;
        return { allowed: true, retryAfterMs: 0 };
    }

    reset(key: string): void {
        this.entries.delete(key.trim() || 'unknown');
    }

    private prune(now: number): void {
        for (const [key, entry] of this.entries) {
            if (entry.resetAt <= now) this.entries.delete(key);
        }
    }
}
