import logger from "../utils/logger.js";
import { getIO } from "./socket.js";
import { sendMessageToChannel, sendBotMessageToUser, sendMessageToUser, sendNotificationToUser } from "./message.js";
import { getUserChannel } from "./channel.js";
import { getSession } from "./login.js";
import type { ChatMessage, CommandInfo, CompletionItem } from "../../../shared/types.js";
import { parseCommandInput } from "../../../shared/commandInput.js";
import {
    isInformationPublicMode,
    runInformationCommand,
    setInformationPublicMode,
} from './informationVisibility.js';

interface CommandArg {
    name: string
    description: string
    required?: boolean
    /** 띄어쓰기를 포함하는 긴 텍스트 파라미터 (명령어당 최대 1개) */
    isText?: boolean
    /** 자동완성 후보 목록. 함수 형태는 requestCompletions 이벤트 시 호출됨 */
    completions?: CompletionItem[] | ((userId: number, args: string[], raw: string) => CompletionItem[])
}

type CommandUseVisibility = 'hide' | 'show' | 'private';

interface CommandConfig {
    name: string
    aliases?: string[]
    description: string
    permission?: number        // 최소 권한 레벨 (미지정 시 0, 누구나 사용 가능)
    showCommandUse?: CommandUseVisibility  // 명령어 사용 채팅 표시 방식 (기본: 'private')
    /** 정보 열람 명령. 공개 모드이면 입력과 sendBotMessageToUser 결과를 현재 채널에 공개한다. */
    information?: boolean
    args?: CommandArg[]
    handler: (userId: number, args: string[], raw: string, msg: ChatMessage | null, permission: number) => void | Promise<void>
}

export interface CommandExecutionEvent {
    readonly userId: number
    readonly commandName: string
    readonly args: readonly string[]
    readonly raw: string
}

const commands = new Map<string, CommandConfig>();
const aliasMap = new Map<string, string>(); // alias → name
const commandExecutionHandlers = new Set<(event: CommandExecutionEvent) => void>();

/** 버튼·별칭·정식 명령을 canonical 명령 이름 하나로 관찰한다. */
export function subscribeCommandExecutions(handler: (event: CommandExecutionEvent) => void): () => void {
    commandExecutionHandlers.add(handler);
    return () => { commandExecutionHandlers.delete(handler); };
}

/** UI와 명령어가 공유하는 정보 공개 모드 변경 API. 같은 계정의 모든 소켓에 즉시 반영한다. */
export function setInformationModeForUser(userId: number, isPublic: boolean): void {
    setInformationPublicMode(userId, isPublic);
    const io = getIO();
    for (const [, userSocket] of io.sockets.sockets) {
        const userSession = userSocket.data.sessionToken ? getSession(userSocket.data.sessionToken) : undefined;
        if (userSession?.userId === userId) userSocket.emit('informationMode', isPublic);
    }
    sendNotificationToUser(userId, {
        key: 'information-mode',
        message: `정보 열람이 ${isPublic ? '공개' : '비공개'}모드로 전환되었습니다.`,
        length: 2500,
    });
}

function resolveCommand(name: string, hasSlash: boolean): CommandConfig | undefined {
    if (hasSlash) return commands.get(name) ?? commands.get(aliasMap.get(name) ?? '');
    return commands.get(aliasMap.get(name) ?? '');
}

/** 슬래시 없는 입력의 첫 단어가 등록된 명령 별칭인지 확인한다. */
export function isCommandAliasInput(raw: string): boolean {
    const input = parseCommandInput(raw);
    return input !== undefined && !input.hasSlash && aliasMap.has(input.token);
}

/** 명령어 등록 (전역) */
export function registerCommand(config: CommandConfig): void {
    commands.set(config.name.toLowerCase(), config);
    for (const alias of config.aliases ?? []) {
        aliasMap.set(alias.toLowerCase(), config.name.toLowerCase());
    }
}

/** 등록된 명령어 목록 반환 (권한 필터링, /도움말용) */
export function getCommandListFiltered(permission: number) {
    return Array.from(commands.values())
        .filter(cmd => (cmd.permission ?? 0) <= permission)
        .map(cmd => ({
            name: cmd.name,
            aliases: [...(cmd.aliases ?? [])],
            args: cmd.args,
            description: cmd.description,
            permission: cmd.permission ?? 0,
        }));
}

/** 등록된 명령어 목록 반환 (자동완성용) */
export function getCommandList(): CommandInfo[] {
    return Array.from(commands.values()).map(cmd => ({
        name: cmd.name,
        aliases: cmd.aliases,
        description: cmd.description,
        args: cmd.args?.map(a => ({
            name: a.name,
            description: a.description,
            required: a.required,
            isText: a.isText,
            completions: typeof a.completions === 'function' ? undefined : a.completions,
            dynamicCompletions: typeof a.completions === 'function',
        })),
    }));
}

/**
 * isText 파라미터를 고려한 인자 파싱.
 * isText 파라미터는 앞/뒤 인자를 제외한 나머지 전체를 하나의 문자열로 합친다.
 * 예) argDefs=[A, B:text, C], remainder="1 hello world 2"
 *     → ['1', 'hello world', '2']
 */
function parseArgs(remainder: string, argDefs?: CommandArg[]): string[] {
    const textIdx = argDefs?.findIndex(a => a.isText) ?? -1;

    if (textIdx === -1 || !argDefs) {
        return remainder ? remainder.trim().split(/\s+/).filter(Boolean) : [];
    }

    const trimmed = remainder.trim();
    if (!trimmed) return [];

    const argsAfter = argDefs.length - 1 - textIdx;

    // 앞 인자들을 앞에서부터 토큰 단위로 추출
    const before: string[] = [];
    let pos = 0;
    for (let i = 0; i < textIdx; i++) {
        while (pos < trimmed.length && /\s/.test(trimmed[pos])) pos++;
        if (pos >= trimmed.length) break;
        const start = pos;
        while (pos < trimmed.length && !/\s/.test(trimmed[pos])) pos++;
        before.push(trimmed.slice(start, pos));
    }
    while (pos < trimmed.length && /\s/.test(trimmed[pos])) pos++;

    // 뒤 인자들을 끝에서부터 토큰 단위로 추출
    const after: string[] = [];
    let endPos = trimmed.length;
    for (let i = 0; i < argsAfter; i++) {
        while (endPos > pos && /\s/.test(trimmed[endPos - 1])) endPos--;
        if (endPos <= pos) break;
        const end = endPos;
        while (endPos > pos && !/\s/.test(trimmed[endPos - 1])) endPos--;
        after.unshift(trimmed.slice(endPos, end));
        while (endPos > pos && /\s/.test(trimmed[endPos - 1])) endPos--;
    }

    // 남은 부분이 텍스트 인자
    const textValue = trimmed.slice(pos, endPos).trim();

    return [...before, textValue, ...after];
}

/** 명령어 파싱 및 실행 (chat.ts에서 호출) */
export function handleCommand(userId: number, raw: string, msg: ChatMessage | null = null, permission = 0): void {
    const input = parseCommandInput(raw);
    if (!input) {
        if (msg) sendMessageToUser(userId, msg);
        sendBotMessageToUser(userId, '알 수 없는 명령어: /');
        return;
    }
    const { token: name, remainder, hasSlash } = input;

    const cmd = resolveCommand(name, hasSlash);
    if (!cmd) {
        if(msg) sendMessageToUser(userId, msg);
        sendBotMessageToUser(userId, `알 수 없는 명령어: /${name}`);
        return;
    }

    // 권한 검증
    if ((cmd.permission ?? 0) > permission) {
        if(msg) sendMessageToUser(userId, msg);
        sendBotMessageToUser(userId, '권한이 부족합니다.');
        return;
    }

    const args = parseArgs(remainder, cmd.args);
    const hasVisibilityArgument = cmd.args?.[0]?.name === '공개/비공개';
    const informationPublic = hasVisibilityArgument && args[0] === '공개'
        ? true
        : hasVisibilityArgument && args[0] === '비공개'
            ? false
            : isInformationPublicMode(userId);

    // 필수 인자 검증
    const requiredArgs = cmd.args?.filter(a => a.required) ?? [];
    if (args.length < requiredArgs.length) {
        if(msg) sendMessageToUser(userId, msg);
        const usage = cmd.args
            ?.map(a => {
                const label = a.isText ? `${a.name}:텍스트` : a.name;
                return a.required ? `<${label}>` : `[${label}]`;
            })
            .join(' ') ?? '';
        sendBotMessageToUser(userId, `사용법: /${cmd.name} ${usage}`);
        return;
    }

    if(msg !== null) {
        if (cmd.information) {
            if (informationPublic) sendMessageToChannel(msg, getUserChannel(userId));
            else sendMessageToUser(userId, msg);
        } else {
            const visibility = cmd.showCommandUse ?? 'private';
            if (visibility === 'show') sendMessageToChannel(msg, getUserChannel(userId));
            else if (visibility === 'private') sendMessageToUser(userId, msg);
        }
    }

    if (cmd.information) runInformationCommand(userId, () => cmd.handler(userId, args, raw, msg, permission), informationPublic);
    else cmd.handler(userId, args, raw, msg, permission);

    const event: CommandExecutionEvent = Object.freeze({
        userId,
        commandName: cmd.name,
        args: Object.freeze([...args]),
        raw,
    });
    for (const handler of [...commandExecutionHandlers]) {
        try {
            handler(event);
        } catch (error) {
            logger.error(`명령 실행 구독자 오류: ${cmd.name}`, error);
        }
    }
}

/** 봇 모듈 초기화 */
export const initBot = () => {
    const io = getIO();

    io.on('connection', (socket) => {
        const emitInformationMode = () => {
            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            if (session) socket.emit('informationMode', isInformationPublicMode(session.userId));
        };
        socket.on('requestInformationMode', emitInformationMode);
        socket.on('setInformationMode', (isPublic: unknown) => {
            if (typeof isPublic !== 'boolean') return;
            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            if (!session) { socket.emit('sessionInvalid'); return; }
            setInformationModeForUser(session.userId, isPublic);
        });
        // 명령어 목록 요청
        socket.on('requestCommandList', () => {
            socket.emit('commandList', getCommandList());
        });

        // 파라미터 자동완성 요청 (입력 중 실시간 호출)
        socket.on('requestCompletions', (raw: string) => {
            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            if (typeof raw !== 'string') return;
            const input = parseCommandInput(raw);
            if (!session || !input?.hasSeparator) return;

            const cmd = resolveCommand(input.token, input.hasSlash);
            if (!cmd?.args?.length) return;
            const remainder = input.remainder;

            // 현재 입력 위치의 argIndex 계산 (클라이언트와 동일한 로직)
            const argParts = remainder.split(' ');
            const textIdx = cmd.args.findIndex(a => a.isText);
            let argIndex = argParts.length - 1;
            if (textIdx !== -1 && argIndex > textIdx) {
                const argsAfter = cmd.args.length - 1 - textIdx;
                const afterStart = argParts.length - argsAfter;
                argIndex = afterStart > textIdx ? textIdx + (argIndex - afterStart + 1) : textIdx;
            }
            argIndex = Math.min(argIndex, cmd.args.length - 1);

            const currentArg = cmd.args[argIndex];
            if (!currentArg?.completions) return;

            const currentTyped = argParts[argParts.length - 1] ?? '';
            const parsedArgs = parseArgs(remainder, cmd.args);

            const allCompletions = typeof currentArg.completions === 'function'
                ? currentArg.completions(session.userId, parsedArgs, raw)
                : currentArg.completions;

            const filtered = allCompletions.filter(c => {
                const val = typeof c === 'string' ? c : c.value;
                return !currentTyped || val.toLowerCase().startsWith(currentTyped.toLowerCase());
            });

            socket.emit('argCompletions', filtered);
        });
    });

    logger.success('봇 모듈 초기화 완료');
};
