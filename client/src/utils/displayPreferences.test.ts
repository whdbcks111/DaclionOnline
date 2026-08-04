/// <reference types="node" />

import assert from 'node:assert/strict'
import test from 'node:test'
import { resolvePhysicalViewportSize } from './displayPreferences.ts'

test('visual viewport page scale을 제거해 회전 전후 실제 화면 크기를 유지한다', () => {
  const portrait = resolvePhysicalViewportSize({
    innerWidth: 390,
    innerHeight: 840,
    visualViewport: { width: 390, height: 840, scale: 1 },
  })
  const landscape = resolvePhysicalViewportSize({
    innerWidth: 840,
    innerHeight: 390,
    visualViewport: { width: 840, height: 390, scale: 1 },
  })
  const portraitAfterBrowserAutoFit = resolvePhysicalViewportSize({
    // Safari가 직전 가로 layout 폭을 유지하며 페이지를 50%로 축소한 과도 상태
    innerWidth: 780,
    innerHeight: 1_680,
    visualViewport: { width: 780, height: 1_680, scale: 0.5 },
  })

  assert.deepEqual(portrait, { width: 390, height: 840 })
  assert.deepEqual(landscape, { width: 840, height: 390 })
  assert.deepEqual(portraitAfterBrowserAutoFit, portrait)
})

test('사용자 pinch zoom도 UI 논리 viewport 크기를 누적 변경하지 않는다', () => {
  assert.deepEqual(resolvePhysicalViewportSize({
    innerWidth: 390,
    innerHeight: 840,
    visualViewport: { width: 195, height: 420, scale: 2 },
  }), { width: 390, height: 840 })
})

test('visual viewport 값이 유효하지 않으면 window inner size로 폴백한다', () => {
  assert.deepEqual(resolvePhysicalViewportSize({
    innerWidth: 412,
    innerHeight: 915,
    visualViewport: { width: 0, height: Number.NaN, scale: 0 },
  }), { width: 412, height: 915 })
})
