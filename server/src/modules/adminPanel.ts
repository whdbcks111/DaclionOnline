import type { Socket } from 'socket.io';
import type {
    AdminOptionData,
    AdminPanelAction,
    AdminPanelActionRequest,
    AdminPanelBootstrapData,
    AdminPanelResult,
    AdminPlayerDetailData,
    AdminPlayerListItem,
} from '../../../shared/types.js';
import prisma from '../config/prisma.js';
import { getAllItemData, getItemData } from '../models/Item.js';
import { getAllSkillData, getSkillData } from '../models/Skill.js';
import { getAllJobs, JobTier } from '../models/Job.js';
import { getAllLocations, getLocation } from '../models/Location.js';
import Monster, { getAllMonsterData, getMonsterData } from '../models/Monster.js';
import Resource, { getAllResourceData } from '../models/Resource.js';
import { StatusEffectType } from '../models/StatusEffect.js';
import { StatType } from '../models/Stat.js';
import { EquipSlotType } from '../models/Equipment.js';
import { AttributeType } from '../models/Attribute.js';
import { markAllLocationsVisited } from '../models/WorldMap.js';
import { discoverAllCraftingRecipes } from '../models/Crafting.js';
import type Player from '../models/Player.js';
import { fetchPlayerByUserId, getOnlinePlayers, getPlayerByUserId } from './player.js';
import { getSession } from './login.js';
import { getIO } from './socket.js';
import { broadcastBotMessageAll, broadcastNotification, sendNotificationToUser } from './message.js';
import logger from '../utils/logger.js';

const ADMIN_PERMISSION = 10;
const VITAL_TYPES = Object.freeze({
    life: AttributeType.MAX_LIFE,
    mentality: AttributeType.MAX_MENTALITY,
    thirsty: AttributeType.MAX_THIRSTY,
    hungry: AttributeType.MAX_HUNGRY,
});

type VitalKey = keyof typeof VITAL_TYPES;

function adminUserId(socket: Socket): number | undefined {
    const session = socket.data.sessionToken ? getSession(socket.data.sessionToken) : undefined;
    return session && session.permission >= ADMIN_PERMISSION ? session.userId : undefined;
}

function deny(socket: Socket): void {
    socket.emit('notification', { key: 'admin-panel-denied', message: '관리자 권한이 필요합니다.' });
}

function option(value: string, label: string, description?: string): AdminOptionData {
    return { value, label, ...(description ? { description } : {}) };
}

export function getAdminPanelBootstrap(): AdminPanelBootstrapData {
    return {
        items: getAllItemData().map(data => option(data.id, data.name, data.description)),
        skills: getAllSkillData().map(data => option(data.id, data.name, `최대 Lv.${data.maxLevel}`)),
        jobs: getAllJobs().filter(job => job.tier === JobTier.FIRST).map(job => option(job.id, job.name, job.description)),
        locations: getAllLocations().map(location => option(location.id, location.data.name)),
        monsters: getAllMonsterData().map(monster => option(monster.id, monster.name, `Lv.${monster.level}`)),
        resources: getAllResourceData().map(resource => option(resource.id, resource.name, `Lv.${resource.level}`)),
        statusEffects: StatusEffectType.values().map(effect => option(effect.id, effect.label, `최대 Lv.${effect.maxLevel}`)),
        stats: StatType.values().map(stat => option(stat.key, stat.label)),
    };
}

export async function getAdminPlayerList(): Promise<AdminPlayerListItem[]> {
    const onlineIds = new Set(getOnlinePlayers().map(player => player.userId));
    const users = await prisma.user.findMany({
        where: { player: { isNot: null } },
        select: {
            id: true,
            username: true,
            nickname: true,
            permission: true,
            player: { select: { level: true, locationId: true } },
        },
    });
    return users.flatMap(user => {
        if (!user.player) return [];
        const runtime = getPlayerByUserId(user.id);
        const locationId = runtime?.locationId ?? user.player.locationId;
        return [{
            userId: user.id,
            username: user.username,
            nickname: runtime?.name ?? user.nickname,
            permission: user.permission,
            online: onlineIds.has(user.id),
            level: runtime?.level ?? user.player.level,
            locationId,
            locationName: getLocation(locationId)?.data.name ?? locationId,
        }];
    }).sort((left, right) => Number(right.online) - Number(left.online)
        || left.nickname.localeCompare(right.nickname, 'ko'));
}

export async function getAdminPlayerDetail(userId: number): Promise<AdminPlayerDetailData | null> {
    if (!Number.isSafeInteger(userId) || userId <= 0) return null;
    const [user, player] = await Promise.all([
        prisma.user.findUnique({
            where: { id: userId },
            select: { username: true, nickname: true, permission: true },
        }),
        fetchPlayerByUserId(userId),
    ]);
    if (!user || !player) return null;
    const location = getLocation(player.locationId);
    return {
        userId,
        username: user.username,
        nickname: player.name || user.nickname,
        permission: user.permission,
        online: getPlayerByUserId(userId) !== undefined,
        level: player.level,
        exp: player.exp,
        maxExp: player.maxExp,
        locationId: player.locationId,
        locationName: location?.data.name ?? player.locationId,
        gold: player.gold,
        statPoint: player.statPoint,
        life: player.life,
        maxLife: player.maxLife,
        mentality: player.mentality,
        maxMentality: player.maxMentality,
        thirsty: player.thirsty,
        maxThirsty: player.maxThirsty,
        hungry: player.hungry,
        maxHungry: player.maxHungry,
        mainJobId: player.career.mainJobId,
        mainJobName: player.career.mainJob?.name ?? '(없음)',
        subJobId: player.career.subJobId,
        subJobName: player.career.subJob?.name ?? '(없음)',
        eliteJobName: player.career.eliteJob?.name ?? '(없음)',
        stats: StatType.values().map(stat => ({ key: stat.key, label: stat.label, value: player.stat.get(stat) })),
        inventory: player.inventory.getIndexedItems().map(({ index, item }) => ({
            index,
            id: item.id,
            itemDataId: item.itemDataId,
            name: item.name || item.itemDataId,
            count: item.count,
            durability: item.durability,
            maxDurability: item.baseDurability,
            metadataDelta: item.getMetadataDeltaSnapshot(),
        })),
        equipment: player.equipment.getAllEquipped().map(({ slot, slotIndex, item }) => ({
            slot,
            slotLabel: EquipSlotType.fromKey(slot)?.label ?? slot,
            index: slotIndex,
            itemDataId: item.itemDataId,
            name: item.name || item.itemDataId,
        })),
        skills: player.skills.getAll().map(skill => ({
            id: skill.skillDataId,
            name: skill.name,
            level: skill.level,
            experience: skill.experience,
        })),
        statusEffects: player.getStatusEffectDisplaySnapshots().map(effect => ({
            id: effect.id,
            label: effect.label,
            level: effect.level,
            duration: effect.duration,
        })),
    };
}

function valuesOf(request: AdminPanelActionRequest): Record<string, string | number | boolean | null> {
    return request.values && typeof request.values === 'object' ? request.values : {};
}

function stringValue(values: ReturnType<typeof valuesOf>, key: string, allowEmpty = false): string {
    const value = values[key];
    if (typeof value !== 'string' || (!allowEmpty && !value.trim())) throw new Error(`${key} 값이 필요합니다.`);
    return value.trim();
}

function numberValue(values: ReturnType<typeof valuesOf>, key: string, options: { integer?: boolean; min?: number; max?: number } = {}): number {
    const raw = values[key];
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
    if (!Number.isFinite(value) || (options.integer && !Number.isInteger(value))
        || (options.min !== undefined && value < options.min)
        || (options.max !== undefined && value > options.max)) throw new Error(`${key} 값이 올바르지 않습니다.`);
    return value;
}

function noticeMessage(values: ReturnType<typeof valuesOf>): string {
    const message = stringValue(values, 'message');
    if (message.length > 1000) throw new Error('공지 내용은 1000자 이하여야 합니다.');
    return message;
}

function notificationLength(values: ReturnType<typeof valuesOf>): number {
    if (values.duration === undefined || values.duration === null || values.duration === '') return 5000;
    return numberValue(values, 'duration', { min: 1, max: 60 }) * 1000;
}

async function targetPlayer(request: AdminPanelActionRequest): Promise<Player> {
    const id = request.targetUserId;
    if (!Number.isSafeInteger(id) || (id ?? 0) <= 0) throw new Error('대상 플레이어가 필요합니다.');
    const player = await fetchPlayerByUserId(id!);
    if (!player) throw new Error('대상 플레이어를 찾을 수 없습니다.');
    return player;
}

async function save(player: Player): Promise<void> {
    await player.save();
}

async function executePlayerAction(adminId: number, request: AdminPanelActionRequest): Promise<string> {
    const values = valuesOf(request);
    const player = await targetPlayer(request);
    switch (request.action) {
        case 'notify_player': {
            const online = getPlayerByUserId(player.userId);
            if (!online) throw new Error('알림은 온라인 플레이어에게만 발송할 수 있습니다.');
            sendNotificationToUser(online.userId, {
                key: `admin-notice:${Date.now()}:${online.userId}`,
                message: noticeMessage(values),
                length: notificationLength(values),
            });
            return `${online.name}에게 알림 공지를 발송했습니다.`;
        }
        case 'teleport_admin_to_player': {
            const admin = getPlayerByUserId(adminId);
            if (!admin) throw new Error('관리자 캐릭터가 온라인 상태가 아닙니다.');
            admin.moving = false;
            admin.locationId = player.locationId;
            await save(admin);
            return `${player.name}의 위치로 이동했습니다.`;
        }
        case 'teleport_player_to_admin': {
            const admin = getPlayerByUserId(adminId);
            if (!admin) throw new Error('관리자 캐릭터가 온라인 상태가 아닙니다.');
            player.moving = false;
            player.locationId = admin.locationId;
            await save(player);
            return `${player.name}을(를) 관리자 위치로 이동했습니다.`;
        }
        case 'teleport_player_location': {
            const locationId = stringValue(values, 'locationId');
            const location = getLocation(locationId);
            if (!location) throw new Error('장소를 찾을 수 없습니다.');
            player.moving = false;
            player.locationId = location.id;
            await save(player);
            return `${player.name}을(를) ${location.data.name}(으)로 이동했습니다.`;
        }
        case 'grant_item': {
            const itemDataId = stringValue(values, 'itemDataId');
            const count = numberValue(values, 'count', { integer: true, min: 1, max: 9999 });
            const item = getItemData(itemDataId);
            if (!item) throw new Error('아이템 정의를 찾을 수 없습니다.');
            if (!player.inventory.addItem(itemDataId, count)) throw new Error('인벤토리 무게 또는 스택 제한으로 지급할 수 없습니다.');
            await save(player);
            return `${player.name}에게 ${item.name} x${count}을(를) 지급했습니다.`;
        }
        case 'remove_item': {
            const index = numberValue(values, 'itemIndex', { integer: true, min: 0 });
            const count = numberValue(values, 'count', { integer: true, min: 1 });
            const item = player.inventory.getItemByIndex(index);
            if (!item || !player.inventory.removeItemInstance(item, count)) throw new Error('아이템 또는 수량을 확인해주세요.');
            await save(player);
            return `${player.name}의 ${item.name} x${count}을(를) 삭제했습니다.`;
        }
        case 'clear_inventory': {
            const count = player.inventory.clear();
            await save(player);
            return `${player.name}의 인벤토리를 초기화했습니다. (삭제 수량 ${count})`;
        }
        case 'set_item_metadata': {
            const index = numberValue(values, 'itemIndex', { integer: true, min: 0 });
            const key = stringValue(values, 'metadataKey');
            const item = player.inventory.getItemByIndex(index);
            if (!item) throw new Error('인벤토리 아이템을 찾을 수 없습니다.');
            if (values.reset === true) player.inventory.resetItemMetadataByIndex(index, key);
            else {
                const json = stringValue(values, 'metadataJson', true);
                player.inventory.setItemMetadataByIndex(index, key, JSON.parse(json));
            }
            await save(player);
            return `${item.name}의 metadata '${key}'을(를) ${values.reset === true ? '초기화' : '수정'}했습니다.`;
        }
        case 'grant_skill': {
            const skillDataId = stringValue(values, 'skillDataId');
            const level = numberValue(values, 'level', { integer: true, min: 1 });
            const data = getSkillData(skillDataId);
            if (!data) throw new Error('스킬 정의를 찾을 수 없습니다.');
            const result = player.skills.grant(skillDataId, 'admin-panel', level);
            result.skill.setLevel(level);
            await save(player);
            return `${player.name}의 ${data.name}을(를) Lv.${result.skill.level}로 설정했습니다.`;
        }
        case 'set_skill_level': {
            const skillDataId = stringValue(values, 'skillDataId');
            const data = getSkillData(skillDataId);
            if (!data || !player.skills.has(skillDataId)) throw new Error('보유한 스킬을 찾을 수 없습니다.');
            const level = numberValue(values, 'level', { integer: true, min: 1, max: data.maxLevel });
            const appliedLevel = player.skills.setLevel(skillDataId, level);
            if (appliedLevel === null) throw new Error('스킬 레벨을 설정하지 못했습니다.');
            await save(player);
            return `${player.name}의 ${data.name} 레벨을 Lv.${appliedLevel}로 설정했습니다.`;
        }
        case 'remove_skill': {
            const skillDataId = stringValue(values, 'skillDataId');
            if (!player.skills.revoke(skillDataId)) throw new Error('보유한 스킬을 찾을 수 없습니다.');
            await save(player);
            return `${player.name}의 스킬을 삭제했습니다.`;
        }
        case 'set_jobs': {
            const result = player.career.setByAdmin(
                stringValue(values, 'mainJobId', true),
                stringValue(values, 'subJobId', true),
            );
            if (!result.success) throw new Error(result.reason ?? '직업 설정에 실패했습니다.');
            await save(player);
            return `${player.name}의 직업을 설정했습니다.`;
        }
        case 'set_level': {
            const level = numberValue(values, 'level', { integer: true, min: 1, max: 10000 });
            const expPercent = numberValue(values, 'expPercent', { min: 0, max: 99.999 });
            player.level = level;
            player.exp = Math.floor(player.maxExp * expPercent / 100);
            await save(player);
            return `${player.name}의 레벨을 Lv.${level} (${expPercent}% EXP)로 설정했습니다.`;
        }
        case 'set_stat_points': {
            player.statPoint = numberValue(values, 'value', { integer: true, min: 0, max: 1_000_000 });
            await save(player);
            return `${player.name}의 가용 스탯 포인트를 ${player.statPoint}로 설정했습니다.`;
        }
        case 'set_stat': {
            const stat = StatType.fromKey(stringValue(values, 'statKey'));
            if (!stat) throw new Error('스탯을 찾을 수 없습니다.');
            const value = numberValue(values, 'value', { integer: true, min: 0, max: 1_000_000 });
            player.stat.set(stat, value);
            player.stat.applyModifiers(player);
            await save(player);
            return `${player.name}의 ${stat.label}을(를) ${value}로 설정했습니다.`;
        }
        case 'set_gold': {
            player.gold = numberValue(values, 'value', { integer: true, min: 0, max: Number.MAX_SAFE_INTEGER });
            await save(player);
            return `${player.name}의 골드를 ${player.gold}로 설정했습니다.`;
        }
        case 'set_vital': {
            const key = stringValue(values, 'vitalKey') as VitalKey;
            const maxType = VITAL_TYPES[key];
            if (!maxType) throw new Error('상태값 종류를 찾을 수 없습니다.');
            const value = Math.min(numberValue(values, 'value', { min: 0 }), player.attribute.get(maxType));
            player[key] = value;
            await save(player);
            return `${player.name}의 ${key}를 ${value}로 설정했습니다.`;
        }
        case 'unlock_all_locations': {
            const count = markAllLocationsVisited(player);
            await save(player);
            return `${player.name}의 전체 지역 지도를 발견 처리했습니다. (신규 ${count}곳)`;
        }
        case 'unlock_all_crafting_recipes': {
            const count = discoverAllCraftingRecipes(player);
            await save(player);
            return `${player.name}의 모든 제작법을 발견 처리했습니다. (신규 ${count}개)`;
        }
        case 'apply_status_effect': {
            const online = getPlayerByUserId(player.userId);
            if (!online) throw new Error('상태이상은 온라인 플레이어에게만 부여할 수 있습니다.');
            const type = StatusEffectType.fromKey(stringValue(values, 'statusEffectId'));
            if (!type) throw new Error('상태이상 정의를 찾을 수 없습니다.');
            const level = numberValue(values, 'level', { integer: true, min: 1, max: type.maxLevel });
            const duration = numberValue(values, 'duration', { min: 0.1, max: 86400 });
            const result = online.applyStatusEffect(type, duration, level);
            if (!result.action.changed) throw new Error('기존 효과가 더 강하거나 오래 남아 있어 변경되지 않았습니다.');
            return `${online.name}에게 ${type.label} Lv.${level}을(를) ${duration}초 부여했습니다.`;
        }
        case 'clear_status_effects': {
            const online = getPlayerByUserId(player.userId);
            if (!online) throw new Error('온라인 플레이어만 상태이상을 해제할 수 있습니다.');
            online.clearStatusEffects();
            return `${online.name}의 상태이상을 모두 해제했습니다.`;
        }
        case 'revive_player': {
            const online = getPlayerByUserId(player.userId);
            if (!online) throw new Error('온라인 플레이어만 즉시 부활시킬 수 있습니다.');
            online.respawn();
            return `${online.name}을(를) 즉시 부활시켰습니다.`;
        }
        default:
            throw new Error('플레이어 대상 액션이 아닙니다.');
    }
}

function executeNoticeAction(request: AdminPanelActionRequest): string {
    const values = valuesOf(request);
    const message = noticeMessage(values);
    switch (request.action) {
        case 'broadcast_chat_notice':
            broadcastBotMessageAll(message);
            return '전체 채팅 공지를 발송했습니다.';
        case 'broadcast_notification':
            broadcastNotification({
                key: `admin-global-notice:${Date.now()}`,
                message,
                length: notificationLength(values),
            });
            return '전체 알림 공지를 발송했습니다.';
        default:
            throw new Error('공지 액션이 아닙니다.');
    }
}

function executeWorldAction(request: AdminPanelActionRequest): string {
    const values = valuesOf(request);
    const locationId = stringValue(values, 'locationId');
    const location = getLocation(locationId);
    if (!location) throw new Error('장소를 찾을 수 없습니다.');
    switch (request.action) {
        case 'spawn_monster': {
            const monsterDataId = stringValue(values, 'monsterDataId');
            const count = numberValue(values, 'count', { integer: true, min: 1, max: 50 });
            if (!getMonsterData(monsterDataId)) throw new Error('몬스터 정의를 찾을 수 없습니다.');
            for (let index = 0; index < count; index++) location.addObject(new Monster(monsterDataId, location.id));
            return `${location.data.name}에 몬스터 ${count}개를 소환했습니다.`;
        }
        case 'respawn_monsters': {
            const monsterDataId = stringValue(values, 'monsterDataId', true);
            let count = 0;
            for (const object of location.getObjects()) {
                if (!(object instanceof Monster) || (monsterDataId && object.monsterDataId !== monsterDataId)) continue;
                object.respawn();
                count++;
            }
            return `${location.data.name}의 몬스터 ${count}개를 리스폰했습니다.`;
        }
        case 'reset_resource_cooldown': {
            const objectNumber = numberValue(values, 'objectNumber', { integer: true, min: 1 });
            const object = location.getObject(objectNumber - 1);
            if (!(object instanceof Resource)) throw new Error('해당 번호는 자원 오브젝트가 아닙니다.');
            object.resetInteractionCooldown();
            return `${location.data.name} ${objectNumber}번 ${object.name}의 상호작용 쿨타임을 초기화했습니다.`;
        }
        default:
            throw new Error('월드 액션이 아닙니다.');
    }
}

export async function executeAdminPanelAction(adminId: number, request: AdminPanelActionRequest): Promise<AdminPanelResult> {
    const result: AdminPanelResult = { action: request.action, targetUserId: request.targetUserId };
    try {
        const message = request.action === 'broadcast_chat_notice'
            || request.action === 'broadcast_notification'
            ? executeNoticeAction(request)
            : request.action === 'spawn_monster'
            || request.action === 'respawn_monsters'
            || request.action === 'reset_resource_cooldown'
            ? executeWorldAction(request)
            : await executePlayerAction(adminId, request);
        return { ...result, ok: true, message };
    } catch (error) {
        logger.warn(`관리자 패널 액션 실패: ${request.action}`, error);
        return { ...result, error: error instanceof Error ? error.message : '관리자 액션 처리 중 오류가 발생했습니다.' };
    }
}

export function initAdminPanel(): void {
    const io = getIO();
    io.on('connection', socket => {
        socket.on('adminPanelRequestBootstrap', () => {
            if (adminUserId(socket) === undefined) return deny(socket);
            socket.emit('adminPanelBootstrap', getAdminPanelBootstrap());
        });
        socket.on('adminPanelRequestPlayers', async () => {
            if (adminUserId(socket) === undefined) return deny(socket);
            socket.emit('adminPanelPlayers', await getAdminPlayerList());
        });
        socket.on('adminPanelRequestPlayer', async (userId: unknown) => {
            if (adminUserId(socket) === undefined) return deny(socket);
            socket.emit('adminPanelPlayer', typeof userId === 'number' ? await getAdminPlayerDetail(userId) : null);
        });
        socket.on('adminPanelExecute', async (request: AdminPanelActionRequest) => {
            const userId = adminUserId(socket);
            if (userId === undefined) return deny(socket);
            if (!request || typeof request !== 'object' || typeof request.action !== 'string') return;
            const result = await executeAdminPanelAction(userId, request);
            socket.emit('adminPanelResult', result);
            socket.emit('notification', {
                key: `admin-panel-result:${request.action}:${Date.now()}`,
                message: result.ok ? result.message ?? '관리자 작업을 완료했습니다.' : result.error ?? '관리자 작업에 실패했습니다.',
                length: result.ok ? 3500 : 5000,
            });
            socket.emit('adminPanelPlayers', await getAdminPlayerList());
            if (request.targetUserId) socket.emit('adminPanelPlayer', await getAdminPlayerDetail(request.targetUserId));
        });
    });
}
