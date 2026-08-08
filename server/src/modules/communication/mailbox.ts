import prisma from '../../config/prisma.js';
import type Player from '../../models/actors/Player.js';
import {
    Item,
    getItemData,
    type ItemSnapshot,
} from '../../models/economy/Item.js';
import type { PersistedInventoryGrantRow } from '../../models/economy/Inventory.js';
import type { TagId } from '../../../../shared/tags.js';
import logger from '../../utils/logger.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { getTitle, persistTitleRewardGrants } from '../../models/progression/Title.js';
import { getSkillData } from '../../models/progression/Skill.js';
import {
    persistSkillRewardGrants,
    type PersistedSkillRewardGrant,
} from '../../models/progression/SkillBook.js';

export const MAILBOX_LIST_LIMIT = 20;
export const MAILBOX_ATTACHMENT_VERSION = 1;
export const MAILBOX_REWARD_VERSION = 2;
export const MAILBOX_MAX_ATTACHMENT_SNAPSHOTS = 20;
export const MAILBOX_MAX_PERSISTED_ITEM_ROWS = 100;
export const MAILBOX_MAX_TOTAL_ITEM_COUNT = 1_000_000;
export const MAILBOX_MAX_ATTACHMENT_JSON_BYTES = 32 * 1024;
export const MAILBOX_CLAIM_ALL_MAIL_LIMIT = 20;
export const MAILBOX_CLAIM_ALL_ROW_LIMIT = 100;
export const MAILBOX_MAX_GOLD_REWARD = 1_000_000_000;
export const MAILBOX_MAX_PLAYER_GOLD = 2_000_000_000;
export const MAILBOX_MAX_TITLE_REWARDS = 20;
export const MAILBOX_MAX_SKILL_REWARDS = 20;
/** 32KiB 첨부와 긴 본문을 함께 발송해도 MySQL packet 여유를 남기는 대량 INSERT 크기. */
export const MAILBOX_BULK_INSERT_BATCH_SIZE = 100;
export const MAILBOX_SOURCE_KEY_PATTERN = /^[a-z0-9][a-z0-9:_./-]{0,149}$/;
const MAILBOX_BULK_RECIPIENT_QUERY_BATCH_SIZE = 1_000;
const MAILBOX_BULK_TRANSACTION_TIMEOUT_MS = 120_000;

interface StoredMailboxAttachmentsV1 {
    readonly version: typeof MAILBOX_ATTACHMENT_VERSION;
    readonly items: readonly ItemSnapshot[];
}

interface StoredMailboxRewardsV2 {
    readonly version: typeof MAILBOX_REWARD_VERSION;
    readonly items: readonly ItemSnapshot[];
    readonly gold: number;
    readonly titleIds: readonly string[];
    readonly skills: readonly MailboxSkillReward[];
}

type StoredMailboxPayload = StoredMailboxAttachmentsV1 | StoredMailboxRewardsV2;

export interface MailboxSkillReward {
    readonly skillDataId: string;
    readonly level: number;
}

export interface MailboxRewardInput {
    readonly gold?: number;
    readonly titleIds?: readonly string[];
    readonly skills?: readonly MailboxSkillReward[];
}

export interface MailboxRewardBundle {
    readonly items: readonly ItemSnapshot[];
    readonly gold: number;
    readonly titleIds: readonly string[];
    readonly skills: readonly MailboxSkillReward[];
}

export interface SendSystemMailInput {
    readonly recipientId: number;
    readonly senderLabel?: string;
    readonly subject: string;
    readonly body: string;
    readonly items?: readonly ItemSnapshot[];
    readonly rewards?: MailboxRewardInput;
    /** 같은 수신자에게 동일 보상을 재시도해도 한 통만 생성하기 위한 멱등 key. */
    readonly sourceKey?: string;
    readonly expiresAt?: Date;
}

/**
 * 같은 내용의 독립 우편을 여러 플레이어에게 발송하는 입력이다.
 * 관리자 수동 발송은 반복 실행 자체가 새 지급 의도이므로 sourceKey를 받지 않는다.
 */
export interface SendBulkSystemMailInput {
    readonly senderLabel?: string;
    readonly subject: string;
    readonly body: string;
    readonly items?: readonly ItemSnapshot[];
    readonly rewards?: MailboxRewardInput;
    readonly expiresAt?: Date;
    readonly recipientId?: never;
    readonly sourceKey?: never;
}

export interface SendBulkSystemMailResult {
    readonly recipientCount: number;
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

export interface MailboxTitleRewardDisplay {
    readonly titleId: string;
    readonly name: string;
}

export interface MailboxSkillRewardDisplay extends MailboxSkillReward {
    readonly name: string;
}

export interface MailboxMessageDetail extends MailboxMessageSummary {
    readonly body: string;
    readonly attachments: readonly MailboxAttachmentDisplay[];
    readonly gold: number;
    readonly titles: readonly MailboxTitleRewardDisplay[];
    readonly skills: readonly MailboxSkillRewardDisplay[];
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
    readonly gold: number;
    readonly titles: readonly MailboxTitleRewardDisplay[];
    readonly skills: readonly MailboxSkillRewardDisplay[];
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

type NormalizedSystemMailPayload = {
    readonly senderLabel: string;
    readonly subject: string;
    readonly body: string;
    readonly attachments: StoredMailboxPayload | null;
    readonly attachmentCount: number;
    readonly expiresAt: Date | undefined;
};

const claimQueues = new Map<number, Promise<unknown>>();

function normalizeText(value: string, label: string, maxLength: number): string {
    const normalized = value.trim();
    if (!normalized || normalized.length > maxLength) {
        throw new Error(`${label}은(는) 1~${maxLength}자여야 합니다.`);
    }
    return normalized;
}

function normalizeSystemMailPayload(
    input: Pick<SendSystemMailInput, 'senderLabel' | 'subject' | 'body' | 'items' | 'rewards' | 'expiresAt'>,
): NormalizedSystemMailPayload {
    const senderLabel = normalizeText(input.senderLabel ?? '시스템', '발신자', 50);
    const subject = normalizeText(input.subject, '우편 제목', 120);
    const body = normalizeText(input.body, '우편 본문', 10_000);
    if (input.expiresAt && (!Number.isFinite(input.expiresAt.getTime())
        || input.expiresAt.getTime() <= Date.now())) {
        throw new Error('우편 만료 시각은 현재보다 뒤여야 합니다.');
    }
    const attachments = encodeMailboxRewards(input.items ?? [], input.rewards);
    const rewardCount = attachments?.version === MAILBOX_REWARD_VERSION
        ? (attachments.gold > 0 ? 1 : 0) + attachments.titleIds.length + attachments.skills.length
        : 0;
    return Object.freeze({
        senderLabel,
        subject,
        body,
        attachments,
        attachmentCount: (attachments?.items.reduce((sum, item) => sum + item.count, 0) ?? 0) + rewardCount,
        expiresAt: input.expiresAt,
    });
}

function normalizeBulkRecipientIds(recipientIds: readonly number[]): readonly number[] {
    const uniqueRecipientIds = new Set<number>();
    for (const recipientId of recipientIds) {
        if (!Number.isSafeInteger(recipientId) || recipientId <= 0) {
            throw new Error('우편 수신자 ID가 올바르지 않습니다.');
        }
        uniqueRecipientIds.add(recipientId);
    }
    return Object.freeze([...uniqueRecipientIds].sort((left, right) => left - right));
}

function assertBulkInputHasNoSingleRecipientFields(input: SendBulkSystemMailInput): void {
    if (Object.hasOwn(input, 'recipientId') || Object.hasOwn(input, 'sourceKey')) {
        throw new Error('대량 우편에는 개별 수신자 ID나 멱등 키를 지정할 수 없습니다.');
    }
}

function chunkValues<T>(values: readonly T[], size: number): readonly (readonly T[])[] {
    const chunks: T[][] = [];
    for (let offset = 0; offset < values.length; offset += size) {
        chunks.push(values.slice(offset, offset + size));
    }
    return chunks;
}

function toBulkCreateInput(
    recipientId: number,
    payload: NormalizedSystemMailPayload,
): Prisma.MailboxMessageCreateManyInput {
    return {
        recipientId,
        senderLabel: payload.senderLabel,
        subject: payload.subject,
        body: payload.body,
        ...(payload.attachments
            ? { attachments: payload.attachments as unknown as Prisma.InputJsonValue }
            : {}),
        attachmentCount: payload.attachmentCount,
        expiresAt: payload.expiresAt,
    };
}

async function createBulkSystemMailInTransaction(
    transaction: Prisma.TransactionClient,
    recipientIds: readonly number[],
    payload: NormalizedSystemMailPayload,
): Promise<SendBulkSystemMailResult> {
    let recipientCount = 0;
    for (const batch of chunkValues(recipientIds, MAILBOX_BULK_INSERT_BATCH_SIZE)) {
        const result = await transaction.mailboxMessage.createMany({
            data: batch.map(recipientId => toBulkCreateInput(recipientId, payload)),
        });
        if (result.count !== batch.length) {
            throw new Error('대량 우편 일부를 생성하지 못했습니다.');
        }
        recipientCount += result.count;
    }
    return Object.freeze({ recipientCount });
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

/** 아이템과 진행 보상을 하나의 검증된 우편 payload로 직렬화한다. */
export function encodeMailboxRewards(
    items: readonly ItemSnapshot[],
    rewards: MailboxRewardInput = {},
): StoredMailboxPayload | null {
    const normalizedItems = normalizeAttachmentSnapshots(items);
    const gold = rewards.gold ?? 0;
    if (!Number.isSafeInteger(gold) || gold < 0 || gold > MAILBOX_MAX_GOLD_REWARD) {
        throw new Error(`우편 Gold는 0~${MAILBOX_MAX_GOLD_REWARD.toLocaleString()} 범위의 정수여야 합니다.`);
    }
    const titleIds = [...new Set(rewards.titleIds ?? [])].map(value => {
        const title = getTitle(value);
        if (!title) throw new Error(`존재하지 않는 우편 칭호 보상입니다: ${value}`);
        return title.id;
    });
    if (titleIds.length > MAILBOX_MAX_TITLE_REWARDS) {
        throw new Error(`우편 칭호 보상은 최대 ${MAILBOX_MAX_TITLE_REWARDS}개입니다.`);
    }
    const skillLevels = new Map<string, number>();
    for (const reward of rewards.skills ?? []) {
        const data = getSkillData(reward.skillDataId);
        if (!data) throw new Error(`존재하지 않는 우편 스킬 보상입니다: ${reward.skillDataId}`);
        if (!Number.isSafeInteger(reward.level) || reward.level < 1 || reward.level > data.maxLevel) {
            throw new Error(`${data.name} 보상 레벨은 1~${data.maxLevel} 범위의 정수여야 합니다.`);
        }
        skillLevels.set(data.id, Math.max(skillLevels.get(data.id) ?? 0, reward.level));
    }
    const skills = Object.freeze([...skillLevels].map(([skillDataId, level]) =>
        Object.freeze({ skillDataId, level })));
    if (skills.length > MAILBOX_MAX_SKILL_REWARDS) {
        throw new Error(`우편 스킬 보상은 최대 ${MAILBOX_MAX_SKILL_REWARDS}개입니다.`);
    }
    if (gold === 0 && titleIds.length === 0 && skills.length === 0) {
        return encodeMailboxAttachments(normalizedItems);
    }
    const bundle: StoredMailboxRewardsV2 = Object.freeze({
        version: MAILBOX_REWARD_VERSION,
        items: normalizedItems,
        gold,
        titleIds: Object.freeze(titleIds),
        skills,
    });
    if (Buffer.byteLength(JSON.stringify(bundle), 'utf8') > MAILBOX_MAX_ATTACHMENT_JSON_BYTES) {
        throw new Error(`우편 첨부 정보는 최대 ${MAILBOX_MAX_ATTACHMENT_JSON_BYTES / 1024}KiB입니다.`);
    }
    return bundle;
}

export function decodeMailboxRewards(value: unknown): MailboxRewardBundle | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    try {
        if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAILBOX_MAX_ATTACHMENT_JSON_BYTES) return undefined;
        const candidate = value as Partial<StoredMailboxPayload>;
        if (candidate.version === MAILBOX_ATTACHMENT_VERSION && Array.isArray(candidate.items)) {
            return Object.freeze({
                items: normalizeAttachmentSnapshots(candidate.items as ItemSnapshot[]),
                gold: 0,
                titleIds: Object.freeze([]),
                skills: Object.freeze([]),
            });
        }
        if (candidate.version !== MAILBOX_REWARD_VERSION
            || !Array.isArray(candidate.items)
            || !Array.isArray((candidate as Partial<StoredMailboxRewardsV2>).titleIds)
            || !Array.isArray((candidate as Partial<StoredMailboxRewardsV2>).skills)) return undefined;
        const rewards = candidate as Partial<StoredMailboxRewardsV2>;
        return Object.freeze({
            items: normalizeAttachmentSnapshots(rewards.items as ItemSnapshot[]),
            ...normalizeDecodedProgressRewards(rewards),
        });
    } catch {
        return undefined;
    }
}

function normalizeDecodedProgressRewards(
    rewards: Partial<StoredMailboxRewardsV2>,
): Omit<MailboxRewardBundle, 'items'> {
    const encoded = encodeMailboxRewards([], {
        gold: rewards.gold,
        titleIds: rewards.titleIds,
        skills: rewards.skills,
    });
    if (!encoded || encoded.version !== MAILBOX_REWARD_VERSION) {
        throw new Error('우편 진행 보상이 비어 있습니다.');
    }
    return {
        gold: encoded.gold,
        titleIds: encoded.titleIds,
        skills: encoded.skills,
    };
}

export function decodeMailboxAttachments(value: unknown): readonly ItemSnapshot[] | undefined {
    return decodeMailboxRewards(value)?.items;
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
    const rewards = row.attachmentCount > 0
        ? decodeMailboxRewards(row.attachments)
        : Object.freeze({ items: [], gold: 0, titleIds: [], skills: [] } as MailboxRewardBundle);
    return {
        ...toSummary(row, now),
        body: row.body,
        attachments: rewards ? toAttachmentDisplay(rewards.items) : [],
        gold: rewards?.gold ?? 0,
        titles: rewards?.titleIds.map(titleId => ({
            titleId,
            name: getTitle(titleId)?.name ?? titleId,
        })) ?? [],
        skills: rewards?.skills.map(reward => ({
            ...reward,
            name: getSkillData(reward.skillDataId)?.name ?? reward.skillDataId,
        })) ?? [],
        attachmentCorrupted: row.attachmentCount > 0 && rewards === undefined,
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
    const payload = normalizeSystemMailPayload(input);
    const sourceKey = input.sourceKey === undefined
        ? undefined
        : normalizeText(input.sourceKey, '우편 멱등 키', 150);
    if (sourceKey !== undefined && !MAILBOX_SOURCE_KEY_PATTERN.test(sourceKey)) {
        throw new Error('우편 멱등 키는 소문자 영문·숫자로 시작하고 소문자 영문, 숫자, :, _, ., /, -만 사용할 수 있습니다.');
    }
    const exists = await prisma.player.findUnique({
        where: { userId: input.recipientId },
        select: { userId: true },
    });
    if (!exists) throw new Error('우편을 받을 플레이어가 존재하지 않습니다.');
    const create = {
        recipientId: input.recipientId,
        senderLabel: payload.senderLabel,
        subject: payload.subject,
        body: payload.body,
        ...(payload.attachments
            ? { attachments: payload.attachments as unknown as Prisma.InputJsonValue }
            : {}),
        attachmentCount: payload.attachmentCount,
        sourceKey,
        expiresAt: payload.expiresAt,
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

/**
 * 지정 Player ID 집합에 같은 내용의 독립 우편을 원자적으로 발송한다.
 * ID는 검증·중복 제거되며 한 명이라도 존재하지 않으면 아무 우편도 생성하지 않는다.
 */
export async function sendSystemMailToRecipients(
    recipientIds: readonly number[],
    input: SendBulkSystemMailInput,
): Promise<SendBulkSystemMailResult> {
    assertBulkInputHasNoSingleRecipientFields(input);
    const payload = normalizeSystemMailPayload(input);
    const normalizedRecipientIds = normalizeBulkRecipientIds(recipientIds);
    if (normalizedRecipientIds.length === 0) {
        return Object.freeze({ recipientCount: 0 });
    }

    return prisma.$transaction(async transaction => {
        const existingRecipientIds = new Set<number>();
        for (const batch of chunkValues(
            normalizedRecipientIds,
            MAILBOX_BULK_RECIPIENT_QUERY_BATCH_SIZE,
        )) {
            const players = await transaction.player.findMany({
                where: { userId: { in: [...batch] } },
                select: { userId: true },
            });
            for (const player of players) existingRecipientIds.add(player.userId);
        }
        if (existingRecipientIds.size !== normalizedRecipientIds.length
            || normalizedRecipientIds.some(recipientId => !existingRecipientIds.has(recipientId))) {
            throw new Error('우편을 받을 플레이어가 존재하지 않습니다.');
        }
        return createBulkSystemMailInTransaction(transaction, normalizedRecipientIds, payload);
    }, {
        maxWait: 10_000,
        timeout: MAILBOX_BULK_TRANSACTION_TIMEOUT_MS,
    });
}

/** DB의 Player 행 전체(오프라인 포함)에 같은 내용의 독립 우편을 원자적으로 발송한다. */
export async function sendSystemMailToAllPlayers(
    input: SendBulkSystemMailInput,
): Promise<SendBulkSystemMailResult> {
    assertBulkInputHasNoSingleRecipientFields(input);
    const payload = normalizeSystemMailPayload(input);

    return prisma.$transaction(async transaction => {
        const players = await transaction.player.findMany({
            select: { userId: true },
            orderBy: { userId: 'asc' },
        });
        const recipientIds = normalizeBulkRecipientIds(players.map(player => player.userId));
        return createBulkSystemMailInTransaction(transaction, recipientIds, payload);
    }, {
        maxWait: 10_000,
        timeout: MAILBOX_BULK_TRANSACTION_TIMEOUT_MS,
    });
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

/** 관리자 상세/삭제용 전체 목록. 일반 플레이어의 최근 20통 조회 제한과 분리한다. */
export async function listMailboxMessagesForAdmin(recipientId: number): Promise<MailboxMessageSummary[]> {
    if (!Number.isSafeInteger(recipientId) || recipientId <= 0) return [];
    const rows = await prisma.mailboxMessage.findMany({
        where: { recipientId, archivedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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

export interface RemoveMailboxMessageResult {
    readonly removed: boolean;
    readonly subject?: string;
    readonly archived: boolean;
}

/** 관리자 회수용 경계. 멱등 sourceKey 우편은 tombstone을 보존하고 일반 우편은 실제 삭제한다. */
export function removeMailboxMessageByAdmin(
    recipientId: number,
    mailId: number,
): Promise<RemoveMailboxMessageResult> {
    return enqueueClaim(recipientId, async () => {
        if (!Number.isSafeInteger(recipientId) || recipientId <= 0
            || !Number.isSafeInteger(mailId) || mailId <= 0) {
            return { removed: false, archived: false };
        }
        const row = await prisma.mailboxMessage.findFirst({
            where: { id: mailId, recipientId, archivedAt: null },
            select: { subject: true, sourceKey: true },
        });
        if (!row) return { removed: false, archived: false };
        if (row.sourceKey) {
            const result = await prisma.mailboxMessage.updateMany({
                where: { id: mailId, recipientId, archivedAt: null },
                data: { archivedAt: new Date() },
            });
            return { removed: result.count === 1, subject: row.subject, archived: result.count === 1 };
        }
        const result = await prisma.mailboxMessage.deleteMany({ where: { id: mailId, recipientId } });
        return { removed: result.count === 1, subject: row.subject, archived: false };
    });
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
    const rewards = decodeMailboxRewards(preview.attachments);
    if (!rewards) {
        return claimFailure(mailId, 'invalid-attachments', '우편 첨부 정보가 손상되어 수령할 수 없습니다.');
    }
    if (saveBeforeClaim) await player.save();
    if (player.gold + rewards.gold > MAILBOX_MAX_PLAYER_GOLD) {
        return claimFailure(mailId, 'capacity', `Gold 보유 상한 ${MAILBOX_MAX_PLAYER_GOLD.toLocaleString()}G을 초과합니다.`);
    }
    const grantPlan = rewards.items.length > 0
        ? player.inventory.preparePersistedGrant(rewards.items)
        : null;
    if (rewards.items.length > 0 && !grantPlan) {
        return claimFailure(mailId, 'capacity', '첨부를 모두 받을 만큼 인벤토리 중량 여유가 없습니다.');
    }
    if (grantPlan && grantPlan.rows.length > maximumPersistedRows) {
        return claimFailure(mailId, 'batch-limit', '이번 전체 수령의 아이템 처리 한도에 도달했습니다.');
    }

    let committed: {
        readonly rows: readonly PersistedInventoryGrantRow[];
        readonly skills: readonly PersistedSkillRewardGrant[];
    } | null;
    try {
        committed = await prisma.$transaction(async transaction => {
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
            const rows = grantPlan
                ? await player.inventory.persistPreparedGrant(transaction, grantPlan)
                : Object.freeze([] as PersistedInventoryGrantRow[]);
            if (rewards.gold > 0) {
                await transaction.player.update({
                    where: { userId: player.userId },
                    data: { gold: { increment: rewards.gold } },
                });
            }
            await persistTitleRewardGrants(transaction, player.userId, rewards.titleIds);
            const skills = await persistSkillRewardGrants(transaction, player.userId, rewards.skills);
            return Object.freeze({ rows, skills });
        }, { timeout: 15_000 });
    } catch (error) {
        logger.error(`우편 첨부 수령 transaction 실패: user=${player.userId}, mail=${mailId}`, error);
        return claimFailure(mailId, 'database-error', '우편 수령을 확정하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
    }
    if (!committed) {
        return claimFailure(mailId, 'unavailable', '다른 접속에서 이미 수령했거나 우편이 만료되었습니다.');
    }
    let memorySynchronized = false;
    try {
        const inventorySynchronized = rewards.items.length === 0
            || player.inventory.adoptPersistedGrant(committed.rows);
        player.gold += rewards.gold;
        for (const titleId of rewards.titleIds) {
            if (!player.titles.isOwned(titleId)) player.titles.grant(titleId, 'mailbox', false);
        }
        for (const reward of committed.skills) {
            const current = player.skills.get(reward.skillDataId);
            if (current) {
                if (current.level < reward.level) player.skills.setLevel(reward.skillDataId, reward.level);
            } else {
                player.skills.grant(reward.skillDataId, 'mailbox', reward.level);
            }
        }
        await player.save();
        memorySynchronized = inventorySynchronized;
    } catch (error) {
        logger.error(`우편 첨부 DB 확정 후 메모리 동기화 예외: user=${player.userId}, mail=${mailId}`, error);
    }
    if (!memorySynchronized) {
        logger.error(`우편 첨부 DB 확정 후 메모리 동기화 실패: user=${player.userId}, mail=${mailId}`);
    }
    return {
        success: true,
        mailId,
        items: toAttachmentDisplay(rewards.items),
        gold: rewards.gold,
        titles: rewards.titleIds.map(titleId => ({ titleId, name: getTitle(titleId)?.name ?? titleId })),
        skills: committed.skills.map(reward => ({
            ...reward,
            name: getSkillData(reward.skillDataId)?.name ?? reward.skillDataId,
        })),
        memorySynchronized,
        persistedRowCount: committed.rows.length,
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
            const rewards = decodeMailboxRewards(row.attachments);
            const previewPlan = rewards && rewards.items.length > 0
                ? player.inventory.preparePersistedGrant(rewards.items)
                : undefined;
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
