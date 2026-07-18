import logger from '../utils/logger.js';

export interface ScheduleGameTaskOptions {
    /** 같은 key가 이미 있으면 교체한다. 기본 true. */
    replace?: boolean
    /** 지정하면 callback 실행 후 같은 간격으로 반복한다. */
    repeatSeconds?: number
}

interface ScheduledGameTask {
    key: string
    remaining: number
    repeatSeconds?: number
    run: () => void | boolean
}

const tasks = new Map<string, ScheduledGameTask>();

/** 게임 시간 기준 지연 작업을 등록하고 해제 함수를 반환한다. */
export function scheduleGameTask(
    key: string,
    delaySeconds: number,
    run: () => void | boolean,
    options: ScheduleGameTaskOptions = {},
): () => boolean {
    const normalized = key.trim();
    if (!normalized) throw new Error('Scheduled task key must not be empty');
    if (!Number.isFinite(delaySeconds) || delaySeconds < 0) throw new Error('Scheduled task delay must be non-negative');
    if (options.repeatSeconds !== undefined && (!Number.isFinite(options.repeatSeconds) || options.repeatSeconds <= 0)) {
        throw new Error('Scheduled task repeat interval must be positive');
    }
    if (tasks.has(normalized) && options.replace === false) return () => false;
    tasks.set(normalized, {
        key: normalized,
        remaining: delaySeconds,
        repeatSeconds: options.repeatSeconds,
        run,
    });
    return () => cancelGameTask(normalized);
}

export function hasGameTask(key: string): boolean {
    return tasks.has(key.trim());
}

export function cancelGameTask(key: string): boolean {
    return tasks.delete(key.trim());
}

export function cancelGameTasksByPrefix(prefix: string): number {
    const normalized = prefix.trim();
    let count = 0;
    for (const key of [...tasks.keys()]) {
        if (key.startsWith(normalized) && tasks.delete(key)) count++;
    }
    return count;
}

/** 게임 루프에서 한 번 호출한다. callback의 false 반환은 반복 작업을 종료한다. */
export function updateGameScheduler(dt: number): void {
    if (!Number.isFinite(dt) || dt < 0) throw new Error('Scheduler delta time must be non-negative');
    for (const task of [...tasks.values()]) {
        if (tasks.get(task.key) !== task) continue;
        task.remaining -= dt;
        if (task.remaining > 0) continue;
        let keep = true;
        try {
            keep = task.run() !== false;
        } catch (error) {
            keep = false;
            logger.error(`예약 작업 실행 실패: ${task.key}`, error);
        }
        if (tasks.get(task.key) !== task) continue;
        if (keep && task.repeatSeconds !== undefined) {
            task.remaining += task.repeatSeconds;
        } else {
            tasks.delete(task.key);
        }
    }
}

/** 테스트와 서버 종료 정리용. */
export function clearGameTasks(): void {
    tasks.clear();
}
