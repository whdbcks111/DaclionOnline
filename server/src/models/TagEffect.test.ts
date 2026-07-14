import test from 'node:test'
import assert from 'node:assert/strict'
import { GameTags, TagCollection } from '../../../shared/tags.js'
import '../data/tagEffects.js'
import { applyTagEffectValue, resolveTagEffect } from './TagEffect.js'

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
