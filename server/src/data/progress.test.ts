import assert from 'node:assert/strict';
import test from 'node:test';
import Entity from '../models/Entity.js';
import Equipment from '../models/Equipment.js';
import { emitGameEvent, GameEventIds } from '../models/GameEvent.js';
import { getProgressDefinition, PlayerProgress } from '../models/Progress.js';
import { getTagEffectTagDisplay } from '../models/TagEffect.js';
import { GameTags } from '../../../shared/tags.js';
import './progress.js';

const ELEMENT_KILL_STATISTICS = [
    { id: 'career:mage_fire_kills', tag: GameTags.PROPERTY_FIRE, label: '불 속성 몬스터 처치' },
    { id: 'career:mage_ice_kills', tag: GameTags.PROPERTY_ICE, label: '얼음 속성 몬스터 처치' },
    { id: 'career:mage_electric_kills', tag: GameTags.PROPERTY_ELECTRIC, label: '전기 속성 몬스터 처치' },
    { id: 'combat:property_kills/water', tag: GameTags.PROPERTY_WATER, label: '물 속성 몬스터 처치' },
    { id: 'combat:property_kills/natural', tag: GameTags.PROPERTY_NATURAL, label: '자연 속성 몬스터 처치' },
    { id: 'combat:property_kills/poison', tag: GameTags.PROPERTY_POISON, label: '독 속성 몬스터 처치' },
    { id: 'combat:property_kills/stone', tag: GameTags.PROPERTY_STONE, label: '돌 속성 몬스터 처치' },
    { id: 'combat:property_kills/dark', tag: GameTags.PROPERTY_DARK, label: '어둠 속성 몬스터 처치' },
    { id: 'combat:property_kills/light', tag: GameTags.PROPERTY_LIGHT, label: '빛 속성 몬스터 처치' },
    { id: 'combat:property_kills/undead', tag: GameTags.PROPERTY_UNDEAD, label: '언데드 속성 몬스터 처치' },
    { id: 'combat:property_kills/holy', tag: GameTags.PROPERTY_HOLY, label: '신성 속성 몬스터 처치' },
    { id: 'combat:property_kills/insect', tag: GameTags.PROPERTY_INSECT, label: '벌레 속성 몬스터 처치' },
    { id: 'combat:property_kills/metal', tag: GameTags.PROPERTY_METAL, label: '금속 속성 몬스터 처치' },
    { id: 'combat:property_kills/earth', tag: GameTags.PROPERTY_EARTH, label: '땅 속성 몬스터 처치' },
] as const;

class StatisticPlayer extends Entity {
    override readonly name = '속성 통계 시험 플레이어';
    readonly progress: PlayerProgress;

    constructor(userId: number, tags: readonly string[] = []) {
        super(1, 0, 'test', { maxLife: 100 }, Equipment.createEmpty(), undefined, tags);
        this.progress = PlayerProgress.createEmpty(userId);
    }

    override get isPlayer(): boolean { return true; }
    override get playerUserId(): number { return this.progress.playerId; }
}

class StatisticTarget extends Entity {
    override readonly name = '속성 통계 시험 대상';

    constructor(tags: readonly string[]) {
        super(1, 0, 'test', { maxLife: 100 }, Equipment.createEmpty(), undefined, tags);
    }
}

test('14종 속성 처치 통계가 기존 ID를 보존한 공개 통계로 등록된다', () => {
    const progress = PlayerProgress.createEmpty(9_001);
    const publicSnapshots = new Map(
        progress.getSnapshots(true).map(snapshot => [snapshot.id, snapshot]),
    );

    for (const statistic of ELEMENT_KILL_STATISTICS) {
        const definition = getProgressDefinition(statistic.id);
        const display = getTagEffectTagDisplay(statistic.tag);
        assert.ok(definition, statistic.id);
        assert.ok(display, statistic.tag);
        assert.equal(definition.visible, true, statistic.id);
        assert.equal(definition.label, statistic.label, statistic.id);
        assert.deepEqual(definition.tags, [statistic.tag], statistic.id);
        assert.equal(publicSnapshots.get(statistic.id)?.formattedValue, '0회', statistic.id);
        assert.equal(display.label, statistic.label.replace(' 속성 몬스터 처치', ''), statistic.tag);
        assert.match(display.icon, /^affinities\//, statistic.tag);
    }
});

test('권위적 처치 이벤트의 subject 속성 태그만 14종 통계를 각각 증가시킨다', () => {
    const player = new StatisticPlayer(9_002);

    for (const statistic of ELEMENT_KILL_STATISTICS) {
        emitGameEvent(GameEventIds.ENTITY_DEFEATED, {
            actor: player,
            subject: new StatisticTarget([GameTags.ENTITY_MONSTER, statistic.tag]),
        });
    }

    for (const statistic of ELEMENT_KILL_STATISTICS) {
        assert.equal(player.progress.getCounter(statistic.id), 1n, statistic.id);
    }
});

test('공격자 태그·비몬스터·다른 속성 subject는 해당 속성 처치로 집계하지 않는다', () => {
    for (const [index, statistic] of ELEMENT_KILL_STATISTICS.entries()) {
        const other = ELEMENT_KILL_STATISTICS[(index + 1) % ELEMENT_KILL_STATISTICS.length];
        const player = new StatisticPlayer(9_100 + index, [statistic.tag]);

        emitGameEvent(GameEventIds.ENTITY_DEFEATED, {
            actor: player,
            subject: new StatisticTarget([GameTags.ENTITY_MONSTER, other.tag]),
        });
        emitGameEvent(GameEventIds.ENTITY_DEFEATED, {
            actor: player,
            subject: new StatisticTarget([statistic.tag]),
        });

        assert.equal(player.progress.getCounter(statistic.id), 0n, statistic.id);
    }
});
