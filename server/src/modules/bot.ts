import logger from "../utils/logger.js";
import { getIO } from "./socket.js";
import { sendBotMessage } from "./message.js";
import type { CommandInfo } from "../../../shared/types.js";

interface CommandArg {
    name: string
    description: string
    required?: boolean
}

interface CommandConfig {
    name: string
    aliases?: string[]
    description: string
    args?: CommandArg[]
    handler: (userId: number, args: string[], raw: string) => void
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

/** 명령어 파싱 및 실행 (chat.ts에서 호출) */
export function handleCommand(userId: number, raw: string): void {
    // "/명령어 인자1 인자2" → ["명령어", "인자1", "인자2"]
    const parts = raw.slice(1).split(/\s+/);
    const name = parts[0].toLowerCase();
    const args = parts.slice(1);

    const cmd = commands.get(name) ?? commands.get(aliasMap.get(name) ?? '');
    if (!cmd) {
        sendBotMessage(`알 수 없는 명령어: /${name}`);
        return;
    }

    // 필수 인자 검증
    const requiredArgs = cmd.args?.filter(a => a.required) ?? [];
    if (args.length < requiredArgs.length) {
        const usage = cmd.args
            ?.map(a => a.required ? `<${a.name}>` : `[${a.name}]`)
            .join(' ') ?? '';
        sendBotMessage(`사용법: /${cmd.name} ${usage}`);
        return;
    }

    cmd.handler(userId, args, raw);
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
        handler () {
            const list = Array.from(commands.values());
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
    })

    logger.success('봇 모듈 초기화 완료');
};
