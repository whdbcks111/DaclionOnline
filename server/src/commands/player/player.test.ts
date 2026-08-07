import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveDropCount, resolveItemRemovalCount } from './player.js'

test('버리기는 기본 1개, 초과 수량과 전체 입력은 보유량 전부로 해석한다', () => {
    assert.equal(resolveDropCount(undefined, 12), 1)
    assert.equal(resolveDropCount('3', 12), 3)
    assert.equal(resolveDropCount('999999', 12), 12)
    assert.equal(resolveDropCount('전체', 12), 12)
    assert.equal(resolveDropCount('all', 12), 12)
})

test('버리기는 0·음수·숫자가 아닌 수량을 거부한다', () => {
    assert.equal(resolveDropCount('0', 12), undefined)
    assert.equal(resolveDropCount('-1', 12), undefined)
    assert.equal(resolveDropCount('열개', 12), undefined)
})

test('소각 수량도 버리기와 같은 전체·보유량 제한 규칙을 사용한다', () => {
    assert.equal(resolveItemRemovalCount(undefined, 5), 1)
    assert.equal(resolveItemRemovalCount('전체', 5), 5)
    assert.equal(resolveItemRemovalCount('99', 5), 5)
    assert.equal(resolveItemRemovalCount('0', 5), undefined)
})
