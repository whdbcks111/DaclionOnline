import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { PlayerStatsData } from '@shared/types'

export interface HudConfig {
  id: string
  visible: boolean
  x: number  // 화면 너비 대비 %
  y: number  // 화면 높이 대비 %
}

const OPACITY_KEY = 'hud-opacity'
const SCALE_KEY = 'hud-scale'

export interface HudDefinition {
  id: string
  label: string
}

export const HUD_DEFINITIONS: HudDefinition[] = [
  { id: 'player-status', label: '플레이어 상태' },
]

const DEFAULT_CONFIGS: Record<string, HudConfig> = {
  'player-status': { id: 'player-status', visible: true, x: 1, y: 1 },
}

interface HudContextType {
  configs: Record<string, HudConfig>
  editMode: boolean
  setEditMode: (v: boolean) => void
  setVisible: (id: string, visible: boolean) => void
  setPosition: (id: string, x: number, y: number) => void
  playerStats: PlayerStatsData | null
  setPlayerStats: (data: PlayerStatsData) => void
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
        const parsed = JSON.parse(saved) as Record<string, HudConfig>
        return { ...DEFAULT_CONFIGS, ...parsed }
      }
    } catch { /* ignore */ }
    return { ...DEFAULT_CONFIGS }
  })

  const [editMode, setEditMode] = useState(false)
  const [playerStats, setPlayerStats] = useState<PlayerStatsData | null>(null)
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
      [id]: { ...(prev[id] ?? DEFAULT_CONFIGS[id] ?? { id, x: 50, y: 50 }), visible },
    }))
  }, [])

  const setPosition = useCallback((id: string, x: number, y: number) => {
    setConfigs(prev => ({
      ...prev,
      [id]: { ...(prev[id] ?? DEFAULT_CONFIGS[id] ?? { id, visible: true }), x, y },
    }))
  }, [])

  return (
    <HudContext.Provider value={{ configs, editMode, setEditMode, setVisible, setPosition, playerStats, setPlayerStats, opacity, setOpacity, scale, setScale }}>
      {children}
    </HudContext.Provider>
  )
}

export function useHud() {
  const ctx = useContext(HudContext)
  if (!ctx) throw new Error('useHud must be used within HudProvider')
  return ctx
}
