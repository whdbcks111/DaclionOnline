import { randomHex } from '../../utils/random.js';

/** 로그인 토큰은 서버에만 보관하고 URL에는 짧게 유효한 일회용 코드만 전달한다. */
export class LoginHandoff {
    private readonly codes = new Map<string, { token: string; state: string; expiresAt: number }>();
    constructor(private readonly lifetimeMs = 30_000, private readonly limit = 1_000) {}

    issue(token: string, state: string, now = Date.now()): string {
        for (const [code, entry] of this.codes) {
            if (entry.expiresAt <= now) this.codes.delete(code);
        }
        if (this.codes.size >= this.limit) throw new Error('로그인 연결 요청이 너무 많습니다.');
        const code = randomHex(32);
        this.codes.set(code, { token, state, expiresAt: now + this.lifetimeMs });
        return code;
    }

    consume(code: string, state: string, now = Date.now()): string | undefined {
        const entry = this.codes.get(code);
        this.codes.delete(code);
        return entry && entry.state === state && entry.expiresAt > now ? entry.token : undefined;
    }
}
