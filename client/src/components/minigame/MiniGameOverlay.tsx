import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  FishingSimulationState,
  MiniGameInputSample,
  MiniGameStartData,
} from '@shared/minigames'
import { simulateFishingCapture } from '@shared/minigames'
import { useSocket } from '../../context/SocketContext'
import styles from './MiniGameOverlay.module.scss'

const INITIAL_STATE: FishingSimulationState = {
  gauge: 0.5,
  netX: 50,
  netY: 50,
  fishX: 50,
  fishY: 50,
  caught: false,
  finished: false,
  success: false,
}

export default function MiniGameOverlay() {
  const { socket } = useSocket()
  const [game, setGame] = useState<MiniGameStartData | null>(null)
  const [state, setState] = useState(INITIAL_STATE)
  const [joystickDirection, setJoystickDirection] = useState({ x: 0, y: 0 })
  const [status, setStatus] = useState('물고기를 채집 영역 안에 유지하세요!')
  const startedAt = useRef(0)
  const inputs = useRef<MiniGameInputSample[]>([{ at: 0, x: 0, y: 0 }])
  const direction = useRef({ x: 0, y: 0 })
  const submitted = useRef(false)
  const pressedKeys = useRef(new Set<string>())
  const joystickRef = useRef<HTMLDivElement>(null)

  const setDirection = useCallback((x: number, y: number) => {
    const magnitude = Math.hypot(x, y)
    const next = magnitude > 1 ? { x: x / magnitude, y: y / magnitude } : { x, y }
    if (Math.abs(next.x - direction.current.x) < 0.01 && Math.abs(next.y - direction.current.y) < 0.01) return
    direction.current = next
    setJoystickDirection(next)
    const at = Math.max(0, performance.now() - startedAt.current)
    inputs.current.push({ at, ...next })
  }, [])

  const updateKeyboardDirection = useCallback(() => {
    const keys = pressedKeys.current
    const x = Number(keys.has('arrowright') || keys.has('d')) - Number(keys.has('arrowleft') || keys.has('a'))
    const y = Number(keys.has('arrowdown') || keys.has('s')) - Number(keys.has('arrowup') || keys.has('w'))
    setDirection(x, y)
  }, [setDirection])

  useEffect(() => {
    if (!socket) return
    const onStart = (data: MiniGameStartData) => {
      setGame(data)
      setState({ ...INITIAL_STATE, gauge: data.config.initialGauge })
      setStatus(`${data.config.rarityLabel} 등급 입질!`)
      startedAt.current = performance.now()
      inputs.current = [{ at: 0, x: 0, y: 0 }]
      direction.current = { x: 0, y: 0 }
      setJoystickDirection({ x: 0, y: 0 })
      pressedKeys.current.clear()
      submitted.current = false
    }
    const onResolved = (data: { sessionId: string; success: boolean; message?: string }) => {
      if (data.sessionId !== game?.sessionId) return
      setStatus(data.success ? '낚시 성공!' : (data.message ?? '낚시 실패'))
      window.setTimeout(() => setGame(null), 900)
    }
    const onCancelled = (data: { sessionId: string; reason: string }) => {
      if (data.sessionId !== game?.sessionId) return
      setStatus(data.reason)
      window.setTimeout(() => setGame(null), 700)
    }
    socket.on('miniGameStart', onStart)
    socket.on('miniGameResolved', onResolved)
    socket.on('miniGameCancelled', onCancelled)
    return () => {
      socket.off('miniGameStart', onStart)
      socket.off('miniGameResolved', onResolved)
      socket.off('miniGameCancelled', onCancelled)
    }
  }, [socket, game?.sessionId])

  useEffect(() => {
    if (!game) return
    const relevant = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'])
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (!relevant.has(key)) return
      event.preventDefault()
      pressedKeys.current.add(key)
      updateKeyboardDirection()
    }
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (!relevant.has(key)) return
      event.preventDefault()
      pressedKeys.current.delete(key)
      updateKeyboardDirection()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      setDirection(0, 0)
    }
  }, [game, setDirection, updateKeyboardDirection])

  useEffect(() => {
    if (!game || !socket) return
    let frame = 0
    const tick = () => {
      const elapsedMs = Math.min(game.config.durationMs, performance.now() - startedAt.current)
      const next = simulateFishingCapture(game.config, inputs.current, elapsedMs)
      setState(next)
      if (next.finished && !submitted.current) {
        submitted.current = true
        setStatus('결과를 확인하는 중...')
        socket.emit('miniGameResult', {
          sessionId: game.sessionId,
          token: game.token,
          elapsedMs,
          inputs: inputs.current,
        })
        return
      }
      if (!submitted.current) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [game, socket])

  const updateJoystick = (clientX: number, clientY: number) => {
    const element = joystickRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const radius = Math.max(1, rect.width / 2)
    setDirection((clientX - (rect.left + radius)) / radius, (clientY - (rect.top + radius)) / radius)
  }

  if (!game) return null
  const config = game.config
  const netStyle = {
    left: `${state.netX}%`,
    top: `${state.netY}%`,
    width: `${config.netWidth}%`,
    height: `${config.netHeight}%`,
    borderRadius: config.netShape === 'circle' ? '50%' : config.netShape === 'square' ? '18%' : '28%',
  }

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="낚시 미니게임">
      <section className={styles.panel}>
        <header>
          <div>
            <span className={styles.rarity} style={{ color: config.rarityColor }}>{config.rarityLabel}</span>
            <h2>물고기 포획</h2>
          </div>
          <p>WASD · 방향키 · 모바일 조이스틱</p>
        </header>
        <div className={styles.gauge} aria-label={`포획 게이지 ${Math.round(state.gauge * 100)}%`}>
          <span style={{ width: `${state.gauge * 100}%` }} />
          <b>{Math.round(state.gauge * 100)}%</b>
        </div>
        <div className={styles.board}>
          <div className={`${styles.net} ${state.caught ? styles.caught : ''}`} style={netStyle} />
          <img
            className={styles.fish}
            src={`/icons/${config.fishIcon}.png`}
            alt="움직이는 물고기"
            draggable={false}
            style={{ left: `${state.fishX}%`, top: `${state.fishY}%` }}
          />
        </div>
        <div className={styles.controls}>
          <strong>{status}</strong>
          <div
            ref={joystickRef}
            className={styles.joystick}
            onPointerDown={event => {
              event.currentTarget.setPointerCapture(event.pointerId)
              updateJoystick(event.clientX, event.clientY)
            }}
            onPointerMove={event => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) updateJoystick(event.clientX, event.clientY)
            }}
            onPointerUp={event => {
              event.currentTarget.releasePointerCapture(event.pointerId)
              setDirection(0, 0)
            }}
            onPointerCancel={() => setDirection(0, 0)}
          >
            <span style={{ transform: `translate(${joystickDirection.x * 65}%, ${joystickDirection.y * 65}%)` }} />
          </div>
        </div>
      </section>
    </div>
  )
}
