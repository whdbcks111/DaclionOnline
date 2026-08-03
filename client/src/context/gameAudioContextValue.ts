import { createContext } from 'react'

export interface GameAudioContextValue {
  musicVolume: number
  musicMuted: boolean
  setMusicVolume: (volume: number) => void
  toggleMusicMute: () => void
}

export const GameAudioContext = createContext<GameAudioContextValue | undefined>(undefined)
