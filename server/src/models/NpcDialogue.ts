import type { ChatNode } from '../../../shared/types.js';
import { sendBotMessageToUser } from '../modules/message.js';
import { getOnlinePlayer } from '../modules/playerRegistry.js';
import { chat } from '../utils/chatBuilder.js';
import { parseChatMessage } from '../utils/chatParser.js';
import logger from '../utils/logger.js';
import { emitGameEvent, GameEventIds } from './GameEvent.js';
import { getLocation } from './Location.js';
import NPC from './NPC.js';
import type { DialogueAction, DialogueChoice, DialogueContent, DialogueContext } from './NPC.js';
import type Player from './Player.js';
import { GameTags } from '../../../shared/tags.js';
import { KarmaAccessPolicy } from './Karma.js';

export type DialogueEndReasonKey = 'completed' | 'user' | 'moved' | 'defeated' | 'unloaded' | 'replaced' | 'error';

/** 종료 사유 문자열 경계와 사용자 메시지를 소유하는 클래스형 enum. */
export class DialogueEndReason {
    private static readonly all: DialogueEndReason[] = [];

    static readonly COMPLETED = new DialogueEndReason('completed', '대화가 끝났습니다.');
    static readonly USER = new DialogueEndReason('user', '대화를 종료했습니다.');
    static readonly MOVED = new DialogueEndReason('moved', '장소를 이탈하여 대화가 종료되었습니다.');
    static readonly DEFEATED = new DialogueEndReason('defeated', '사망하여 대화가 종료되었습니다.');
    static readonly UNLOADED = new DialogueEndReason('unloaded', '');
    static readonly REPLACED = new DialogueEndReason('replaced', '');
    static readonly ERROR = new DialogueEndReason('error', '대화 처리 중 오류가 발생하여 대화가 종료되었습니다.');

    private constructor(readonly key: DialogueEndReasonKey, readonly message: string) {
        DialogueEndReason.all.push(this);
    }

    static values(): readonly DialogueEndReason[] { return DialogueEndReason.all; }
    static fromKey(key: string): DialogueEndReason | undefined {
        return DialogueEndReason.all.find(reason => reason.key === key);
    }
}

export interface DialogueOperationResult {
    readonly success: boolean;
    readonly reason?: string;
}

export interface ActiveNpcDialogueSnapshot {
    readonly sessionId: string;
    readonly playerUserId: number;
    readonly npcId: string;
    readonly locationId: string;
    readonly scenarioKey: string;
    readonly choices: readonly DialogueChoice[];
}

interface ActiveNpcDialogue {
    readonly sessionId: string;
    readonly player: Player;
    readonly npc: NPC;
    readonly locationId: string;
    scenarioKey: string;
    choices: readonly DialogueChoice[];
}

const activeDialogues = new Map<number, ActiveNpcDialogue>();
const ACTION_PAUSE = Symbol('dialogue-pause');
const ACTION_END = Symbol('dialogue-end');
let sessionSequence = 0;

export function startNpcDialogue(player: Player, npc: NPC): DialogueOperationResult {
    if (player.isDead) return { success: false, reason: '사망 상태에서는 대화할 수 없습니다.' };
    if (player.moving) return { success: false, reason: '이동 중에는 대화할 수 없습니다.' };
    const location = getLocation(player.locationId);
    if (!location?.hasNpc(npc)) return { success: false, reason: '현재 장소에 없는 NPC입니다.' };
    if (npc.hasTag(GameTags.FACILITY_SANCTUARY)) {
        const deniedReason = player.getKarmaAccessDeniedReason(KarmaAccessPolicy.SANCTUARY);
        if (deniedReason) return { success: false, reason: deniedReason };
    }

    endNpcDialogue(player, DialogueEndReason.REPLACED, false);
    const context: DialogueContext = { player, npc };
    let entry;
    try {
        entry = npc.getEntryScenario(context);
    } catch (error) {
        logger.error(`NPC 대화 진입점 실패: ${npc.id}`, error);
        return { success: false, reason: '대화를 시작할 수 없습니다.' };
    }
    if (!entry) return { success: false, reason: 'NPC의 대화 진입점을 찾을 수 없습니다.' };

    const session: ActiveNpcDialogue = {
        sessionId: `npc_${Date.now().toString(36)}_${(++sessionSequence).toString(36)}`,
        player,
        npc,
        locationId: player.locationId,
        scenarioKey: entry.key,
        choices: [],
    };
    activeDialogues.set(player.userId, session);
    emitGameEvent(GameEventIds.NPC_DIALOGUE_STARTED, {
        actor: player,
        data: { npcId: npc.id, scenarioKey: entry.key },
    });
    runScenario(session, entry.key);
    return { success: true };
}

export function chooseNpcDialogue(
    player: Player,
    sessionId: string,
    choiceNumber: number,
): DialogueOperationResult {
    const session = activeDialogues.get(player.userId);
    if (!session || session.sessionId !== sessionId) {
        return { success: false, reason: '이미 종료되었거나 오래된 대화 선택지입니다.' };
    }
    const exitReason = getInvalidSessionReason(session);
    if (exitReason) {
        endNpcDialogue(player, exitReason);
        return { success: false, reason: exitReason.message };
    }
    const choice = session.choices[choiceNumber - 1];
    if (!Number.isInteger(choiceNumber) || !choice) {
        return { success: false, reason: '유효한 대화 선택지 번호를 입력해주세요.' };
    }
    session.choices = [];
    emitGameEvent(GameEventIds.NPC_DIALOGUE_CHOICE, {
        actor: player,
        data: { npcId: session.npc.id, choice: choiceNumber, target: choice.target },
    });
    runScenario(session, choice.target);
    return { success: true };
}

export function endNpcDialogue(
    player: Player,
    reason = DialogueEndReason.USER,
    notify = true,
): boolean {
    const session = activeDialogues.get(player.userId);
    if (!session) return false;
    activeDialogues.delete(player.userId);
    emitGameEvent(GameEventIds.NPC_DIALOGUE_ENDED, {
        actor: player,
        data: { npcId: session.npc.id, reason: reason.key },
    });
    if (notify && reason.message) sendBotMessageToUser(player.userId, reason.message);
    return true;
}

export function endNpcDialogueByUserId(
    userId: number,
    reason = DialogueEndReason.UNLOADED,
    notify = false,
): boolean {
    const session = activeDialogues.get(userId);
    return session ? endNpcDialogue(session.player, reason, notify) : false;
}

export function isNpcDialogueActive(player: Player): boolean {
    return activeDialogues.has(player.userId);
}

export function getActiveNpcDialogue(player: Player): ActiveNpcDialogueSnapshot | undefined {
    const session = activeDialogues.get(player.userId);
    if (!session) return undefined;
    return {
        sessionId: session.sessionId,
        playerUserId: player.userId,
        npcId: session.npc.id,
        locationId: session.locationId,
        scenarioKey: session.scenarioKey,
        choices: session.choices.map(choice => ({ ...choice })),
    };
}

/** 게임 루프 안전망: 직접 위치 변경·사망·레지스트리 이탈도 세션을 남기지 않는다. */
export function updateNpcDialogues(): void {
    for (const session of [...activeDialogues.values()]) {
        const reason = getInvalidSessionReason(session);
        if (reason) endNpcDialogue(session.player, reason, reason !== DialogueEndReason.UNLOADED);
    }
}

function runScenario(session: ActiveNpcDialogue, initialScenarioKey: string): void {
    let scenarioKey = initialScenarioKey;
    let stepCount = 0;

    try {
        while (stepCount++ < 100) {
            const invalidReason = getInvalidSessionReason(session);
            if (invalidReason) {
                endNpcDialogue(session.player, invalidReason, invalidReason !== DialogueEndReason.UNLOADED);
                return;
            }
            const scenario = session.npc.getScenario(scenarioKey);
            if (!scenario) throw new Error(`대화 시나리오를 찾을 수 없습니다: ${session.npc.id}/${scenarioKey}`);
            session.scenarioKey = scenario.key;
            session.choices = [];
            const context: DialogueContext = { player: session.player, npc: session.npc };
            let nextScenario: string | undefined;

            for (const action of scenario.run(context)) {
                if (activeDialogues.get(session.player.userId) !== session) return;
                const outcome = executeAction(session, context, action);
                if (outcome === ACTION_PAUSE || outcome === ACTION_END) return;
                if (typeof outcome === 'string') {
                    nextScenario = outcome;
                    break;
                }
                if (stepCount++ >= 100) break;
            }

            if (!nextScenario) {
                endNpcDialogue(session.player, DialogueEndReason.COMPLETED);
                return;
            }
            scenarioKey = nextScenario;
        }
        throw new Error(`대화 액션 한도 초과: ${session.npc.id}`);
    } catch (error) {
        logger.error(`NPC 대화 실행 실패: ${session.npc.id}/${session.scenarioKey}`, error);
        endNpcDialogue(session.player, DialogueEndReason.ERROR);
    }
}

function executeAction(
    session: ActiveNpcDialogue,
    context: DialogueContext,
    action: DialogueAction,
): string | typeof ACTION_PAUSE | typeof ACTION_END | undefined {
    switch (action.type) {
        case 'say':
            sendNpcLine(session, action.content);
            return undefined;
        case 'event':
            action.run(context);
            return undefined;
        case 'setFlag':
            session.player.progress.setFlag(action.id, action.value);
            return undefined;
        case 'goto':
            return action.target;
        case 'choice':
            session.choices = action.choices.map(choice => ({ ...choice }));
            sendChoices(session);
            return ACTION_PAUSE;
        case 'acceptQuest': {
            const result = session.player.quests.accept(action.questId, session.npc.id);
            if (!result.success && result.reason) sendBotMessageToUser(session.player.userId, result.reason);
            return undefined;
        }
        case 'turnInQuest': {
            const result = session.player.quests.turnIn(action.questId, session.npc.id);
            if (!result.success && result.reason) sendBotMessageToUser(session.player.userId, result.reason);
            return undefined;
        }
        case 'end':
            endNpcDialogue(session.player, DialogueEndReason.COMPLETED);
            return ACTION_END;
    }
}

function sendNpcLine(session: ActiveNpcDialogue, content: DialogueContent): void {
    const body: ChatNode[] = typeof content === 'string'
        ? parseChatMessage(content)
        : content.map(node => ({ ...node }));
    const nodes: ChatNode[] = [
        { type: 'color', color: 'gold', children: [{ type: 'weight', weight: 'bold', children: [{ type: 'text', text: `[${session.npc.name}]` }] }] },
        { type: 'text', text: '\n' },
        ...body,
    ];
    sendBotMessageToUser(session.player.userId, nodes);
}

function sendChoices(session: ActiveNpcDialogue): void {
    const builder = chat().color('gray', b => b.text('[ 선택지 ]\n'));
    session.choices.forEach((choice, index) => {
        builder
            .text(`${index + 1}. `)
            .closeButton(`/대화선택 ${session.sessionId} ${index + 1}`, b => b.text(choice.label))
            .text('\n');
    });
    builder.text('\n').button('/대화종료', b => b.color('gray', inner => inner.text('[대화 종료]')));
    sendBotMessageToUser(session.player.userId, builder.build());
}

function getInvalidSessionReason(session: ActiveNpcDialogue): DialogueEndReason | undefined {
    if (getOnlinePlayer(session.player.userId) !== session.player) return DialogueEndReason.UNLOADED;
    if (session.player.isDead) return DialogueEndReason.DEFEATED;
    if (session.player.locationId !== session.locationId || session.player.moving) return DialogueEndReason.MOVED;
    if (!getLocation(session.locationId)?.hasNpc(session.npc)) return DialogueEndReason.MOVED;
    return undefined;
}
