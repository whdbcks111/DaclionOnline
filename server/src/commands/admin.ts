import { registerCommand } from "../modules/bot.js";
import { sendBotMessageToUser } from "../modules/message.js";
import { fetchPlayerByUserId } from "../modules/player.js";
import { getLocation } from "../models/Location.js";
import { getItemData } from "../models/Item.js";
import logger from "../utils/logger.js";

type StatKey = 'life' | 'mentality' | 'thirsty' | 'hungry';
const STAT_KEYS: StatKey[] = ['life', 'mentality', 'thirsty', 'hungry'];
const STAT_MAX_MAP: Record<StatKey, 'maxLife' | 'maxMentality' | 'maxThirsty' | 'maxHungry'> = {
    life:      'maxLife',
    mentality: 'maxMentality',
    thirsty:   'maxThirsty',
    hungry:    'maxHungry',
};

export function initAdminCommands(): void {
    registerCommand({
        name: '레벨설정',
        description: '플레이어의 레벨(+경험치)을 설정합니다. 소수점 입력 시 소수 부분을 경험치 진행률로 설정합니다. (예: 5.75 → 레벨 5, 경험치 75%)',
        permission: 10,
        showCommandUse: 'private',
        args: [
            { name: '대상', description: '플레이어 userId 또는 me', required: true },
            { name: '레벨', description: '설정할 레벨 (1 이상, 소수점 가능)', required: true },
        ],
        async handler(userId, args) {
            try {
                const targetId = args[0] === 'me' ? userId : parseInt(args[0], 10);
                if (isNaN(targetId)) {
                    sendBotMessageToUser(userId, '유효한 플레이어 ID를 입력해주세요.');
                    return;
                }
                const value = parseFloat(args[1]);
                if (isNaN(value) || value < 1) {
                    sendBotMessageToUser(userId, '유효한 레벨을 입력해주세요. (1 이상)');
                    return;
                }
                const level = Math.floor(value);
                const expFraction = Math.round((value - level) * 1e9) / 1e9; // 부동소수점 보정

                const player = await fetchPlayerByUserId(targetId);
                if (!player) {
                    sendBotMessageToUser(userId, '플레이어를 찾을 수 없습니다.');
                    return;
                }
                player.level = level;
                const maxExp = player.maxExp;
                player.exp = expFraction > 0 ? Math.floor(expFraction * maxExp) : 0;
                await player.save();

                const expInfo = expFraction > 0 ? ` (경험치 ${player.exp} / ${maxExp})` : '';
                sendBotMessageToUser(userId, `${player.name}의 레벨을 ${level}${expInfo}로 설정했습니다.`);
                if (targetId !== userId) {
                    sendBotMessageToUser(targetId, `관리자에 의해 레벨이 ${level}${expInfo}로 변경되었습니다.`);
                }
            } catch (e) {
                logger.error('레벨설정 명령어 처리 중 오류:', e);
                sendBotMessageToUser(userId, '레벨 설정 중 오류가 발생했습니다.');
            }
        },
    });

    registerCommand({
        name: '상태변경',
        description: '플레이어의 상태(life, mentality, thirsty, hungry)를 설정합니다.',
        permission: 10,
        showCommandUse: 'private',
        args: [
            { name: '대상', description: '플레이어 userId 또는 me', required: true },
            { name: '스탯', description: 'life / mentality / thirsty / hungry', required: true },
            { name: '값', description: '설정할 값 (0 ~ 최대치)', required: true },
        ],
        async handler(userId, args) {
            try {
                const targetId = args[0] === 'me' ? userId : parseInt(args[0], 10);
                if (isNaN(targetId)) {
                    sendBotMessageToUser(userId, '유효한 플레이어 ID를 입력해주세요.');
                    return;
                }

                const statKey = args[1].toLowerCase() as StatKey;
                if (!STAT_KEYS.includes(statKey)) {
                    sendBotMessageToUser(userId, `유효한 스탯을 입력해주세요. (${STAT_KEYS.join(' / ')})`);
                    return;
                }

                const rawValue = parseFloat(args[2]);
                if (isNaN(rawValue) || rawValue < 0) {
                    sendBotMessageToUser(userId, '유효한 값을 입력해주세요. (0 이상)');
                    return;
                }

                const player = await fetchPlayerByUserId(targetId);
                if (!player) {
                    sendBotMessageToUser(userId, '플레이어를 찾을 수 없습니다.');
                    return;
                }

                const maxKey = STAT_MAX_MAP[statKey];
                const maxValue = player.attribute.get(maxKey);
                const clamped = Math.min(rawValue, maxValue);

                player[statKey] = clamped;
                await player.save();

                sendBotMessageToUser(userId, `${player.name}의 ${statKey}를 ${clamped} / ${maxValue}로 설정했습니다.`);
                if (targetId !== userId) {
                    sendBotMessageToUser(targetId, `관리자에 의해 ${statKey}가 ${clamped}로 변경되었습니다.`);
                }
            } catch (e) {
                logger.error('상태변경 명령어 처리 중 오류:', e);
                sendBotMessageToUser(userId, '상태 변경 중 오류가 발생했습니다.');
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
