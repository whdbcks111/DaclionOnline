import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { PlayerStatsData, LocationInfoData } from '@shared/types'

export type AnchorPoint = 'topLeft' | 'topMiddle' | 'topRight' | 'middleLeft' | 'center' | 'middleRight' | 'bottomLeft' | 'bottomMiddle' | 'bottomRight'

export interface HudConfig {
  id: string
  visible: boolean
  x: number  // 화면 너비 대비 %
  y: number  // 화면 높이 대비 %
  anchor: AnchorPoint
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
  'player-status': { id: 'player-status', visible: true, x: 95, y: 10, anchor: 'topRight' },
  'player-location': { id: 'player-location', visible: false, x: 95, y: 30, anchor: 'topRight' },
  'minimap': { id: 'minimap', visible: true, x: 5, y: 90, anchor: 'bottomLeft' },
}

interface HudContextType {
  configs: Record<string, HudConfig>
  editMode: boolean
  setEditMode: (v: boolean) => void
  setVisible: (id: string, visible: boolean) => void
  setPosition: (id: string, x: number, y: number) => void
  setAnchor: (id: string, anchor: AnchorPoint) => void
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

  const setVisible = useCallback((id: string, visible: boolean) => {
    setConfigs(prev => ({
      ...prev,
      [id]: { ...(prev[id] ?? DEFAULT_CONFIGS[id] ?? { id, x: 50, y: 50, anchor: 'topLeft' as AnchorPoint }), visible },
    }))
  }, [])

  const setPosition = useCallback((id: string, x: number, y: number) => {
    setConfigs(prev => ({
      ...prev,
      [id]: { ...(prev[id] ?? DEFAULT_CONFIGS[id] ?? { id, visible: true, anchor: 'topLeft' as AnchorPoint }), x, y },
    }))
  }, [])

  const setAnchor = useCallback((id: string, anchor: AnchorPoint) => {
    setConfigs(prev => ({
      ...prev,
      [id]: { ...(prev[id] ?? DEFAULT_CONFIGS[id] ?? { id, visible: true, x: 50, y: 50 }), anchor },
    }))
  }, [])

  return (
    <HudContext.Provider value={{ configs, editMode, setEditMode, setVisible, setPosition, setAnchor, playerStats, setPlayerStats, locationInfo, setLocationInfo, opacity, setOpacity, scale, setScale }}>
      {children}
    </HudContext.Provider>
  )
}

export function useHud() {
  const ctx = useContext(HudContext)
  if (!ctx) throw new Error('useHud must be used within HudProvider')
  return ctx
}
