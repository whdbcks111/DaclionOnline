import logger from "../utils/logger.js";
import { getIO } from "./socket.js";
import { sendMessageToChannel, sendBotMessageToUser, sendMessageToUser } from "./message.js";
import { getUserChannel } from "./channel.js";
import { getSession } from "./login.js";
import type { ChatMessage, CommandInfo, CompletionItem } from "../../../shared/types.js";

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
    showCommandUse?: CommandUseVisibility  // 명령어 사용 채팅 표시 방식 (기본: 'show')
    args?: CommandArg[]
    handler: (userId: number, args: string[], raw: string, msg: ChatMessage | null, permission: number) => void
}

const commands = new Map<string, CommandConfig>();
const aliasMap = new Map<string, string>(); // alias → name

/** 명령어 등록 (전역) */
export function registerCommand(config: CommandConfig): void {
    commands.set(config.name, config);
    for (const alias of config.aliases ?? []) {
        aliasMap.set(alias, config.name);
    }
}

/** 등록된 명령어 목록 반환 (권한 필터링, /도움말용) */
export function getCommandListFiltered(permission: number) {
    return Array.from(commands.values())
        .filter(cmd => (cmd.permission ?? 0) <= permission)
        .map(cmd => ({
            name: cmd.name,
            args: cmd.args,
            description: cmd.description,
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
    const rawSliced = raw.slice(1);
    const wsIdx = rawSliced.search(/\s/);
    const name = (wsIdx === -1 ? rawSliced : rawSliced.slice(0, wsIdx)).toLowerCase();
    const remainder = wsIdx === -1 ? '' : rawSliced.slice(wsIdx + 1);

    const cmd = commands.get(name) ?? commands.get(aliasMap.get(name) ?? '');
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
        if(cmd.showCommandUse === 'show' || !cmd.showCommandUse) sendMessageToChannel(msg, getUserChannel(userId));
        else if(cmd.showCommandUse == 'private') sendMessageToUser(userId, msg);
    }

    cmd.handler(userId, args, raw, msg, permission);
}

/** 봇 모듈 초기화 */
export const initBot = () => {
    const io = getIO();

    io.on('connection', (socket) => {
        // 명령어 목록 요청
        socket.on('requestCommandList', () => {
            socket.emit('commandList', getCommandList());
        });

        // 파라미터 자동완성 요청 (입력 중 실시간 호출)
        socket.on('requestCompletions', (raw: string) => {
            const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
            if (!session || !raw.startsWith('/')) return;

            const rawSliced = raw.slice(1);
            const wsIdx = rawSliced.search(/\s/);
            if (wsIdx === -1) return;

            const cmdName = rawSliced.slice(0, wsIdx).toLowerCase();
            const remainder = rawSliced.slice(wsIdx + 1);
            const cmd = commands.get(cmdName) ?? commands.get(aliasMap.get(cmdName) ?? '');
            if (!cmd?.args?.length) return;

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
