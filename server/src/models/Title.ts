import type Player from './Player.js';
import type { AttributeModifier } from './Attribute.js';
import { defineProgress, ProgressType } from './Progress.js';
import { emitGameEvent, GameEventIds } from './GameEvent.js';
import type { CombatContext } from './CombatPipeline.js';
import { CombatStage } from './CombatPipeline.js';
import { normalizeTag } from '../../../shared/tags.js';
import { sendBotMessageToUser, sendNotificationToUser } from '../modules/message.js';
import { chat } from '../utils/chatBuilder.js';
import logger from '../utils/logger.js';

const EQUIPPED_TITLE_PROGRESS_ID = 'title:equipped';
const TITLE_MODIFIER_SOURCE = 'title:equipped';
const TITLE_EXPERIENCE_SOURCE = 'title:equipped';

defineProgress({
    id: EQUIPPED_TITLE_PROGRESS_ID,
    type: ProgressType.STATE,
    label: '장착 칭호',
    description: '현재 장착한 칭호의 마스터 데이터 ID입니다.',
    visible: false,
});

export interface TitleData {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly acquisitionDescription: string;
    readonly aliases?: readonly string[];
    readonly canAcquire: (player: Player) => boolean;
    /** 현재 대상·장비 등 조건을 만족할 때만 지속 패시브를 활성화한다. */
    readonly isPassiveActive?: (player: Player) => boolean;
    readonly modifiers?: (player: Player) => readonly Omit<AttributeModifier, 'source'>[];
    readonly experienceGainMultiplier?: (player: Player) => number;
    readonly onCombatPrepare?: (player: Player, context: CombatContext) => void;
    readonly onCombatAfterDamage?: (player: Player, context: CombatContext) => void;
}

export interface TitleSnapshot {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly acquisitionDescription: string;
    readonly equipped: boolean;
    readonly passiveActive: boolean;
}

export interface TitleOperationResult {
    readonly success: boolean;
    readonly reason?: string;
    readonly title?: Readonly<TitleData>;
}

const titleRegistry = new Map<string, Readonly<TitleData>>();

function ownershipProgressId(titleId: string): string {
    const [namespace, path] = normalizeTag(titleId).split(':', 2);
    return `title-owned:${namespace}/${path}`;
}

function acquisitionBlockedProgressId(titleId: string): string {
    const [namespace, path] = normalizeTag(titleId).split(':', 2);
    return `title-blocked:${namespace}/${path}`;
}

function normalizedInput(value: string): string {
    return value.trim().toLocaleLowerCase().replace(/\s+/g, '');
}

export function defineTitle(data: TitleData): Readonly<TitleData> {
    const id = normalizeTag(data.id);
    const name = data.name.trim();
    if (!name) throw new Error(`Title name must not be empty: ${id}`);
    if (!data.description.trim() || !data.acquisitionDescription.trim()) {
        throw new Error(`Title descriptions must not be empty: ${id}`);
    }
    if ([...titleRegistry.values()].some(title => normalizedInput(title.name) === normalizedInput(name))) {
        throw new Error(`Duplicate title name: ${name}`);
    }
    const title = Object.freeze({
        ...data,
        id,
        name,
        description: data.description.trim(),
        acquisitionDescription: data.acquisitionDescription.trim(),
        aliases: Object.freeze([...(data.aliases ?? [])].map(alias => alias.trim()).filter(Boolean)),
    });
    titleRegistry.set(id, title);
    defineProgress({
        id: ownershipProgressId(id),
        type: ProgressType.FLAG,
        label: `칭호 획득: ${name}`,
        description: `${name} 칭호의 영구 획득 여부입니다.`,
        visible: false,
    });
    defineProgress({
        id: acquisitionBlockedProgressId(id),
        type: ProgressType.FLAG,
        label: `칭호 관리자 회수: ${name}`,
        description: `${name} 칭호가 자동 재획득되지 않도록 관리자가 회수했는지 나타냅니다.`,
        visible: false,
    });
    return title;
}

export function getTitle(idOrName: string): Readonly<TitleData> | undefined {
    const input = idOrName.trim();
    if (!input) return undefined;
    try {
        const byId = titleRegistry.get(normalizeTag(input));
        if (byId) return byId;
    } catch {
        // 사용자 입력은 namespace ID가 아닐 수 있으므로 표시명 조회를 계속한다.
    }
    const normalized = normalizedInput(input);
    return [...titleRegistry.values()].find(title =>
        normalizedInput(title.name) === normalized
        || title.aliases?.some(alias => normalizedInput(alias) === normalized));
}

export function getAllTitles(): readonly Readonly<TitleData>[] {
    return [...titleRegistry.values()];
}

export default class TitleBook {
    private acquisitionTimer = 0;
    private passiveTimer = 0;
    private acquisitionDirty = true;
    private evaluating = false;
    private passiveSignature = '';

    constructor(private readonly player: Player) {
        player.progress.subscribeChanges(() => { this.acquisitionDirty = true; });
        this.validateEquippedTitle();
        this.refreshPassiveEffects();
    }

    get equippedId(): string {
        return this.player.progress.getState(EQUIPPED_TITLE_PROGRESS_ID);
    }

    get equipped(): Readonly<TitleData> | undefined {
        const title = getTitle(this.equippedId);
        return title && this.isOwned(title.id) ? title : undefined;
    }

    get equippedName(): string {
        return this.equipped?.name ?? '';
    }

    isOwned(idOrName: string): boolean {
        const title = getTitle(idOrName);
        return Boolean(title && this.player.progress.getFlag(ownershipProgressId(title.id)));
    }

    getOwned(): readonly Readonly<TitleData>[] {
        return getAllTitles().filter(title => this.isOwned(title.id));
    }

    getOwnedSnapshots(): readonly TitleSnapshot[] {
        const equippedId = this.equippedId;
        return this.getOwned().map(title => ({
            id: title.id,
            name: title.name,
            description: title.description,
            acquisitionDescription: title.acquisitionDescription,
            equipped: title.id === equippedId,
            passiveActive: title.id === equippedId && this.isPassiveActive(title),
        }));
    }

    findOwnedByInput(input: string): Readonly<TitleData> | undefined {
        const index = Number(input);
        if (Number.isInteger(index) && index > 0) return this.getOwned()[index - 1];
        const title = getTitle(input);
        return title && this.isOwned(title.id) ? title : undefined;
    }

    grant(idOrName: string, source = 'achievement', notify = true): TitleOperationResult {
        const title = getTitle(idOrName);
        if (!title) return { success: false, reason: '등록되지 않은 칭호입니다.' };
        if (this.isOwned(title.id)) return { success: false, reason: '이미 획득한 칭호입니다.', title };
        this.player.progress.setFlag(acquisitionBlockedProgressId(title.id), false);
        this.player.progress.setFlag(ownershipProgressId(title.id));
        if (notify) {
            const message = `칭호 [ ${title.name} ] 를 획득했습니다!`;
            sendBotMessageToUser(this.player.userId, chat()
                .color('gold', builder => builder.weight('bold', nested => nested.text(message)))
                .text(`\n${title.description}`)
                .build());
            sendNotificationToUser(this.player.userId, {
                key: `title-acquired:${title.id}`,
                message,
                length: 4000,
            });
        }
        emitGameEvent(GameEventIds.TITLE_ACQUIRED, {
            actor: this.player,
            data: { titleId: title.id, source },
        });
        return { success: true, title };
    }

    /** 관리자가 회수한 칭호는 다시 부여하기 전까지 달성 조건으로 자동 재획득되지 않는다. */
    revoke(idOrName: string, source = 'admin', notify = true): TitleOperationResult {
        const title = getTitle(idOrName);
        if (!title) return { success: false, reason: '등록되지 않은 칭호입니다.' };
        if (!this.isOwned(title.id)) return { success: false, reason: '보유하지 않은 칭호입니다.', title };
        const equipped = this.equippedId === title.id;
        this.player.progress.setFlag(ownershipProgressId(title.id), false);
        this.player.progress.setFlag(acquisitionBlockedProgressId(title.id));
        if (equipped) {
            this.player.progress.setState(EQUIPPED_TITLE_PROGRESS_ID, '');
            this.refreshPassiveEffects(true);
        }
        if (notify) {
            const message = `칭호 [ ${title.name} ] 이(가) 회수되었습니다.`;
            sendBotMessageToUser(this.player.userId, message);
            sendNotificationToUser(this.player.userId, {
                key: `title-revoked:${title.id}`,
                message,
                length: 4000,
            });
        }
        emitGameEvent(GameEventIds.TITLE_REVOKED, {
            actor: this.player,
            data: { titleId: title.id, source },
        });
        return { success: true, title };
    }

    equip(idOrName: string): TitleOperationResult {
        const title = this.findOwnedByInput(idOrName);
        if (!title) return { success: false, reason: '보유한 칭호를 찾을 수 없습니다.' };
        if (this.equippedId === title.id) return { success: false, reason: '이미 장착 중인 칭호입니다.', title };
        this.player.progress.setState(EQUIPPED_TITLE_PROGRESS_ID, title.id);
        this.refreshPassiveEffects(true);
        emitGameEvent(GameEventIds.TITLE_EQUIPPED, {
            actor: this.player,
            data: { titleId: title.id },
        });
        return { success: true, title };
    }

    unequip(): TitleOperationResult {
        const title = this.equipped;
        if (!title) return { success: false, reason: '장착 중인 칭호가 없습니다.' };
        this.player.progress.setState(EQUIPPED_TITLE_PROGRESS_ID, '');
        this.refreshPassiveEffects(true);
        emitGameEvent(GameEventIds.TITLE_EQUIPPED, {
            actor: this.player,
            data: { titleId: '' },
        });
        return { success: true, title };
    }

    update(dt: number): void {
        const elapsed = Number.isFinite(dt) && dt > 0 ? dt : 0;
        this.acquisitionTimer -= elapsed;
        this.passiveTimer -= elapsed;
        if (this.acquisitionDirty || this.acquisitionTimer <= 0) {
            this.acquisitionTimer = 1;
            this.refreshAcquisitions();
        }
        if (this.passiveTimer <= 0) {
            this.passiveTimer = 0.2;
            this.refreshPassiveEffects();
        }
    }

    refreshAcquisitions(notify = true): readonly Readonly<TitleData>[] {
        if (this.evaluating) return [];
        this.evaluating = true;
        this.acquisitionDirty = false;
        const acquired: Readonly<TitleData>[] = [];
        try {
            for (const title of getAllTitles()) {
                if (this.isOwned(title.id)
                    || this.player.progress.getFlag(acquisitionBlockedProgressId(title.id))) continue;
                let accepted = false;
                try {
                    accepted = title.canAcquire(this.player);
                } catch (error) {
                    logger.error(`칭호 획득 조건 확인 실패: ${title.id}`, error);
                }
                if (!accepted) continue;
                const result = this.grant(title.id, 'automatic', notify);
                if (result.success && result.title) acquired.push(result.title);
            }
        } finally {
            this.evaluating = false;
        }
        return acquired;
    }

    /** 장착·대상·장비 변경 직후에도 조건부 modifier를 즉시 맞추는 공개 API. */
    refreshPassiveEffects(force = false): void {
        if (force) {
            // 칭호 교체 시 이전 칭호의 능력치가 새 칭호 계산식에 섞이지 않게 먼저 정리한다.
            this.player.attribute.removeBySource(TITLE_MODIFIER_SOURCE);
            this.player.removeExperienceGainModifier(TITLE_EXPERIENCE_SOURCE);
            this.passiveSignature = '';
        }
        const title = this.equipped;
        const active = Boolean(title && this.isPassiveActive(title));
        const modifiers = title && active
            ? [...(title.modifiers?.(this.player) ?? [])]
            : [];
        const experienceMultiplier = title && active
            ? Math.max(0, title.experienceGainMultiplier?.(this.player) ?? 1)
            : 1;
        const signature = JSON.stringify({
            id: title?.id ?? '',
            active,
            modifiers,
            experienceMultiplier,
        });
        if (!force && signature === this.passiveSignature) return;

        this.player.attribute.removeBySource(TITLE_MODIFIER_SOURCE);
        this.player.removeExperienceGainModifier(TITLE_EXPERIENCE_SOURCE);
        if (modifiers.length > 0) {
            this.player.attribute.addModifiers(modifiers.map(modifier => ({
                ...modifier,
                source: TITLE_MODIFIER_SOURCE,
            })));
        }
        if (experienceMultiplier !== 1) {
            this.player.setExperienceGainModifier(TITLE_EXPERIENCE_SOURCE, experienceMultiplier);
        }
        this.passiveSignature = signature;
        this.player.clampVitals();
    }

    applyCombat(stage: CombatStage, context: CombatContext): void {
        const title = this.equipped;
        if (!title || !this.isPassiveActive(title)) return;
        if (stage === CombatStage.PREPARE) {
            this.refreshPassiveEffects();
            title.onCombatPrepare?.(this.player, context);
        } else if (stage === CombatStage.AFTER_DAMAGE) {
            title.onCombatAfterDamage?.(this.player, context);
        }
    }

    private isPassiveActive(title: Readonly<TitleData>): boolean {
        try {
            return title.isPassiveActive?.(this.player) ?? true;
        } catch (error) {
            logger.error(`칭호 패시브 조건 확인 실패: ${title.id}`, error);
            return false;
        }
    }

    private validateEquippedTitle(): void {
        const id = this.equippedId;
        if (id && (!getTitle(id) || !this.isOwned(id))) {
            this.player.progress.setState(EQUIPPED_TITLE_PROGRESS_ID, '');
        }
    }
}
