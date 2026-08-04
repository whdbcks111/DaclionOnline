/// <reference types="node" />

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AUTO_ATTACK_HUD_ID,
  BASIC_ATTACK_HUD_ID,
  createDefaultSkillHudConfig,
} from './skillHudConfig.ts'

test('신규 전투 퀵 버튼은 자동공격을 포함해 기본 숨김이다', () => {
  assert.equal(createDefaultSkillHudConfig(BASIC_ATTACK_HUD_ID).visible, false)
  assert.equal(createDefaultSkillHudConfig(AUTO_ATTACK_HUD_ID, 1).visible, false)
  assert.equal(createDefaultSkillHudConfig('fireball', 2).visible, false)
})
