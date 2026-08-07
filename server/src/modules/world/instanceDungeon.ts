import Monster from '../../models/actors/Monster.js';
import type Player from '../../models/actors/Player.js';
import Resource from '../../models/actors/Resource.js';
import { WITCH_CURSE_STATUS_EFFECT, WITCH_GAZE_STATUS_EFFECT } from '../../data/combat/statusEffects.js';
import { sendBotMessageToUser, sendBotMessageToUsers } from '../communication/message.js';
import { GameEventIds, subscribeGameEvent } from '../../models/core/GameEvent.js';
import { StatusEffectRemovalReason } from '../../models/combat/StatusEffect.js';
import {
    defineRuntimeLocation,
    getLocation,
    registerConnectionCondition,
    removeRuntimeLocation,
} from '../../models/world/Location.js';
import {
    buildInstanceDungeonLocations,
    getInstanceDungeonDefinition,
    INSTANCE_ROOM_CLEAR_CONDITION,
    type NormalizedInstanceDungeonDefinition,
} from '../../models/world/InstanceDungeon.js';

const RETURN_RIFT_RESOURCE_ID = 'dimensional_return_rift';
// Player 공용 10초 reconnect grace가 끝나 새 객체로 reload되기 전에 원정 귀속을 확정 정리한다.
const DISCONNECT_GRACE_MS = 9_000;

interface InstanceParticipant {
    readonly player: Player;
    readonly originLocationId: string;
    disconnectedAt?: number;
}

interface InstanceRun {
    readonly id: string;
    readonly definition: NormalizedInstanceDungeonDefinition;
    readonly originLocationId: string;
    readonly sourceGate: Resource;
    readonly openedAt: number;
    readonly closesAt: number;
    readonly expiresAt: number;
    readonly roomIds: readonly string[];
    readonly roomIdSet: ReadonlySet<string>;
    readonly participants: Map<number, InstanceParticipant>;
    gateClosed: boolean;
    completed: boolean;
}

export interface InstanceDungeonEntryResult {
    readonly entered: boolean;
    readonly reason?: string;
    readonly runId?: string;
}

export class InstanceDungeonManager {
    private readonly runs = new Map<string, InstanceRun>();
    private readonly runIdByUserId = new Map<number, string>();
    private readonly openRunByGate = new Map<Resource, string>();
    private sequence = 0;

    enterFromGate(
        sourceGate: Resource,
        player: Player,
        dungeonDefinitionId: string,
        now = Date.now(),
    ): InstanceDungeonEntryResult {
        const definition = getInstanceDungeonDefinition(dungeonDefinitionId);
        if (!definition) return this.reject(player, '존재하지 않는 차원 균열입니다.');
        if (!player.isWorldActive || player.isDefeated || player.moving
            || player.locationId !== sourceGate.locationId) {
            return this.reject(player, '현재 상태로는 차원 균열에 진입할 수 없습니다.');
        }
        if (this.runIdByUserId.has(player.userId)) {
            return this.reject(player, '이미 다른 차원 균열 원정에 참가 중입니다.');
        }

        let run = this.getOpenRun(sourceGate, now);
        if (!run) run = this.createRun(sourceGate, definition, now);
        if (run.participants.size >= run.definition.maxPlayers) {
            return this.reject(player, `균열 수용 인원(${run.definition.maxPlayers}명)이 가득 찼습니다.`);
        }

        const participant: InstanceParticipant = {
            player,
            originLocationId: sourceGate.locationId,
        };
        run.participants.set(player.userId, participant);
        this.runIdByUserId.set(player.userId, run.id);
        this.authorizeParticipants(run);
        player.locationId = run.roomIds[0];
        player.applyStatusEffect(
            WITCH_GAZE_STATUS_EFFECT,
            Math.max(0.05, (run.expiresAt - now) / 1000),
            1,
        );

        const seconds = Math.max(0, Math.ceil((run.closesAt - now) / 1000));
        sendBotMessageToUser(player.userId,
            `[ 차원 균열 진입 ] ${run.definition.name}\n${seconds}초 뒤 게이트가 닫힙니다. 마녀의 주시가 끝나기 전에 지배자를 쓰러뜨리고 귀환하십시오.`);
        return { entered: true, runId: run.id };
    }

    escapeThroughReturnRift(resource: Resource, player: Player): boolean {
        const run = this.getRunForPlayer(player);
        if (!run || !run.completed || resource.locationId !== run.roomIds.at(-1)
            || player.locationId !== resource.locationId) {
            sendBotMessageToUser(player.userId, '아직 이 균열을 통해 안전하게 귀환할 수 없습니다.');
            return false;
        }
        const participant = run.participants.get(player.userId);
        if (!participant) return false;
        this.clearWitchEffects(player);
        player.locationId = participant.originLocationId;
        run.participants.delete(player.userId);
        this.runIdByUserId.delete(player.userId);
        sendBotMessageToUser(player.userId, `[ 원정 귀환 ] ${run.definition.name}에서 무사히 빠져나왔습니다.`);
        if (run.participants.size === 0) this.disposeRun(run);
        return true;
    }

    canAdvance(player: Player): boolean {
        const run = this.getRunForPlayer(player);
        if (!run || !run.roomIdSet.has(player.locationId)) return false;
        return getLocation(player.locationId)?.getActiveMonsterCount() === 0;
    }

    update(now = Date.now()): void {
        for (const run of [...this.runs.values()]) {
            if (!run.gateClosed && now >= run.closesAt) {
                run.gateClosed = true;
                this.openRunByGate.delete(run.sourceGate);
                this.sendToRun(run, '[ 게이트 폐쇄 ] 차원 균열이 닫혔습니다. 이제 추가 합류는 불가능합니다.');
            }

            for (const [userId, participant] of [...run.participants]) {
                const player = participant.player;
                if (player.isDefeated || !run.roomIdSet.has(player.locationId)) {
                    this.removeParticipant(run, userId, false);
                    continue;
                }
                if (!player.isWorldActive) {
                    participant.disconnectedAt ??= now;
                    if (now - participant.disconnectedAt >= DISCONNECT_GRACE_MS) {
                        this.removeParticipant(run, userId, true);
                    }
                    continue;
                }
                if (participant.disconnectedAt !== undefined) {
                    participant.disconnectedAt = undefined;
                    this.synchronizeWitchEffect(player, run, now);
                } else if (!player.hasStatusEffect(WITCH_GAZE_STATUS_EFFECT)
                    && !player.hasStatusEffect(WITCH_CURSE_STATUS_EFFECT)) {
                    this.synchronizeWitchEffect(player, run, now);
                }
            }
            if (run.participants.size === 0) this.disposeRun(run);
        }
    }

    handleMonsterDefeated(monster: Monster): void {
        if (!monster.hasTag('entity:boss')) return;
        const run = [...this.runs.values()].find(candidate => candidate.roomIds.at(-1) === monster.locationId);
        if (!run || run.completed) return;
        run.completed = true;
        getLocation(monster.locationId)?.addObject(new Resource(RETURN_RIFT_RESOURCE_ID, monster.locationId, 0));
        this.sendToRun(run,
            `[ 균열 안정화 ] ${monster.name}의 지배가 무너져 보스방에 귀환 차원 균열이 열렸습니다. 제한시간 안에 직접 탈출하십시오.`);
    }

    getActiveRunCount(): number { return this.runs.size; }

    private createRun(
        sourceGate: Resource,
        definition: NormalizedInstanceDungeonDefinition,
        now: number,
    ): InstanceRun {
        const id = `${now.toString(36)}_${(++this.sequence).toString(36)}`;
        const locationData = buildInstanceDungeonLocations(definition, id);
        locationData.forEach(defineRuntimeLocation);
        const closesAt = now + definition.gateOpenSeconds * 1000;
        const run: InstanceRun = {
            id,
            definition,
            originLocationId: sourceGate.locationId,
            sourceGate,
            openedAt: now,
            closesAt,
            expiresAt: closesAt + definition.durationSeconds * 1000,
            roomIds: locationData.map(location => location.id),
            roomIdSet: new Set(locationData.map(location => location.id)),
            participants: new Map(),
            gateClosed: false,
            completed: false,
        };
        this.runs.set(id, run);
        this.openRunByGate.set(sourceGate, id);
        return run;
    }

    private getOpenRun(sourceGate: Resource, now: number): InstanceRun | undefined {
        const id = this.openRunByGate.get(sourceGate);
        const run = id ? this.runs.get(id) : undefined;
        if (!run || run.gateClosed || now >= run.closesAt) {
            if (id) this.openRunByGate.delete(sourceGate);
            return undefined;
        }
        return run;
    }

    private getRunForPlayer(player: Player): InstanceRun | undefined {
        const id = this.runIdByUserId.get(player.userId);
        return id ? this.runs.get(id) : undefined;
    }

    private authorizeParticipants(run: InstanceRun): void {
        const userIds = [...run.participants.keys()];
        for (const roomId of run.roomIds) {
            getLocation(roomId)?.authorizeMonsterCombatParticipants(userIds);
        }
    }

    private synchronizeWitchEffect(player: Player, run: InstanceRun, now: number): void {
        this.clearWitchEffects(player);
        if (now < run.expiresAt) {
            player.applyStatusEffect(WITCH_GAZE_STATUS_EFFECT, (run.expiresAt - now) / 1000, 1);
            return;
        }
        const curseSeconds = (run.expiresAt + 5_000 - now) / 1000;
        if (curseSeconds > 0) player.applyStatusEffect(WITCH_CURSE_STATUS_EFFECT, curseSeconds, 1);
        else player.life = 0;
    }

    private clearWitchEffects(player: Player): void {
        player.removeStatusEffect(WITCH_GAZE_STATUS_EFFECT, StatusEffectRemovalReason.INVALID_TARGET);
        player.removeStatusEffect(WITCH_CURSE_STATUS_EFFECT, StatusEffectRemovalReason.INVALID_TARGET);
    }

    private removeParticipant(run: InstanceRun, userId: number, eject: boolean): void {
        const participant = run.participants.get(userId);
        if (!participant) return;
        this.clearWitchEffects(participant.player);
        if (eject && !participant.player.isDefeated && run.roomIdSet.has(participant.player.locationId)) {
            participant.player.locationId = participant.originLocationId;
        }
        run.participants.delete(userId);
        this.runIdByUserId.delete(userId);
    }

    private disposeRun(run: InstanceRun): void {
        if (!this.runs.delete(run.id)) return;
        this.openRunByGate.delete(run.sourceGate);
        for (const [userId, participant] of run.participants) {
            this.clearWitchEffects(participant.player);
            if (!participant.player.isDefeated && run.roomIdSet.has(participant.player.locationId)) {
                participant.player.locationId = participant.originLocationId;
            }
            this.runIdByUserId.delete(userId);
        }
        run.participants.clear();
        run.roomIds.forEach(removeRuntimeLocation);
    }

    private sendToRun(run: InstanceRun, message: string): void {
        const userIds = [...run.participants.values()]
            .filter(participant => participant.player.isWorldActive)
            .map(participant => participant.player.userId);
        if (userIds.length > 0) sendBotMessageToUsers(userIds, message);
    }

    private reject(player: Player, reason: string): InstanceDungeonEntryResult {
        sendBotMessageToUser(player.userId, reason);
        return { entered: false, reason };
    }
}

export const instanceDungeonManager = new InstanceDungeonManager();

let initialized = false;
export function initInstanceDungeons(): void {
    if (initialized) return;
    initialized = true;
    registerConnectionCondition(INSTANCE_ROOM_CLEAR_CONDITION, player => instanceDungeonManager.canAdvance(player)
        ? 'visible'
        : { status: 'locked', publicReason: '이 방의 균열 개체를 모두 쓰러뜨려야 합니다.' });
    subscribeGameEvent(GameEventIds.ENTITY_DEFEATED, event => {
        if (event.subject instanceof Monster) instanceDungeonManager.handleMonsterDefeated(event.subject);
    });
}

export function updateInstanceDungeons(now = Date.now()): void {
    instanceDungeonManager.update(now);
}
