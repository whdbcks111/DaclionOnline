import logger from "../utils/logger.js";
import { getIO } from "./socket.js";
import { sendMessageToChannel, sendBotMessageToUser, sendMessageToUser } from "./message.js";
import { getUserChannel } from "./channel.js";
import type { ChatMessage, CommandInfo } from "../../../shared/types.js";

interface CommandArg {
    name: string
    description: string
    required?: boolean
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
        })),
    }));
}

/** 명령어 파싱 및 실행 (chat.ts에서 호출). 명령어 사용 채팅 표시 방식 반환 */
export function handleCommand(userId: number, raw: string, msg: ChatMessage | null = null, permission = 0): void {
    // "/명령어 인자1 인자2" → ["명령어", "인자1", "인자2"]
    const parts = raw.slice(1).split(/\s+/);
    const name = parts[0].toLowerCase();
    const args = parts.slice(1);

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

    // 필수 인자 검증
    const requiredArgs = cmd.args?.filter(a => a.required) ?? [];
    if (args.length < requiredArgs.length) {
        if(msg) sendMessageToUser(userId, msg);
        const usage = cmd.args
            ?.map(a => a.required ? `<${a.name}>` : `[${a.name}]`)
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

    // 명령어 목록 요청 이벤트
    io.on('connection', (socket) => {
        socket.on('requestCommandList', () => {
            socket.emit('commandList', getCommandList());
        });
    });

    logger.success('봇 모듈 초기화 완료');
};
