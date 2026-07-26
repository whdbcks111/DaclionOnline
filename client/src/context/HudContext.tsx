import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { PlayerStatsData, LocationInfoData } from '@shared/types'
import { createDefaultSkillHudConfig } from './skillHudConfig'
import type { SkillHudConfig } from './skillHudConfig'

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
const QUICK_BUTTON_SCALE_KEY = 'hud-quick-button-scale'
const GRID_SNAP_KEY = 'hud-grid-snap'
const GRID_EXPONENT_KEY = 'hud-grid-exponent'
const QUICK_BUTTON_POS_ANCHOR_KEY = 'hud-quick-button-pos-anchor'
const QUICK_BUTTON_POS_UNIT_X_KEY = 'hud-quick-button-pos-unit-x'
const QUICK_BUTTON_POS_UNIT_Y_KEY = 'hud-quick-button-pos-unit-y'
export const HUD_GRID_EXPONENT_MIN = 2
export const HUD_GRID_EXPONENT_MAX = 6
export const MAX_QUICK_SLOTS = 10

function isPosAnchor(value: unknown): value is PosAnchor {
  return value === 'topLeft' || value === 'topRight' || value === 'bottomLeft' || value === 'bottomRight'
}

function isPosUnit(value: unknown): value is PosUnit {
  return value === '%' || value === 'px'
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

function isKeyboardInputFocused(): boolean {
  const active = document.activeElement
  return active instanceof HTMLInputElement
    || active instanceof HTMLTextAreaElement
    || (active instanceof HTMLElement && active.isContentEditable)
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
  quickButtonScale: number
  setQuickButtonScale: (scale: number) => void
  quickButtonPosAnchor: PosAnchor
  setQuickButtonPosAnchor: (posAnchor: PosAnchor) => void
  quickButtonPosUnitX: PosUnit
  quickButtonPosUnitY: PosUnit
  setQuickButtonPosUnit: (axis: 'x' | 'y', unit: PosUnit) => void
}

const HudContext = createContext<HudContextType | null>(null)

const STORAGE_KEY = 'hud-configs'

export function HudProvider({ children }: { children: React.ReactNode }) {
  const [configs, setConfigs] = useState<Record<string, HudConfig>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
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
  const [hudViewport, setHudViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1024 : window.innerWidth,
    height: typeof window === 'undefined' ? 768 : window.innerHeight,
  }))
  const [gridSnapEnabled, setGridSnapEnabledState] = useState(() => {
    try { return localStorage.getItem(GRID_SNAP_KEY) === 'true' } catch { return false }
  })
  const [gridExponent, setGridExponentState] = useState(() => {
    try {
      const raw = localStorage.getItem(GRID_EXPONENT_KEY)
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
      const saved = localStorage.getItem(QUICK_BUTTON_POS_ANCHOR_KEY)
      if (isPosAnchor(saved)) return saved
    } catch { /* ignore */ }
    return 'topLeft'
  })
  const [quickButtonPosUnitX, setQuickButtonPosUnitX] = useState<PosUnit>(() => {
    try {
      const saved = localStorage.getItem(QUICK_BUTTON_POS_UNIT_X_KEY)
      if (isPosUnit(saved)) return saved
    } catch { /* ignore */ }
    return '%'
  })
  const [quickButtonPosUnitY, setQuickButtonPosUnitY] = useState<PosUnit>(() => {
    try {
      const saved = localStorage.getItem(QUICK_BUTTON_POS_UNIT_Y_KEY)
      if (isPosUnit(saved)) return saved
    } catch { /* ignore */ }
    return '%'
  })
  const [playerStats, setPlayerStatsState] = useState<PlayerStatsData | null>(null)
  const [playerStatsReceivedAt, setPlayerStatsReceivedAt] = useState(0)
  const [locationInfo, setLocationInfo] = useState<LocationInfoData | null>(null)
  const [quickSlots, setQuickSlots] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(QUICK_SLOTS_KEY)
      if (saved) return JSON.parse(saved) as string[]
    } catch { /* ignore */ }
    return []
  })
  const [skillHudConfigs, setSkillHudConfigs] = useState<Record<string, SkillHudConfig>>(() => {
    try {
      const saved = localStorage.getItem(SKILL_HUD_KEY)
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

  const saveQuickSlots = useCallback((slots: string[]) => {
    setQuickSlots(slots)
    localStorage.setItem(QUICK_SLOTS_KEY, JSON.stringify(slots))
  }, [])

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
      const saved = localStorage.getItem(OPACITY_KEY)
      if (saved !== null) return Math.max(0.1, Math.min(1, parseFloat(saved)))
    } catch { /* ignore */ }
    return 1
  })

  const setOpacity = useCallback((v: number) => {
    const clamped = Math.max(0.1, Math.min(1, v))
    setOpacityState(clamped)
    localStorage.setItem(OPACITY_KEY, String(clamped))
  }, [])

  const [scale, setScaleState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(SCALE_KEY)
      if (saved !== null) return Math.max(0.1, Math.min(1, parseFloat(saved)))
    } catch { /* ignore */ }
    return 1
  })

  const setScale = useCallback((v: number) => {
    const clamped = Math.max(0.1, Math.min(1, v))
    setScaleState(clamped)
    localStorage.setItem(SCALE_KEY, String(clamped))
  }, [])

  const [quickButtonScale, setQuickButtonScaleState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(QUICK_BUTTON_SCALE_KEY)
      if (saved !== null) return Math.max(0.5, Math.min(2, parseFloat(saved)))
    } catch { /* ignore */ }
    return 1
  })

  const setQuickButtonScale = useCallback((value: number) => {
    const clamped = Math.max(0.5, Math.min(2, value))
    setQuickButtonScaleState(clamped)
    localStorage.setItem(QUICK_BUTTON_SCALE_KEY, String(clamped))
  }, [])

  const setGridSnapEnabled = useCallback((enabled: boolean) => {
    setGridSnapEnabledState(enabled)
    localStorage.setItem(GRID_SNAP_KEY, String(enabled))
  }, [])

  const setGridExponent = useCallback((exponent: number) => {
    const normalized = Math.max(HUD_GRID_EXPONENT_MIN, Math.min(HUD_GRID_EXPONENT_MAX, Math.round(exponent)))
    setGridExponentState(normalized)
    localStorage.setItem(GRID_EXPONENT_KEY, String(normalized))
  }, [])

  useEffect(() => {
    const updateHudViewport = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      setHudViewport(previous => {
        const sameOrientation = (previous.width >= previous.height) === (width >= height)
        const keyboardResize = sameOrientation
          && Math.abs(width - previous.width) < 48
          && height < previous.height - 120
          && (isKeyboardInputFocused() || navigator.maxTouchPoints > 0)
        if (keyboardResize) return previous
        if (previous.width === width && previous.height === height) return previous
        return { width, height }
      })
    }
    window.addEventListener('resize', updateHudViewport)
    window.addEventListener('orientationchange', updateHudViewport)
    return () => {
      window.removeEventListener('resize', updateHudViewport)
      window.removeEventListener('orientationchange', updateHudViewport)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs))
  }, [configs])

  useEffect(() => {
    localStorage.setItem(SKILL_HUD_KEY, JSON.stringify(skillHudConfigs))
  }, [skillHudConfigs])

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
    setQuickButtonPosAnchorState(posAnchor)
    localStorage.setItem(QUICK_BUTTON_POS_ANCHOR_KEY, posAnchor)
  }, [hudViewport, quickButtonPosAnchor, quickButtonPosUnitX, quickButtonPosUnitY])

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
    if (axis === 'x') {
      setQuickButtonPosUnitX(unit)
      localStorage.setItem(QUICK_BUTTON_POS_UNIT_X_KEY, unit)
    } else {
      setQuickButtonPosUnitY(unit)
      localStorage.setItem(QUICK_BUTTON_POS_UNIT_Y_KEY, unit)
    }
  }, [hudViewport, quickButtonPosUnitX, quickButtonPosUnitY])

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
      quickButtonScale, setQuickButtonScale,
      quickButtonPosAnchor, setQuickButtonPosAnchor,
      quickButtonPosUnitX, quickButtonPosUnitY, setQuickButtonPosUnit,
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
