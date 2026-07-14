import { normalizeTag } from '../../../shared/tags.js'
import type { TagId, TagReadable } from '../../../shared/tags.js'

export interface TagEffectModifier {
    sourceTag: TagId
    targetTag: TagId
    modifier: number
}

export interface TagEffectResult extends TagEffectModifier {
    effective: boolean
}

/** 전투 문맥별 태그를 제공할 수 있는 객체. 미구현 시 일반 hasTag로 fallback한다. */
export interface TagEffectReadable extends TagReadable {
    hasEffectSourceTag?(tag: TagId): boolean
    hasEffectTargetTag?(tag: TagId): boolean
}

const modifiers = new Map<TagId, Map<TagId, number>>()

/** 단방향 태그 효과 배율을 등록한다. 같은 쌍을 다시 등록하면 교체한다. */
export function defineTagEffectModifier(sourceTag: TagId, targetTag: TagId, modifier: number): void {
    if (!Number.isFinite(modifier) || modifier < 0) {
        throw new Error(`태그 효과 배율은 0 이상의 유한한 수여야 합니다: ${modifier}`)
    }

    const source = normalizeTag(sourceTag)
    const target = normalizeTag(targetTag)
    let targets = modifiers.get(source)
    if (!targets) {
        targets = new Map<TagId, number>()
        modifiers.set(source, targets)
    }
    targets.set(target, modifier)
}

/**
 * 모든 일치 쌍 중 가장 낮은 단일 배율을 반환한다.
 * 복수 속성의 곱연산을 금지하여 상성 중첩 폭주를 막고 면역/저항을 우선한다.
 */
export function resolveTagEffect(source: TagEffectReadable, target: TagEffectReadable): TagEffectResult {
    let match: TagEffectModifier | undefined

    for (const [sourceTag, targets] of modifiers) {
        if (!(source.hasEffectSourceTag?.(sourceTag) ?? source.hasTag(sourceTag))) continue
        for (const [targetTag, modifier] of targets) {
            if (!(target.hasEffectTargetTag?.(targetTag) ?? target.hasTag(targetTag))) continue
            if (!match || modifier < match.modifier) {
                match = { sourceTag, targetTag, modifier }
            }
        }
    }

    return match
        ? { ...match, effective: match.modifier > 0 }
        : { sourceTag: '', targetTag: '', modifier: 1, effective: true }
}

/** 대미지, 회복량, 상태 효과 강도 등에 공통으로 사용할 효과값 계산 API */
export function applyTagEffectValue(value: number, source: TagEffectReadable, target: TagEffectReadable): TagEffectResult & { value: number } {
    const result = resolveTagEffect(source, target)
    return { ...result, value: value * result.modifier }
}

export function getAllTagEffectModifiers(): TagEffectModifier[] {
    const result: TagEffectModifier[] = []
    for (const [sourceTag, targets] of modifiers) {
        for (const [targetTag, modifier] of targets) result.push({ sourceTag, targetTag, modifier })
    }
    return result
}
