import type { Socket } from 'socket.io';
import type { SnapshotRevision } from '../../../shared/types.js';
import { randomHex } from '../utils/random.js';
import { getSession } from './login.js';
import { getIO } from './socket.js';

interface RevisionStreamState<T extends object> {
    syncId: string
    revision: number
    fingerprint: string
    payload: T & SnapshotRevision
}

const streams = new Map<string, RevisionStreamState<object>>();
const deliveredBySocket = new WeakMap<Socket, Map<string, string>>();

function streamKey(userId: number, kind: string): string {
    return `${kind}:${userId}`;
}

function resolveStream<T extends object>(userId: number, kind: string, data: T): RevisionStreamState<T> {
    const key = streamKey(userId, kind);
    const fingerprint = JSON.stringify(data);
    const previous = streams.get(key) as RevisionStreamState<T> | undefined;
    if (previous?.fingerprint === fingerprint) return previous;
    const syncId = previous?.syncId ?? randomHex(8);
    const revision = (previous?.revision ?? 0) + 1;
    const next: RevisionStreamState<T> = {
        syncId,
        revision,
        fingerprint,
        payload: { ...data, syncId, revision },
    };
    streams.set(key, next as RevisionStreamState<object>);
    return next;
}

/** 변경된 완전한 snapshot만 각 소켓에 한 번 전달한다. 새 소켓은 현재 revision을 즉시 받는다. */
export function publishUserSnapshot<T extends object>(
    userId: number,
    kind: string,
    data: T,
    emit: (socket: Socket, payload: T & SnapshotRevision) => void,
): number {
    const key = streamKey(userId, kind);
    const stream = resolveStream(userId, kind, data);
    const stamp = `${stream.syncId}:${stream.revision}`;
    let count = 0;
    for (const [, socket] of getIO().sockets.sockets) {
        const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
        if (session?.userId !== userId) continue;
        const delivered = deliveredBySocket.get(socket) ?? new Map<string, string>();
        if (delivered.get(key) === stamp) continue;
        emit(socket, stream.payload);
        delivered.set(key, stamp);
        deliveredBySocket.set(socket, delivered);
        count++;
    }
    return count;
}

export function clearUserSnapshotStreams(userId: number): void {
    for (const key of [...streams.keys()]) {
        if (key.endsWith(`:${userId}`)) streams.delete(key);
    }
}

/** 단위 테스트용 revision 계산기. 네트워크 전달 상태는 포함하지 않는다. */
export class RevisionedSnapshot<T extends object> {
    private syncId = randomHex(8);
    private revision = 0;
    private fingerprint = '';
    private payload: (T & SnapshotRevision) | undefined;

    resolve(data: T): T & SnapshotRevision {
        const fingerprint = JSON.stringify(data);
        if (fingerprint !== this.fingerprint || !this.payload) {
            this.fingerprint = fingerprint;
            this.revision++;
            this.payload = { ...data, syncId: this.syncId, revision: this.revision };
        }
        return this.payload;
    }

    reset(): void {
        this.syncId = randomHex(8);
        this.revision = 0;
        this.fingerprint = '';
        this.payload = undefined;
    }
}
