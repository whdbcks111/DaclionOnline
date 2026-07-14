import { GameTags } from '../../../shared/tags.js'
import { defineTagEffectModifier } from '../models/TagEffect.js'

// 모든 규칙은 단방향이다. 반대 방향은 필요한 경우 별도로 정의한다.
defineTagEffectModifier(GameTags.PROPERTY_POISON, GameTags.TRAIT_INANIMATE, 0)

defineTagEffectModifier(GameTags.PROPERTY_FIRE, GameTags.PROPERTY_WATER, 0.5)
defineTagEffectModifier(GameTags.PROPERTY_FIRE, GameTags.PROPERTY_ICE, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_FIRE, GameTags.PROPERTY_NATURAL, 1.5)

defineTagEffectModifier(GameTags.PROPERTY_WATER, GameTags.PROPERTY_FIRE, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_WATER, GameTags.PROPERTY_ICE, 0.5)

defineTagEffectModifier(GameTags.PROPERTY_ICE, GameTags.PROPERTY_FIRE, 0.5)
defineTagEffectModifier(GameTags.PROPERTY_ICE, GameTags.PROPERTY_WATER, 1.5)

defineTagEffectModifier(GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_WATER, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_FIRE, 0.5)
