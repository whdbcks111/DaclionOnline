import { registerCommand, getCommandListFiltered, setInformationModeForUser } from "../modules/bot.js";
import { sendBotMessageToChannel, sendBotMessageToUser, broadcastMessageAll, getFlagsForPermission } from "../modules/message.js";
import { chat } from "../utils/chatBuilder.js";
import { getUserChannel } from "../modules/channel.js";
import { parseChatMessage } from "../utils/chatParser.js";
import { getSessionByUserId } from "../modules/login.js";
import { getPlayerByUserId } from "../modules/player.js";

export function initGeneralCommands(): void {
    registerCommand({
        name: '도움말',
        aliases: ['help'],
        showCommandUse: 'private',
        information: true,
        description: '명령어 목록을 표시합니다',
        handler(userId, _args, _raw, _msg, permission) {
            const list = getCommandListFiltered(permission);

            const groups = new Map<number, typeof list>();
            for (const cmd of list) {
                if (!groups.has(cmd.permission)) groups.set(cmd.permission, []);
                groups.get(cmd.permission)!.push(cmd);
            }

            const sortedGroups = [...groups.entries()].sort((x, y) => x[0] - y[0]);
            const CMD = 260;

            const node = chat()
                .text('[ 도움말 ]\n')
                .hide('목록 보기', b => {
                    for (let gi = 0; gi < sortedGroups.length; gi++) {
                        const [perm, cmds] = sortedGroups[gi];
                        if (gi > 0) b.text('\n');

                        const header = perm === 0 ? '일반 명령어' : `권한 ${perm} 이상`;
                        b.divider(header);

                        for (const cmd of cmds) {
                            b.weight('bold', b2 => b2.text(`/${cmd.name}`));
                            for (const arg of cmd.args ?? []) {
                                b.text(' ');
                                if (arg.required) {
                                    b.color('$info', b2 => b2.text(`<${arg.name}>`));
                                } else {
                                    b.color('$text-tertiary', b2 => b2.text(`[${arg.name}]`));
                                }
                            }
                            b
                            .text('\n')
                            .color('$text-secondary', b2 => b2.bg('$background-secondary', b3 => b3.text(cmd.description)))
                            .text('\n');
                        }
                    }
                    return b;
                })
                .build();

            sendBotMessageToUser(userId, node);
        },
    });

    registerCommand({
        name: '단축키목록',
        showCommandUse: 'private',
        information: true,
        description: '명령어별 등록된 별칭을 표시합니다.',
        handler(userId, _args, _raw, _msg, permission) {
            const commandsWithAliases = getCommandListFiltered(permission)
                .filter(command => command.aliases.length > 0);
            const node = chat()
                .text('[ 단축키 목록 ]\n')
                .color('$text-tertiary', b => b.text('슬래시 없이도 입력할 수 있습니다.\n'))
                .hide('목록 보기', b => {
                    for (const command of commandsWithAliases) {
                        b.weight('bold', title => title.text(`/${command.name}`))
                            .color('$text-tertiary', arrow => arrow.text(' → '))
                            .color('$info', aliases => aliases.text(command.aliases.join(', ')))
                            .text('\n');
                    }
                    return b;
                })
                .build();
            sendBotMessageToUser(userId, node);
        },
    });

    registerCommand({
        name: '공개모드', aliases: ['publicmode'], description: '정보 열람 결과를 현재 채널에 공개합니다.',
        showCommandUse: 'hide',
        handler(userId) { setInformationModeForUser(userId, true); },
    });

    registerCommand({
        name: '비공개모드', aliases: ['privatemode'], description: '정보 열람 결과를 본인에게만 표시합니다.',
        showCommandUse: 'hide',
        handler(userId) { setInformationModeForUser(userId, false); },
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
            { name: '코드', description: '실행 가능한 자바스크립트 코드', required: true, isText: true },
        ],
        handler(userId, args) {
            const code = args[0];
            const session = getSessionByUserId(userId);
            const player = getPlayerByUserId(userId);
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
