import logger from "../utils/logger.js";
import { getIO } from "./socket.js";
import { broadcastMessage, sendBotMessage, sendBotMessageToUser, sendMessageToUser } from "./message.js";
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
        sendBotMessageToUser(userId, `알 수 없는 명령어: /${name}`);
        return;
    }

    // 권한 검증
    if ((cmd.permission ?? 0) > permission) {
        sendBotMessageToUser(userId, '권한이 부족합니다.');
        return;
    }

    // 필수 인자 검증
    const requiredArgs = cmd.args?.filter(a => a.required) ?? [];
    if (args.length < requiredArgs.length) {
        const usage = cmd.args
            ?.map(a => a.required ? `<${a.name}>` : `[${a.name}]`)
            .join(' ') ?? '';
        sendBotMessageToUser(userId, `사용법: /${cmd.name} ${usage}`);
        return;
    }

    if(msg !== null) {
        if(cmd.showCommandUse === 'show' || !cmd.showCommandUse) broadcastMessage(msg);
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

    // 기본 명령어: /help
    registerCommand({
        name: '도움말',
        aliases: ['help'],
        description: '명령어 목록을 표시합니다',
        handler (userId, args, raw, msg, permission) {
            const list = Array.from(commands.values())
                .filter(cmd => (cmd.permission ?? 0) <= permission);
            const lines = list.map(cmd => {
                const usage = cmd.args
                    ?.map(a => a.required ? `<${a.name}>` : `[${a.name}]`)
                    .join(' ') ?? '';
                return `/${cmd.name} ${usage} - ${cmd.description}`;
            });
            sendBotMessage(lines.join('\n'));
        },
    });

    registerCommand({
        name: '랜덤',
        aliases: ['random'],
        description: '범위 내 랜덤한 정수를 뽑습니다.',
        args: [
            { name: '최소', description: '범위의 최소값' },
            { name: '최대', description: '범위의 최대' }
        ],
        handler(userId, args, raw) {
            let minValue = Number(args[0]);
            let maxValue = Number(args[1]);

            if(!Number.isInteger(minValue) || !Number.isInteger(maxValue)) {
                sendBotMessage('유효한 정수 범위를 입력해주세요.');
                return;
            }

            if(maxValue < minValue) {
                [ maxValue, minValue ] = [ minValue, maxValue ];
            }

            sendBotMessage(`결과 : ${Math.floor(Math.random() * (maxValue - minValue + 1) + minValue)}`);
        },
    });

    registerCommand({
        name: '실행',
        aliases: ['eval'],
        description: 'JS 코드를 실행합니다.',
        permission: 10,
        showCommandUse: 'private',
        args: [
            { name: '코드', description: '실행 가능한 자바스크립트 코드' }
        ],
        handler(userId, args, raw) {
            const code = args.join(' ');
            
            try {
                sendBotMessageToUser(userId, `결과 : ${eval(code)}`);
            }
            catch(e) {
                sendBotMessageToUser(userId, `오류 : ${e}`)
            }
        },
    });

    logger.success('봇 모듈 초기화 완료');
};
