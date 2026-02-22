import { registerCommand } from "../modules/bot.js";
import { sendBotMessageToUser } from "../modules/message.js";
import { getPlayerByUserId, fetchPlayerByUserId } from "../modules/player.js";
import { getLocation } from "../models/Location.js";
import { getItemData } from "../models/Item.js";
import logger from "../utils/logger.js";

export function initAdminCommands(): void {
    registerCommand({
        name: '레벨설정',
        description: '플레이어의 레벨을 설정합니다.',
        permission: 10,
        showCommandUse: 'private',
        args: [
            { name: '대상', description: '플레이어 userId 또는 me', required: true },
            { name: '레벨', description: '설정할 레벨 (1 이상 정수)', required: true },
        ],
        async handler(userId, args) {
            try {
                const targetId = args[0] === 'me' ? userId : parseInt(args[0], 10);
                if (isNaN(targetId)) {
                    sendBotMessageToUser(userId, '유효한 플레이어 ID를 입력해주세요.');
                    return;
                }
                const level = parseInt(args[1], 10);
                if (!Number.isInteger(level) || level < 1) {
                    sendBotMessageToUser(userId, '유효한 레벨을 입력해주세요. (1 이상 정수)');
                    return;
                }
                const player = await fetchPlayerByUserId(targetId);
                if (!player) {
                    sendBotMessageToUser(userId, '플레이어를 찾을 수 없습니다.');
                    return;
                }
                player.level = level;
                await player.save();
                sendBotMessageToUser(userId, `${player.name}의 레벨을 ${level}로 설정했습니다.`);
                if (targetId !== userId) {
                    sendBotMessageToUser(targetId, `관리자에 의해 레벨이 ${level}로 변경되었습니다.`);
                }
            } catch (e) {
                logger.error('레벨설정 명령어 처리 중 오류:', e);
                sendBotMessageToUser(userId, '레벨 설정 중 오류가 발생했습니다.');
            }
        },
    });

    registerCommand({
        name: '아이템추가',
        description: '플레이어에게 아이템을 추가합니다.',
        permission: 10,
        showCommandUse: 'private',
        args: [
            { name: '대상', description: '플레이어 userId 또는 me', required: true },
            { name: '아이템id', description: '아이템 데이터 ID', required: true },
            { name: '개수', description: '추가할 개수 (1 이상 정수)', required: true },
        ],
        async handler(userId, args) {
            try {
                const targetId = args[0] === 'me' ? userId : parseInt(args[0], 10);
                if (isNaN(targetId)) {
                    sendBotMessageToUser(userId, '유효한 플레이어 ID를 입력해주세요.');
                    return;
                }
                const itemDataId = args[1];
                const count = parseInt(args[2], 10);
                if (!Number.isInteger(count) || count < 1) {
                    sendBotMessageToUser(userId, '유효한 개수를 입력해주세요. (1 이상 정수)');
                    return;
                }
                const itemData = getItemData(itemDataId);
                if (!itemData) {
                    sendBotMessageToUser(userId, `아이템 ID '${itemDataId}'를 찾을 수 없습니다.`);
                    return;
                }
                const player = await fetchPlayerByUserId(targetId);
                if (!player) {
                    sendBotMessageToUser(userId, '플레이어를 찾을 수 없습니다.');
                    return;
                }
                const ok = player.inventory.addItem(itemDataId, count);
                if (!ok) {
                    sendBotMessageToUser(userId, '아이템 추가에 실패했습니다. (무게 초과 등)');
                    return;
                }
                await player.save();
                sendBotMessageToUser(userId, `${player.name}에게 ${itemData.name} x${count} 추가 완료.`);
                if (targetId !== userId) {
                    sendBotMessageToUser(targetId, `관리자에 의해 ${itemData.name} x${count}가 추가되었습니다.`);
                }
            } catch (e) {
                logger.error('아이템추가 명령어 처리 중 오류:', e);
                sendBotMessageToUser(userId, '아이템 추가 중 오류가 발생했습니다.');
            }
        },
    });

    registerCommand({
        name: '순간이동',
        aliases: ['tp', 'teleport'],
        description: '플레이어를 지정한 장소로 순간이동시킵니다.',
        permission: 10,
        showCommandUse: 'private',
        args: [
            { name: '대상', description: '플레이어 userId 또는 me', required: true },
            { name: '장소id', description: '이동할 장소 ID', required: true },
        ],
        async handler(userId, args) {
            try {
                const targetId = args[0] === 'me' ? userId : parseInt(args[0], 10);
                if (isNaN(targetId)) {
                    sendBotMessageToUser(userId, '유효한 플레이어 ID를 입력해주세요.');
                    return;
                }

                const locationId = args[1];
                const location = getLocation(locationId);
                if (!location) {
                    sendBotMessageToUser(userId, `장소 ID '${locationId}'를 찾을 수 없습니다.`);
                    return;
                }

                const player = await fetchPlayerByUserId(targetId);
                if (!player) {
                    sendBotMessageToUser(userId, '플레이어를 찾을 수 없습니다.');
                    return;
                }

                if (player.moving) {
                    player.moving = false;
                }

                player.locationId = locationId;
                await player.save();

                sendBotMessageToUser(userId, `${player.name}을(를) ${location.data.name}(으)로 순간이동시켰습니다.`);
                if (targetId !== userId) {
                    sendBotMessageToUser(targetId, `관리자에 의해 ${location.data.name}(으)로 이동되었습니다.`);
                }
            } catch (e) {
                logger.error('순간이동 명령어 처리 중 오류:', e);
                sendBotMessageToUser(userId, '순간이동 중 오류가 발생했습니다.');
            }
        },
    });

}
