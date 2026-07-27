import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { GameTags } from '../../../shared/tags.js';
import '../data/statusEffects.js';
import '../data/items.js';
import { AttributeType } from './Attribute.js';
import Entity from './Entity.js';
import Equipment from './Equipment.js';
import { Item } from './Item.js';
import type Player from './Player.js';
import { registerOnlinePlayer, unregisterOnlinePlayer } from '../modules/playerRegistry.js';
import { initSocket } from '../modules/socket.js';

initSocket(createServer(), '*');

class SpecialEquipmentTarget extends Entity {
    override readonly name: string;

    constructor(name: string, maxLife = 1_000) {
        super(
            1,
            0,
            'special_equipment_test',
            { maxLife, atk: 100 },
            Equipment.createEmpty(),
            undefined,
            [GameTags.TRAIT_LIVING],
        );
        this.name = name;
    }
}

class KarmaEquipmentOwner extends SpecialEquipmentTarget {
    readonly userId: number;
    karma = 10;

    constructor(userId: number) {
        super('업식검 주인');
        this.userId = userId;
    }

    override get isPlayer(): boolean { return true; }
    override get playerUserId(): number { return this.userId; }

    reduceKarma(amount: number): { delta: number } {
        const previous = this.karma;
        this.karma = Math.max(0, this.karma - amount);
        return { delta: this.karma - previous };
    }

    addKarma(amount: number): { delta: number } {
        this.karma += Math.max(0, amount);
        return { delta: Math.max(0, amount) };
    }
}

test('회귀성운 갑주는 6시간에 한 번 치명적 피해를 막고 최대 생명력 30%로 되돌린다', () => {
    const attacker = new SpecialEquipmentTarget('공격자');
    const target = new SpecialEquipmentTarget('착용자');
    const armor = new Item('chronicle_revival_armor', 1, null, null);
    assert.equal(target.equipment.equip('body', armor, target.attribute), true);

    target.damage(target.maxLife * 2, 'absolute', {
        type: 'void',
        causeEntity: attacker,
        fixedDamage: true,
    });

    assert.equal(target.isDefeated, false);
    assert.equal(target.life, target.maxLife * 0.3);
    const availableAt = armor.getMetadata<number>('fatalReviveAvailableAt');
    assert.ok(availableAt && availableAt > Date.now() + 5.9 * 60 * 60 * 1_000);

    target.damage(target.maxLife * 2, 'absolute', {
        type: 'void',
        causeEntity: attacker,
        fixedDamage: true,
    });
    assert.equal(target.isDefeated, true);
});

test('성벽시위는 적중할 때마다 5초 방어력을 최대 5중첩까지 높인다', () => {
    const attacker = new SpecialEquipmentTarget('궁수');
    const target = new SpecialEquipmentTarget('표적');
    const bow = new Item('rampart_string_bow', 1, null, null);
    assert.equal(attacker.equipment.equip('mainHand', bow, attacker.attribute), true);
    const baseDefense = attacker.attribute.get(AttributeType.DEF);
    const result = attacker.attack(target, 'physical', 10, {
        unavoidable: true,
        fixedDamage: true,
        consumeMainHandDurability: false,
    });
    assert.ok(result);

    for (let hit = 1; hit < 5; hit++) {
        bow.data?.onBasicAttackHit?.({ attacker, target, weapon: bow, result: result! });
    }
    const guard = attacker.getStatusEffect('rampart_volley');
    assert.equal(guard?.level, 5);
    assert.equal(attacker.attribute.get(AttributeType.DEF), baseDefense + 350);

    attacker.earlyUpdate(5.1);
    assert.equal(attacker.hasStatusEffect('rampart_volley'), false);
    assert.equal(attacker.attribute.get(AttributeType.DEF), baseDefense);
});

test('업식검은 장착 중 흡수한 카르마의 절반과 7일 쇠약을 파괴 순간 주인에게 돌려준다', () => {
    const owner = new KarmaEquipmentOwner(98_701);
    const player = owner as unknown as Player;
    registerOnlinePlayer(player);

    try {
        const sword = new Item('karma_devourer_sword', 1, null, null);
        assert.equal(owner.equipment.equip('mainHand', sword, owner.attribute), true);

        owner.earlyUpdate(5);
        assert.ok(Math.abs(owner.karma - 9) < 0.000_001);
        assert.ok(Math.abs((sword.getMetadata<number>('absorbedKarma') ?? 0) - 1) < 0.000_001);

        assert.equal(
            owner.equipment.decreaseItemDurability('mainHand', 0, sword.durability ?? 0),
            0,
        );
        assert.ok(Math.abs(owner.karma - 9.5) < 0.000_001);
        assert.equal(owner.equipment.getEquipped('mainHand'), undefined);
        const curse = owner.getStatusEffect('curse');
        assert.equal(curse?.level, 10);
        assert.equal(curse?.duration, 7 * 24 * 60 * 60);
    } finally {
        unregisterOnlinePlayer(owner.userId);
    }
});
