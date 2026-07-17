import { AttributeType } from '../models/Attribute.js';
import { FishRarity, rollFish, rollFishRarity, rollFishingExp } from '../models/Fishing.js';
import { getItemData } from '../models/Item.js';
import { getLocation } from '../models/Location.js';
import type Player from '../models/Player.js';
import { GameTags } from '../../../shared/tags.js';
import {
    simulateFishingCapture,
    type FishingCaptureConfig,
    type FishingCaptureShape,
    type MiniGameInputSample,
    type MiniGameResultRequest,
} from '../../../shared/minigames.js';
import { sendBotMessageToUser, sendNotificationToUser } from './message.js';
import { cancelMiniGame, hasActiveMiniGame, startMiniGame } from './minigame.js';
import { getPlayerByUserId } from './player.js';

interface FishingState {
    locationId: string
    rodItemDataId: string
    netShape: FishingCaptureShape
    netSize: number
    netSpeed: number
    initialGauge: number
    timer: ReturnType<typeof setTimeout>
    phase: 'waiting' | 'minigame'
}

export interface StartFishingResult {
    ok: boolean
    message: string
    waitSeconds?: number
}

const fishingByUser = new Map<number, FishingState>();

function randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

function normalizeShape(value: unknown): FishingCaptureShape {
    return value === 'circle' || value === 'rectangle' || value === 'square' ? value : 'circle';
}

function validateInputs(request: MiniGameResultRequest): request is MiniGameResultRequest & { inputs: MiniGameInputSample[] } {
    if (!Array.isArray(request.inputs) || request.inputs.length === 0 || request.inputs.length > 512) return false;
    let previousAt = -1;
    return request.inputs.every(input => {
        if (!input || typeof input !== 'object') return false;
        if (!Number.isFinite(input.at) || input.at < previousAt || input.at < 0 || input.at > request.elapsedMs) return false;
        if (!Number.isFinite(input.x) || !Number.isFinite(input.y) || Math.abs(input.x) > 1 || Math.abs(input.y) > 1) return false;
        previousAt = input.at;
        return true;
    });
}

function finishFishingReward(player: Player, rarity: FishRarity): string {
    const fish = rollFish(rarity);
    if (!fish) return '해당 등급의 물고기 데이터가 없어 보상을 받지 못했습니다.';
    const itemData = getItemData(fish.itemDataId);
    if (!itemData) return '물고기 아이템 데이터가 없어 보상을 받지 못했습니다.';

    const exp = rollFishingExp(rarity);
    const levels = player.gainExp(exp);
    let placement = '인벤토리에 넣었습니다.';
    if (!player.inventory.addItem(fish.itemDataId, 1)) {
        getLocation(player.locationId)?.addDroppedItem({
            itemDataId: fish.itemDataId,
            count: 1,
            durability: itemData.baseDurability,
            metadataDelta: null,
            tags: [],
        });
        placement = '인벤토리가 무거워 발밑에 떨어졌습니다.';
    }
    const levelText = levels.length > 0 ? ` Lv.${levels.at(-1)} 달성!` : '';
    return `[${rarity.label}] ${itemData.name}을(를) 낚았습니다! 경험치 +${exp}.${levelText} ${placement}`;
}

function beginFishingMiniGame(userId: number, locationId: string, rarity: FishRarity): void {
    const player = getPlayerByUserId(userId);
    const state = fishingByUser.get(userId);
    const location = player ? getLocation(player.locationId) : undefined;
    const rod = player?.equipment.getEquipped('mainHand');
    if (!player || !state || player.isDead || player.locationId !== locationId
        || !location?.hasTag(GameTags.LOCATION_FISHING) || !rod?.hasTag(GameTags.TOOL_FISHING)
        || rod.itemDataId !== state.rodItemDataId) {
        fishingByUser.delete(userId);
        sendNotificationToUser(userId, { key: 'fishing:cancelled', message: '낚시할 수 있는 상태가 아니어서 입질이 끊겼습니다.' });
        return;
    }

    state.phase = 'minigame';
    const size = state.netSize;
    const shape = state.netShape;
    const config: FishingCaptureConfig = {
        seed: Math.floor(Math.random() * 2_147_483_647),
        durationMs: 24_000 + rarity.difficulty * 1_000,
        rarityLabel: rarity.label,
        rarityColor: rarity.color,
        fishIcon: 'items/silver_minnow',
        difficulty: rarity.difficulty,
        netShape: shape,
        netWidth: shape === 'rectangle' ? size * 1.35 : size,
        netHeight: shape === 'rectangle' ? size * 0.78 : size,
        netSpeed: state.netSpeed,
        initialGauge: state.initialGauge,
        fillPerSecond: Math.max(0.08, 0.18 - rarity.difficulty * 0.012),
        drainPerSecond: Math.min(0.18, 0.055 + rarity.difficulty * 0.012),
    };

    sendNotificationToUser(userId, {
        key: 'fishing:bite',
        message: `${rarity.label} 등급의 강한 입질입니다! 물고기를 채집 영역 안에 유지하세요.`,
        length: 3500,
    });

    const started = startMiniGame({
        userId,
        type: 'fishing_capture',
        config,
        expiresInMs: config.durationMs + 5_000,
        validate: request => {
            if (!validateInputs(request)) return { success: false, message: '입력 기록이 올바르지 않습니다.' };
            const current = getPlayerByUserId(userId);
            if (!current || current.isDead || current.locationId !== locationId) {
                return { success: false, message: '낚시 도중 자리를 벗어났습니다.' };
            }
            const simulation = simulateFishingCapture(config, request.inputs, request.elapsedMs);
            return simulation.finished && simulation.success
                ? { success: true }
                : { success: false, message: '물고기가 채집 영역에서 빠져나갔습니다.' };
        },
        onResolved: result => {
            fishingByUser.delete(userId);
            const current = getPlayerByUserId(userId);
            if (!current) return;
            const message = result.success ? finishFishingReward(current, rarity) : (result.message ?? '낚시에 실패했습니다.');
            sendBotMessageToUser(userId, message);
            sendNotificationToUser(userId, { key: 'fishing:result', message, length: 4500 });
        },
        onCancelled: () => { fishingByUser.delete(userId); },
    });
    if (!started) {
        fishingByUser.delete(userId);
        sendNotificationToUser(userId, { key: 'fishing:busy', message: '이미 다른 미니게임을 진행하고 있습니다.' });
    }
}

export function startFishing(player: Player): StartFishingResult {
    if (fishingByUser.has(player.userId) || hasActiveMiniGame(player.userId)) {
        return { ok: false, message: '이미 낚시 또는 다른 미니게임을 진행하고 있습니다.' };
    }
    if (player.isDead) return { ok: false, message: '사망 상태에서는 낚시할 수 없습니다.' };
    const location = getLocation(player.locationId);
    if (!location?.hasTag(GameTags.LOCATION_FISHING)) {
        return { ok: false, message: '이 장소에서는 낚시할 수 없습니다.' };
    }
    const rod = player.equipment.getEquipped('mainHand');
    if (!rod?.hasTag(GameTags.TOOL_FISHING)) {
        return { ok: false, message: '손 슬롯에 낚시 도구를 장착해야 합니다.' };
    }
    let bait = player.equipment.getEquipped('offHand');
    if (!bait?.hasTag(GameTags.ITEM_BAIT)) {
        const inventoryBait = player.inventory.findFirstItem(item => item.hasTag(GameTags.ITEM_BAIT));
        if (inventoryBait && player.equipInventoryItem(inventoryBait, 0)) {
            bait = player.equipment.getEquipped('offHand');
            sendNotificationToUser(player.userId, {
                key: 'fishing:bait-equipped',
                message: `${bait?.name ?? '미끼'} 묶음을 보조 슬롯에 자동 장착했습니다.`,
            });
        }
    }
    if (!bait?.hasTag(GameTags.ITEM_BAIT)) {
        return { ok: false, message: '보조 슬롯이나 인벤토리에 사용할 미끼가 없습니다.' };
    }

    const luck = player.attribute.get(AttributeType.LUCK);
    const biteSpeed = Math.max(0.25, player.attribute.get(AttributeType.FISHING_BITE_SPEED));
    const netShape = normalizeShape(rod.getMetadata('fishingNetShape'));
    const netSize = Math.max(8, Math.min(38, player.attribute.get(AttributeType.FISHING_NET_SIZE)));
    const netSpeed = Math.max(12, Math.min(80, player.attribute.get(AttributeType.FISHING_NET_SPEED)));
    const initialGauge = Math.max(0.2, Math.min(0.8, player.attribute.get(AttributeType.FISHING_GAUGE_START)));
    const waitSeconds = Math.max(1.5, randomBetween(4, 10) / biteSpeed);
    if (!player.equipment.consumeEquippedItem('offHand', 0, player.attribute)) {
        return { ok: false, message: '장착한 미끼를 소비하지 못했습니다.' };
    }

    const fishingLocationId = player.locationId;
    const timer = setTimeout(() => {
        const rarity = rollFishRarity(luck);
        beginFishingMiniGame(player.userId, fishingLocationId, rarity);
    }, waitSeconds * 1000);
    fishingByUser.set(player.userId, {
        locationId: fishingLocationId,
        rodItemDataId: rod.itemDataId,
        netShape,
        netSize,
        netSpeed,
        initialGauge,
        timer,
        phase: 'waiting',
    });
    sendNotificationToUser(player.userId, {
        key: 'fishing:waiting',
        message: '미끼를 던졌습니다. 입질을 기다리는 중...',
        length: Math.ceil(waitSeconds * 1000),
    });
    return { ok: true, message: '미끼를 던졌습니다. 입질을 기다립니다.', waitSeconds };
}

export function cancelFishing(userId: number, reason = '낚시가 취소되었습니다.'): boolean {
    const state = fishingByUser.get(userId);
    if (!state) return cancelMiniGame(userId, reason);
    clearTimeout(state.timer);
    fishingByUser.delete(userId);
    if (state.phase === 'minigame') cancelMiniGame(userId, reason);
    return true;
}

export function isFishing(userId: number): boolean { return fishingByUser.has(userId); }
