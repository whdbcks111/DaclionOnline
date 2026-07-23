import { registerCommand } from "../modules/bot.js";
import { sendBotMessageToUser } from "../modules/message.js";
import { fetchPlayerByUserId, getOnlinePlayers, getPlayerByUserId } from "../modules/player.js";
import { getLocation, getAllLocations } from "../models/Location.js";
import { getItemData, getAllItemData } from "../models/Item.js";
import { StatType } from "../models/Stat.js";
import { AttributeType } from "../models/Attribute.js";
import logger from "../utils/logger.js";
import type { CompletionItem } from "../../../shared/types.js";
import { StatusEffectType } from "../models/StatusEffect.js";
import { cancelNavigation } from "../modules/navigation.js";


type StatKey = 'life' | 'mentality' | 'thirsty' | 'hungry';
const STAT_KEYS: StatKey[] = ['life', 'mentality', 'thirsty', 'hungry'];
const STAT_MAX_MAP: Record<StatKey, AttributeType> = {
    life:      AttributeType.MAX_LIFE,
    mentality: AttributeType.MAX_MENTALITY,
    thirsty:   AttributeType.MAX_THIRSTY,
    hungry:    AttributeType.MAX_HUNGRY,
};

export function initAdminCommands(): void {
    registerCommand({
        name: '상태이상부여',
        aliases: ['effectgive'],
        description: '온라인 플레이어에게 런타임 상태이상을 부여합니다.',
        permission: 10,
        showCommandUse: 'private',
        args: [
            { name: '대상', description: '온라인 플레이어 userId 또는 me', required: true,
                completions() {
                    return [
                        { value: 'me', description: '나 자신' },
                        ...getOnlinePlayers().map((p): CompletionItem => ({ value: String(p.userId), description: p.name })),
                    ];
                },
            },
            { name: '상태이상코드', description: '부여할 상태이상 ID', required: true,
                completions: StatusEffectType.values().map((effect): CompletionItem => ({
                    value: effect.id,
                    description: effect.label,
                })),
            },
            { name: '레벨', description: '효과 레벨 (1 이상 정수)', required: true },
            { name: '시간', description: '지속시간(초)', required: true },
        ],
        handler(userId, args) {
            try {
                const targetId = args[0] === 'me' ? userId : Number.parseInt(args[0], 10);
                if (!Number.isInteger(targetId)) {
                    sendBotMessageToUser(userId, '유효한 온라인 플레이어 ID 또는 me를 입력해주세요.');
                    return;
                }

                const type = StatusEffectType.fromInput(args[1] ?? '');
                if (!type) {
                    sendBotMessageToUser(userId, `상태이상 '${args[1] ?? ''}'을(를) 찾을 수 없습니다.`);
                    return;
                }

                const level = Number.parseInt(args[2], 10);
                const duration = Number.parseFloat(args[3]);
                if (!Number.isInteger(level) || level < 1) {
                    sendBotMessageToUser(userId, '레벨은 1 이상의 정수여야 합니다.');
                    return;
                }
                if (!Number.isFinite(duration) || duration <= 0) {
                    sendBotMessageToUser(userId, '시간은 0보다 큰 초 단위 숫자여야 합니다.');
                    return;
                }

                const target = getPlayerByUserId(targetId);
                if (!target) {
                    sendBotMessageToUser(userId, '상태이상은 런타임 전용이므로 온라인 플레이어에게만 부여할 수 있습니다.');
                    return;
                }

                const result = target.applyStatusEffect(type, duration, level);
                if (!result.action.changed || !result.effect) {
                    sendBotMessageToUser(userId, result.action.key === 'rejected'
                        ? `${target.name}에게 ${type.label}을(를) 적용할 수 없습니다.`
                        : `${target.name}의 기존 ${type.label} 효과가 더 강하거나 오래 남아 있어 변경되지 않았습니다.`);
                    return;
                }

                const message = `${target.name}에게 ${type.label} Lv.${result.effect.level}을(를) ${duration}초 부여했습니다.`;
                sendBotMessageToUser(userId, message);
                if (targetId !== userId) {
                    sendBotMessageToUser(targetId, `관리자에 의해 ${type.label} Lv.${result.effect.level} 효과가 부여되었습니다.`);
                }
            } catch (error) {
                logger.error('상태이상부여 명령어 처리 중 오류:', error);
                sendBotMessageToUser(userId, '상태이상 부여 중 오류가 발생했습니다.');
            }
        },
    });

    registerCommand({
        name: '레벨설정',
        description: '플레이어의 레벨(+경험치)을 설정합니다. 소수점 입력 시 소수 부분을 경험치 진행률로 설정합니다. (예: 5.75 → 레벨 5, 경험치 75%)',
        permission: 10,
        showCommandUse: 'private',
        args: [
            { name: '대상', description: '플레이어 userId 또는 me', required: true,
                completions() {
                    return [
                        { value: 'me', description: '나 자신' },
                        ...getOnlinePlayers().map((p): CompletionItem => ({ value: String(p.userId), description: p.name })),
                    ];
                },
            },
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
        name: '레벨조정',
        aliases: ['leveladjust'],
        description: '레벨 차이만큼 실제 성장 규칙의 모든 스탯과 스탯 포인트를 함께 증감합니다. 소수점은 경험치 진행률입니다.',
        permission: 10,
        showCommandUse: 'private',
        args: [
            { name: '대상', description: '플레이어 userId 또는 me', required: true,
                completions() {
                    return [
                        { value: 'me', description: '나 자신' },
                        ...getOnlinePlayers().map((p): CompletionItem => ({ value: String(p.userId), description: p.name })),
                    ];
                },
            },
            { name: '레벨', description: '조정할 레벨 (1 이상, 소수점 가능)', required: true },
        ],
        async handler(userId, args) {
            try {
                const targetId = args[0] === 'me' ? userId : Number.parseInt(args[0], 10);
                const rawLevel = Number.parseFloat(args[1]);
                if (!Number.isSafeInteger(targetId) || !Number.isFinite(rawLevel) || rawLevel < 1 || rawLevel >= 10_001) {
                    sendBotMessageToUser(userId, '유효한 대상과 1~10000 범위의 레벨을 입력해주세요.');
                    return;
                }
                const level = Math.floor(rawLevel);
                const expPercent = Math.round((rawLevel - level) * 100_000) / 1_000;
                const player = await fetchPlayerByUserId(targetId);
                if (!player) {
                    sendBotMessageToUser(userId, '플레이어를 찾을 수 없습니다.');
                    return;
                }
                const result = player.adjustLevel(level, expPercent);
                await player.save();
                const levelDelta = `${result.levelDelta >= 0 ? '+' : ''}${result.levelDelta}`;
                const pointDelta = `${result.statPointDelta >= 0 ? '+' : ''}${result.statPointDelta}`;
                const stats = StatType.values().map(stat => {
                    const delta = result.statDeltas[stat.key];
                    return `${stat.label} ${delta >= 0 ? '+' : ''}${delta}`;
                }).join(', ');
                const message = `${player.name}의 레벨을 ${level}로 조정했습니다. (레벨 ${levelDelta}, ${stats}, 가용 포인트 ${pointDelta})`;
                sendBotMessageToUser(userId, message);
                if (targetId !== userId) sendBotMessageToUser(targetId, `관리자에 의해 ${message}`);
            } catch (error) {
                logger.error('레벨조정 명령어 처리 중 오류:', error);
                sendBotMessageToUser(userId, error instanceof Error ? error.message : '레벨 조정 중 오류가 발생했습니다.');
            }
        },
    });

    registerCommand({
        name: '상태변경',
        description: '플레이어의 상태(life, mentality, thirsty, hungry)를 설정합니다.',
        permission: 10,
        showCommandUse: 'private',
        args: [
            { name: '대상', description: '플레이어 userId 또는 me', required: true,
                completions() {
                    return [
                        { value: 'me', description: '나 자신' },
                        ...getOnlinePlayers().map((p): CompletionItem => ({ value: String(p.userId), description: p.name })),
                    ];
                },
            },
            { name: '상태', description: 'life / mentality / thirsty / hungry', required: true,
                completions: STAT_KEYS.map(k => ({ value: k, description: k })),
            },
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
            { name: '대상', description: '플레이어 userId 또는 me', required: true,
                completions() {
                    return [
                        { value: 'me', description: '나 자신' },
                        ...getOnlinePlayers().map((p): CompletionItem => ({ value: String(p.userId), description: p.name })),
                    ];
                },
            },
            { name: '아이템id', description: '아이템 데이터 ID', required: true,
                completions() {
                    return getAllItemData().map((d): CompletionItem => ({ value: d.id, description: d.name }));
                },
            },
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
        name: '스탯설정',
        description: '플레이어의 스탯(근력/민첩/체력/감각/정신력)을 설정합니다.',
        permission: 10,
        showCommandUse: 'private',
        args: [
            { name: '대상', description: '플레이어 userId 또는 me', required: true,
                completions() {
                    return [
                        { value: 'me', description: '나 자신' },
                        ...getOnlinePlayers().map((p): CompletionItem => ({ value: String(p.userId), description: p.name })),
                    ];
                },
            },
            { name: '스탯', description: '근력 / 민첩 / 체력 / 감각 / 정신력 (또는 영문)', required: true,
                completions: StatType.values().map((s): CompletionItem => ({ value: s.label, description: s.key })),
            },
            { name: '값', description: '설정할 스탯 포인트 수 (0 이상 정수)', required: true },
        ],
        async handler(userId, args) {
            try {
                const targetId = args[0] === 'me' ? userId : parseInt(args[0], 10);
                if (isNaN(targetId)) {
                    sendBotMessageToUser(userId, '유효한 플레이어 ID를 입력해주세요.');
                    return;
                }

                const statType = StatType.fromInput(args[1]);
                if (!statType) {
                    sendBotMessageToUser(userId, `유효한 스탯을 입력해주세요. (${StatType.values().map(s => s.label).join(' / ')})`);
                    return;
                }

                const value = parseInt(args[2], 10);
                if (isNaN(value) || value < 0) {
                    sendBotMessageToUser(userId, '유효한 값을 입력해주세요. (0 이상 정수)');
                    return;
                }

                const player = await fetchPlayerByUserId(targetId);
                if (!player) {
                    sendBotMessageToUser(userId, '플레이어를 찾을 수 없습니다.');
                    return;
                }

                player.stat.set(statType, value);
                player.stat.applyModifiers(player);
                await player.save();

                sendBotMessageToUser(userId, `${player.name}의 ${statType.label}을(를) ${value}로 설정했습니다.`);
                if (targetId !== userId) {
                    sendBotMessageToUser(targetId, `관리자에 의해 ${statType.label}이(가) ${value}로 변경되었습니다.`);
                }
            } catch (e) {
                logger.error('스탯설정 명령어 처리 중 오류:', e);
                sendBotMessageToUser(userId, '스탯 설정 중 오류가 발생했습니다.');
            }
        },
    });

    registerCommand({
        name: '스탯포인트설정',
        description: '플레이어의 스탯 포인트를 설정합니다.',
        permission: 10,
        showCommandUse: 'private',
        args: [
            { name: '대상', description: '플레이어 userId 또는 me', required: true,
                completions() {
                    return [
                        { value: 'me', description: '나 자신' },
                        ...getOnlinePlayers().map((p): CompletionItem => ({ value: String(p.userId), description: p.name })),
                    ];
                },
            },
            { name: '값', description: '설정할 스탯 포인트 수 (0 이상 정수)', required: true },
        ],
        async handler(userId, args) {
            try {
                const targetId = args[0] === 'me' ? userId : parseInt(args[0], 10);
                if (isNaN(targetId)) {
                    sendBotMessageToUser(userId, '유효한 플레이어 ID를 입력해주세요.');
                    return;
                }

                const value = parseInt(args[1], 10);
                if (isNaN(value) || value < 0) {
                    sendBotMessageToUser(userId, '유효한 값을 입력해주세요. (0 이상 정수)');
                    return;
                }

                const player = await fetchPlayerByUserId(targetId);
                if (!player) {
                    sendBotMessageToUser(userId, '플레이어를 찾을 수 없습니다.');
                    return;
                }

                player.statPoint = value;
                await player.save();

                sendBotMessageToUser(userId, `${player.name}의 스탯 포인트를 ${value}로 설정했습니다.`);
                if (targetId !== userId) {
                    sendBotMessageToUser(targetId, `관리자에 의해 스탯 포인트가 ${value}로 변경되었습니다.`);
                }
            } catch (e) {
                logger.error('스탯포인트설정 명령어 처리 중 오류:', e);
                sendBotMessageToUser(userId, '스탯 포인트 설정 중 오류가 발생했습니다.');
            }
        },
    });

    registerCommand({
        name: '골드설정',
        description: '플레이어의 골드를 설정합니다.',
        permission: 10,
        showCommandUse: 'private',
        args: [
            { name: '대상', description: '플레이어 userId 또는 me', required: true,
                completions() {
                    return [
                        { value: 'me', description: '나 자신' },
                        ...getOnlinePlayers().map((p): CompletionItem => ({ value: String(p.userId), description: p.name })),
                    ];
                },
            },
            { name: '값', description: '설정할 골드 수량 (0 이상 정수)', required: true },
        ],
        async handler(userId, args) {
            try {
                const targetId = args[0] === 'me' ? userId : parseInt(args[0], 10);
                if (isNaN(targetId)) {
                    sendBotMessageToUser(userId, '유효한 플레이어 ID를 입력해주세요.');
                    return;
                }

                const value = parseInt(args[1], 10);
                if (isNaN(value) || value < 0) {
                    sendBotMessageToUser(userId, '유효한 값을 입력해주세요. (0 이상 정수)');
                    return;
                }

                const player = await fetchPlayerByUserId(targetId);
                if (!player) {
                    sendBotMessageToUser(userId, '플레이어를 찾을 수 없습니다.');
                    return;
                }

                player.gold = value;
                await player.save();

                sendBotMessageToUser(userId, `${player.name}의 골드를 ${value}로 설정했습니다.`);
                if (targetId !== userId) {
                    sendBotMessageToUser(targetId, `관리자에 의해 골드가 ${value}로 변경되었습니다.`);
                }
            } catch (e) {
                logger.error('골드설정 명령어 처리 중 오류:', e);
                sendBotMessageToUser(userId, '골드 설정 중 오류가 발생했습니다.');
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
            { name: '대상', description: '플레이어 userId 또는 me', required: true,
                completions() {
                    return [
                        { value: 'me', description: '나 자신' },
                        ...getOnlinePlayers().map((p): CompletionItem => ({ value: String(p.userId), description: p.name })),
                    ];
                },
            },
            { name: '장소id', description: '이동할 장소 ID', required: true,
                completions() {
                    return getAllLocations().map((loc): CompletionItem => ({ value: loc.id, description: loc.data.name }));
                },
            },
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

                cancelNavigation(player, false);

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
