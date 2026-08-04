import assert from 'node:assert/strict';
import test from 'node:test';
import { GameTags } from '../../../shared/tags.js';
import '../data/ascendantFrontier.js';
import { ASCENDANT_REGIONS } from '../data/ascendantRegions.js';
import { AttributeType } from './Attribute.js';
import Entity, { getDamageCauseActorPlayerId } from './Entity.js';
import Equipment from './Equipment.js';
import { GameEventIds, subscribeAllGameEvents } from './GameEvent.js';
import {
    MAX_PERSISTED_STATUS_EFFECTS,
    StatusEffectPersistencePolicy,
    StatusEffectType,
    STATUS_EFFECT_PERSISTENCE_VERSION,
} from './StatusEffect.js';

class PersistenceEntity extends Entity {
    override readonly name: string;

    constructor(name: string, private readonly id?: number) {
        super(1, 0, 'persistence_test', { maxLife: 1_000, atk: 10 }, Equipment.createEmpty(), undefined,
            id ? [GameTags.ENTITY_PLAYER, GameTags.TRAIT_LIVING] : [GameTags.TRAIT_LIVING]);
        this.name = name;
    }

    override get isPlayer(): boolean { return this.id !== undefined; }
    override get playerUserId(): number | undefined { return this.id; }
}

let persistenceStarts = 0;
let persistenceUpdates = 0;
let persistenceRemoves = 0;
const PERSISTENCE_TEST_EFFECT = StatusEffectType.define({
    id: 'test_wall_clock_persistence',
    label: '영속 시험 효과',
    descriptionTemplate: '저장값 {{meta.persistedPower}}',
    baseMetadata: { persistedPower: 1 },
    persistenceMetadataKeys: ['persistedPower'],
    onStart: ({ target, effect }) => {
        persistenceStarts++;
        target.attribute.removeBySource('status:test-wall-clock');
        target.attribute.addModifier({
            attribute: AttributeType.ATK.key,
            op: 'add',
            value: effect.getMetadata<number>('persistedPower') ?? 1,
            source: 'status:test-wall-clock',
        });
    },
    onUpdate: () => { persistenceUpdates++; },
    onRemove: ({ target }) => {
        persistenceRemoves++;
        target.attribute.removeBySource('status:test-wall-clock');
    },
});

test('영속 정책은 클래스형 enum이며 일반 효과·파생 환경·복합 전투 효과를 구분한다', () => {
    assert.equal(StatusEffectPersistencePolicy.fromKey('wallClock'), StatusEffectPersistencePolicy.WALL_CLOCK);
    assert.equal(StatusEffectPersistencePolicy.fromInput('조건 재생성'), StatusEffectPersistencePolicy.DERIVED);
    assert.equal(PERSISTENCE_TEST_EFFECT.persistencePolicy, StatusEffectPersistencePolicy.WALL_CLOCK);
    assert.equal(StatusEffectType.HUNGER.persistencePolicy, StatusEffectPersistencePolicy.DERIVED);
    assert.equal(StatusEffectType.THIRST.persistencePolicy, StatusEffectPersistencePolicy.DERIVED);

    for (const region of ASCENDANT_REGIONS) {
        assert.equal(
            StatusEffectType.fromKey(region.environment.id)?.persistencePolicy,
            StatusEffectPersistencePolicy.DERIVED,
            region.environment.id,
        );
    }
    for (const id of ['wind_evasion', 'stealth', 'battle_rush', 'indomitable', 'mana_barrier', 'elemental_insight']) {
        assert.equal(StatusEffectType.fromKey(id)?.persistencePolicy, StatusEffectPersistencePolicy.COMBAT_TRANSIENT, id);
    }
});

test('snapshot은 절대 만료시각·허용 metadata·sourcePlayerId만 저장하고 modifier를 이벤트 없이 한 번 복원한다', () => {
    const now = 10_000;
    const source = new PersistenceEntity('효과 제공자', 71);
    const original = new PersistenceEntity('원본 대상', 72);
    persistenceStarts = 0;
    const effect = original.applyStatusEffect(PERSISTENCE_TEST_EFFECT, 120, 3, source).effect!;
    effect.setMetadata('persistedPower', 7);
    effect.setMetadata('unsafeRuntimeObject', { ignored: true });

    const snapshot = original.getStatusEffectPersistenceSnapshot(now);
    assert.deepEqual(snapshot, {
        version: STATUS_EFFECT_PERSISTENCE_VERSION,
        effects: [{
            id: PERSISTENCE_TEST_EFFECT.id,
            level: 3,
            expiresAtMs: 130_000,
            maxDuration: 120,
            metadata: { persistedPower: 7 },
            sourcePlayerId: 71,
        }],
    });

    const restored = new PersistenceEntity('복원 대상', 72);
    const events: string[] = [];
    const unsubscribe = subscribeAllGameEvents(event => {
        if (event.subject === restored && event.id.startsWith('status_effect:')) events.push(event.id);
    });
    const result = restored.restoreStatusEffectPersistenceSnapshot(snapshot, now + 10_000);
    unsubscribe();

    assert.deepEqual(result, { restored: 1, rejected: 0, expired: 0 });
    assert.equal(persistenceStarts, 2);
    assert.equal(restored.getStatusEffect(PERSISTENCE_TEST_EFFECT)?.duration, 110);
    assert.equal(restored.getStatusEffect(PERSISTENCE_TEST_EFFECT)?.maxDuration, 120);
    assert.equal(restored.getStatusEffect(PERSISTENCE_TEST_EFFECT)?.getMetadata('persistedPower'), 7);
    assert.equal(restored.getStatusEffect(PERSISTENCE_TEST_EFFECT)?.source, undefined);
    assert.equal(restored.getStatusEffect(PERSISTENCE_TEST_EFFECT)?.sourcePlayerId, 71);
    assert.equal(restored.attribute.get(AttributeType.ATK), 17);
    assert.deepEqual(events, []);
});

test('복원된 지속 피해는 raw source 없이 실제 피해 DamageCause에 sourcePlayerId를 남긴다', () => {
    const now = 30_000;
    const target = new PersistenceEntity('지속 피해 복원 대상');
    assert.deepEqual(target.restoreStatusEffectPersistenceSnapshot({
        version: STATUS_EFFECT_PERSISTENCE_VERSION,
        effects: [{
            id: StatusEffectType.FIRE.id,
            level: 1,
            expiresAtMs: now + 5_000,
            maxDuration: 5,
            sourcePlayerId: 71,
        }],
    }, now), { restored: 1, rejected: 0, expired: 0 });

    target.updateStatusEffects(1);

    assert.ok((target.lastDamageCause?.actorPlayerId ?? 0) > 0);
    assert.equal(target.lastDamageCause?.causeEntity, null);
    assert.equal(getDamageCauseActorPlayerId(target.lastDamageCause), 71);
    assert.ok(target.life < target.maxLife);
});

test('복원은 만료·unknown·파생·중복·허용되지 않은 metadata와 과대 envelope를 거부한다', () => {
    const now = 50_000;
    const valid = {
        id: PERSISTENCE_TEST_EFFECT.id,
        level: 2,
        expiresAtMs: now + 5_000,
        maxDuration: 5,
    };
    const target = new PersistenceEntity('오염 snapshot 대상', 73);
    const result = target.restoreStatusEffectPersistenceSnapshot({
        version: STATUS_EFFECT_PERSISTENCE_VERSION,
        effects: [
            valid,
            { ...valid },
            { ...valid, id: 'unknown_effect' },
            { ...valid, id: StatusEffectType.HUNGER.id },
            { ...valid, id: StatusEffectType.FIRE.id, metadata: { injected: 1 } },
            { ...valid, id: StatusEffectType.BURN.id, expiresAtMs: now },
        ],
    }, now);
    assert.deepEqual(result, { restored: 1, rejected: 4, expired: 1 });

    const oversized = Array.from({ length: MAX_PERSISTED_STATUS_EFFECTS + 1 }, () => valid);
    assert.deepEqual(
        new PersistenceEntity('과대 snapshot 대상').restoreStatusEffectPersistenceSnapshot({
            version: STATUS_EFFECT_PERSISTENCE_VERSION,
            effects: oversized,
        }, now),
        { restored: 0, rejected: 1, expired: 0 },
    );
    assert.deepEqual(
        new PersistenceEntity('버전 오류 대상').restoreStatusEffectPersistenceSnapshot({ version: 999, effects: [] }, now),
        { restored: 0, rejected: 1, expired: 0 },
    );
});

test('복원된 제어는 적용 이벤트와 CC 점감 charge를 만들지 않는다', () => {
    const now = 80_000;
    const stun = StatusEffectType.fromKey('stun')!;
    const sleep = StatusEffectType.fromKey('sleep')!;
    const target = new PersistenceEntity('제어 복원 대상', 74);
    const events: string[] = [];
    const unsubscribe = subscribeAllGameEvents(event => {
        if (event.subject === target && [
            GameEventIds.STATUS_EFFECT_APPLIED,
            GameEventIds.STATUS_EFFECT_UPDATED,
            GameEventIds.STATUS_EFFECT_REMOVED,
        ].includes(event.id as never)) events.push(event.id);
    });
    assert.deepEqual(target.restoreStatusEffectPersistenceSnapshot({
        version: STATUS_EFFECT_PERSISTENCE_VERSION,
        effects: [{ id: stun.id, level: 1, expiresAtMs: now + 2_000, maxDuration: 2 }],
    }, now), { restored: 1, rejected: 0, expired: 0 });
    unsubscribe();
    assert.deepEqual(events, []);

    target.removeStatusEffect(stun);
    assert.equal(target.applyStatusEffect(sleep, 10, 1).effect?.duration, 2);
});

test('오프라인 경과는 tick을 재생하지 않고 만료만 구조 변경으로 알리며 비영속 효과는 정상 정리한다', () => {
    const target = new PersistenceEntity('연결 종료 대상', 75);
    persistenceUpdates = 0;
    persistenceRemoves = 0;
    let changes = 0;
    target.setStatusEffectChangeHandler(() => { changes++; });

    target.applyStatusEffect(PERSISTENCE_TEST_EFFECT, 10, 1);
    assert.equal(changes, 1);
    assert.equal(target.elapseWallClockStatusEffects(3), 0);
    assert.equal(target.getStatusEffect(PERSISTENCE_TEST_EFFECT)?.duration, 7);
    assert.equal(persistenceUpdates, 0);
    assert.equal(changes, 1);
    assert.equal(target.elapseWallClockStatusEffects(7), 1);
    assert.equal(persistenceRemoves, 1);
    assert.equal(changes, 2);

    target.hungry = 0;
    target.applyStatusEffect(StatusEffectType.HUNGER, 86_400, 1);
    const manaBarrier = StatusEffectType.fromKey('mana_barrier')!;
    target.applyStatusEffect(manaBarrier, 10, 1);
    target.applyStatusEffect(StatusEffectType.BURN, 20, 1);
    const beforeRemoval = changes;
    assert.equal(target.removeNonPersistentStatusEffects(), 2);
    assert.equal(changes, beforeRemoval + 2);
    assert.equal(target.hasStatusEffect(StatusEffectType.HUNGER), false);
    assert.equal(target.hasStatusEffect(manaBarrier), false);
    assert.equal(target.hasStatusEffect(StatusEffectType.BURN), true);
    assert.deepEqual(
        target.getStatusEffectPersistenceSnapshot(100).effects.map(effect => effect.id),
        [StatusEffectType.BURN.id],
    );
});

test('사망은 WALL_CLOCK 효과도 정리해 이후 스냅샷에 남지 않게 한다', () => {
    const target = new PersistenceEntity('사망 정리 대상', 76);
    let changes = 0;
    target.setStatusEffectChangeHandler(() => { changes++; });
    target.applyStatusEffect(PERSISTENCE_TEST_EFFECT, 30, 1);

    assert.equal(target.getStatusEffectPersistenceSnapshot(100).effects.length, 1);
    assert.equal(changes, 1);

    target.onDeath();

    assert.equal(target.hasStatusEffect(PERSISTENCE_TEST_EFFECT), false);
    assert.deepEqual(target.getStatusEffectPersistenceSnapshot(200).effects, []);
    assert.equal(changes, 2);
});
