import { GameTags } from '../../../shared/tags.js'
import { defineTagEffectModifier, defineTagEffectTagDisplay } from '../models/TagEffect.js'

defineTagEffectTagDisplay(GameTags.PROPERTY_FIRE, '불', 'affinities/fire')
defineTagEffectTagDisplay(GameTags.PROPERTY_WATER, '물', 'affinities/water')
defineTagEffectTagDisplay(GameTags.PROPERTY_ICE, '얼음', 'affinities/ice')
defineTagEffectTagDisplay(GameTags.PROPERTY_NATURAL, '자연', 'affinities/natural')
defineTagEffectTagDisplay(GameTags.PROPERTY_POISON, '독', 'affinities/poison')
defineTagEffectTagDisplay(GameTags.PROPERTY_ELECTRIC, '전기', 'affinities/electric')
defineTagEffectTagDisplay(GameTags.PROPERTY_STONE, '돌', 'affinities/stone')
defineTagEffectTagDisplay(GameTags.PROPERTY_DARK, '어둠', 'affinities/dark')
defineTagEffectTagDisplay(GameTags.PROPERTY_LIGHT, '빛', 'affinities/light')
defineTagEffectTagDisplay(GameTags.PROPERTY_UNDEAD, '언데드', 'affinities/undead')
defineTagEffectTagDisplay(GameTags.PROPERTY_HOLY, '신성', 'affinities/holy')
defineTagEffectTagDisplay(GameTags.PROPERTY_INSECT, '벌레', 'affinities/insect')
defineTagEffectTagDisplay(GameTags.PROPERTY_METAL, '금속', 'affinities/metal')
defineTagEffectTagDisplay(GameTags.PROPERTY_EARTH, '땅', 'affinities/earth')
defineTagEffectTagDisplay(GameTags.TRAIT_INANIMATE, '무생물', 'affinities/inanimate')

// 모든 규칙은 단방향이다. 반대 방향은 필요한 경우 별도로 정의한다.
defineTagEffectModifier(GameTags.PROPERTY_POISON, GameTags.TRAIT_INANIMATE, 0)

defineTagEffectModifier(GameTags.PROPERTY_FIRE, GameTags.PROPERTY_WATER, 0.5)
defineTagEffectModifier(GameTags.PROPERTY_FIRE, GameTags.PROPERTY_ICE, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_FIRE, GameTags.PROPERTY_NATURAL, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_FIRE, GameTags.PROPERTY_INSECT, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_FIRE, GameTags.PROPERTY_METAL, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_FIRE, GameTags.PROPERTY_STONE, 0.5)
defineTagEffectModifier(GameTags.PROPERTY_FIRE, GameTags.PROPERTY_EARTH, 0.5)

defineTagEffectModifier(GameTags.PROPERTY_WATER, GameTags.PROPERTY_FIRE, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_WATER, GameTags.PROPERTY_ICE, 0.5)
defineTagEffectModifier(GameTags.PROPERTY_WATER, GameTags.PROPERTY_STONE, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_WATER, GameTags.PROPERTY_EARTH, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_WATER, GameTags.PROPERTY_ELECTRIC, 0.5)
defineTagEffectModifier(GameTags.PROPERTY_WATER, GameTags.PROPERTY_NATURAL, 0.5)

defineTagEffectModifier(GameTags.PROPERTY_ICE, GameTags.PROPERTY_FIRE, 0.5)
defineTagEffectModifier(GameTags.PROPERTY_ICE, GameTags.PROPERTY_WATER, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_ICE, GameTags.PROPERTY_NATURAL, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_ICE, GameTags.PROPERTY_INSECT, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_ICE, GameTags.PROPERTY_STONE, 0.5)
defineTagEffectModifier(GameTags.PROPERTY_ICE, GameTags.PROPERTY_METAL, 0.5)

defineTagEffectModifier(GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_WATER, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_FIRE, 0.5)
defineTagEffectModifier(GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_STONE, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_EARTH, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_UNDEAD, 0.5)
defineTagEffectModifier(GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_INSECT, 0.5)
defineTagEffectModifier(GameTags.PROPERTY_NATURAL, GameTags.PROPERTY_METAL, 0.5)

defineTagEffectModifier(GameTags.PROPERTY_POISON, GameTags.PROPERTY_UNDEAD, 0)
defineTagEffectModifier(GameTags.PROPERTY_POISON, GameTags.PROPERTY_INSECT, 1.5)

defineTagEffectModifier(GameTags.PROPERTY_ELECTRIC, GameTags.PROPERTY_WATER, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_ELECTRIC, GameTags.PROPERTY_METAL, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_ELECTRIC, GameTags.PROPERTY_STONE, 0.5)
defineTagEffectModifier(GameTags.PROPERTY_ELECTRIC, GameTags.PROPERTY_EARTH, 0)

defineTagEffectModifier(GameTags.PROPERTY_STONE, GameTags.PROPERTY_FIRE, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_STONE, GameTags.PROPERTY_ICE, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_STONE, GameTags.PROPERTY_INSECT, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_STONE, GameTags.PROPERTY_WATER, 0.5)
defineTagEffectModifier(GameTags.PROPERTY_STONE, GameTags.PROPERTY_NATURAL, 0.5)
defineTagEffectModifier(GameTags.PROPERTY_STONE, GameTags.PROPERTY_METAL, 0.5)

defineTagEffectModifier(GameTags.PROPERTY_DARK, GameTags.PROPERTY_LIGHT, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_DARK, GameTags.PROPERTY_UNDEAD, 0.5)
defineTagEffectModifier(GameTags.PROPERTY_DARK, GameTags.PROPERTY_HOLY, 0.5)

defineTagEffectModifier(GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_DARK, 1.5)

defineTagEffectModifier(GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_NATURAL, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_LIGHT, 0.5)
defineTagEffectModifier(GameTags.PROPERTY_UNDEAD, GameTags.PROPERTY_HOLY, 0.5)

defineTagEffectModifier(GameTags.PROPERTY_HOLY, GameTags.PROPERTY_DARK, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_HOLY, GameTags.PROPERTY_UNDEAD, 1.5)

defineTagEffectModifier(GameTags.PROPERTY_INSECT, GameTags.PROPERTY_NATURAL, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_INSECT, GameTags.PROPERTY_FIRE, 0.5)
defineTagEffectModifier(GameTags.PROPERTY_INSECT, GameTags.PROPERTY_POISON, 0.5)
defineTagEffectModifier(GameTags.PROPERTY_INSECT, GameTags.PROPERTY_STONE, 0.5)

defineTagEffectModifier(GameTags.PROPERTY_METAL, GameTags.PROPERTY_ICE, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_METAL, GameTags.PROPERTY_NATURAL, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_METAL, GameTags.PROPERTY_STONE, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_METAL, GameTags.PROPERTY_FIRE, 0.5)
defineTagEffectModifier(GameTags.PROPERTY_METAL, GameTags.PROPERTY_ELECTRIC, 0.5)
defineTagEffectModifier(GameTags.PROPERTY_METAL, GameTags.PROPERTY_EARTH, 0.5)

defineTagEffectModifier(GameTags.PROPERTY_EARTH, GameTags.PROPERTY_ELECTRIC, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_EARTH, GameTags.PROPERTY_METAL, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_EARTH, GameTags.PROPERTY_FIRE, 1.5)
defineTagEffectModifier(GameTags.PROPERTY_EARTH, GameTags.PROPERTY_WATER, 0.5)
defineTagEffectModifier(GameTags.PROPERTY_EARTH, GameTags.PROPERTY_NATURAL, 0.5)
