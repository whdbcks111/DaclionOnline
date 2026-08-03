import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  DEFAULT_MUSIC_VOLUME,
  normalizeMusicVolume,
  readMusicVolume,
  resolveMusicCombatState,
  writeMusicVolume,
} from '@shared/adaptiveMusic'
import { AdaptiveMusicEngine } from '../audio/AdaptiveMusicEngine'
import { useHud } from './HudContext'
import { useSocket } from './SocketContext'
import { GameAudioContext } from './gameAudioContextValue'

function getInitialVolume(): number {
  if (typeof window === 'undefined') return DEFAULT_MUSIC_VOLUME
  try { return readMusicVolume(window.localStorage) } catch { return DEFAULT_MUSIC_VOLUME }
}

function hasActiveDocument(): boolean {
  return document.visibilityState !== 'hidden' && document.hasFocus()
}

export function GameAudioProvider({ children }: { children: ReactNode }) {
  const { playerStats, locationInfo } = useHud()
  const { isConnected, sessionInfo } = useSocket()
  const engineRef = useRef<AdaptiveMusicEngine | null>(null)
  const [musicVolume, setMusicVolumeState] = useState(getInitialVolume)
  const volumeRef = useRef(musicVolume)
  const lastAudibleVolumeRef = useRef(musicVolume > 0 ? musicVolume : DEFAULT_MUSIC_VOLUME)
  const resolvedCombatState = resolveMusicCombatState(playerStats?.musicCombatState, playerStats?.target)

  const setMusicVolume = useCallback((value: number) => {
    const normalized = normalizeMusicVolume(value)
    volumeRef.current = normalized
    if (normalized > 0) lastAudibleVolumeRef.current = normalized
    try { writeMusicVolume(window.localStorage, normalized) } catch { /* unavailable storage */ }
    setMusicVolumeState(normalized)
    engineRef.current?.setVolume(normalized)
    // range/click handler 안에서 복원될 때도 WebAudio unlock 기회를 놓치지 않는다.
    if (normalized > 0) void engineRef.current?.unlock()
  }, [])

  const toggleMusicMute = useCallback(() => {
    setMusicVolume(volumeRef.current > 0 ? 0 : lastAudibleVolumeRef.current)
  }, [setMusicVolume])

  useEffect(() => {
    const engine = new AdaptiveMusicEngine()
    engineRef.current = engine
    engine.setVolume(volumeRef.current)
    return () => {
      engine.dispose()
      if (engineRef.current === engine) engineRef.current = null
    }
  }, [])

  useEffect(() => {
    engineRef.current?.setVolume(musicVolume)
  }, [musicVolume])

  useEffect(() => {
    const locationId = locationInfo?.locationId
    if (!locationId) return
    engineRef.current?.setScene(locationId, locationInfo.mapColor, resolvedCombatState)
  }, [locationInfo?.locationId, locationInfo?.mapColor, resolvedCombatState])

  useEffect(() => {
    const syncAudibility = () => {
      engineRef.current?.setAudible(Boolean(isConnected && sessionInfo && hasActiveDocument()))
    }
    syncAudibility()
    document.addEventListener('visibilitychange', syncAudibility)
    window.addEventListener('focus', syncAudibility)
    window.addEventListener('blur', syncAudibility)
    window.addEventListener('pageshow', syncAudibility)
    window.addEventListener('pagehide', syncAudibility)
    return () => {
      document.removeEventListener('visibilitychange', syncAudibility)
      window.removeEventListener('focus', syncAudibility)
      window.removeEventListener('blur', syncAudibility)
      window.removeEventListener('pageshow', syncAudibility)
      window.removeEventListener('pagehide', syncAudibility)
    }
  }, [isConnected, sessionInfo])

  useEffect(() => {
    const unlockFromGesture = () => {
      if (volumeRef.current > 0) void engineRef.current?.unlock()
    }
    document.addEventListener('pointerdown', unlockFromGesture, { capture: true })
    document.addEventListener('keydown', unlockFromGesture, { capture: true })
    document.addEventListener('touchstart', unlockFromGesture, { capture: true, passive: true })
    return () => {
      document.removeEventListener('pointerdown', unlockFromGesture, { capture: true })
      document.removeEventListener('keydown', unlockFromGesture, { capture: true })
      document.removeEventListener('touchstart', unlockFromGesture, { capture: true })
    }
  }, [])

  return (
    <GameAudioContext.Provider value={{
      musicVolume,
      musicMuted: musicVolume === 0,
      setMusicVolume,
      toggleMusicMute,
    }}>
      {children}
    </GameAudioContext.Provider>
  )
}
