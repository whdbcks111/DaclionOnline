import prisma from '../config/prisma.js';
import type Player from '../models/Player.js';
import {
    Item,
    getItemData,
    type ItemSnapshot,
} from '../models/Item.js';
import type { PersistedInventoryGrantRow } from '../models/Inventory.js';
import type { TagId } from '../../../shared/tags.js';
import logger from '../utils/logger.js';
import type { Prisma } from '../generated/prisma/client.js';

export const MAILBOX_LIST_LIMIT = 20;
export const MAILBOX_ATTACHMENT_VERSION = 1;
export const MAILBOX_MAX_ATTACHMENT_SNAPSHOTS = 20;
export const MAILBOX_MAX_PERSISTED_ITEM_ROWS = 100;
export const MAILBOX_MAX_TOTAL_ITEM_COUNT = 1_000_000;
export const MAILBOX_MAX_ATTACHMENT_JSON_BYTES = 32 * 1024;
export const MAILBOX_CLAIM_ALL_MAIL_LIMIT = 20;
export const MAILBOX_CLAIM_ALL_ROW_LIMIT = 100;
export const MAILBOX_SOURCE_KEY_PATTERN = /^[a-z0-9][a-z0-9:_./-]{0,149}$/;

interface StoredMailboxAttachmentsV1 {
    readonly version: typeof MAILBOX_ATTACHMENT_VERSION;
    readonly items: readonly ItemSnapshot[];
}

export interface SendSystemMailInput {
    readonly recipientId: number;
    readonly senderLabel?: string;
    readonly subject: string;
    readonly body: string;
    readonly items?: readonly ItemSnapshot[];
    /** 같은 수신자에게 동일 보상을 재시도해도 한 통만 생성하기 위한 멱등 key. */
    readonly sourceKey?: string;
    readonly expiresAt?: Date;
}

export interface MailboxMessageSummary {
    readonly id: number;
    readonly senderLabel: string;
    readonly subject: string;
    readonly attachmentCount: number;
    readonly createdAt: Date;
    readonly readAt: Date | null;
    readonly claimedAt: Date | null;
    readonly expiresAt: Date | null;
    readonly expired: boolean;
}

export interface MailboxAttachmentDisplay {
    readonly itemDataId: string;
    readonly name: string;
    readonly count: number;
}

export interface MailboxMessageDetail extends MailboxMessageSummary {
    readonly body: string;
    readonly attachments: readonly MailboxAttachmentDisplay[];
    readonly attachmentCorrupted: boolean;
}

export type MailboxClaimFailureCode =
    | 'not-found'
    | 'already-claimed'
    | 'expired'
    | 'no-attachments'
    | 'invalid-attachments'
    | 'capacity'
    | 'batch-limit'
    | 'unavailable'
    | 'database-error';

export type MailboxClaimResult = {
    readonly success: true;
    readonly mailId: number;
    readonly items: readonly MailboxAttachmentDisplay[];
    readonly memorySynchronized: boolean;
    /** 이번 수령 transaction에서 실제 생성한 Item 행 수. */
    readonly persistedRowCount: number;
} | {
    readonly success: false;
    readonly mailId: number;
    readonly code: MailboxClaimFailureCode;
    readonly reason: string;
};

export interface MailboxClaimAllResult {
    readonly results: readonly MailboxClaimResult[];
    /** 한 번의 20통/100 Item행 처리 예산 밖에 아직 받을 우편이 남아 있음. */
    readonly hasMore: boolean;
}

type MailboxRow = {
    id: number;
    senderLabel: string;
    subject: string;
    body: string;
    attachments: unknown;
    attachmentCount: number;
    createdAt: Date;
    readAt: Date | null;
    claimedAt: Date | null;
    expiresAt: Date | null;
};

const claimQueues = new Map<number, Promise<unknown>>();

function normalizeText(value: string, label: string, maxLength: number): string {
    const normalized = value.trim();
    if (!normalized || normalized.length > maxLength) {
        throw new Error(`${label}은(는) 1~${maxLength}자여야 합니다.`);
    }
    return normalized;
}

function normalizeAttachmentSnapshots(items: readonly ItemSnapshot[]): readonly ItemSnapshot[] {
    if (items.length > MAILBOX_MAX_ATTACHMENT_SNAPSHOTS) {
        throw new Error(`우편 첨부 종류는 최대 ${MAILBOX_MAX_ATTACHMENT_SNAPSHOTS}개입니다.`);
    }
    let persistedRows = 0;
    let totalItemCount = 0;
    return Object.freeze(items.map(snapshot => {
        const data = getItemData(snapshot.itemDataId);
        if (!data) throw new Error(`존재하지 않는 우편 첨부 아이템입니다: ${snapshot.itemDataId}`);
        if (!Number.isSafeInteger(snapshot.count) || snapshot.count < 1) {
            throw new Error('우편 첨부 수량은 1 이상의 정수여야 합니다.');
        }
        if (snapshot.durability !== null
            && (!Number.isSafeInteger(snapshot.durability) || snapshot.durability < 1)) {
            throw new Error('우편 첨부 내구도가 올바르지 않습니다.');
        }
        if (!Array.isArray(snapshot.tags) || snapshot.tags.some(tag => typeof tag !== 'string')) {
            throw new Error('우편 첨부 태그가 올바르지 않습니다.');
        }
        let metadataDelta = snapshot.metadataDelta;
        try {
            metadataDelta = metadataDelta === null
                ? null
                : JSON.parse(JSON.stringify(metadataDelta)) as typeof metadataDelta;
        } catch {
            throw new Error('우편 첨부 metadata를 직렬화할 수 없습니다.');
        }
        const normalized: ItemSnapshot = {
            itemDataId: snapshot.itemDataId,
            count: snapshot.count,
            durability: snapshot.durability,
            metadataDelta,
            tags: [...new Set(snapshot.tags)] as TagId[],
        };
        const item = Item.fromSnapshot(normalized);
        if (item.isBroken) throw new Error('파손된 아이템은 우편에 첨부할 수 없습니다.');
        totalItemCount += snapshot.count;
        if (totalItemCount > MAILBOX_MAX_TOTAL_ITEM_COUNT) {
            throw new Error(`우편 첨부 총수량은 최대 ${MAILBOX_MAX_TOTAL_ITEM_COUNT.toLocaleString()}개입니다.`);
        }
        persistedRows += data.stackable ? Math.ceil(snapshot.count / data.maxStack) : snapshot.count;
        if (persistedRows > MAILBOX_MAX_PERSISTED_ITEM_ROWS) {
            throw new Error(`우편 한 통이 생성할 수 있는 아이템 행은 최대 ${MAILBOX_MAX_PERSISTED_ITEM_ROWS}개입니다.`);
        }
        return Object.freeze(normalized);
    }));
}

export function encodeMailboxAttachments(
    items: readonly ItemSnapshot[],
): StoredMailboxAttachmentsV1 | null {
    const normalized = normalizeAttachmentSnapshots(items);
    const bundle: StoredMailboxAttachmentsV1 | null = normalized.length === 0
        ? null
        : Object.freeze({ version: MAILBOX_ATTACHMENT_VERSION, items: normalized });
    if (bundle && Buffer.byteLength(JSON.stringify(bundle), 'utf8') > MAILBOX_MAX_ATTACHMENT_JSON_BYTES) {
        throw new Error(`우편 첨부 정보는 최대 ${MAILBOX_MAX_ATTACHMENT_JSON_BYTES / 1024}KiB입니다.`);
    }
    return bundle;
}

export function decodeMailboxAttachments(value: unknown): readonly ItemSnapshot[] | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const candidate = value as { version?: unknown; items?: unknown };
    if (candidate.version !== MAILBOX_ATTACHMENT_VERSION || !Array.isArray(candidate.items)) return undefined;
    try {
        if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAILBOX_MAX_ATTACHMENT_JSON_BYTES) {
            return undefined;
        }
        return normalizeAttachmentSnapshots(candidate.items as ItemSnapshot[]);
    } catch {
        return undefined;
    }
}

function toSummary(row: MailboxRow, now = new Date()): MailboxMessageSummary {
    return {
        id: row.id,
        senderLabel: row.senderLabel,
        subject: row.subject,
        attachmentCount: row.attachmentCount,
        createdAt: row.createdAt,
        readAt: row.readAt,
        claimedAt: row.claimedAt,
        expiresAt: row.expiresAt,
        expired: row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime(),
    };
}

function toAttachmentDisplay(items: readonly ItemSnapshot[]): MailboxAttachmentDisplay[] {
    return items.map(snapshot => ({
        itemDataId: snapshot.itemDataId,
        name: getItemData(snapshot.itemDataId)?.name ?? snapshot.itemDataId,
        count: snapshot.count,
    }));
}

function toDetail(row: MailboxRow, now = new Date()): MailboxMessageDetail {
    const attachments = row.attachmentCount > 0
        ? decodeMailboxAttachments(row.attachments)
        : Object.freeze([] as ItemSnapshot[]);
    return {
        ...toSummary(row, now),
        body: row.body,
        attachments: attachments ? toAttachmentDisplay(attachments) : [],
        attachmentCorrupted: row.attachmentCount > 0 && attachments === undefined,
    };
}

function enqueueClaim<T>(playerId: number, action: () => Promise<T>): Promise<T> {
    const previous = claimQueues.get(playerId) ?? Promise.resolve();
    const operation = previous.catch(() => undefined).then(action);
    claimQueues.set(playerId, operation);
    return operation.finally(() => {
        if (claimQueues.get(playerId) === operation) claimQueues.delete(playerId);
    });
}

function claimFailure(mailId: number, code: MailboxClaimFailureCode, reason: string): MailboxClaimResult {
    return { success: false, mailId, code, reason };
}

/** 시스템 보상 기능만 호출하는 공개 발송 API. 플레이어 간 발송은 의도적으로 제공하지 않는다. */
export async function sendSystemMail(input: SendSystemMailInput): Promise<MailboxMessageSummary> {
    if (!Number.isSafeInteger(input.recipientId) || input.recipientId <= 0) {
        throw new Error('우편 수신자 ID가 올바르지 않습니다.');
    }
    const senderLabel = normalizeText(input.senderLabel ?? '시스템', '발신자', 50);
    const subject = normalizeText(input.subject, '우편 제목', 120);
    const body = normalizeText(input.body, '우편 본문', 10_000);
    const sourceKey = input.sourceKey === undefined
        ? undefined
        : normalizeText(input.sourceKey, '우편 멱등 키', 150);
    if (sourceKey !== undefined && !MAILBOX_SOURCE_KEY_PATTERN.test(sourceKey)) {
        throw new Error('우편 멱등 키는 소문자 영문·숫자로 시작하고 소문자 영문, 숫자, :, _, ., /, -만 사용할 수 있습니다.');
    }
    if (input.expiresAt && (!Number.isFinite(input.expiresAt.getTime())
        || input.expiresAt.getTime() <= Date.now())) {
        throw new Error('우편 만료 시각은 현재보다 뒤여야 합니다.');
    }
    const attachments = encodeMailboxAttachments(input.items ?? []);
    const attachmentCount = attachments?.items.reduce((sum, item) => sum + item.count, 0) ?? 0;
    const exists = await prisma.player.findUnique({
        where: { userId: input.recipientId },
        select: { userId: true },
    });
    if (!exists) throw new Error('우편을 받을 플레이어가 존재하지 않습니다.');
    const create = {
        recipientId: input.recipientId,
        senderLabel,
        subject,
        body,
        ...(attachments ? { attachments: attachments as any } : {}),
        attachmentCount,
        sourceKey,
        expiresAt: input.expiresAt,
    };
    const row = sourceKey
        ? await prisma.mailboxMessage.upsert({
            where: { recipientId_sourceKey: { recipientId: input.recipientId, sourceKey } },
            create,
            update: {},
        })
        : await prisma.mailboxMessage.create({ data: create });
    return toSummary(row);
}

export async function listMailboxMessages(
    recipientId: number,
    limit = MAILBOX_LIST_LIMIT,
): Promise<MailboxMessageSummary[]> {
    const take = Math.max(1, Math.min(MAILBOX_LIST_LIMIT, Math.floor(limit)));
    const rows = await prisma.mailboxMessage.findMany({
        where: { recipientId, archivedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
    });
    const now = new Date();
    return rows.map(row => toSummary(row, now));
}

export async function readMailboxMessage(
    recipientId: number,
    mailId: number,
): Promise<MailboxMessageDetail | undefined> {
    if (!Number.isSafeInteger(mailId) || mailId <= 0) return undefined;
    const row = await prisma.mailboxMessage.findFirst({
        where: { id: mailId, recipientId, archivedAt: null },
    });
    if (!row) return undefined;
    if (!row.readAt) {
        const readAt = new Date();
        await prisma.mailboxMessage.updateMany({
            where: { id: mailId, recipientId, readAt: null },
            data: { readAt },
        });
        row.readAt = readAt;
    }
    return toDetail(row);
}

async function claimMailboxMessageUnlocked(
    player: Player,
    mailId: number,
    saveBeforeClaim: boolean,
    maximumPersistedRows = MAILBOX_MAX_PERSISTED_ITEM_ROWS,
): Promise<MailboxClaimResult> {
    if (!Number.isSafeInteger(mailId) || mailId <= 0) {
        return claimFailure(mailId, 'not-found', '유효한 우편 번호가 아닙니다.');
    }
    const preview = await prisma.mailboxMessage.findFirst({
        where: { id: mailId, recipientId: player.userId, archivedAt: null },
    });
    if (!preview) return claimFailure(mailId, 'not-found', '해당 우편을 찾을 수 없습니다.');
    if (preview.claimedAt) return claimFailure(mailId, 'already-claimed', '이미 첨부를 수령한 우편입니다.');
    const now = new Date();
    if (preview.expiresAt && preview.expiresAt.getTime() <= now.getTime()) {
        return claimFailure(mailId, 'expired', '만료된 우편이라 첨부를 수령할 수 없습니다.');
    }
    if (preview.attachmentCount <= 0) {
        return claimFailure(mailId, 'no-attachments', '이 우편에는 수령할 첨부가 없습니다.');
    }
    const attachments = decodeMailboxAttachments(preview.attachments);
    if (!attachments) {
        return claimFailure(mailId, 'invalid-attachments', '우편 첨부 정보가 손상되어 수령할 수 없습니다.');
    }
    if (saveBeforeClaim) await player.save();
    const grantPlan = player.inventory.preparePersistedGrant(attachments);
    if (!grantPlan) {
        return claimFailure(mailId, 'capacity', '첨부를 모두 받을 만큼 인벤토리 중량 여유가 없습니다.');
    }
    if (grantPlan.rows.length > maximumPersistedRows) {
        return claimFailure(mailId, 'batch-limit', '이번 전체 수령의 아이템 처리 한도에 도달했습니다.');
    }

    let createdRows: readonly PersistedInventoryGrantRow[] | null;
    try {
        createdRows = await prisma.$transaction(async transaction => {
            const claimedAt = new Date();
            const updated = await transaction.mailboxMessage.updateMany({
                where: {
                    id: mailId,
                    recipientId: player.userId,
                    claimedAt: null,
                    archivedAt: null,
                    OR: [{ expiresAt: null }, { expiresAt: { gt: claimedAt } }],
                },
                data: {
                    claimedAt,
                    readAt: preview.readAt ?? claimedAt,
                },
            });
            if (updated.count !== 1) return null;
            return player.inventory.persistPreparedGrant(transaction, grantPlan);
        }, { timeout: 15_000 });
    } catch (error) {
        logger.error(`우편 첨부 수령 transaction 실패: user=${player.userId}, mail=${mailId}`, error);
        return claimFailure(mailId, 'database-error', '우편 수령을 확정하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
    }
    if (!createdRows) {
        return claimFailure(mailId, 'unavailable', '다른 접속에서 이미 수령했거나 우편이 만료되었습니다.');
    }
    let memorySynchronized = false;
    try {
        memorySynchronized = player.inventory.adoptPersistedGrant(createdRows);
    } catch (error) {
        logger.error(`우편 첨부 DB 확정 후 메모리 동기화 예외: user=${player.userId}, mail=${mailId}`, error);
    }
    if (!memorySynchronized) {
        logger.error(`우편 첨부 DB 확정 후 메모리 동기화 실패: user=${player.userId}, mail=${mailId}`);
    }
    return {
        success: true,
        mailId,
        items: toAttachmentDisplay(attachments),
        memorySynchronized,
        persistedRowCount: createdRows.length,
    };
}

/** 같은 계정의 동시 수령 요청을 직렬화하고 첨부 지급을 원자적으로 확정한다. */
export function claimMailboxMessage(player: Player, mailId: number): Promise<MailboxClaimResult> {
    return enqueueClaim(player.userId, () => claimMailboxMessageUnlocked(player, mailId, true));
}

export function claimAllMailboxAttachments(player: Player): Promise<MailboxClaimAllResult> {
    return enqueueClaim(player.userId, async () => {
        await player.save();
        const now = new Date();
        const rows = await prisma.mailboxMessage.findMany({
            where: {
                recipientId: player.userId,
                attachmentCount: { gt: 0 },
                claimedAt: null,
                archivedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            select: { id: true, attachments: true },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take: MAILBOX_CLAIM_ALL_MAIL_LIMIT + 1,
        });
        const results: MailboxClaimResult[] = [];
        const candidates = rows.slice(0, MAILBOX_CLAIM_ALL_MAIL_LIMIT);
        let remainingRows = MAILBOX_CLAIM_ALL_ROW_LIMIT;
        let hasMore = rows.length > candidates.length;
        for (let index = 0; index < candidates.length; index++) {
            const row = candidates[index];
            const attachments = decodeMailboxAttachments(row.attachments);
            const previewPlan = attachments
                ? player.inventory.preparePersistedGrant(attachments)
                : null;
            if (previewPlan && previewPlan.rows.length > remainingRows) {
                hasMore = true;
                break;
            }
            const result = await claimMailboxMessageUnlocked(player, row.id, false, remainingRows);
            if (!result.success && result.code === 'batch-limit') {
                hasMore = true;
                break;
            }
            results.push(result);
            if (result.success) remainingRows -= result.persistedRowCount;
            if (remainingRows <= 0 && index < candidates.length - 1) {
                hasMore = true;
                break;
            }
        }
        return { results: Object.freeze(results), hasMore };
    });
}

/** 완료 우편을 정리한다. 멱등 우편은 archive하고 일반 우편은 삭제하며 미수령 유효 첨부는 보존한다. */
export async function cleanupCompletedMailboxMessages(recipientId: number): Promise<number> {
    const now = new Date();
    const completionFilter: Prisma.MailboxMessageWhereInput = {
        recipientId,
        archivedAt: null,
        OR: [
            { claimedAt: { not: null } },
            { attachmentCount: 0, readAt: { not: null } },
            { expiresAt: { lte: now } },
        ],
    };
    const [archived, deleted] = await prisma.$transaction([
        // 멱등 보상의 unique sourceKey tombstone은 숨기되 남겨 재발송 중복을 차단한다.
        prisma.mailboxMessage.updateMany({
            where: { ...completionFilter, sourceKey: { not: null } },
            data: { archivedAt: now },
        }),
        // 멱등 key가 없는 일반 안내 우편은 완료 후 실제 삭제해 테이블 증가를 제한한다.
        prisma.mailboxMessage.deleteMany({
            where: { ...completionFilter, sourceKey: null },
        }),
    ]);
    return archived.count + deleted.count;
}
