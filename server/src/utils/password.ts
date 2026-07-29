import { pbkdf2, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const pbkdf2Async = promisify(pbkdf2);
export const PASSWORD_HASH_ITERATIONS = 10_000;
export const PASSWORD_HASH_BYTES = 64;

/** 기존 저장 형식과 호환하면서 CPU 작업을 libuv worker pool에서 실행한다. */
export async function derivePasswordHash(password: string, salt: string): Promise<string> {
    const derived = await pbkdf2Async(
        password,
        salt,
        PASSWORD_HASH_ITERATIONS,
        PASSWORD_HASH_BYTES,
        'sha512',
    );
    return derived.toString('hex');
}

export async function verifyPasswordHash(password: string, salt: string, expectedHex: string): Promise<boolean> {
    const actual = Buffer.from(await derivePasswordHash(password, salt), 'hex');
    const expected = Buffer.from(expectedHex, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}
