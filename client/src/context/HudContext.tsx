import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { PlayerStatsData, LocationInfoData } from '@shared/types'

export type AnchorPoint = 'topLeft' | 'topMiddle' | 'topRight' | 'middleLeft' | 'center' | 'middleRight' | 'bottomLeft' | 'bottomMiddle' | 'bottomRight'
export type PosAnchor = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

export interface HudConfig {
  id: string
  visible: boolean
  x: number
  y: number
  posUnit: '%' | 'px'
  posAnchor: PosAnchor
  anchor: AnchorPoint
  opacity?: number   // undefined = use global
  scale?: number     // undefined = use global
}

const OPACITY_KEY = 'hud-opacity'
const SCALE_KEY = 'hud-scale'

export interface HudDefinition {
  id: string
  label: string
}

export const HUD_DEFINITIONS: HudDefinition[] = [
  { id: 'player-status', label: '플레이어 상태' },
  { id: 'player-location', label: '위치 정보' },
  { id: 'minimap', label: '미니맵' },
]

const DEFAULT_CONFIGS: Record<string, HudConfig> = {
  'player-status':   { id: 'player-status',   visible: true,  x: 5, y: 10, posUnit: '%', posAnchor: 'topRight',  anchor: 'topRight' },
  'player-location': { id: 'player-location', visible: false, x: 5, y: 30, posUnit: '%', posAnchor: 'topRight',  anchor: 'topRight' },
  'minimap':         { id: 'minimap',         visible: false, x: 5, y: 45, posUnit: '%', posAnchor: 'topRight',  anchor: 'topRight' },
}

interface HudContextType {
  configs: Record<string, HudConfig>
  editMode: boolean
  setEditMode: (v: boolean) => void
  setVisible: (id: string, visible: boolean) => void
  setPosition: (id: string, x: number, y: number) => void
  setAnchor: (id: string, anchor: AnchorPoint) => void
  setPosUnit: (id: string, unit: '%' | 'px') => void
  setPosAnchor: (id: string, posAnchor: PosAnchor) => void
  setHudOpacity: (id: string, opacity: number | undefined) => void
  setHudScale: (id: string, scale: number | undefined) => void
  resetPosition: (id: string) => void
  playerStats: PlayerStatsData | null
  setPlayerStats: (data: PlayerStatsData) => void
  locationInfo: LocationInfoData | null
  setLocationInfo: (data: LocationInfoData) => void
  opacity: number
  setOpacity: (v: number) => void
  scale: number
  setScale: (v: number) => void
}

const HudContext = createContext<HudContextType | null>(null)

const STORAGE_KEY = 'hud-configs'

export function HudProvider({ children }: { children: React.ReactNode }) {
  const [configs, setConfigs] = useState<Record<string, HudConfig>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, Partial<HudConfig>>
        const merged: Record<string, HudConfig> = {}
        for (const id of Object.keys(DEFAULT_CONFIGS)) {
          merged[id] = { ...DEFAULT_CONFIGS[id], ...(parsed[id] ?? {}) }
        }
        return merged
      }
    } catch { /* ignore */ }
    return { ...DEFAULT_CONFIGS }
  })

  const [editMode, setEditMode] = useState(false)
  const [playerStats, setPlayerStats] = useState<PlayerStatsData | null>(null)
  const [locationInfo, setLocationInfo] = useState<LocationInfoData | null>(null)
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

  const patchConfig = useCallback((id: string, patch: Partial<HudConfig>) => {
    setConfigs(prev => ({
      ...prev,
      [id]: { ...(prev[id] ?? DEFAULT_CONFIGS[id] ?? { id, visible: true, x: 50, y: 50, posUnit: '%' as const, posAnchor: 'topLeft' as PosAnchor, anchor: 'topLeft' as AnchorPoint }), ...patch },
    }))
  }, [])

  const setVisible   = useCallback((id: string, visible: boolean)               => patchConfig(id, { visible }), [patchConfig])
  const setPosition  = useCallback((id: string, x: number, y: number)           => patchConfig(id, { x, y }), [patchConfig])
  const setAnchor    = useCallback((id: string, anchor: AnchorPoint)            => patchConfig(id, { anchor }), [patchConfig])

  const setPosUnit = useCallback((id: string, unit: '%' | 'px') => {
    setConfigs(prev => {
      const cfg = prev[id] ?? DEFAULT_CONFIGS[id]
      if (!cfg || cfg.posUnit === unit) return prev
      const vw = window.innerWidth
      const vh = window.innerHeight
      let newX = cfg.x
      let newY = cfg.y
      if (cfg.posUnit === '%' && unit === 'px') {
        newX = Math.round(cfg.x / 100 * vw)
        newY = Math.round(cfg.y / 100 * vh)
      } else if (cfg.posUnit === 'px' && unit === '%') {
        newX = Math.round(cfg.x / vw * 1000) / 10
        newY = Math.round(cfg.y / vh * 1000) / 10
      }
      return { ...prev, [id]: { ...cfg, posUnit: unit, x: newX, y: newY } }
    })
  }, [])

  const setPosAnchor = useCallback((id: string, posAnchor: PosAnchor) => {
    setConfigs(prev => {
      const cfg = prev[id] ?? DEFAULT_CONFIGS[id]
      if (!cfg || cfg.posAnchor === posAnchor) return prev
      const unit = cfg.posUnit ?? '%'
      const maxX = unit === '%' ? 100 : window.innerWidth
      const maxY = unit === '%' ? 100 : window.innerHeight
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
    patchConfig(id, { x: def.x, y: def.y, posUnit: def.posUnit, posAnchor: def.posAnchor })
  }, [patchConfig])

  return (
    <HudContext.Provider value={{
      configs, editMode, setEditMode,
      setVisible, setPosition, setAnchor, setPosUnit, setPosAnchor, setHudOpacity, setHudScale, resetPosition,
      playerStats, setPlayerStats, locationInfo, setLocationInfo,
      opacity, setOpacity, scale, setScale,
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
