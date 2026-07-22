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

export interface TagEffectTagDisplay {
    tag: TagId
    label: string
    icon: string
}

export interface TagEffectDisplayRelation extends TagEffectTagDisplay {
    modifier: number
}

/** `/속성표` 같은 UI가 내부 modifier Map을 직접 읽지 않고 사용하는 표시 DTO. */
export interface TagEffectAffinitySnapshot extends TagEffectTagDisplay {
    attackAdvantages: TagEffectDisplayRelation[]
    attackDisadvantages: TagEffectDisplayRelation[]
    attackImmunities: TagEffectDisplayRelation[]
    defenseVulnerabilities: TagEffectDisplayRelation[]
    defenseResistances: TagEffectDisplayRelation[]
    defenseImmunities: TagEffectDisplayRelation[]
}

/** 전투 문맥별 태그를 제공할 수 있는 객체. 미구현 시 일반 hasTag로 fallback한다. */
export interface TagEffectReadable extends TagReadable {
    hasEffectSourceTag?(tag: TagId): boolean
    hasEffectTargetTag?(tag: TagId): boolean
}

const modifiers = new Map<TagId, Map<TagId, number>>()
const tagDisplays = new Map<TagId, TagEffectTagDisplay>()

/** 상성표에 노출할 태그의 라벨과 IconNode key를 등록한다. */
export function defineTagEffectTagDisplay(tag: TagId, label: string, icon: string): void {
    const normalized = normalizeTag(tag)
    if (!label.trim()) throw new Error(`태그 표시 라벨은 비어 있을 수 없습니다: ${normalized}`)
    if (!icon.trim()) throw new Error(`태그 아이콘 key는 비어 있을 수 없습니다: ${normalized}`)
    tagDisplays.set(normalized, { tag: normalized, label: label.trim(), icon: icon.trim() })
}

/** 스킬·감정 UI가 등록된 속성만 내부 tag key 없이 표시하도록 반환한다. */
export function getTagEffectTagDisplay(tag: TagId): Omit<TagEffectTagDisplay, 'tag'> | undefined {
    const display = tagDisplays.get(normalizeTag(tag))
    return display ? { label: display.label, icon: display.icon } : undefined
}

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

/**
 * 등록된 태그별 공격/방어 관계를 UI용 불변 snapshot으로 반환한다.
 * 단방향 규칙을 역관계로 추론하지 않고 실제 등록 행만 양쪽 관점으로 분류한다.
 */
export function getTagEffectAffinitySnapshots(): TagEffectAffinitySnapshot[] {
    const createSnapshot = (display: TagEffectTagDisplay): TagEffectAffinitySnapshot => ({
        ...display,
        attackAdvantages: [],
        attackDisadvantages: [],
        attackImmunities: [],
        defenseVulnerabilities: [],
        defenseResistances: [],
        defenseImmunities: [],
    })
    const snapshots = new Map<TagId, TagEffectAffinitySnapshot>()
    for (const display of tagDisplays.values()) snapshots.set(display.tag, createSnapshot(display))

    for (const [sourceTag, targets] of modifiers) {
        const source = snapshots.get(sourceTag)
        if (!source) continue
        for (const [targetTag, modifier] of targets) {
            const targetDisplay = tagDisplays.get(targetTag)
            const target = snapshots.get(targetTag)
            if (!targetDisplay || !target) continue

            const outgoing = { ...targetDisplay, modifier }
            const sourceDisplay = tagDisplays.get(sourceTag)!
            const incoming = { ...sourceDisplay, modifier }
            if (modifier === 0) {
                source.attackImmunities.push(outgoing)
                target.defenseImmunities.push(incoming)
            } else if (modifier > 1) {
                source.attackAdvantages.push(outgoing)
                target.defenseVulnerabilities.push(incoming)
            } else if (modifier < 1) {
                source.attackDisadvantages.push(outgoing)
                target.defenseResistances.push(incoming)
            }
        }
    }

    return [...snapshots.values()].map(snapshot => ({
        ...snapshot,
        attackAdvantages: [...snapshot.attackAdvantages],
        attackDisadvantages: [...snapshot.attackDisadvantages],
        attackImmunities: [...snapshot.attackImmunities],
        defenseVulnerabilities: [...snapshot.defenseVulnerabilities],
        defenseResistances: [...snapshot.defenseResistances],
        defenseImmunities: [...snapshot.defenseImmunities],
    }))
}
