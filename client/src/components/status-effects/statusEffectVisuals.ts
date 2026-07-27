import type { StatusEffectHudData } from '@shared/types'

/** 화면 상태효과의 시각 규칙을 소유하는 클래스형 enum. */
export class StatusScreenEffectPreset {
  private static readonly all: StatusScreenEffectPreset[] = []
  readonly key: 'fire' | 'poison' | 'frozen' | 'electric'
  readonly effectIds: readonly string[]
  readonly image: string
  readonly lifeColor?: string

  static readonly FIRE = new StatusScreenEffectPreset(
    'fire',
    ['fire', 'burn'],
    '/effects/status/fire-vignette.webp',
  )

  static readonly POISON = new StatusScreenEffectPreset(
    'poison',
    ['poison', 'deadly_poison', 'paralytic_poison', 'decay'],
    '/effects/status/poison-vignette.webp',
    '#8951b5',
  )

  static readonly FROZEN = new StatusScreenEffectPreset(
    'frozen',
    ['frozen'],
    '/effects/status/frozen-vignette.webp',
  )

  /** 감전 효과가 추가될 때 서버 ID만 이 목록에 등록하면 같은 화면 효과를 재사용한다. */
  static readonly ELECTRIC = new StatusScreenEffectPreset(
    'electric',
    ['electric', 'electrified', 'electric_shock', 'shock'],
    '/effects/status/electric-vignette.webp',
  )

  private constructor(
    key: 'fire' | 'poison' | 'frozen' | 'electric',
    effectIds: readonly string[],
    image: string,
    lifeColor?: string,
  ) {
    this.key = key
    this.effectIds = effectIds
    this.image = image
    this.lifeColor = lifeColor
    StatusScreenEffectPreset.all.push(this)
  }

  static values(): readonly StatusScreenEffectPreset[] {
    return StatusScreenEffectPreset.all
  }

  matches(effectId: string): boolean {
    return this.effectIds.includes(effectId)
  }
}

export interface ActiveStatusScreenEffect {
  readonly preset: StatusScreenEffectPreset
  readonly intensity: number
}

export interface StatusScreenVisualState {
  readonly activeEffects: readonly ActiveStatusScreenEffect[]
  readonly lifeColor?: string
  readonly messageDisrupted: boolean
}

const MESSAGE_DISRUPTION_EFFECT_IDS = new Set([
  'paralytic_poison',
  'stun',
  'overmaster',
  'electric',
  'electrified',
  'electric_shock',
  'shock',
])

function getEffectIntensity(level: number): number {
  const safeLevel = Math.max(1, Number.isFinite(level) ? level : 1)
  return Math.min(0.58, 0.32 + Math.log2(safeLevel + 1) * 0.055)
}

export function resolveStatusScreenVisualState(
  effects: readonly Pick<StatusEffectHudData, 'id' | 'level'>[],
): StatusScreenVisualState {
  const activeEffects: ActiveStatusScreenEffect[] = []
  let lifeColor: string | undefined

  for (const preset of StatusScreenEffectPreset.values()) {
    const matched = effects.filter(effect => preset.matches(effect.id))
    if (matched.length === 0) continue
    activeEffects.push({
      preset,
      intensity: Math.max(...matched.map(effect => getEffectIntensity(effect.level))),
    })
    lifeColor ??= preset.lifeColor
  }

  return {
    activeEffects,
    lifeColor,
    messageDisrupted: effects.some(effect => MESSAGE_DISRUPTION_EFFECT_IDS.has(effect.id)),
  }
}
