import { useContext } from 'react'
import { GameAudioContext, type GameAudioContextValue } from './gameAudioContextValue'

export function useGameAudio(): GameAudioContextValue {
  const value = useContext(GameAudioContext)
  if (!value) throw new Error('useGameAudio는 GameAudioProvider 내부에서만 사용할 수 있습니다')
  return value
}
