import type { CompletionItem } from '../../../../shared/types.js';
import { GameTags } from '../../../../shared/tags.js';
import NPC from '../../models/actors/NPC.js';
import { getLocation } from '../../models/world/Location.js';
import {
    DialogueEndReason,
    chooseNpcDialogue,
    endNpcDialogue,
    startNpcDialogue,
} from '../../models/actors/NpcDialogue.js';
import { registerCommand } from '../../modules/communication/bot.js';
import { sendBotMessageToUser, sendNotificationToUser } from '../../modules/communication/message.js';
import { getPlayerByUserId } from '../../modules/player/player.js';
import {
    deliverNpcCommission,
    getNpcCommissionSnapshot,
    getNpcFavorSnapshot,
    getNpcFavorSnapshots,
} from '../../models/progression/NpcRelationship.js';
import { chat } from '../../utils/chatBuilder.js';

function findNpcByInput(input: string): NPC | undefined {
    const normalized = input.trim().toLocaleLowerCase().replace(/\s+/g, '');
    return NPC.getAll().find(npc => npc.id === input.trim().toLowerCase()
        || npc.name.toLocaleLowerCase().replace(/\s+/g, '') === normalized);
}

function favorCompletions(userId: number): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    if (!player) return [];
    return [
        { value: '전체', description: '한 번이라도 만난 NPC의 호감도 전체 보기' },
        ...getNpcFavorSnapshots(player).map(snapshot => ({
            value: snapshot.npcName,
            description: `${snapshot.tierLabel} · ${snapshot.favor}/${snapshot.maxFavor}`,
        })),
    ];
}

function commissionNpcCompletions(userId: number): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    const location = player ? getLocation(player.locationId) : undefined;
    return location?.getNpcs(player).map((npc, index) => ({
        value: String(index + 1),
        description: npc.name,
    })) ?? [];
}

function forgedItemCompletions(userId: number): CompletionItem[] {
    const player = getPlayerByUserId(userId);
    if (!player) return [];
    return player.inventory.getIndexedItems()
        .filter(({ item }) => item.hasTag(GameTags.ITEM_FORGED) && Boolean(item.data?.equipSlot))
        .map(({ index, item }) => ({ value: String(index + 1), description: item.name }));
}

export function initNpcCommands(): void {
    registerCommand({
        name: '대화',
        aliases: ['talk', 'tk'],
        description: '현재 위치의 NPC와 대화합니다.',
        showCommandUse: 'hide',
        args: [{
            name: '번호',
            description: '대화할 NPC 번호',
            required: true,
            completions(userId) {
                const player = getPlayerByUserId(userId);
                const location = player ? getLocation(player.locationId) : undefined;
                if (!location) return [];
                return location.getNpcs(player).map((npc, index): CompletionItem => ({
                    value: String(index + 1),
                    description: npc.name,
                }));
            },
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const number = Number(args[0]);
            const location = getLocation(player.locationId);
            const npc = Number.isInteger(number) ? location?.getNpc(number - 1, player) : undefined;
            if (!npc) {
                sendBotMessageToUser(userId, '유효한 NPC 번호를 입력해주세요.');
                return;
            }
            const result = startNpcDialogue(player, npc);
            if (!result.success && result.reason) sendBotMessageToUser(userId, result.reason);
        },
    });

    registerCommand({
        name: '호감도',
        aliases: ['npc호감도', 'favor'],
        description: 'NPC별 호감도, 오늘 획득량과 제작 의뢰 보너스를 확인합니다.',
        information: true,
        showCommandUse: 'private',
        args: [{
            name: 'NPC',
            description: '확인할 NPC 이름 또는 전체',
            isText: true,
            completions: favorCompletions,
        }],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const input = args.join(' ').trim();
            const selected = input && input !== '전체' ? findNpcByInput(input) : undefined;
            if (input && input !== '전체' && !selected) {
                sendBotMessageToUser(userId, '한 번이라도 만난 NPC 이름을 입력해주세요.');
                return;
            }
            const snapshots = selected
                ? [getNpcFavorSnapshot(player, selected)]
                : getNpcFavorSnapshots(player);
            const builder = chat().weight('bold', nested => nested.text('[ NPC 호감도 ]'))
                .text('\n대화 시작 +2, 대화 선택 +1, 제작 의뢰 +5 · NPC별 하루 최대 10');
            if (snapshots.length === 0) {
                builder.text('\n\n아직 호감도가 오른 NPC가 없습니다. NPC와 대화를 시작해보세요.');
            }
            for (const snapshot of snapshots) {
                builder.text('\n\n')
                    .weight('bold', nested => nested.text(`${snapshot.npcName} · ${snapshot.tierLabel}`))
                    .text(`\n호감도 ${snapshot.favor}/${snapshot.maxFavor}`)
                    .text(` · 오늘 ${snapshot.gainedToday}/${snapshot.dailyCap}`)
                    .text(`\n제작 의뢰 보상 x${snapshot.commissionRewardMultiplier.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}`);
                if (snapshot.maxRewardClaimed) builder.color('gold', nested => nested.text('\n✓ 진심의 답례와 특별 관계 해금'));
            }
            sendBotMessageToUser(userId, builder.build());
        },
    });

    registerCommand({
        name: '제작의뢰',
        aliases: ['납품의뢰', 'craftcommission'],
        description: '현재 장소 NPC의 일일 제작 의뢰를 확인하거나 납품합니다.',
        showCommandUse: 'private',
        args: [
            {
                name: 'NPC번호',
                description: '의뢰를 납품할 현재 장소 NPC 번호',
                completions: commissionNpcCompletions,
            },
            {
                name: '아이템번호',
                description: '단조품 의뢰에 납품할 인벤토리 번호',
                completions: forgedItemCompletions,
            },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const location = getLocation(player.locationId);
            const npcs = location?.getNpcs(player) ?? [];
            const npcNumber = args[0] ? Number(args[0]) : NaN;
            if (Number.isInteger(npcNumber)) {
                const npc = npcs[npcNumber - 1];
                if (!npc) {
                    sendBotMessageToUser(userId, '현재 장소의 유효한 NPC 번호를 입력해주세요.');
                    return;
                }
                const itemIndex = args[1] ? Number(args[1]) : undefined;
                const result = deliverNpcCommission(player, npc, itemIndex);
                if (!result.delivered) {
                    sendNotificationToUser(userId, { key: 'npc-commission-denied', message: result.message });
                    sendBotMessageToUser(userId, result.message);
                    return;
                }
                const levelText = result.levelsGained.length > 0
                    ? ` · Lv.${result.levelsGained.at(-1)} 달성`
                    : '';
                const completed = chat()
                    .color('gold', nested => nested.weight('bold', inner => inner.text(
                        `[ 제작 의뢰 완료 ] ${result.snapshot.npcName}`,
                    )))
                    .text(`\n${result.snapshot.itemName} ${result.snapshot.quantity}개 납품`)
                    .text(`\nGold +${result.snapshot.goldReward.toLocaleString('ko-KR')}`)
                    .text(` · EXP +${result.snapshot.experienceReward.toLocaleString('ko-KR')}${levelText}`)
                    .text(` · 호감도 +${result.favor.gained}`);
                if (result.favor.tierChanged) {
                    completed.color('gold', nested => nested.text(`\n관계 단계: ${result.favor.snapshot.tierLabel}`));
                }
                if (result.favor.maxRewardGranted) {
                    completed.text('\n진심의 답례로 Gold 25,000과 대용량 체력·마나 포션 3개씩을 받았습니다.');
                }
                sendBotMessageToUser(userId, completed.build());
                return;
            }

            const builder = chat().weight('bold', nested => nested.text('[ 오늘의 NPC 제작 의뢰 ]'));
            if (npcs.length === 0) builder.text('\n현재 장소에는 의뢰를 줄 NPC가 없습니다.');
            for (const [index, npc] of npcs.entries()) {
                const snapshot = getNpcCommissionSnapshot(player, npc);
                builder.text('\n\n').weight('bold', nested => nested.text(`${index + 1}. ${npc.name}`));
                if (!snapshot) {
                    builder.text('\n발견한 제작법이 없어 배정 가능한 의뢰가 없습니다.');
                    continue;
                }
                builder.text(`\n${snapshot.itemName} ${snapshot.quantity}개 · 보유 ${snapshot.ownedQuantity}`)
                    .text(`\n보상 Gold ${snapshot.goldReward.toLocaleString('ko-KR')} · EXP ${snapshot.experienceReward.toLocaleString('ko-KR')} · 호감도 +${snapshot.favorReward}`);
                if (snapshot.completed) {
                    builder.color('lime', nested => nested.text('\n✓ 오늘 완료'));
                } else if (snapshot.requestType === 'forged') {
                    if (snapshot.eligibleItemIndexes.length === 0) {
                        builder.color('red', nested => nested.text('\n납품 가능한 단조 장비가 없습니다.'));
                    } else {
                        builder.text('\n납품할 장비:');
                        for (const itemIndex of snapshot.eligibleItemIndexes) {
                            const item = player.inventory.getIndexedItems().find(entry => entry.index === itemIndex - 1)?.item;
                            builder.text(' ').closeButton(
                                `/제작의뢰 ${index + 1} ${itemIndex}`,
                                nested => nested.text(`[${itemIndex}. ${item?.name ?? '단조 장비'}]`),
                            );
                        }
                    }
                } else {
                    builder.text(' ').closeButton(`/제작의뢰 ${index + 1}`, nested => nested.text('[납품]'));
                }
            }
            sendBotMessageToUser(userId, builder.build());
        },
    });

    registerCommand({
        name: '대화선택',
        description: '진행 중인 NPC 대화의 선택지를 고릅니다.',
        showCommandUse: 'hide',
        args: [
            { name: '세션', description: '대화 세션 ID', required: true },
            { name: '번호', description: '선택지 번호', required: true },
        ],
        handler(userId, args) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            const result = chooseNpcDialogue(player, args[0], Number(args[1]));
            if (!result.success && result.reason) sendBotMessageToUser(userId, result.reason);
        },
    });

    registerCommand({
        name: '대화종료',
        aliases: ['endtalk'],
        description: '진행 중인 NPC 대화를 종료합니다.',
        showCommandUse: 'hide',
        handler(userId) {
            const player = getPlayerByUserId(userId);
            if (!player) return;
            if (!endNpcDialogue(player, DialogueEndReason.USER)) {
                sendBotMessageToUser(userId, '진행 중인 대화가 없습니다.');
            }
        },
    });
}
