import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface ServerBootState {
    schemaVersion: 1;
    bootCount: number;
    lastBootId: string | null;
    lastBootAt: string | null;
    appliedPatchVersion: string;
    nextPatchVersion: string;
    updatedAt: string;
    source: 'server-start' | 'manual-confirmation';
}

export interface RecordServerBootOptions {
    statePath?: string;
    now?: Date;
    bootId?: string;
    processId?: number;
}

function workspaceRoot(cwd = process.cwd()): string {
    return path.basename(cwd) === 'server' ? path.dirname(cwd) : cwd;
}

/** 에이전트와 서버가 함께 읽는 기본 재부팅 상태 파일 경로. */
export function getServerBootStatePath(): string {
    const configured = process.env.SERVER_BOOT_STATE_PATH?.trim();
    if (configured) {
        return path.isAbsolute(configured)
            ? configured
            : path.resolve(workspaceRoot(), configured);
    }
    return path.join(workspaceRoot(), '.runtime', 'server-boot.json');
}

function isServerBootState(value: unknown): value is ServerBootState {
    if (!value || typeof value !== 'object') return false;
    const state = value as Partial<ServerBootState>;
    return state.schemaVersion === 1
        && Number.isSafeInteger(state.bootCount)
        && (state.bootCount ?? -1) >= 0
        && (state.lastBootId === null || typeof state.lastBootId === 'string')
        && (state.lastBootAt === null || typeof state.lastBootAt === 'string')
        && typeof state.appliedPatchVersion === 'string'
        && typeof state.nextPatchVersion === 'string'
        && typeof state.updatedAt === 'string'
        && (state.source === 'server-start' || state.source === 'manual-confirmation');
}

export async function readServerBootState(
    statePath = getServerBootStatePath(),
): Promise<ServerBootState | undefined> {
    try {
        const parsed: unknown = JSON.parse(await readFile(statePath, 'utf8'));
        return isServerBootState(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
}

export function incrementPatchVersion(version: string): string {
    const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-[0-9a-z.-]+)?$/i.exec(version.trim());
    if (!match) throw new Error(`올바르지 않은 패치 버전입니다: ${version}`);
    return `${Number(match[1])}.${Number(match[2])}.${Number(match[3]) + 1}`;
}

/**
 * 실제 HTTP listen 성공 뒤 호출해 현재 소스에 포함된 최신 패치 버전을 적용 완료로 기록한다.
 * 임시 파일을 같은 디렉터리에 쓴 뒤 rename해 에이전트가 부분 JSON을 읽지 않게 한다.
 */
export async function recordServerBoot(
    appliedPatchVersion: string,
    options: RecordServerBootOptions = {},
): Promise<ServerBootState> {
    const version = appliedPatchVersion.trim();
    if (!version) throw new Error('적용 패치 버전이 필요합니다.');
    const statePath = options.statePath ?? getServerBootStatePath();
    const previous = await readServerBootState(statePath);
    const now = options.now ?? new Date();
    const state: ServerBootState = {
        schemaVersion: 1,
        bootCount: (previous?.bootCount ?? 0) + 1,
        lastBootId: options.bootId ?? randomUUID(),
        lastBootAt: now.toISOString(),
        appliedPatchVersion: version,
        nextPatchVersion: incrementPatchVersion(version),
        updatedAt: now.toISOString(),
        source: 'server-start',
    };

    await mkdir(path.dirname(statePath), { recursive: true });
    const temporaryPath = `${statePath}.${options.processId ?? process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryPath, statePath);
    return state;
}
