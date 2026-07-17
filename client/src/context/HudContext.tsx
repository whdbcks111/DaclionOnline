import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { PlayerStatsData, LocationInfoData } from '@shared/types'
import { createDefaultSkillHudConfig } from './skillHudConfig'
import type { SkillHudConfig } from './skillHudConfig'

export type AnchorPoint = 'topLeft' | 'topMiddle' | 'topRight' | 'middleLeft' | 'center' | 'middleRight' | 'bottomLeft' | 'bottomMiddle' | 'bottomRight'
export type PosAnchor = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

export interface HudConfig {
  id: string
  visible: boolean
  x: number
  y: number
  posUnitX: '%' | 'px'
  posUnitY: '%' | 'px'
  posAnchor: PosAnchor
  anchor: AnchorPoint
  opacity?: number   // undefined = use global
  scale?: number     // undefined = use global
}

const OPACITY_KEY = 'hud-opacity'
const SCALE_KEY = 'hud-scale'
const QUICK_SLOTS_KEY = 'hud-quick-slots'
const SKILL_HUD_KEY = 'hud-skill-buttons'
export const MAX_QUICK_SLOTS = 10

export interface HudDefinition {
  id: string
  label: string
}

export const HUD_DEFINITIONS: HudDefinition[] = [
  { id: 'player-status', label: '플레이어 상태' },
  { id: 'player-location', label: '위치 정보' },
  { id: 'minimap', label: '미니맵' },
  { id: 'quick-slots', label: '퀵 슬롯' },
  { id: 'party-status', label: '파티원 상태' },
]

const DEFAULT_CONFIGS: Record<string, HudConfig> = {
  'player-status':   { id: 'player-status',   visible: true,  x: 5,  y: 10, posUnitX: '%', posUnitY: '%', posAnchor: 'topRight',    anchor: 'topRight' },
  'player-location': { id: 'player-location', visible: false, x: 5,  y: 30, posUnitX: '%', posUnitY: '%', posAnchor: 'topRight',    anchor: 'topRight' },
  'minimap':         { id: 'minimap',         visible: false, x: 5,  y: 45, posUnitX: '%', posUnitY: '%', posAnchor: 'topRight',    anchor: 'topRight' },
  'quick-slots':     { id: 'quick-slots',     visible: false, x: 50, y: 10,  posUnitX: '%', posUnitY: '%', posAnchor: 'bottomLeft',  anchor: 'bottomMiddle' },
  'party-status':    { id: 'party-status',    visible: true,  x: 5,  y: 23,  posUnitX: '%', posUnitY: '%', posAnchor: 'topLeft',     anchor: 'topLeft' },
}

interface HudContextType {
  configs: Record<string, HudConfig>
  editMode: boolean
  setEditMode: (v: boolean) => void
  setVisible: (id: string, visible: boolean) => void
  setPosition: (id: string, x: number, y: number) => void
  setAnchor: (id: string, anchor: AnchorPoint) => void
  setPosUnit: (id: string, axis: 'x' | 'y', unit: '%' | 'px') => void
  setPosAnchor: (id: string, posAnchor: PosAnchor) => void
  setHudOpacity: (id: string, opacity: number | undefined) => void
  setHudScale: (id: string, scale: number | undefined) => void
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
          x: Math.max(0, Math.min(100, config.x!)),
          y: Math.max(0, Math.min(100, config.y!)),
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

  const setVisible   = useCallback((id: string, visible: boolean)               => patchConfig(id, { visible }), [patchConfig])
  const setPosition  = useCallback((id: string, x: number, y: number)           => patchConfig(id, { x, y }), [patchConfig])
  const setAnchor    = useCallback((id: string, anchor: AnchorPoint)            => patchConfig(id, { anchor }), [patchConfig])

  const setPosUnit = useCallback((id: string, axis: 'x' | 'y', unit: '%' | 'px') => {
    setConfigs(prev => {
      const cfg = prev[id] ?? DEFAULT_CONFIGS[id]
      if (!cfg) return prev
      const vw = window.innerWidth
      const vh = window.innerHeight
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
  }, [])

  const setPosAnchor = useCallback((id: string, posAnchor: PosAnchor) => {
    setConfigs(prev => {
      const cfg = prev[id] ?? DEFAULT_CONFIGS[id]
      if (!cfg || cfg.posAnchor === posAnchor) return prev
      const maxX = (cfg.posUnitX ?? '%') === '%' ? 100 : window.innerWidth
      const maxY = (cfg.posUnitY ?? '%') === '%' ? 100 : window.innerHeight
      const oldIsRight  = cfg.posAnchor === 'topRight'  || cfg.posAnchor === 'bottomRight'
      const oldIsBottom = cfg.posAnchor === 'bottomLeft' || cfg.posAnchor === 'bottomRight'
      const newIsRight  = posAnchor === 'topRight'  || posAnchor === 'bottomRight'
      const newIsBottom = posAnchor === 'bottomLeft' || posAnchor === 'bottomRight'
      const newX = oldIsRight  !== newIsRight  ? maxX - cfg.x : cfg.x
      const newY = oldIsBottom !== newIsBottom ? maxY - cfg.y : cfg.y
      return { ...prev, [id]: { ...cfg, posAnchor, x: newX, y: newY } }
    })
  }, [])
  const setHudOpacity = useCallback((id: string, opacity: number | undefined)   => patchConfig(id, { opacity }), [patchConfig])
  const setHudScale   = useCallback((id: string, scale: number | undefined)     => patchConfig(id, { scale }), [patchConfig])

  const resetPosition = useCallback((id: string) => {
    const def = DEFAULT_CONFIGS[id]
    if (!def) return
    patchConfig(id, { x: def.x, y: def.y, posUnitX: def.posUnitX, posUnitY: def.posUnitY, posAnchor: def.posAnchor })
  }, [patchConfig])

  const patchSkillHudConfig = useCallback((skillId: string, patch: Partial<SkillHudConfig>, defaultIndex = 0) => {
    setSkillHudConfigs(prev => ({
      ...prev,
      [skillId]: { ...(prev[skillId] ?? createDefaultSkillHudConfig(skillId, defaultIndex)), ...patch, skillId },
    }))
  }, [])

  const setSkillHudVisible = useCallback((skillId: string, visible: boolean, defaultIndex = 0) => {
    patchSkillHudConfig(skillId, { visible }, defaultIndex)
  }, [patchSkillHudConfig])

  const setSkillHudPosition = useCallback((skillId: string, x: number, y: number) => {
    patchSkillHudConfig(skillId, {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    })
  }, [patchSkillHudConfig])

  const resetSkillHudPosition = useCallback((skillId: string, defaultIndex = 0) => {
    const defaults = createDefaultSkillHudConfig(skillId, defaultIndex)
    patchSkillHudConfig(skillId, { x: defaults.x, y: defaults.y }, defaultIndex)
  }, [patchSkillHudConfig])

  return (
    <HudContext.Provider value={{
      configs, editMode, setEditMode,
      setVisible, setPosition, setAnchor, setPosUnit, setPosAnchor, setHudOpacity, setHudScale, resetPosition,
      playerStats, setPlayerStats, playerStatsReceivedAt, locationInfo, setLocationInfo,
      opacity, setOpacity, scale, setScale,
      quickSlots, addQuickSlot, removeQuickSlot, moveQuickSlot, updateQuickSlot,
      skillHudConfigs, setSkillHudVisible, setSkillHudPosition, resetSkillHudPosition,
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
