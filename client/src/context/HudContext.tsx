import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { PlayerStatsData, LocationInfoData } from '@shared/types'
import { createDefaultSkillHudConfig } from './skillHudConfig'
import type { SkillHudConfig } from './skillHudConfig'
import { createDefaultItemHudConfig } from './itemHudConfig'
import type { ItemHudConfig } from './itemHudConfig'
import type { UsableItemHudData } from '@shared/types'
import {
  getUiViewportSize,
  UI_SCALE_CHANGE_EVENT,
  UI_VIEWPORT_CHANGE_EVENT,
} from '../utils/displayPreferences'
import { useSocket } from './SocketContext'
import {
  HUD_PRESET_VERSION,
  MAX_CONSUMABLE_BUNDLES,
  MAX_CONSUMABLE_BUNDLE_ITEMS,
  MAX_HUD_PRESET_QUICK_SLOTS,
  normalizeHudPresetData,
  normalizeHudPresetName,
  type HudPresetData,
  type HudPresetConsumableBundleConfig,
  type HudPresetConsumableBundleItem,
  type HudPresetOperationResult,
  type HudPresetSummary,
} from '@shared/hudPresets'

export type AnchorPoint = 'topLeft' | 'topMiddle' | 'topRight' | 'middleLeft' | 'center' | 'middleRight' | 'bottomLeft' | 'bottomMiddle' | 'bottomRight'
export type PosAnchor = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'
export type PosUnit = '%' | 'px'

export interface HudConfig {
  id: string
  visible: boolean
  x: number
  y: number
  posUnitX: PosUnit
  posUnitY: PosUnit
  posAnchor: PosAnchor
  anchor: AnchorPoint
  opacity?: number   // undefined = use global
  scale?: number     // undefined = use global
  showObjectActions?: boolean
  showTravelActions?: boolean
}

const OPACITY_KEY = 'hud-opacity'
const SCALE_KEY = 'hud-scale'
const QUICK_SLOTS_KEY = 'hud-quick-slots'
const SKILL_HUD_KEY = 'hud-skill-buttons'
const ITEM_HUD_KEY = 'hud-item-buttons'
const CONSUMABLE_BUNDLE_HUD_KEY = 'hud-consumable-bundles'
const QUICK_BUTTON_SCALE_KEY = 'hud-quick-button-scale'
const SKILL_QUICK_BUTTON_OPACITY_KEY = 'hud-skill-quick-button-opacity'
const GRID_SNAP_KEY = 'hud-grid-snap'
const GRID_EXPONENT_KEY = 'hud-grid-exponent'
const QUICK_BUTTON_POS_ANCHOR_KEY = 'hud-quick-button-pos-anchor'
const QUICK_BUTTON_POS_UNIT_X_KEY = 'hud-quick-button-pos-unit-x'
const QUICK_BUTTON_POS_UNIT_Y_KEY = 'hud-quick-button-pos-unit-y'
export const HUD_GRID_EXPONENT_MIN = 2
export const HUD_GRID_EXPONENT_MAX = 6
export const MAX_QUICK_SLOTS = MAX_HUD_PRESET_QUICK_SLOTS

const ACCOUNT_STORAGE_MIGRATION_KEY = 'hud-account-storage-migrated-v1'
const HUD_STORAGE_KEYS = [
  OPACITY_KEY,
  SCALE_KEY,
  QUICK_SLOTS_KEY,
  SKILL_HUD_KEY,
  ITEM_HUD_KEY,
  CONSUMABLE_BUNDLE_HUD_KEY,
  QUICK_BUTTON_SCALE_KEY,
  SKILL_QUICK_BUTTON_OPACITY_KEY,
  GRID_SNAP_KEY,
  GRID_EXPONENT_KEY,
  QUICK_BUTTON_POS_ANCHOR_KEY,
  QUICK_BUTTON_POS_UNIT_X_KEY,
  QUICK_BUTTON_POS_UNIT_Y_KEY,
  'hud-configs',
] as const

export function getAccountHudStorageKey(userId: number, key: string): string {
  return `account:${userId}:${key}`
}

function migrateLegacyHudStorage(userId: number): void {
  try {
    if (localStorage.getItem(ACCOUNT_STORAGE_MIGRATION_KEY)) return
    for (const key of HUD_STORAGE_KEYS) {
      const legacy = localStorage.getItem(key)
      const scoped = getAccountHudStorageKey(userId, key)
      if (legacy !== null && localStorage.getItem(scoped) === null) localStorage.setItem(scoped, legacy)
    }
    localStorage.setItem(ACCOUNT_STORAGE_MIGRATION_KEY, String(userId))
  } catch { /* ignore */ }
}

function getAccountHudStorageItem(userId: number | undefined, key: string): string | null {
  if (userId === undefined) return null
  try { return localStorage.getItem(getAccountHudStorageKey(userId, key)) } catch { return null }
}

function setAccountHudStorageItem(userId: number | undefined, key: string, value: string): void {
  if (userId === undefined) return
  try { localStorage.setItem(getAccountHudStorageKey(userId, key), value) } catch { /* ignore */ }
}

function isPosAnchor(value: unknown): value is PosAnchor {
  return value === 'topLeft' || value === 'topRight' || value === 'bottomLeft' || value === 'bottomRight'
}

function isPosUnit(value: unknown): value is PosUnit {
  return value === '%' || value === 'px'
}

function parseStoredConsumableBundles(value: string | null): Record<string, HudPresetConsumableBundleConfig> {
  if (!value) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: Record<string, HudPresetConsumableBundleConfig> = {}
    for (const [id, raw] of Object.entries(parsed).slice(0, MAX_CONSUMABLE_BUNDLES)) {
      if (!/^[a-z0-9:_-]{1,100}$/i.test(id) || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue
      const candidate = raw as Partial<HudPresetConsumableBundleConfig>
      if (typeof candidate.name !== 'string' || !candidate.name.trim()
        || !Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)
        || !Array.isArray(candidate.items)) continue
      const items: HudPresetConsumableBundleItem[] = []
      const seen = new Set<string>()
      for (const item of candidate.items.slice(0, MAX_CONSUMABLE_BUNDLE_ITEMS)) {
        if (!item || typeof item !== 'object') continue
        const value = item as Partial<HudPresetConsumableBundleItem>
        if (typeof value.itemDataId !== 'string' || !/^[a-z0-9:_-]{1,100}$/i.test(value.itemDataId)
          || typeof value.name !== 'string' || !value.name
          || typeof value.icon !== 'string' || !value.icon
          || seen.has(value.itemDataId)) continue
        seen.add(value.itemDataId)
        items.push({ itemDataId: value.itemDataId, name: value.name, icon: value.icon })
      }
      if (items.length === 0) continue
      result[id] = {
        id,
        name: candidate.name.trim().slice(0, 24),
        items,
        visible: candidate.visible === true,
        x: Math.max(0, candidate.x!),
        y: Math.max(0, candidate.y!),
      }
    }
    return result
  } catch {
    return {}
  }
}

function getHudGridSize(exponent: number): number {
  const normalized = Math.max(HUD_GRID_EXPONENT_MIN, Math.min(HUD_GRID_EXPONENT_MAX, Math.round(exponent)))
  return 2 ** normalized
}

function snapHudCoordinate(value: number, unit: PosUnit, viewportSize: number, gridSize: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(viewportSize) || viewportSize <= 0) return value
  const pixels = unit === '%' ? value / 100 * viewportSize : value
  const snappedPixels = Math.round(pixels / gridSize) * gridSize
  return unit === '%' ? snappedPixels / viewportSize * 100 : snappedPixels
}

function createAnchoredSkillHudConfig(
  skillId: string,
  index: number,
  posAnchor: PosAnchor,
  unitX: PosUnit,
  unitY: PosUnit,
  viewportWidth: number,
  viewportHeight: number,
): SkillHudConfig {
  const defaults = createDefaultSkillHudConfig(skillId, index)
  const isRight = posAnchor === 'topRight' || posAnchor === 'bottomRight'
  const isBottom = posAnchor === 'bottomLeft' || posAnchor === 'bottomRight'
  const xPercent = isRight ? 100 - defaults.x : defaults.x
  const yPercent = isBottom ? 100 - defaults.y : defaults.y
  return {
    ...defaults,
    x: unitX === '%' ? xPercent : xPercent / 100 * viewportWidth,
    y: unitY === '%' ? yPercent : yPercent / 100 * viewportHeight,
  }
}

function createAnchoredItemHudConfig(
  item: Pick<ItemHudConfig, 'itemDataId' | 'name' | 'icon'>,
  index: number,
  posAnchor: PosAnchor,
  unitX: PosUnit,
  unitY: PosUnit,
  viewportWidth: number,
  viewportHeight: number,
): ItemHudConfig {
  const defaults = createDefaultItemHudConfig(item, index)
  const isRight = posAnchor === 'topRight' || posAnchor === 'bottomRight'
  const isBottom = posAnchor === 'bottomLeft' || posAnchor === 'bottomRight'
  const xPercent = isRight ? 100 - defaults.x : defaults.x
  const yPercent = isBottom ? 100 - defaults.y : defaults.y
  return {
    ...defaults,
    x: unitX === '%' ? xPercent : xPercent / 100 * viewportWidth,
    y: unitY === '%' ? yPercent : yPercent / 100 * viewportHeight,
  }
}

function createAnchoredConsumableBundleConfig(
  id: string,
  name: string,
  items: HudPresetConsumableBundleItem[],
  index: number,
  posAnchor: PosAnchor,
  unitX: PosUnit,
  unitY: PosUnit,
  viewportWidth: number,
  viewportHeight: number,
): HudPresetConsumableBundleConfig {
  const columns = viewportWidth <= 600 ? 4 : 8
  const column = Math.max(0, index) % columns
  const row = Math.floor(Math.max(0, index) / columns)
  const defaultX = (column + 1) * 100 / (columns + 1)
  const defaultY = Math.max(12, 50 - row * 12)
  const isRight = posAnchor === 'topRight' || posAnchor === 'bottomRight'
  const isBottom = posAnchor === 'bottomLeft' || posAnchor === 'bottomRight'
  const xPercent = isRight ? 100 - defaultX : defaultX
  const yPercent = isBottom ? 100 - defaultY : defaultY
  return {
    id,
    name,
    items,
    visible: true,
    x: unitX === '%' ? xPercent : xPercent / 100 * viewportWidth,
    y: unitY === '%' ? yPercent : yPercent / 100 * viewportHeight,
  }
}

export interface HudDefinition {
  id: string
  label: string
}

export const HUD_DEFINITIONS: HudDefinition[] = [
  { id: 'player-status', label: '플레이어 상태' },
  { id: 'target-status', label: '타게팅 대상' },
  { id: 'player-location', label: '위치 정보' },
  { id: 'minimap', label: '미니맵' },
  { id: 'quick-slots', label: '퀵 슬롯' },
  { id: 'party-status', label: '파티원 상태' },
]

const DEFAULT_CONFIGS: Record<string, HudConfig> = {
  'player-status':   { id: 'player-status',   visible: true,  x: 5,  y: 10, posUnitX: '%', posUnitY: '%', posAnchor: 'topRight',    anchor: 'topRight' },
  'target-status':   { id: 'target-status',   visible: true,  x: 50, y: 5,  posUnitX: '%', posUnitY: '%', posAnchor: 'topLeft',     anchor: 'topMiddle' },
  'player-location': { id: 'player-location', visible: false, x: 5,  y: 30, posUnitX: '%', posUnitY: '%', posAnchor: 'topRight',    anchor: 'topRight', showObjectActions: true },
  'minimap':         { id: 'minimap',         visible: false, x: 5,  y: 45, posUnitX: '%', posUnitY: '%', posAnchor: 'topRight',    anchor: 'topRight', showTravelActions: false },
  'quick-slots':     { id: 'quick-slots',     visible: false, x: 50, y: 10,  posUnitX: '%', posUnitY: '%', posAnchor: 'bottomLeft',  anchor: 'bottomMiddle' },
  'party-status':    { id: 'party-status',    visible: true,  x: 5,  y: 23,  posUnitX: '%', posUnitY: '%', posAnchor: 'topLeft',     anchor: 'topLeft' },
}

interface HudContextType {
  configs: Record<string, HudConfig>
  editMode: boolean
  setEditMode: (v: boolean) => void
  gridSnapEnabled: boolean
  setGridSnapEnabled: (enabled: boolean) => void
  gridExponent: number
  gridSize: number
  setGridExponent: (exponent: number) => void
  hudViewportWidth: number
  hudViewportHeight: number
  setVisible: (id: string, visible: boolean) => void
  setPosition: (id: string, x: number, y: number) => void
  setAnchor: (id: string, anchor: AnchorPoint) => void
  setPosUnit: (id: string, axis: 'x' | 'y', unit: PosUnit) => void
  setPosAnchor: (id: string, posAnchor: PosAnchor) => void
  setHudOpacity: (id: string, opacity: number | undefined) => void
  setHudScale: (id: string, scale: number | undefined) => void
  setLocationObjectActionsVisible: (visible: boolean) => void
  setMinimapTravelActionsVisible: (visible: boolean) => void
  resetPosition: (id: string) => void
  playerStats: PlayerStatsData | null
  setPlayerStats: (data: PlayerStatsData) => void
  playerStatsReceivedAt: number
  locationInfo: LocationInfoData | null
  setLocationInfo: (data: LocationInfoData) => void
  opacity: number
  setOpacity: (v: number) => void
  scale: number
  setScale: (v: number) => void
  quickSlots: string[]
  addQuickSlot: (text: string) => void
  removeQuickSlot: (index: number) => void
  moveQuickSlot: (from: number, to: number) => void
  updateQuickSlot: (index: number, text: string) => void
  skillHudConfigs: Record<string, SkillHudConfig>
  setSkillHudVisible: (skillId: string, visible: boolean, defaultIndex?: number) => void
  setSkillHudPosition: (skillId: string, x: number, y: number) => void
  resetSkillHudPosition: (skillId: string, defaultIndex?: number) => void
  itemHudConfigs: Record<string, ItemHudConfig>
  setItemHudVisible: (item: UsableItemHudData, visible: boolean, defaultIndex?: number) => void
  setItemHudPosition: (itemDataId: string, x: number, y: number) => void
  resetItemHudPosition: (itemDataId: string, defaultIndex?: number) => void
  consumableBundleHudConfigs: Record<string, HudPresetConsumableBundleConfig>
  createConsumableBundle: (name: string, items: readonly UsableItemHudData[]) => boolean
  removeConsumableBundle: (id: string) => void
  setConsumableBundleVisible: (id: string, visible: boolean) => void
  setConsumableBundlePosition: (id: string, x: number, y: number) => void
  resetConsumableBundlePosition: (id: string, defaultIndex?: number) => void
  quickButtonScale: number
  setQuickButtonScale: (scale: number) => void
  skillQuickButtonOpacity: number
  setSkillQuickButtonOpacity: (opacity: number) => void
  quickButtonPosAnchor: PosAnchor
  setQuickButtonPosAnchor: (posAnchor: PosAnchor) => void
  quickButtonPosUnitX: PosUnit
  quickButtonPosUnitY: PosUnit
  setQuickButtonPosUnit: (axis: 'x' | 'y', unit: PosUnit) => void
  hudPresetSummaries: readonly HudPresetSummary[]
  hudPresetBusy: boolean
  hudPresetMessage: string
  saveHudPreset: (name: string) => void
  loadHudPreset: (name: string) => void
  deleteHudPreset: (name: string) => void
}

const HudContext = createContext<HudContextType | null>(null)

const STORAGE_KEY = 'hud-configs'

export function HudProvider({ children }: { children: React.ReactNode }) {
  const { socket, sessionInfo } = useSocket()
  const storageUserId = sessionInfo?.userId
  if (storageUserId !== undefined) migrateLegacyHudStorage(storageUserId)

  const [configs, setConfigs] = useState<Record<string, HudConfig>>(() => {
    try {
      const saved = getAccountHudStorageItem(storageUserId, STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, Partial<HudConfig> & { posUnit?: '%' | 'px' }>
        const merged: Record<string, HudConfig> = {}
        for (const id of Object.keys(DEFAULT_CONFIGS)) {
          const p = parsed[id] ?? {}
          const fallback = p.posUnit ?? DEFAULT_CONFIGS[id].posUnitX
          merged[id] = {
            ...DEFAULT_CONFIGS[id],
            ...p,
            posUnitX: p.posUnitX ?? fallback,
            posUnitY: p.posUnitY ?? fallback,
          }
        }
        return merged
      }
    } catch { /* ignore */ }
    return { ...DEFAULT_CONFIGS }
  })

  const [editMode, setEditMode] = useState(false)
  const [hudViewport, setHudViewport] = useState(() => (
    typeof window === 'undefined' ? { width: 1024, height: 768 } : getUiViewportSize()
  ))
  const [gridSnapEnabled, setGridSnapEnabledState] = useState(() => {
    return getAccountHudStorageItem(storageUserId, GRID_SNAP_KEY) === 'true'
  })
  const [gridExponent, setGridExponentState] = useState(() => {
    try {
      const raw = getAccountHudStorageItem(storageUserId, GRID_EXPONENT_KEY)
      if (raw !== null) {
        const saved = Number(raw)
        if (Number.isFinite(saved)) return Math.max(HUD_GRID_EXPONENT_MIN, Math.min(HUD_GRID_EXPONENT_MAX, Math.round(saved)))
      }
    } catch { /* ignore */ }
    return 3
  })
  const gridSize = getHudGridSize(gridExponent)
  const [quickButtonPosAnchor, setQuickButtonPosAnchorState] = useState<PosAnchor>(() => {
    try {
      const saved = getAccountHudStorageItem(storageUserId, QUICK_BUTTON_POS_ANCHOR_KEY)
      if (isPosAnchor(saved)) return saved
    } catch { /* ignore */ }
    return 'topLeft'
  })
  const [quickButtonPosUnitX, setQuickButtonPosUnitX] = useState<PosUnit>(() => {
    try {
      const saved = getAccountHudStorageItem(storageUserId, QUICK_BUTTON_POS_UNIT_X_KEY)
      if (isPosUnit(saved)) return saved
    } catch { /* ignore */ }
    return '%'
  })
  const [quickButtonPosUnitY, setQuickButtonPosUnitY] = useState<PosUnit>(() => {
    try {
      const saved = getAccountHudStorageItem(storageUserId, QUICK_BUTTON_POS_UNIT_Y_KEY)
      if (isPosUnit(saved)) return saved
    } catch { /* ignore */ }
    return '%'
  })
  const [playerStats, setPlayerStatsState] = useState<PlayerStatsData | null>(null)
  const [playerStatsReceivedAt, setPlayerStatsReceivedAt] = useState(0)
  const [locationInfo, setLocationInfo] = useState<LocationInfoData | null>(null)
  const [hudPresetSummaries, setHudPresetSummaries] = useState<readonly HudPresetSummary[]>([])
  const [hudPresetBusy, setHudPresetBusy] = useState(false)
  const [hudPresetMessage, setHudPresetMessage] = useState('')
  const [quickSlots, setQuickSlots] = useState<string[]>(() => {
    try {
      const saved = getAccountHudStorageItem(storageUserId, QUICK_SLOTS_KEY)
      if (saved) return JSON.parse(saved) as string[]
    } catch { /* ignore */ }
    return []
  })
  const [skillHudConfigs, setSkillHudConfigs] = useState<Record<string, SkillHudConfig>>(() => {
    try {
      const saved = getAccountHudStorageItem(storageUserId, SKILL_HUD_KEY)
      if (!saved) return {}
      const parsed = JSON.parse(saved) as Record<string, Partial<SkillHudConfig>>
      return Object.fromEntries(Object.entries(parsed).flatMap(([skillId, config]) => {
        if (!config || !Number.isFinite(config.x) || !Number.isFinite(config.y)) return []
        return [[skillId, {
          skillId,
          visible: config.visible === true,
          x: Math.max(0, quickButtonPosUnitX === '%' ? Math.min(100, config.x!) : config.x!),
          y: Math.max(0, quickButtonPosUnitY === '%' ? Math.min(100, config.y!) : config.y!),
        } satisfies SkillHudConfig]]
      }))
    } catch { /* ignore */ }
    return {}
  })
  const [itemHudConfigs, setItemHudConfigs] = useState<Record<string, ItemHudConfig>>(() => {
    try {
      const saved = getAccountHudStorageItem(storageUserId, ITEM_HUD_KEY)
      if (!saved) return {}
      const parsed = JSON.parse(saved) as Record<string, Partial<ItemHudConfig>>
      return Object.fromEntries(Object.entries(parsed).flatMap(([itemDataId, config]) => {
        if (!config
          || typeof config.name !== 'string'
          || typeof config.icon !== 'string'
          || !Number.isFinite(config.x)
          || !Number.isFinite(config.y)) return []
        return [[itemDataId, {
          itemDataId,
          name: config.name,
          icon: config.icon,
          visible: config.visible === true,
          x: Math.max(0, quickButtonPosUnitX === '%' ? Math.min(100, config.x!) : config.x!),
          y: Math.max(0, quickButtonPosUnitY === '%' ? Math.min(100, config.y!) : config.y!),
        } satisfies ItemHudConfig]]
      }))
    } catch { /* ignore */ }
    return {}
  })
  const [consumableBundleHudConfigs, setConsumableBundleHudConfigs] = useState<
    Record<string, HudPresetConsumableBundleConfig>
  >(() => parseStoredConsumableBundles(
    getAccountHudStorageItem(storageUserId, CONSUMABLE_BUNDLE_HUD_KEY),
  ))

  const saveQuickSlots = useCallback((slots: string[]) => {
    setQuickSlots(slots)
    setAccountHudStorageItem(storageUserId, QUICK_SLOTS_KEY, JSON.stringify(slots))
  }, [storageUserId])

  const setPlayerStats = useCallback((data: PlayerStatsData) => {
    setPlayerStatsState(data)
    setPlayerStatsReceivedAt(Date.now())
  }, [])

  const addQuickSlot    = useCallback((text: string) => saveQuickSlots([...quickSlots, text]), [quickSlots, saveQuickSlots])
  const removeQuickSlot = useCallback((index: number) => saveQuickSlots(quickSlots.filter((_, i) => i !== index)), [quickSlots, saveQuickSlots])
  const moveQuickSlot   = useCallback((from: number, to: number) => {
    const next = [...quickSlots]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    saveQuickSlots(next)
  }, [quickSlots, saveQuickSlots])
  const updateQuickSlot = useCallback((index: number, text: string) => {
    const next = [...quickSlots]
    next[index] = text
    saveQuickSlots(next)
  }, [quickSlots, saveQuickSlots])
  const [opacity, setOpacityState] = useState<number>(() => {
    try {
      const saved = getAccountHudStorageItem(storageUserId, OPACITY_KEY)
      if (saved !== null) return Math.max(0.1, Math.min(1, parseFloat(saved)))
    } catch { /* ignore */ }
    return 1
  })

  const setOpacity = useCallback((v: number) => {
    const clamped = Math.max(0.1, Math.min(1, v))
    setOpacityState(clamped)
    setAccountHudStorageItem(storageUserId, OPACITY_KEY, String(clamped))
  }, [storageUserId])

  const [scale, setScaleState] = useState<number>(() => {
    try {
      const saved = getAccountHudStorageItem(storageUserId, SCALE_KEY)
      if (saved !== null) return Math.max(0.1, Math.min(1, parseFloat(saved)))
    } catch { /* ignore */ }
    return 1
  })

  const setScale = useCallback((v: number) => {
    const clamped = Math.max(0.1, Math.min(1, v))
    setScaleState(clamped)
    setAccountHudStorageItem(storageUserId, SCALE_KEY, String(clamped))
  }, [storageUserId])

  const [quickButtonScale, setQuickButtonScaleState] = useState<number>(() => {
    try {
      const saved = getAccountHudStorageItem(storageUserId, QUICK_BUTTON_SCALE_KEY)
      if (saved !== null) return Math.max(0.5, Math.min(2, parseFloat(saved)))
    } catch { /* ignore */ }
    return 1
  })

  const setQuickButtonScale = useCallback((value: number) => {
    const clamped = Math.max(0.5, Math.min(2, value))
    setQuickButtonScaleState(clamped)
    setAccountHudStorageItem(storageUserId, QUICK_BUTTON_SCALE_KEY, String(clamped))
  }, [storageUserId])

  const [skillQuickButtonOpacity, setSkillQuickButtonOpacityState] = useState<number>(() => {
    try {
      const saved = getAccountHudStorageItem(storageUserId, SKILL_QUICK_BUTTON_OPACITY_KEY)
      if (saved !== null) return Math.max(0.1, Math.min(1, parseFloat(saved)))
    } catch { /* ignore */ }
    return 1
  })

  const setSkillQuickButtonOpacity = useCallback((value: number) => {
    const clamped = Math.max(0.1, Math.min(1, value))
    setSkillQuickButtonOpacityState(clamped)
    setAccountHudStorageItem(storageUserId, SKILL_QUICK_BUTTON_OPACITY_KEY, String(clamped))
  }, [storageUserId])

  const setGridSnapEnabled = useCallback((enabled: boolean) => {
    setGridSnapEnabledState(enabled)
    setAccountHudStorageItem(storageUserId, GRID_SNAP_KEY, String(enabled))
  }, [storageUserId])

  const setGridExponent = useCallback((exponent: number) => {
    const normalized = Math.max(HUD_GRID_EXPONENT_MIN, Math.min(HUD_GRID_EXPONENT_MAX, Math.round(exponent)))
    setGridExponentState(normalized)
    setAccountHudStorageItem(storageUserId, GRID_EXPONENT_KEY, String(normalized))
  }, [storageUserId])

  useEffect(() => {
    const updateHudViewport = () => {
      const { width, height } = getUiViewportSize()
      setHudViewport(previous => {
        if (previous.width === width && previous.height === height) return previous
        return { width, height }
      })
    }
    window.addEventListener(UI_VIEWPORT_CHANGE_EVENT, updateHudViewport)
    window.addEventListener(UI_SCALE_CHANGE_EVENT, updateHudViewport)
    return () => {
      window.removeEventListener(UI_VIEWPORT_CHANGE_EVENT, updateHudViewport)
      window.removeEventListener(UI_SCALE_CHANGE_EVENT, updateHudViewport)
    }
  }, [])

  useEffect(() => {
    setAccountHudStorageItem(storageUserId, STORAGE_KEY, JSON.stringify(configs))
  }, [configs, storageUserId])

  useEffect(() => {
    setAccountHudStorageItem(storageUserId, SKILL_HUD_KEY, JSON.stringify(skillHudConfigs))
  }, [skillHudConfigs, storageUserId])

  useEffect(() => {
    setAccountHudStorageItem(storageUserId, ITEM_HUD_KEY, JSON.stringify(itemHudConfigs))
  }, [itemHudConfigs, storageUserId])

  useEffect(() => {
    setAccountHudStorageItem(
      storageUserId,
      CONSUMABLE_BUNDLE_HUD_KEY,
      JSON.stringify(consumableBundleHudConfigs),
    )
  }, [consumableBundleHudConfigs, storageUserId])

  const patchConfig = useCallback((id: string, patch: Partial<HudConfig>) => {
    setConfigs(prev => ({
      ...prev,
      [id]: { ...(prev[id] ?? DEFAULT_CONFIGS[id] ?? { id, visible: true, x: 50, y: 50, posUnitX: '%' as const, posUnitY: '%' as const, posAnchor: 'topLeft' as PosAnchor, anchor: 'topLeft' as AnchorPoint }), ...patch },
    }))
  }, [])

  const setVisible = useCallback((id: string, visible: boolean) => patchConfig(id, { visible }), [patchConfig])
  const setPosition = useCallback((id: string, x: number, y: number) => {
    setConfigs(prev => {
      const cfg = prev[id] ?? DEFAULT_CONFIGS[id]
      if (!cfg) return prev
      const nextX = gridSnapEnabled
        ? snapHudCoordinate(x, cfg.posUnitX ?? '%', hudViewport.width, gridSize)
        : x
      const nextY = gridSnapEnabled
        ? snapHudCoordinate(y, cfg.posUnitY ?? '%', hudViewport.height, gridSize)
        : y
      return { ...prev, [id]: { ...cfg, x: nextX, y: nextY } }
    })
  }, [gridSnapEnabled, gridSize, hudViewport])
  const setAnchor = useCallback((id: string, anchor: AnchorPoint) => patchConfig(id, { anchor }), [patchConfig])

  const setPosUnit = useCallback((id: string, axis: 'x' | 'y', unit: PosUnit) => {
    setConfigs(prev => {
      const cfg = prev[id] ?? DEFAULT_CONFIGS[id]
      if (!cfg) return prev
      const vw = hudViewport.width
      const vh = hudViewport.height
      if (axis === 'x') {
        const cur = cfg.posUnitX ?? '%'
        if (cur === unit) return prev
        let newX = cfg.x
        if (cur === '%' && unit === 'px') newX = Math.round(cfg.x / 100 * vw)
        else if (cur === 'px' && unit === '%') newX = Math.round(cfg.x / vw * 1000) / 10
        return { ...prev, [id]: { ...cfg, posUnitX: unit, x: newX } }
      } else {
        const cur = cfg.posUnitY ?? '%'
        if (cur === unit) return prev
        let newY = cfg.y
        if (cur === '%' && unit === 'px') newY = Math.round(cfg.y / 100 * vh)
        else if (cur === 'px' && unit === '%') newY = Math.round(cfg.y / vh * 1000) / 10
        return { ...prev, [id]: { ...cfg, posUnitY: unit, y: newY } }
      }
    })
  }, [hudViewport])

  const setPosAnchor = useCallback((id: string, posAnchor: PosAnchor) => {
    setConfigs(prev => {
      const cfg = prev[id] ?? DEFAULT_CONFIGS[id]
      if (!cfg || cfg.posAnchor === posAnchor) return prev
      const maxX = (cfg.posUnitX ?? '%') === '%' ? 100 : hudViewport.width
      const maxY = (cfg.posUnitY ?? '%') === '%' ? 100 : hudViewport.height
      const oldIsRight  = cfg.posAnchor === 'topRight'  || cfg.posAnchor === 'bottomRight'
      const oldIsBottom = cfg.posAnchor === 'bottomLeft' || cfg.posAnchor === 'bottomRight'
      const newIsRight  = posAnchor === 'topRight'  || posAnchor === 'bottomRight'
      const newIsBottom = posAnchor === 'bottomLeft' || posAnchor === 'bottomRight'
      const newX = oldIsRight  !== newIsRight  ? maxX - cfg.x : cfg.x
      const newY = oldIsBottom !== newIsBottom ? maxY - cfg.y : cfg.y
      return { ...prev, [id]: { ...cfg, posAnchor, x: newX, y: newY } }
    })
  }, [hudViewport])
  const setHudOpacity = useCallback((id: string, opacity: number | undefined)   => patchConfig(id, { opacity }), [patchConfig])
  const setHudScale   = useCallback((id: string, scale: number | undefined)     => patchConfig(id, { scale }), [patchConfig])
  const setLocationObjectActionsVisible = useCallback((visible: boolean) => {
    patchConfig('player-location', { showObjectActions: visible })
  }, [patchConfig])
  const setMinimapTravelActionsVisible = useCallback((visible: boolean) => {
    patchConfig('minimap', { showTravelActions: visible })
  }, [patchConfig])

  const resetPosition = useCallback((id: string) => {
    const def = DEFAULT_CONFIGS[id]
    if (!def) return
    patchConfig(id, { x: def.x, y: def.y, posUnitX: def.posUnitX, posUnitY: def.posUnitY, posAnchor: def.posAnchor })
  }, [patchConfig])

  const patchSkillHudConfig = useCallback((skillId: string, patch: Partial<SkillHudConfig>, defaultIndex = 0) => {
    setSkillHudConfigs(prev => ({
      ...prev,
      [skillId]: {
        ...(prev[skillId] ?? createAnchoredSkillHudConfig(
          skillId,
          defaultIndex,
          quickButtonPosAnchor,
          quickButtonPosUnitX,
          quickButtonPosUnitY,
          hudViewport.width,
          hudViewport.height,
        )),
        ...patch,
        skillId,
      },
    }))
  }, [hudViewport, quickButtonPosAnchor, quickButtonPosUnitX, quickButtonPosUnitY])

  const setSkillHudVisible = useCallback((skillId: string, visible: boolean, defaultIndex = 0) => {
    patchSkillHudConfig(skillId, { visible }, defaultIndex)
  }, [patchSkillHudConfig])

  const setSkillHudPosition = useCallback((skillId: string, x: number, y: number) => {
    const nextX = gridSnapEnabled ? snapHudCoordinate(x, quickButtonPosUnitX, hudViewport.width, gridSize) : x
    const nextY = gridSnapEnabled ? snapHudCoordinate(y, quickButtonPosUnitY, hudViewport.height, gridSize) : y
    patchSkillHudConfig(skillId, {
      x: Math.max(0, quickButtonPosUnitX === '%' ? Math.min(100, nextX) : nextX),
      y: Math.max(0, quickButtonPosUnitY === '%' ? Math.min(100, nextY) : nextY),
    })
  }, [gridSnapEnabled, gridSize, hudViewport, patchSkillHudConfig, quickButtonPosUnitX, quickButtonPosUnitY])

  const resetSkillHudPosition = useCallback((skillId: string, defaultIndex = 0) => {
    const defaults = createAnchoredSkillHudConfig(
      skillId,
      defaultIndex,
      quickButtonPosAnchor,
      quickButtonPosUnitX,
      quickButtonPosUnitY,
      hudViewport.width,
      hudViewport.height,
    )
    patchSkillHudConfig(skillId, { x: defaults.x, y: defaults.y }, defaultIndex)
  }, [hudViewport, patchSkillHudConfig, quickButtonPosAnchor, quickButtonPosUnitX, quickButtonPosUnitY])

  const patchItemHudConfig = useCallback((
    item: Pick<ItemHudConfig, 'itemDataId' | 'name' | 'icon'>,
    patch: Partial<ItemHudConfig>,
    defaultIndex = 0,
  ) => {
    setItemHudConfigs(prev => ({
      ...prev,
      [item.itemDataId]: {
        ...(prev[item.itemDataId] ?? createAnchoredItemHudConfig(
          item,
          defaultIndex,
          quickButtonPosAnchor,
          quickButtonPosUnitX,
          quickButtonPosUnitY,
          hudViewport.width,
          hudViewport.height,
        )),
        ...patch,
        itemDataId: item.itemDataId,
        name: item.name,
        icon: item.icon,
      },
    }))
  }, [hudViewport, quickButtonPosAnchor, quickButtonPosUnitX, quickButtonPosUnitY])

  const setItemHudVisible = useCallback((item: UsableItemHudData, visible: boolean, defaultIndex = 0) => {
    patchItemHudConfig(item, { visible }, defaultIndex)
  }, [patchItemHudConfig])

  const setItemHudPosition = useCallback((itemDataId: string, x: number, y: number) => {
    const config = itemHudConfigs[itemDataId]
    if (!config) return
    const nextX = gridSnapEnabled ? snapHudCoordinate(x, quickButtonPosUnitX, hudViewport.width, gridSize) : x
    const nextY = gridSnapEnabled ? snapHudCoordinate(y, quickButtonPosUnitY, hudViewport.height, gridSize) : y
    patchItemHudConfig(config, {
      x: Math.max(0, quickButtonPosUnitX === '%' ? Math.min(100, nextX) : nextX),
      y: Math.max(0, quickButtonPosUnitY === '%' ? Math.min(100, nextY) : nextY),
    })
  }, [
    gridSnapEnabled,
    gridSize,
    hudViewport,
    itemHudConfigs,
    patchItemHudConfig,
    quickButtonPosUnitX,
    quickButtonPosUnitY,
  ])

  const resetItemHudPosition = useCallback((itemDataId: string, defaultIndex = 0) => {
    const config = itemHudConfigs[itemDataId]
    if (!config) return
    const defaults = createAnchoredItemHudConfig(
      config,
      defaultIndex,
      quickButtonPosAnchor,
      quickButtonPosUnitX,
      quickButtonPosUnitY,
      hudViewport.width,
      hudViewport.height,
    )
    patchItemHudConfig(config, { x: defaults.x, y: defaults.y }, defaultIndex)
  }, [
    hudViewport,
    itemHudConfigs,
    patchItemHudConfig,
    quickButtonPosAnchor,
    quickButtonPosUnitX,
    quickButtonPosUnitY,
  ])

  const createConsumableBundle = useCallback((
    rawName: string,
    sourceItems: readonly UsableItemHudData[],
  ): boolean => {
    const name = rawName.trim().replace(/\s+/g, ' ')
    if (!name || Array.from(name).length > 24
      || Object.keys(consumableBundleHudConfigs).length >= MAX_CONSUMABLE_BUNDLES) return false
    const seen = new Set<string>()
    const items = sourceItems.flatMap(item => {
      if (!item.bundleEligible || seen.has(item.itemDataId)
        || seen.size >= MAX_CONSUMABLE_BUNDLE_ITEMS) return []
      seen.add(item.itemDataId)
      return [{ itemDataId: item.itemDataId, name: item.name, icon: item.icon }]
    })
    if (items.length === 0) return false
    const randomPart = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    const id = `bundle_${randomPart}`
    const config = createAnchoredConsumableBundleConfig(
      id,
      name,
      items,
      Object.keys(consumableBundleHudConfigs).length,
      quickButtonPosAnchor,
      quickButtonPosUnitX,
      quickButtonPosUnitY,
      hudViewport.width,
      hudViewport.height,
    )
    setConsumableBundleHudConfigs(previous => ({ ...previous, [id]: config }))
    return true
  }, [
    consumableBundleHudConfigs,
    hudViewport,
    quickButtonPosAnchor,
    quickButtonPosUnitX,
    quickButtonPosUnitY,
  ])

  const removeConsumableBundle = useCallback((id: string) => {
    setConsumableBundleHudConfigs(previous => Object.fromEntries(
      Object.entries(previous).filter(([bundleId]) => bundleId !== id),
    ))
  }, [])

  const setConsumableBundleVisible = useCallback((id: string, visible: boolean) => {
    setConsumableBundleHudConfigs(previous => {
      const config = previous[id]
      return config ? { ...previous, [id]: { ...config, visible } } : previous
    })
  }, [])

  const setConsumableBundlePosition = useCallback((id: string, x: number, y: number) => {
    setConsumableBundleHudConfigs(previous => {
      const config = previous[id]
      if (!config) return previous
      const nextX = gridSnapEnabled
        ? snapHudCoordinate(x, quickButtonPosUnitX, hudViewport.width, gridSize)
        : x
      const nextY = gridSnapEnabled
        ? snapHudCoordinate(y, quickButtonPosUnitY, hudViewport.height, gridSize)
        : y
      return {
        ...previous,
        [id]: {
          ...config,
          x: Math.max(0, quickButtonPosUnitX === '%' ? Math.min(100, nextX) : nextX),
          y: Math.max(0, quickButtonPosUnitY === '%' ? Math.min(100, nextY) : nextY),
        },
      }
    })
  }, [gridSize, gridSnapEnabled, hudViewport, quickButtonPosUnitX, quickButtonPosUnitY])

  const resetConsumableBundlePosition = useCallback((id: string, defaultIndex = 0) => {
    setConsumableBundleHudConfigs(previous => {
      const config = previous[id]
      if (!config) return previous
      const defaults = createAnchoredConsumableBundleConfig(
        id,
        config.name,
        config.items,
        defaultIndex,
        quickButtonPosAnchor,
        quickButtonPosUnitX,
        quickButtonPosUnitY,
        hudViewport.width,
        hudViewport.height,
      )
      return { ...previous, [id]: { ...config, x: defaults.x, y: defaults.y } }
    })
  }, [hudViewport, quickButtonPosAnchor, quickButtonPosUnitX, quickButtonPosUnitY])

  const setQuickButtonPosAnchor = useCallback((posAnchor: PosAnchor) => {
    if (posAnchor === quickButtonPosAnchor) return
    const oldIsRight = quickButtonPosAnchor === 'topRight' || quickButtonPosAnchor === 'bottomRight'
    const oldIsBottom = quickButtonPosAnchor === 'bottomLeft' || quickButtonPosAnchor === 'bottomRight'
    const newIsRight = posAnchor === 'topRight' || posAnchor === 'bottomRight'
    const newIsBottom = posAnchor === 'bottomLeft' || posAnchor === 'bottomRight'
    const maxX = quickButtonPosUnitX === '%' ? 100 : hudViewport.width
    const maxY = quickButtonPosUnitY === '%' ? 100 : hudViewport.height
    setSkillHudConfigs(prev => Object.fromEntries(Object.entries(prev).map(([skillId, config]) => [
      skillId,
      {
        ...config,
        x: oldIsRight !== newIsRight ? Math.max(0, maxX - config.x) : config.x,
        y: oldIsBottom !== newIsBottom ? Math.max(0, maxY - config.y) : config.y,
      },
    ])))
    setItemHudConfigs(prev => Object.fromEntries(Object.entries(prev).map(([itemDataId, config]) => [
      itemDataId,
      {
        ...config,
        x: oldIsRight !== newIsRight ? Math.max(0, maxX - config.x) : config.x,
        y: oldIsBottom !== newIsBottom ? Math.max(0, maxY - config.y) : config.y,
      },
    ])))
    setConsumableBundleHudConfigs(prev => Object.fromEntries(Object.entries(prev).map(([id, config]) => [
      id,
      {
        ...config,
        x: oldIsRight !== newIsRight ? Math.max(0, maxX - config.x) : config.x,
        y: oldIsBottom !== newIsBottom ? Math.max(0, maxY - config.y) : config.y,
      },
    ])))
    setQuickButtonPosAnchorState(posAnchor)
    setAccountHudStorageItem(storageUserId, QUICK_BUTTON_POS_ANCHOR_KEY, posAnchor)
  }, [hudViewport, quickButtonPosAnchor, quickButtonPosUnitX, quickButtonPosUnitY, storageUserId])

  const setQuickButtonPosUnit = useCallback((axis: 'x' | 'y', unit: PosUnit) => {
    const currentUnit = axis === 'x' ? quickButtonPosUnitX : quickButtonPosUnitY
    if (currentUnit === unit) return
    const viewportSize = axis === 'x' ? hudViewport.width : hudViewport.height
    setSkillHudConfigs(prev => Object.fromEntries(Object.entries(prev).map(([skillId, config]) => [
      skillId,
      {
        ...config,
        [axis]: currentUnit === '%' ? config[axis] / 100 * viewportSize : config[axis] / viewportSize * 100,
      },
    ])))
    setItemHudConfigs(prev => Object.fromEntries(Object.entries(prev).map(([itemDataId, config]) => [
      itemDataId,
      {
        ...config,
        [axis]: currentUnit === '%' ? config[axis] / 100 * viewportSize : config[axis] / viewportSize * 100,
      },
    ])))
    setConsumableBundleHudConfigs(prev => Object.fromEntries(Object.entries(prev).map(([id, config]) => [
      id,
      {
        ...config,
        [axis]: currentUnit === '%' ? config[axis] / 100 * viewportSize : config[axis] / viewportSize * 100,
      },
    ])))
    if (axis === 'x') {
      setQuickButtonPosUnitX(unit)
      setAccountHudStorageItem(storageUserId, QUICK_BUTTON_POS_UNIT_X_KEY, unit)
    } else {
      setQuickButtonPosUnitY(unit)
      setAccountHudStorageItem(storageUserId, QUICK_BUTTON_POS_UNIT_Y_KEY, unit)
    }
  }, [hudViewport, quickButtonPosUnitX, quickButtonPosUnitY, storageUserId])

  const createHudPresetSnapshot = useCallback((): HudPresetData => ({
    version: HUD_PRESET_VERSION,
    configs,
    quickSlots,
    skillHudConfigs,
    itemHudConfigs,
    consumableBundleHudConfigs,
    opacity,
    scale,
    quickButtonScale,
    skillQuickButtonOpacity,
    gridSnapEnabled,
    gridExponent,
    quickButtonPosAnchor,
    quickButtonPosUnitX,
    quickButtonPosUnitY,
  }), [
    configs,
    consumableBundleHudConfigs,
    gridExponent,
    gridSnapEnabled,
    itemHudConfigs,
    opacity,
    quickButtonPosAnchor,
    quickButtonPosUnitX,
    quickButtonPosUnitY,
    quickButtonScale,
    quickSlots,
    scale,
    skillHudConfigs,
    skillQuickButtonOpacity,
  ])

  const applyHudPreset = useCallback((value: unknown) => {
    const preset = normalizeHudPresetData(value)
    if (!preset) {
      setHudPresetMessage('불러온 HUD 프리셋 데이터가 올바르지 않습니다.')
      return
    }
    const mergedConfigs = Object.fromEntries(Object.keys(DEFAULT_CONFIGS).map(id => [
      id,
      { ...DEFAULT_CONFIGS[id], ...(preset.configs[id] ?? {}) },
    ]))
    setConfigs(mergedConfigs)
    setQuickSlots(preset.quickSlots)
    setSkillHudConfigs(preset.skillHudConfigs)
    setItemHudConfigs(preset.itemHudConfigs)
    setConsumableBundleHudConfigs(preset.consumableBundleHudConfigs)
    setOpacityState(preset.opacity)
    setScaleState(preset.scale)
    setQuickButtonScaleState(preset.quickButtonScale)
    setSkillQuickButtonOpacityState(preset.skillQuickButtonOpacity)
    setGridSnapEnabledState(preset.gridSnapEnabled)
    setGridExponentState(preset.gridExponent)
    setQuickButtonPosAnchorState(preset.quickButtonPosAnchor)
    setQuickButtonPosUnitX(preset.quickButtonPosUnitX)
    setQuickButtonPosUnitY(preset.quickButtonPosUnitY)

    setAccountHudStorageItem(storageUserId, STORAGE_KEY, JSON.stringify(mergedConfigs))
    setAccountHudStorageItem(storageUserId, QUICK_SLOTS_KEY, JSON.stringify(preset.quickSlots))
    setAccountHudStorageItem(storageUserId, SKILL_HUD_KEY, JSON.stringify(preset.skillHudConfigs))
    setAccountHudStorageItem(storageUserId, ITEM_HUD_KEY, JSON.stringify(preset.itemHudConfigs))
    setAccountHudStorageItem(
      storageUserId,
      CONSUMABLE_BUNDLE_HUD_KEY,
      JSON.stringify(preset.consumableBundleHudConfigs),
    )
    setAccountHudStorageItem(storageUserId, OPACITY_KEY, String(preset.opacity))
    setAccountHudStorageItem(storageUserId, SCALE_KEY, String(preset.scale))
    setAccountHudStorageItem(storageUserId, QUICK_BUTTON_SCALE_KEY, String(preset.quickButtonScale))
    setAccountHudStorageItem(storageUserId, SKILL_QUICK_BUTTON_OPACITY_KEY, String(preset.skillQuickButtonOpacity))
    setAccountHudStorageItem(storageUserId, GRID_SNAP_KEY, String(preset.gridSnapEnabled))
    setAccountHudStorageItem(storageUserId, GRID_EXPONENT_KEY, String(preset.gridExponent))
    setAccountHudStorageItem(storageUserId, QUICK_BUTTON_POS_ANCHOR_KEY, preset.quickButtonPosAnchor)
    setAccountHudStorageItem(storageUserId, QUICK_BUTTON_POS_UNIT_X_KEY, preset.quickButtonPosUnitX)
    setAccountHudStorageItem(storageUserId, QUICK_BUTTON_POS_UNIT_Y_KEY, preset.quickButtonPosUnitY)
  }, [storageUserId])

  useEffect(() => {
    if (!socket || storageUserId === undefined) return
    const onList = (presets: HudPresetSummary[]) => setHudPresetSummaries(presets)
    const onLoaded = ({ name, preset }: { name: string; preset: HudPresetData }) => {
      applyHudPreset(preset)
      setHudPresetMessage(`HUD 프리셋 '${name}'을(를) 불러왔습니다.`)
    }
    const onResult = (result: HudPresetOperationResult) => {
      setHudPresetBusy(false)
      if (!result.ok) {
        setHudPresetMessage(result.error ?? 'HUD 프리셋 작업에 실패했습니다.')
        return
      }
      if (result.action === 'save') setHudPresetMessage(`HUD 프리셋 '${result.name}'을(를) 서버에 저장했습니다.`)
      if (result.action === 'delete') setHudPresetMessage(`HUD 프리셋 '${result.name}'을(를) 삭제했습니다.`)
    }
    socket.on('hudPresetList', onList)
    socket.on('hudPresetLoaded', onLoaded)
    socket.on('hudPresetResult', onResult)
    socket.emit('requestHudPresets')
    return () => {
      socket.off('hudPresetList', onList)
      socket.off('hudPresetLoaded', onLoaded)
      socket.off('hudPresetResult', onResult)
    }
  }, [applyHudPreset, socket, storageUserId])

  const saveHudPreset = useCallback((rawName: string) => {
    const name = normalizeHudPresetName(rawName)
    if (!name) {
      setHudPresetMessage('프리셋 이름은 한글·영문·숫자·공백·_-로 1~24자까지 입력해주세요.')
      return
    }
    if (!socket) {
      setHudPresetMessage('서버에 연결되어 있지 않습니다.')
      return
    }
    setHudPresetBusy(true)
    setHudPresetMessage('')
    socket.emit('saveHudPreset', { name, preset: createHudPresetSnapshot() })
  }, [createHudPresetSnapshot, socket])

  const loadHudPreset = useCallback((rawName: string) => {
    const name = normalizeHudPresetName(rawName)
    if (!name || !socket) {
      setHudPresetMessage(name ? '서버에 연결되어 있지 않습니다.' : '불러올 프리셋 이름을 선택해주세요.')
      return
    }
    setHudPresetBusy(true)
    setHudPresetMessage('')
    socket.emit('loadHudPreset', name)
  }, [socket])

  const deleteHudPreset = useCallback((rawName: string) => {
    const name = normalizeHudPresetName(rawName)
    if (!name || !socket) {
      setHudPresetMessage(name ? '서버에 연결되어 있지 않습니다.' : '삭제할 프리셋 이름을 선택해주세요.')
      return
    }
    setHudPresetBusy(true)
    setHudPresetMessage('')
    socket.emit('deleteHudPreset', name)
  }, [socket])

  return (
    <HudContext.Provider value={{
      configs, editMode, setEditMode,
      gridSnapEnabled, setGridSnapEnabled, gridExponent, gridSize, setGridExponent,
      hudViewportWidth: hudViewport.width, hudViewportHeight: hudViewport.height,
      setVisible, setPosition, setAnchor, setPosUnit, setPosAnchor, setHudOpacity, setHudScale,
      setLocationObjectActionsVisible, setMinimapTravelActionsVisible, resetPosition,
      playerStats, setPlayerStats, playerStatsReceivedAt, locationInfo, setLocationInfo,
      opacity, setOpacity, scale, setScale,
      quickSlots, addQuickSlot, removeQuickSlot, moveQuickSlot, updateQuickSlot,
      skillHudConfigs, setSkillHudVisible, setSkillHudPosition, resetSkillHudPosition,
      itemHudConfigs, setItemHudVisible, setItemHudPosition, resetItemHudPosition,
      consumableBundleHudConfigs, createConsumableBundle, removeConsumableBundle,
      setConsumableBundleVisible, setConsumableBundlePosition, resetConsumableBundlePosition,
      quickButtonScale, setQuickButtonScale,
      skillQuickButtonOpacity, setSkillQuickButtonOpacity,
      quickButtonPosAnchor, setQuickButtonPosAnchor,
      quickButtonPosUnitX, quickButtonPosUnitY, setQuickButtonPosUnit,
      hudPresetSummaries, hudPresetBusy, hudPresetMessage,
      saveHudPreset, loadHudPreset, deleteHudPreset,
    }}>
      {children}
    </HudContext.Provider>
  )
}

export function useHud() {
  const ctx = useContext(HudContext)
  if (!ctx) throw new Error('useHud must be used within HudProvider')
  return ctx
}
