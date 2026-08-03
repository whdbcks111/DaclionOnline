import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import {
    createAlchemyTrackingProof,
    getAlchemyTrackingTargetPosition,
    type AlchemyTrackingConfig,
} from '../../../shared/minigames.js';
import { GameTags } from '../../../shared/tags.js';
import '../data/items.js';
import '../data/tagEffects.js';
import '../data/statusEffects.js';
import '../data/alchemy.js';
import {
    ALCHEMIST_JOB_ID,
    ALCHEMY_WATER_BOTTLE_ITEM_ID,
    AlchemyDelivery,
    createAlchemyPotionSnapshot,
    getAlchemyFormula,
} from '../models/Alchemy.js';
import Entity, { type AttackOptions } from '../models/Entity.js';
import Equipment from '../models/Equipment.js';
import Inventory from '../models/Inventory.js';
import { ItemMetadataKeys } from '../models/Item.js';
import { defineLocation, getLocation } from '../models/Location.js';
import Monster, { defineMonster } from '../models/Monster.js';
import type Player from '../models/Player.js';
import Stat from '../models/Stat.js';
import {
    createAlchemyTrackingConfig,
    resolveAlchemyPotionTargets,
    startAlchemy,
    useAlchemyPotion,
} from './alchemy.js';
import { createSession, removeSession, setUserOffline, setUserOnline } from './login.js';
import {
    cancelMiniGame,
    failMiniGameOnDisconnect,
    readyMiniGame,
    submitMiniGameResult,
} from './minigame.js';
import { partyManager } from './party.js';
import { registerOnlinePlayer, unregisterOnlinePlayer } from './playerRegistry.js';
import { getIO, initSocket } from './socket.js';

const LOCATION_ID = 'alchemy-authority-test';
const INSECT_MONSTER_ID = 'alchemy-authority-insect';
const NEUTRAL_MONSTER_ID = 'alchemy-authority-neutral';

defineMonster({
    id: INSECT_MONSTER_ID,
    name: '연금 벌레 표적',
    description: '독 상성 조제약 통합 시험 표적',
    level: 1,
    exp: 0,
    baseAttribute: { maxLife: 2_000, def: 0, magicDef: 0, speed: 1 },
    drops: [],
    expReward: 0,
    goldReward: 0,
    equipments: [],
    tags: [GameTags.PROPERTY_INSECT],
});

defineMonster({
    id: NEUTRAL_MONSTER_ID,
    name: '연금 중립 표적',
    description: '독 상성 조제약 통합 시험 중립 표적',
    level: 1,
    exp: 0,
    baseAttribute: { maxLife: 2_000, def: 0, magicDef: 0, speed: 1 },
    drops: [],
    expReward: 0,
    goldReward: 0,
    equipments: [],
    tags: [],
});

defineLocation({
    id: LOCATION_ID,
    name: '연금술 권한 시험장',
    zoneType: 'hostile',
    x: 0,
    y: 0,
    z: 0,
    npcIds: [],
    objects: [],
    connections: [],
    tags: [],
});

const httpServer = createServer();
initSocket(httpServer, 'http://localhost');
test.after(() => { getIO().close(); });

class TestAlchemyPlayer extends Entity {
    override readonly name: string;
    readonly inventory: Inventory;
    readonly stat = new Stat({ sensibility: 240 });
    readonly career: { hasJob: (jobId: string) => boolean };
    lastAttackOptions: AttackOptions | undefined;
    rejectNextAttack = false;

    constructor(readonly userId: number, locationId = LOCATION_ID, alchemist = true) {
        super(200, 0, locationId, {
            maxLife: 2_000,
            maxMentality: 1_000,
            atk: 100,
            magicForce: 100,
            def: 0,
            magicDef: 0,
            speed: 1,
        }, Equipment.createEmpty(), undefined, [GameTags.ENTITY_PLAYER, GameTags.TRAIT_LIVING]);
        this.name = `연금 시험자 ${userId}`;
        this.inventory = Inventory.createEmpty(userId, 100_000);
        this.career = { hasJob: jobId => alchemist && jobId === ALCHEMIST_JOB_ID };
    }

    override get isPlayer(): boolean { return true; }
    override get playerUserId(): number { return this.userId; }
    getExperienceGainModifier(): number { return 1; }
    gainExp(): number[] { return []; }

    override attack(...args: Parameters<Entity['attack']>): ReturnType<Entity['attack']> {
        this.lastAttackOptions = args[3];
        if (this.rejectNextAttack) {
            this.rejectNextAttack = false;
            return null;
        }
        return super.attack(...args);
    }
}

function asPlayer(player: TestAlchemyPlayer): Player {
    return player as unknown as Player;
}

function addLifeIngredients(player: TestAlchemyPlayer): void {
    player.inventory.addItem('mourning_lily', 2);
    player.inventory.addItem('oasis_date', 1);
    player.inventory.addItem(ALCHEMY_WATER_BOTTLE_ITEM_ID, 1);
}

function lifeAlchemyOptions() {
    return {
        bottleCount: 1,
        delivery: AlchemyDelivery.DRINK,
        ingredients: [
            { itemDataId: 'mourning_lily', count: 2 },
            { itemDataId: 'oasis_date', count: 1 },
        ],
    } as const;
}

function trackingInputs(config: AlchemyTrackingConfig, elapsedMs: number) {
    return Array.from({ length: Math.floor(elapsedMs / 20) + 1 }, (_, index) => {
        const at = index * 20;
        const target = getAlchemyTrackingTargetPosition(config, Math.min(elapsedMs, at + 20));
        return { at, x: target.x, y: target.y, dragging: true };
    });
}

function addPotion(
    player: TestAlchemyPlayer,
    formulaId: string,
    delivery: AlchemyDelivery,
) {
    const formula = getAlchemyFormula(formulaId)!;
    const snapshot = createAlchemyPotionSnapshot({
        formula,
        delivery,
        bottleCount: 1,
        accuracy: 0.82,
        sensibility: 240,
    });
    assert.equal(player.inventory.addItemSnapshot(snapshot), true);
    return player.inventory.getFirstItemByData(snapshot.itemDataId)!;
}

test('연금술은 ready 전 취소에는 재료를 보존하고 최초 ready에서만 비용을 확정한다', async () => {
    const player = new TestAlchemyPlayer(78_101);
    addLifeIngredients(player);
    const idle = startAlchemy(asPlayer(player), lifeAlchemyOptions());
    assert.equal(idle.success, true, idle.reason);
    assert.ok(idle.miniGame);
    assert.equal(cancelMiniGame(player.userId, '시작 전 취소 시험'), true);
    assert.equal(player.inventory.getCount('mourning_lily'), 2);
    assert.equal(player.inventory.getCount('oasis_date'), 1);
    assert.equal(player.inventory.getCount(ALCHEMY_WATER_BOTTLE_ITEM_ID), 1);

    const running = startAlchemy(asPlayer(player), lifeAlchemyOptions());
    assert.ok(running.miniGame);
    assert.equal(readyMiniGame(player.userId, 'alchemy-cost-socket', running.miniGame), true);
    assert.equal(player.inventory.getCount('mourning_lily'), 0);
    assert.equal(player.inventory.getCount('oasis_date'), 0);
    assert.equal(player.inventory.getCount(ALCHEMY_WATER_BOTTLE_ITEM_ID), 0);
    assert.equal(player.inventory.removeItemByData('mourning_lily', 1), false);

    assert.equal(await failMiniGameOnDisconnect(player.userId, 'alchemy-cost-socket'), true);
    assert.equal(player.inventory.getCount('alchemy_life_draught'), 0);
    assert.equal(player.inventory.getCount(ALCHEMY_WATER_BOTTLE_ITEM_ID), 0);
});

test('ready에서 확정한 재료는 성공 결과를 정확히 한 번만 지급한다', async () => {
    const player = new TestAlchemyPlayer(78_102);
    addLifeIngredients(player);
    const started = startAlchemy(asPlayer(player), lifeAlchemyOptions());
    assert.ok(started.miniGame && started.miniGame.type === 'alchemy_tracking');
    const config = started.miniGame.config as AlchemyTrackingConfig;
    const elapsedMs = 7_000;
    const proof = createAlchemyTrackingProof(config, trackingInputs(config, elapsedMs), elapsedMs);
    assert.equal(proof.success, true);
    const socketId = 'alchemy-success-socket';
    assert.equal(readyMiniGame(
        player.userId,
        socketId,
        started.miniGame,
        Date.now() - elapsedMs,
    ), true);
    assert.equal(submitMiniGameResult(player.userId, socketId, {
        ...started.miniGame,
        alchemyTrackingProof: proof,
    }), true);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(player.inventory.getCount('alchemy_life_draught'), 1);
    assert.equal(submitMiniGameResult(player.userId, socketId, {
        ...started.miniGame,
        alchemyTrackingProof: proof,
    }), false);
    assert.equal(player.inventory.getCount('alchemy_life_draught'), 1);
});

test('성공 결과가 중량 때문에 인벤토리에 들어가지 않으면 현재 위치 바닥에 보존한다', async () => {
    const player = new TestAlchemyPlayer(78_103);
    addLifeIngredients(player);
    const started = startAlchemy(asPlayer(player), lifeAlchemyOptions());
    assert.ok(started.miniGame && started.miniGame.type === 'alchemy_tracking');
    const config = started.miniGame.config as AlchemyTrackingConfig;
    const elapsedMs = 7_000;
    const proof = createAlchemyTrackingProof(config, trackingInputs(config, elapsedMs), elapsedMs);
    assert.equal(proof.success, true);
    const socketId = 'alchemy-overweight-socket';
    assert.equal(readyMiniGame(
        player.userId,
        socketId,
        started.miniGame,
        Date.now() - elapsedMs,
    ), true);
    const location = getLocation(LOCATION_ID)!;
    const droppedBefore = location.getDroppedItems()
        .filter(item => item.itemDataId === 'alchemy_life_draught').length;
    player.inventory.maxWeight = 0;
    assert.equal(submitMiniGameResult(player.userId, socketId, {
        ...started.miniGame,
        alchemyTrackingProof: proof,
    }), true);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(player.inventory.getCount('alchemy_life_draught'), 0);
    const dropped = location.getDroppedItems().filter(item => item.itemDataId === 'alchemy_life_draught');
    assert.equal(dropped.length, droppedBefore + 1);
    assert.equal(dropped.at(-1)?.count, 1);
});

test('회복 투척약은 현재 지정한 같은 장소 파티원을 우선하고 비파티·타 장소 대상을 거부한다', () => {
    const source = new TestAlchemyPlayer(78_110);
    const ally = new TestAlchemyPlayer(78_111);
    const outsider = new TestAlchemyPlayer(78_112);
    const tokens = [source, ally, outsider].map(player => createSession({
        id: player.userId,
        username: `alchemy_${player.userId}`,
        nickname: player.name,
    }));
    for (const player of [source, ally, outsider]) {
        registerOnlinePlayer(asPlayer(player));
        setUserOnline(player.userId, `alchemy-online-${player.userId}`);
    }
    try {
        assert.equal(partyManager.invite(asPlayer(source), asPlayer(ally)).success, true);
        assert.equal(partyManager.accept(asPlayer(ally)).success, true);
        source.currentTarget = ally;
        const partyTargets = resolveAlchemyPotionTargets(asPlayer(source), 'beneficial', 3);
        assert.equal(partyTargets.reason, undefined);
        assert.equal(partyTargets.targets[0], ally);
        assert.ok(partyTargets.targets.includes(source as unknown as Player));
        assert.ok(!partyTargets.targets.includes(outsider as unknown as Player));

        source.currentTarget = outsider;
        assert.match(resolveAlchemyPotionTargets(asPlayer(source), 'beneficial', 3).reason ?? '', /파티원/);
        source.currentTarget = ally;
        ally.locationId = 'alchemy-other-location';
        assert.match(resolveAlchemyPotionTargets(asPlayer(source), 'beneficial', 3).reason ?? '', /같은 장소/);
        ally.locationId = LOCATION_ID;

        source.life = 100;
        ally.life = 100;
        const potion = addPotion(source, 'life-restoration', AlchemyDelivery.THROW);
        let finished = 0;
        useAlchemyPotion(source.inventory, potion, () => { finished++; });
        assert.equal(finished, 1);
        assert.ok(source.life > 100);
        assert.ok(ally.life > 100);
        assert.equal(source.inventory.getCount('alchemy_life_draught'), 0);
    } finally {
        partyManager.leave(asPlayer(source));
        for (const player of [source, ally, outsider]) {
            unregisterOnlinePlayer(player.userId);
            setUserOffline(player.userId, `alchemy-online-${player.userId}`);
        }
        for (const token of tokens) removeSession(token);
    }
});

test('독성 투척은 몬스터 대상·독 상성·소모품 공격 옵션을 검증하고 취소된 공격은 약을 돌려준다', () => {
    const location = getLocation(LOCATION_ID)!;
    const insect = new Monster(INSECT_MONSTER_ID, LOCATION_ID, 30);
    location.addObject(insect);
    const insectSource = new TestAlchemyPlayer(78_120);
    registerOnlinePlayer(asPlayer(insectSource));
    try {
        insectSource.currentTarget = insect;
        assert.equal(resolveAlchemyPotionTargets(asPlayer(insectSource), 'harmful', 5).targets[0], insect);
        const potion = addPotion(insectSource, 'toxic', AlchemyDelivery.THROW);
        const insectLifeBefore = insect.life;
        useAlchemyPotion(insectSource.inventory, potion, () => undefined);
        const insectDamage = insectLifeBefore - insect.life;
        assert.ok(insectDamage > 0);
        assert.equal(insect.hasStatusEffect('poison'), true);
        assert.deepEqual(insectSource.lastAttackOptions, {
            criticalRate: 0,
            criticalDamage: 1,
            consumeMainHandDurability: false,
            triggerMainHandHitEffects: false,
            effectTags: [GameTags.PROPERTY_POISON],
            unavoidable: true,
        });
        assert.equal(insect.lastDamageCause?.critical, false);
        assert.equal(insect.lastDamageCause?.effectSource?.hasTag(GameTags.PROPERTY_POISON), true);
        location.removeObject(insect);

        const neutral = new Monster(NEUTRAL_MONSTER_ID, LOCATION_ID, 30);
        location.addObject(neutral);
        const neutralSource = new TestAlchemyPlayer(78_121);
        registerOnlinePlayer(asPlayer(neutralSource));
        neutralSource.currentTarget = neutral;
        const neutralPotion = addPotion(neutralSource, 'toxic', AlchemyDelivery.THROW);
        const neutralLifeBefore = neutral.life;
        useAlchemyPotion(neutralSource.inventory, neutralPotion, () => undefined);
        const neutralDamage = neutralLifeBefore - neutral.life;
        assert.ok(insectDamage > neutralDamage * 1.4, `${insectDamage} > ${neutralDamage} * 1.4`);
        location.removeObject(neutral);
        unregisterOnlinePlayer(neutralSource.userId);

        const cancelledTarget = new Monster(NEUTRAL_MONSTER_ID, LOCATION_ID, 30);
        location.addObject(cancelledTarget);
        const cancelledSource = new TestAlchemyPlayer(78_122);
        registerOnlinePlayer(asPlayer(cancelledSource));
        cancelledSource.currentTarget = cancelledTarget;
        cancelledSource.rejectNextAttack = true;
        const cancelledPotion = addPotion(cancelledSource, 'toxic', AlchemyDelivery.THROW);
        const cancelledLife = cancelledTarget.life;
        useAlchemyPotion(cancelledSource.inventory, cancelledPotion, () => undefined);
        assert.equal(cancelledTarget.life, cancelledLife);
        assert.equal(cancelledSource.inventory.getCount('alchemy_toxic_flask'), 1);
        location.removeObject(cancelledTarget);
        unregisterOnlinePlayer(cancelledSource.userId);
    } finally {
        location.removeObject(insect);
        unregisterOnlinePlayer(insectSource.userId);
    }
});

test('독성 조제약 음용은 자기 공격 경로 없이 자신에게 독 피해와 상태를 적용한다', () => {
    const player = new TestAlchemyPlayer(78_130);
    registerOnlinePlayer(asPlayer(player));
    try {
        const potion = addPotion(player, 'toxic', AlchemyDelivery.DRINK);
        const lifeBefore = player.life;
        useAlchemyPotion(player.inventory, potion, () => undefined);
        assert.ok(player.life < lifeBefore);
        assert.equal(player.hasStatusEffect('poison'), true);
        assert.equal(player.lastAttackOptions, undefined);
        assert.equal(player.lastDamageCause?.effectSource?.hasTag(GameTags.PROPERTY_POISON), true);
        assert.equal(player.inventory.getCount('alchemy_toxic_flask'), 0);
    } finally {
        unregisterOnlinePlayer(player.userId);
    }
});

test('위변조된 조제약 metadata는 효과 없이 거부하고 아이템을 소비하지 않는다', () => {
    const player = new TestAlchemyPlayer(78_131);
    registerOnlinePlayer(asPlayer(player));
    try {
        const potion = addPotion(player, 'life-restoration', AlchemyDelivery.DRINK);
        const metadata = JSON.parse(JSON.stringify(
            potion.getMetadata(ItemMetadataKeys.ALCHEMY),
        )) as Record<string, any>;
        metadata.effect.power = 999_999;
        potion.setMetadata(ItemMetadataKeys.ALCHEMY, metadata);
        player.life = 100;
        useAlchemyPotion(player.inventory, potion, () => undefined);
        assert.equal(player.life, 100);
        assert.equal(player.inventory.getCount('alchemy_life_draught'), 1);
    } finally {
        unregisterOnlinePlayer(player.userId);
    }
});

test('미등록·사망·다른 장소 몬스터는 독성 투척 대상으로 확정하지 않는다', () => {
    const location = getLocation(LOCATION_ID)!;
    const source = new TestAlchemyPlayer(78_140);
    const target = new Monster(NEUTRAL_MONSTER_ID, LOCATION_ID, 30);
    source.currentTarget = target;
    assert.match(resolveAlchemyPotionTargets(asPlayer(source), 'harmful', 2).reason ?? '', /현재 장소/);
    location.addObject(target);
    target.locationId = 'alchemy-other-location';
    assert.match(resolveAlchemyPotionTargets(asPlayer(source), 'harmful', 2).reason ?? '', /현재 장소/);
    target.locationId = LOCATION_ID;
    target.life = 0;
    assert.match(resolveAlchemyPotionTargets(asPlayer(source), 'harmful', 2).reason ?? '', /살아 있는/);
    location.removeObject(target);
});

test('추적 config는 공개 조합식과 동일한 모바일 목표 반경을 사용한다', () => {
    const formula = getAlchemyFormula('life-restoration')!;
    const config = createAlchemyTrackingConfig(formula, formula.ingredients, 1);
    assert.ok(config.targetRadius >= 4.5 && config.targetRadius <= 6);
});
