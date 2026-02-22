import { registerCommand, getCommandListFiltered } from "../modules/bot.js";
import { sendBotMessageToChannel, sendBotMessageToUser, broadcastMessageAll, getFlagsForPermission } from "../modules/message.js";
import { getUserChannel } from "../modules/channel.js";
import { parseChatMessage } from "../utils/chatParser.js";

export function initGeneralCommands(): void {
    registerCommand({
        name: '도움말',
        aliases: ['help'],
        description: '명령어 목록을 표시합니다',
        handler(userId, _args, _raw, _msg, permission) {
            const list = getCommandListFiltered(permission);
            const lines = list.map(cmd => {
                const usage = cmd.args
                    ?.map(a => a.required ? `<${a.name}>` : `[${a.name}]`)
                    .join(' ') ?? '';
                return `/${cmd.name} ${usage} - ${cmd.description}`;
            });
            sendBotMessageToChannel(getUserChannel(userId), lines.join('\n'));
        },
    });

    registerCommand({
        name: '랜덤',
        aliases: ['random'],
        description: '범위 내 랜덤한 정수를 뽑습니다.',
        args: [
            { name: '최소', description: '범위의 최소값', required: true },
            { name: '최대', description: '범위의 최대', required: true },
        ],
        handler(userId, args) {
            let minValue = Number(args[0]);
            let maxValue = Number(args[1]);

            if (!Number.isInteger(minValue) || !Number.isInteger(maxValue)) {
                sendBotMessageToChannel(getUserChannel(userId), '유효한 정수 범위를 입력해주세요.');
                return;
            }

            if (maxValue < minValue) {
                [maxValue, minValue] = [minValue, maxValue];
            }

            sendBotMessageToChannel(getUserChannel(userId), `결과 : ${Math.floor(Math.random() * (maxValue - minValue + 1) + minValue)}`);
        },
    });

    registerCommand({
        name: '실행',
        aliases: ['eval'],
        description: 'JS 코드를 실행합니다.',
        permission: 10,
        showCommandUse: 'private',
        args: [
            { name: '코드', description: '실행 가능한 자바스크립트 코드', required: true },
        ],
        handler(userId, args) {
            const code = args.join(' ');
            try {
                sendBotMessageToUser(userId, `결과 : ${eval(code)}`);
            } catch (e) {
                sendBotMessageToUser(userId, `오류 : ${e}`);
            }
        },
    });

    registerCommand({
        name: '공지',
        description: '전체 채널에 공지를 브로드캐스트합니다.',
        permission: 10,
        showCommandUse: 'hide',
        args: [
            { name: '메시지', description: '공지 내용', required: true },
        ],
        handler(userId, _args, raw, msg, permission) {
            const content = raw.replace(/^\/\S+\s*/, '');
            if (!content.trim()) return;
            broadcastMessageAll({
                userId: msg?.userId ?? userId,
                nickname: msg?.nickname ?? '관리자',
                profileImage: msg?.profileImage,
                flags: getFlagsForPermission(permission),
                content: parseChatMessage(content),
                timestamp: Date.now(),
            });
        },
    });
}
