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
import { getMiniGamePresetSummaries, startMiniGamePreset } from './minigamePresets.js';
import {
    analyzeBalanceProfile,
    analyzeItemBalance,
    analyzeJobBalance,
    analyzeSkillBalance,
    createBalanceScenario,
    type CombatBalanceSnapshot,
    type ItemBalanceReport,
    type JobBalanceReport,
    type SkillBalanceReport,
    type CombatRotationReport,
} from '../models/Balance.js';

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
        balanceItems: getAllItemData().filter(data => data.balance)
            .map(data => option(data.id, data.name, data.balance?.role.label)),
        skills: getAllSkillData().map(data => option(data.id, data.name, `최대 Lv.${data.maxLevel}`)),
        jobs: getAllJobs().filter(job => job.tier === JobTier.FIRST).map(job => option(job.id, job.name, job.description)),
        locations: getAllLocations().map(location => option(location.id, location.data.name)),
        monsters: getAllMonsterData().map(monster => option(monster.id, monster.name, `Lv.${monster.level}`)),
        resources: getAllResourceData().map(resource => option(resource.id, resource.name, `Lv.${resource.level}`)),
        statusEffects: StatusEffectType.values().map(effect => option(effect.id, effect.label, '레벨 상한 없음')),
        stats: StatType.values().map(stat => option(stat.key, stat.label)),
        miniGamePresets: getMiniGamePresetSummaries().map(preset => option(preset.id, preset.label, preset.description)),
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
        case 'start_minigame': {
            const online = getPlayerByUserId(player.userId);
            if (!online) throw new Error('미니게임은 온라인 플레이어에게만 실행할 수 있습니다.');
            const presetId = stringValue(values, 'presetId');
            const preset = getMiniGamePresetSummaries().find(candidate => candidate.id === presetId);
            if (!preset) throw new Error('미니게임 프리셋을 찾을 수 없습니다.');
            if (!startMiniGamePreset(online, presetId)) throw new Error('플레이어가 이미 미니게임을 진행 중입니다.');
            return `${online.name}에게 ${preset.label} 미니게임을 실행했습니다.`;
        }
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
        case 'adjust_level': {
            const level = numberValue(values, 'level', { integer: true, min: 1, max: 10000 });
            const expPercent = numberValue(values, 'expPercent', { min: 0, max: 99.999 });
            const result = player.adjustLevel(level, expPercent);
            await save(player);
            const stats = StatType.values().map(stat => {
                const delta = result.statDeltas[stat.key];
                return `${stat.label} ${delta >= 0 ? '+' : ''}${delta}`;
            }).join(', ');
            return `${player.name}의 레벨을 Lv.${level}로 조정했습니다. (레벨 ${result.levelDelta >= 0 ? '+' : ''}${result.levelDelta}, ${stats}, 가용 포인트 ${result.statPointDelta >= 0 ? '+' : ''}${result.statPointDelta})`;
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
            const level = numberValue(values, 'level', { integer: true, min: 1 });
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

function executeBalanceAction(request: AdminPanelActionRequest): { message: string; details: string } {
    const values = valuesOf(request);
    const level = values.level === undefined ? 50 : numberValue(values, 'level', { integer: true, min: 1, max: 10000 });
    const mainJobId = stringValue(values, 'mainJobId');
    const mainJob = getAllJobs().find(job => job.id === mainJobId && job.tier === JobTier.FIRST);
    if (!mainJob) throw new Error('1차 직업을 찾을 수 없습니다.');
    switch (request.action) {
        case 'analyze_skill_balance': {
            const skillDataId = stringValue(values, 'skillDataId');
            const data = getSkillData(skillDataId);
            if (!data) throw new Error('스킬을 찾을 수 없습니다.');
            const skillLevel = values.skillLevel === undefined
                ? data.maxLevel
                : numberValue(values, 'skillLevel', { integer: true, min: 1, max: data.maxLevel });
            const report = analyzeSkillBalance(createBalanceScenario(level, mainJob.id), data.id, skillLevel);
            return { message: `${data.name} 밸런스 분석을 완료했습니다.`, details: formatSkillBalanceText(report, level, mainJob.name) };
        }
        case 'analyze_job_balance': {
            const subJobId = typeof values.subJobId === 'string' && values.subJobId.trim() ? values.subJobId.trim() : undefined;
            const report = analyzeJobBalance(level, mainJob.id, subJobId);
            return { message: `${report.name} 밸런스 분석을 완료했습니다.`, details: formatJobBalanceText(report) };
        }
        case 'analyze_balance_profile': {
            const subJobId = typeof values.subJobId === 'string' && values.subJobId.trim() ? values.subJobId.trim() : undefined;
            const report = analyzeBalanceProfile(level, mainJob.id, subJobId);
            return {
                message: `${report.name} 전투 로테이션 프로파일을 완료했습니다.`,
                details: [
                    `[밸런스 프로파일] Lv.${report.level} ${report.name}`,
                    `배분: ${report.allocationLabel}`,
                    formatRotationText(report.monster),
                    formatRotationText(report.boss),
                    '',
                    '평타 최소 3행동당 1회, 모든 사용 가능 스킬, 공유 행동 시간·정신력·재사용 대기시간 기준입니다.',
                ].join('\n'),
            };
        }
        case 'analyze_item_balance': {
            const itemDataId = stringValue(values, 'itemDataId');
            const report = analyzeItemBalance(level, mainJob.id, itemDataId);
            return { message: `${report.name} 밸런스 분석을 완료했습니다.`, details: formatItemBalanceText(report) };
        }
        default:
            throw new Error('밸런스 분석 액션이 아닙니다.');
    }
}

function formatSkillBalanceText(report: SkillBalanceReport, level: number, jobName: string): string {
    const lines = [
        `[스킬 밸런스] ${report.name} Lv.${report.skillLevel}`,
        `조건: Lv.${level} ${jobName} / 무장비 / 동레벨 균형형 대상 / 60초`,
        `분류: ${report.role} / 계산 지원: ${report.coverage}`,
        `재사용: ${numberText(report.cooldown)}초 / 정신력: ${numberText(report.manaCost)}`,
    ];
    if (report.rawDamage > 0) lines.push(
        `방어 전 1타: ${numberText(report.rawDamage)}`,
        `대상 1명 기대 피해: ${numberText(report.expectedDamagePerTarget)}`,
        `1회 총 기대 피해: ${numberText(report.expectedTotalDamage)}`,
        `60초 시전: ${report.sustainableCasts}회 / 기대 피해: ${numberText(report.sustainableDpm)}`,
    );
    if (report.healing > 0) lines.push(`1회 회복: ${numberText(report.healing)}`);
    if (report.shield > 0) lines.push(`1회 보호막: ${numberText(report.shield)}`);
    if (report.notes.length) lines.push('', '[분리한 효과]', ...report.notes.map(note => `- ${note}`));
    return lines.join('\n');
}

function formatRotationText(report: CombatRotationReport): string {
    return [
        '',
        `[${report.encounter.label}] Lv.${report.targetLevel} ${report.targetName}${report.targetNormalized ? ` (원본 Lv.${report.targetSourceLevel} 환산)` : ''}`,
        `장비: ${report.loadoutName} / ${report.basicAttackType === 'magic' ? '마법' : '물리'} 평타`,
        `90% 회피 기준: 속도 ${numberText(report.evasionCapSpeed)} / 필요 민첩 ${report.evasionCapAgility}${report.evasionCapReached ? ' (현재 도달)' : ''}`,
        `DPS: ${numberText(report.dps)} / 예상 처치: ${numberText(report.estimatedKillSeconds)}초`,
        `평타: ${report.basicAttacks}회, 피해 ${numberText(report.basicDamage)} (${numberText(report.basicDamageShare * 100)}%)`,
        `스킬: ${report.skillCasts}회, 피해 ${numberText(report.skillDamage)} / 종료 정신력 ${numberText(report.endingMentality)}`,
        ...report.skills.map(skill => `- ${skill.name} Lv.${skill.skillLevel}: ${skill.casts}회 / 피해 ${numberText(skill.damage)} / 회복 ${numberText(skill.healing)} / 보호막 ${numberText(skill.shield)}`),
    ].join('\n');
}

function formatJobBalanceText(report: JobBalanceReport): string {
    return [
        `[직업 밸런스] Lv.${report.level} ${report.name}`,
        `배분: ${report.allocationLabel}`,
        `스탯: 근력 ${report.stats.strength} / 민첩 ${report.stats.agility} / 체력 ${report.stats.vitality} / 감각 ${report.stats.sensibility} / 정신력 ${report.stats.mentality}`,
        `능력치: 공격력 ${numberText(report.attack)} / 마법력 ${numberText(report.magicForce)} / 생명력 ${numberText(report.maxLife)}`,
        `방어: 물리 ${numberText(report.defense)} / 마법 ${numberText(report.magicDefense)} / 속도 ${numberText(report.speed)}`,
        `기본 물리 DPS: ${numberText(report.basicPhysicalDps)}`,
        `표준 공격 생존: 물리 ${numberText(report.physicalSurvivalSeconds)}초 / 마법 ${numberText(report.magicSurvivalSeconds)}초`,
        '',
        '[직업 스킬]',
        ...report.skillReports.map(skill => `- ${skill.name}: 60초 피해 ${numberText(skill.sustainableDpm)} (${skill.coverage})`),
    ].join('\n');
}

function formatItemBalanceText(report: ItemBalanceReport): string {
    const attackKey: keyof CombatBalanceSnapshot = report.attackType === 'magic' ? 'magicBasicDps' : 'physicalBasicDps';
    const lines = [
        `[아이템 밸런스] ${report.name}`,
        `조건: Lv.${report.level} ${report.jobName} / 동레벨 균형형 대상`,
        `분류: ${report.role}${report.recommendedJobNames.length ? ` / 추천: ${report.recommendedJobNames.join(', ')}` : ''}`,
    ];
    if (report.statusEffect) lines.push(`효과: ${report.statusEffect.label} Lv.${report.statusEffect.level} / ${report.statusEffect.duration}초`);
    lines.push(
        '', '[전후 실측]',
        `공격력: ${pairText(report.before.attack, report.after.attack)} / 마법력: ${pairText(report.before.magicForce, report.after.magicForce)}`,
        `방어: ${pairText(report.before.defense, report.after.defense)} / 마법저항: ${pairText(report.before.magicDefense, report.after.magicDefense)}`,
        `생명력: ${pairText(report.before.maxLife, report.after.maxLife)} / 이동속도: ${pairText(report.before.speed, report.after.speed)}`,
        `${report.attackType === 'magic' ? '마법' : '물리'} 기본 DPS: ${pairText(report.before[attackKey], report.after[attackKey])}`,
        `물리 생존: ${pairText(report.before.physicalSurvivalSeconds, report.after.physicalSurvivalSeconds, '초')}`,
        `마법 생존: ${pairText(report.before.magicSurvivalSeconds, report.after.magicSurvivalSeconds, '초')}`,
    );
    if (report.notes.length) lines.push('', '[분리한 효과]', ...report.notes.map(note => `- ${note}`));
    return lines.join('\n');
}

function numberText(value: number): string {
    if (!Number.isFinite(value)) return '∞';
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function pairText(before: number, after: number, suffix = ''): string {
    const delta = after - before;
    return `${numberText(before)}${suffix} → ${numberText(after)}${suffix} (${Math.abs(delta) < 0.0001 ? '변화 없음' : `${delta > 0 ? '+' : ''}${numberText(delta)}${suffix}`})`;
}

export async function executeAdminPanelAction(adminId: number, request: AdminPanelActionRequest): Promise<AdminPanelResult> {
    const result: AdminPanelResult = { action: request.action, targetUserId: request.targetUserId };
    try {
        if (request.action === 'analyze_skill_balance'
            || request.action === 'analyze_job_balance'
            || request.action === 'analyze_item_balance'
            || request.action === 'analyze_balance_profile') {
            const balance = executeBalanceAction(request);
            return { ...result, ok: true, ...balance };
        }
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
