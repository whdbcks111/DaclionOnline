import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { GameTags, TagCollection } from '../../../shared/tags.js'
import '../data/tagEffects.js'
import { applyTagEffectValue, getTagEffectAffinitySnapshots, resolveTagEffect } from './TagEffect.js'

test('단방향 상성 배율을 효과값에 적용한다', () => {
    const fire = new TagCollection({ definition: [GameTags.PROPERTY_FIRE] })
    const ice = new TagCollection({ definition: [GameTags.PROPERTY_ICE] })
    const water = new TagCollection({ definition: [GameTags.PROPERTY_WATER] })

    assert.equal(applyTagEffectValue(10, fire, ice).value, 15)
    assert.equal(applyTagEffectValue(10, fire, water).value, 5)
})

test('독 속성 효과는 무생물에게 무효다', () => {
    const poison = new TagCollection({ definition: [GameTags.PROPERTY_POISON] })
    const inanimate = new TagCollection({ definition: [GameTags.TRAIT_INANIMATE] })
    const result = applyTagEffectValue(10, poison, inanimate)

    assert.equal(result.modifier, 0)
    assert.equal(result.value, 0)
    assert.equal(result.effective, false)
})

test('복수 상성은 곱하지 않고 가장 낮은 단일 배율을 택한다', () => {
    const source = new TagCollection({
        definition: [GameTags.PROPERTY_FIRE, GameTags.PROPERTY_NATURAL],
    })
    const water = new TagCollection({ definition: [GameTags.PROPERTY_WATER] })

    assert.equal(resolveTagEffect(source, water).modifier, 0.5)
})

test('문맥 태그 API가 일반 장비 태그보다 공격·피격 판정에 우선한다', () => {
    const waterSource = {
        hasTag: (tag: string) => tag === GameTags.PROPERTY_WATER,
        hasEffectSourceTag: (tag: string) => tag === GameTags.PROPERTY_WATER,
    }
    const playerWithFireSword = {
        hasTag: (tag: string) => tag === GameTags.PROPERTY_FIRE,
        hasEffectTargetTag: () => false,
    }

    assert.equal(resolveTagEffect(waterSource, playerWithFireSword).modifier, 1)
})

test('속성표 snapshot은 모든 현재 속성의 아이콘과 단방향 공격·방어 관계를 제공한다', () => {
    const snapshots = getTagEffectAffinitySnapshots()
    const propertyTags = Object.values(GameTags).filter(tag => tag.startsWith('property:'))
    assert.ok(propertyTags.every(tag => snapshots.some(snapshot => snapshot.tag === tag && snapshot.icon)))
    for (const snapshot of snapshots) {
        const iconPath = fileURLToPath(new URL(`../../../client/public/icons/${snapshot.icon}.png`, import.meta.url))
        const png = readFileSync(iconPath)
        assert.equal(png.readUInt32BE(16), 128, `${snapshot.tag} 아이콘 너비`)
        assert.equal(png.readUInt32BE(20), 128, `${snapshot.tag} 아이콘 높이`)
        assert.equal(png[25], 6, `${snapshot.tag} 아이콘은 RGBA PNG여야 함`)
    }

    const fire = snapshots.find(snapshot => snapshot.tag === GameTags.PROPERTY_FIRE)!
    assert.ok(fire.attackAdvantages.some(relation => relation.tag === GameTags.PROPERTY_ICE))
    assert.ok(fire.attackAdvantages.some(relation => relation.tag === GameTags.PROPERTY_NATURAL))
    assert.ok(fire.attackDisadvantages.some(relation => relation.tag === GameTags.PROPERTY_WATER))
    assert.ok(fire.defenseVulnerabilities.some(relation => relation.tag === GameTags.PROPERTY_WATER))

    const poison = snapshots.find(snapshot => snapshot.tag === GameTags.PROPERTY_POISON)!
    const inanimate = snapshots.find(snapshot => snapshot.tag === GameTags.TRAIT_INANIMATE)!
    assert.deepEqual(poison.attackImmunities.map(relation => relation.tag), [
        GameTags.TRAIT_INANIMATE,
        GameTags.PROPERTY_UNDEAD,
    ])
    assert.deepEqual(inanimate.defenseImmunities.map(relation => relation.tag), [GameTags.PROPERTY_POISON])
})

test('신규 속성은 접지 면역과 신성·언데드 상성을 단방향으로 적용한다', () => {
    const electric = new TagCollection({ definition: [GameTags.PROPERTY_ELECTRIC] })
    const earth = new TagCollection({ definition: [GameTags.PROPERTY_EARTH] })
    const holy = new TagCollection({ definition: [GameTags.PROPERTY_HOLY] })
    const undead = new TagCollection({ definition: [GameTags.PROPERTY_UNDEAD] })
    const poison = new TagCollection({ definition: [GameTags.PROPERTY_POISON] })

    assert.equal(resolveTagEffect(electric, earth).modifier, 0)
    assert.equal(resolveTagEffect(earth, electric).modifier, 1.5)
    assert.equal(resolveTagEffect(holy, undead).modifier, 1.5)
    assert.equal(resolveTagEffect(undead, holy).modifier, 0.5)
    assert.equal(resolveTagEffect(poison, undead).modifier, 0)
})
