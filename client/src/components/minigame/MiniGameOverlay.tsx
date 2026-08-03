import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type {
  AlchemyTrackingPointerSample,
  AlchemyTrackingSimulationState,
  FishingSimulationState,
  ForgeRhythmSimulationState,
  MiniGameActionSample,
  HazardDodgeSimulationState,
  MiniGameInputSample,
  MiniGameStartData,
} from '@shared/minigames'
import {
  appendAlchemyTrackingPointerSample,
  appendMiniGameInputSample,
  calculateForgeQualityScore,
  createAlchemyTrackingProof,
  createFishingCaptureProof,
  getAlchemyTrackingPathPoints,
  getAlchemyTrackingTargetPosition,
  resolveForgeStrikeTime,
  simulateAlchemyTracking,
  simulateForgeRhythm,
  simulateHazardDodge,
  simulateFishingCapture,
} from '@shared/minigames'
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

const INITIAL_DODGE_STATE: HazardDodgeSimulationState = {
  playerX: 50,
  playerY: 50,
  hazards: [],
  hit: false,
  finished: false,
  success: false,
}

const INITIAL_FORGE_STATE: ForgeRhythmSimulationState = {
  hitCount: 0,
  perfectCount: 0,
  missCount: 0,
  maxCombo: 0,
  accuracy: 0,
  finished: false,
  success: false,
}

const INITIAL_ALCHEMY_STATE: AlchemyTrackingSimulationState = {
  gauge: 0.5,
  pointerX: 50,
  pointerY: 50,
  targetX: 50,
  targetY: 50,
  dragging: false,
  onTarget: false,
  accuracy: 0,
  finished: false,
  success: false,
}

const JOYSTICK_DEAD_ZONE_RATIO = 0.42
const JOYSTICK_MARKERS = [
  { label: '↑', x: 50, y: 12 },
  { label: '↗', x: 77, y: 23 },
  { label: '→', x: 88, y: 50 },
  { label: '↘', x: 77, y: 77 },
  { label: '↓', x: 50, y: 88 },
  { label: '↙', x: 23, y: 77 },
  { label: '←', x: 12, y: 50 },
  { label: '↖', x: 23, y: 23 },
] as const

/** 중앙 정지 영역 밖의 포인터를 같은 속도의 8방향 축으로 고정한다. */
function resolveFixedJoystickDirection(x: number, y: number): { x: number; y: number } {
  const distance = Math.hypot(x, y)
  if (distance < JOYSTICK_DEAD_ZONE_RATIO) return { x: 0, y: 0 }
  const angle = Math.round(Math.atan2(y, x) / (Math.PI / 4)) * (Math.PI / 4)
  return { x: Math.round(Math.cos(angle)), y: Math.round(Math.sin(angle)) }
}

function clampGauge(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** 낮을수록 빨강, 중간은 초록, 성공에 가까울수록 파랑인 현재값 단색. */
function getGaugeColor(value: number): string {
  const gauge = clampGauge(value)
  const hue = gauge <= 0.65
    ? 4 + (gauge / 0.65) * 126
    : 130 + ((gauge - 0.65) / 0.35) * 80
  return `hsl(${hue.toFixed(0)} 58% 44%)`
}

function blurActiveTextEntry(): void {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return
  if (active.isContentEditable || active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    active.blur()
  }
}

export default function MiniGameOverlay() {
  const { socket } = useSocket()
  const [game, setGame] = useState<MiniGameStartData | null>(null)
  const [state, setState] = useState(INITIAL_STATE)
  const [dodgeState, setDodgeState] = useState(INITIAL_DODGE_STATE)
  const [forgeState, setForgeState] = useState(INITIAL_FORGE_STATE)
  const [alchemyState, setAlchemyState] = useState(INITIAL_ALCHEMY_STATE)
  const [alchemyStarted, setAlchemyStarted] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [joystickDirection, setJoystickDirection] = useState({ x: 0, y: 0 })
  const [status, setStatus] = useState('물고기를 채집 영역 안에 유지하세요!')
  const startedAt = useRef(0)
  const inputs = useRef<MiniGameInputSample[]>([{ at: 0, x: 0, y: 0 }])
  const actions = useRef<MiniGameActionSample[]>([])
  const alchemyInputs = useRef<AlchemyTrackingPointerSample[]>([])
  const alchemyStartedRef = useRef(false)
  const alchemyPointerId = useRef<number | null>(null)
  const lastAlchemyPointer = useRef({ x: 50, y: 50 })
  const direction = useRef({ x: 0, y: 0 })
  const submitted = useRef(false)
  const pressedKeys = useRef(new Set<string>())
  const joystickRef = useRef<HTMLDivElement>(null)
  const forgeAudioRef = useRef<AudioContext | null>(null)
  const nextForgeCueRef = useRef(0)
  const displayedElapsedRef = useRef(0)
  const alchemyPathPoints = useMemo(() => game?.type === 'alchemy_tracking'
    ? getAlchemyTrackingPathPoints(game.config)
    : [], [game])

  const playForgeSound = useCallback((kind: 'cue' | 'strike') => {
    const AudioContextClass = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const context = forgeAudioRef.current ?? new AudioContextClass()
    forgeAudioRef.current = context
    if (context.state === 'suspended') void context.resume()
    const now = context.currentTime
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = kind === 'cue' ? 'square' : 'triangle'
    oscillator.frequency.setValueAtTime(kind === 'cue' ? 720 : 210, now)
    if (kind === 'strike') oscillator.frequency.exponentialRampToValueAtTime(72, now + 0.09)
    gain.gain.setValueAtTime(kind === 'cue' ? 0.025 : 0.11, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + (kind === 'cue' ? 0.045 : 0.12))
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(now)
    oscillator.stop(now + (kind === 'cue' ? 0.05 : 0.13))
  }, [])

  useEffect(() => () => {
    if (forgeAudioRef.current) void forgeAudioRef.current.close()
    forgeAudioRef.current = null
  }, [])

  const strike = useCallback((compensateVisualLag = false) => {
    if (submitted.current || game?.type !== 'forge_rhythm') return
    const currentElapsed = Math.max(0, performance.now() - startedAt.current)
    const at = resolveForgeStrikeTime(currentElapsed, displayedElapsedRef.current, compensateVisualLag)
    actions.current.push({ at, action: 'strike' })
    socket?.emit('miniGameAction', {
      sessionId: game.sessionId,
      token: game.token,
      action: 'strike',
    })
    playForgeSound('strike')
  }, [game, playForgeSound, socket])

  useLayoutEffect(() => {
    displayedElapsedRef.current = elapsed
  }, [elapsed])

  const setDirection = useCallback((x: number, y: number) => {
    if (submitted.current) return
    const magnitude = Math.hypot(x, y)
    const next = magnitude > 1 ? { x: x / magnitude, y: y / magnitude } : { x, y }
    if (Math.abs(next.x - direction.current.x) < 0.01 && Math.abs(next.y - direction.current.y) < 0.01) return
    direction.current = next
    setJoystickDirection(next)
    const at = Math.max(0, performance.now() - startedAt.current)
    appendMiniGameInputSample(inputs.current, { at, ...next })
    if (game) {
      socket?.emit('miniGameInput', {
        sessionId: game.sessionId,
        token: game.token,
        x: next.x,
        y: next.y,
      })
    }
  }, [game, socket])

  const updateKeyboardDirection = useCallback(() => {
    const keys = pressedKeys.current
    const x = Number(keys.has('arrowright') || keys.has('d')) - Number(keys.has('arrowleft') || keys.has('a'))
    const y = Number(keys.has('arrowdown') || keys.has('s')) - Number(keys.has('arrowup') || keys.has('w'))
    setDirection(x, y)
  }, [setDirection])

  useEffect(() => {
    if (!socket) return
    const onStart = (data: MiniGameStartData) => {
      blurActiveTextEntry()
      setGame(data)
      if (data.type === 'fishing_capture') {
        setState({ ...INITIAL_STATE, gauge: data.config.initialGauge })
        setStatus(`${data.config.rarityLabel} 등급 입질!`)
      } else if (data.type === 'hazard_dodge') {
        setDodgeState(INITIAL_DODGE_STATE)
        setElapsed(0)
        setStatus(`위험 구역을 피해 ${(data.config.durationMs / 1_000).toFixed(0)}초 동안 버티세요!`)
      } else if (data.type === 'forge_rhythm') {
        setForgeState(INITIAL_FORGE_STATE)
        setElapsed(0)
        setStatus('박자에 맞춰 망치를 내리치세요!')
      } else {
        const initial = simulateAlchemyTracking(data.config, [], 0)
        setAlchemyState(initial)
        setElapsed(0)
        setStatus('움직이는 목표 원을 눌러 추적을 시작하세요!')
      }
      const waitsForPointer = data.type === 'alchemy_tracking'
      startedAt.current = waitsForPointer ? 0 : performance.now()
      displayedElapsedRef.current = 0
      inputs.current = [{ at: 0, x: 0, y: 0 }]
      actions.current = []
      alchemyInputs.current = []
      alchemyStartedRef.current = false
      alchemyPointerId.current = null
      lastAlchemyPointer.current = { x: 50, y: 50 }
      setAlchemyStarted(false)
      nextForgeCueRef.current = 0
      direction.current = { x: 0, y: 0 }
      setJoystickDirection({ x: 0, y: 0 })
      pressedKeys.current.clear()
      submitted.current = false
      if (!waitsForPointer) {
        socket.emit('miniGameReady', {
          sessionId: data.sessionId,
          token: data.token,
        })
      }
    }
    const onResolved = (data: { sessionId: string; success: boolean; message?: string }) => {
      if (data.sessionId !== game?.sessionId) return
      setStatus(data.success ? '미니게임 성공!' : (data.message ?? '미니게임 실패'))
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
    if (game?.type !== 'forge_rhythm' || !forgeAudioRef.current) return
    const cueLeadMs = 180
    while (nextForgeCueRef.current < game.config.beatTimesMs.length
      && game.config.beatTimesMs[nextForgeCueRef.current] - cueLeadMs <= elapsed) {
      const cueAt = game.config.beatTimesMs[nextForgeCueRef.current] - cueLeadMs
      if (elapsed - cueAt < 100) playForgeSound('cue')
      nextForgeCueRef.current++
    }
  }, [elapsed, game, playForgeSound])

  useEffect(() => {
    if (!game || game.type === 'alchemy_tracking') return
    const relevant = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'])
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (game.type === 'forge_rhythm' && (key === ' ' || key === 'enter')) {
        event.preventDefault()
        if (!event.repeat) strike()
        return
      }
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
  }, [game, setDirection, strike, updateKeyboardDirection])

  useEffect(() => {
    if (!game || !socket || (game.type === 'alchemy_tracking' && !alchemyStarted)) return
    let frame = 0
    const tick = () => {
      const elapsedMs = Math.min(game.config.durationMs, performance.now() - startedAt.current)
      const next = game.type === 'fishing_capture'
        ? simulateFishingCapture(game.config, inputs.current, elapsedMs)
        : game.type === 'hazard_dodge'
          ? simulateHazardDodge(game.config, inputs.current, elapsedMs)
          : game.type === 'forge_rhythm'
            ? simulateForgeRhythm(game.config, actions.current, elapsedMs)
            : simulateAlchemyTracking(game.config, alchemyInputs.current, elapsedMs)
      if (game.type === 'fishing_capture') setState(next as FishingSimulationState)
      else if (game.type === 'hazard_dodge') {
        setDodgeState(next as HazardDodgeSimulationState)
        setElapsed(elapsedMs)
      } else if (game.type === 'forge_rhythm') {
        setForgeState(next as ForgeRhythmSimulationState)
        setElapsed(elapsedMs)
      } else {
        setAlchemyState(next as AlchemyTrackingSimulationState)
        setElapsed(elapsedMs)
      }
      if (next.finished && !submitted.current) {
        submitted.current = true
        setStatus('결과를 확인하는 중...')
        if (game.type === 'fishing_capture') {
          socket.emit('miniGameResult', {
            sessionId: game.sessionId,
            token: game.token,
            fishingProof: createFishingCaptureProof(game.config, inputs.current, elapsedMs),
          })
        } else if (game.type === 'alchemy_tracking') {
          socket.emit('miniGameResult', {
            sessionId: game.sessionId,
            token: game.token,
            alchemyTrackingProof: createAlchemyTrackingProof(game.config, alchemyInputs.current, elapsedMs),
          })
        } else {
          socket.emit('miniGameResult', {
            sessionId: game.sessionId,
            token: game.token,
          })
        }
        return
      }
      if (!submitted.current) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [alchemyStarted, game, socket])

  const updateJoystick = (clientX: number, clientY: number) => {
    const element = joystickRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const radiusX = Math.max(1, rect.width / 2)
    const radiusY = Math.max(1, rect.height / 2)
    const next = resolveFixedJoystickDirection(
      (clientX - (rect.left + radiusX)) / radiusX,
      (clientY - (rect.top + radiusY)) / radiusY,
    )
    setDirection(next.x, next.y)
  }

  const getAlchemyPointerPosition = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(100, (event.clientX - rect.left) / Math.max(1, rect.width) * 100)),
      y: Math.max(0, Math.min(100, (event.clientY - rect.top) / Math.max(1, rect.height) * 100)),
    }
  }

  const recordAlchemyPointer = (event: ReactPointerEvent<HTMLDivElement>, dragging: boolean) => {
    if (game?.type !== 'alchemy_tracking' || !alchemyStartedRef.current || submitted.current) return
    const position = getAlchemyPointerPosition(event)
    lastAlchemyPointer.current = position
    appendAlchemyTrackingPointerSample(alchemyInputs.current, {
      at: Math.max(0, performance.now() - startedAt.current),
      ...position,
      dragging,
    })
  }

  const stopAlchemyPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (alchemyPointerId.current !== event.pointerId) return
    recordAlchemyPointer(event, false)
    alchemyPointerId.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  if (!game) return null
  const controls = <div className={styles.controls}>
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
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
        setDirection(0, 0)
      }}
      onPointerCancel={() => setDirection(0, 0)}
      onLostPointerCapture={() => setDirection(0, 0)}
    >
      {JOYSTICK_MARKERS.map(marker => <i
        key={marker.label}
        aria-hidden="true"
        style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
      >{marker.label}</i>)}
      <span className={styles.joystickStopZone} aria-hidden="true">정지</span>
      <span
        className={styles.joystickKnob}
        aria-hidden="true"
        style={{ transform: `translate(${joystickDirection.x * 108}%, ${joystickDirection.y * 108}%)` }}
      />
    </div>
  </div>

  if (game.type === 'alchemy_tracking') {
    const config = game.config
    const gauge = clampGauge(alchemyState.gauge)
    const gaugePercent = Math.round(gauge * 100)
    const accuracyPercent = Math.round(alchemyState.accuracy * 100)
    const remaining = Math.max(0, config.durationMs - elapsed)
    const pointerSize = Math.max(3.5, config.targetRadius * 1.15)
    return <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="가마솥 목표 추적 미니게임"
      onPointerDownCapture={blurActiveTextEntry}
    >
      <section className={styles.panel}>
        <header>
          <div><span className={styles.rarity}>{config.label}</span><h2>가마솥 조율</h2></div>
          <p>움직이는 목표 원을 포인터로 따라가세요</p>
        </header>
        <div className={styles.alchemyStats}>
          <span>{alchemyStarted ? `${(remaining / 1_000).toFixed(1)}초` : '목표 원을 눌러 시작'}</span>
          <span>추적 정확도 <b>{accuracyPercent}%</b></span>
        </div>
        <div
          className={styles.gauge}
          role="progressbar"
          aria-label="가마솥 조율 게이지"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={gaugePercent}
        >
          <span style={{ transform: `scaleX(${gauge})`, backgroundColor: getGaugeColor(gauge) }} />
          <b>{gaugePercent}%</b>
        </div>
        <div
          className={`${styles.board} ${styles.alchemyBoard}`}
          onContextMenu={event => event.preventDefault()}
          onPointerDown={event => {
            if (!event.isPrimary || event.button !== 0 || submitted.current
              || alchemyPointerId.current !== null) return
            event.preventDefault()
            const position = getAlchemyPointerPosition(event)
            if (!alchemyStartedRef.current) {
              const initialTarget = getAlchemyTrackingTargetPosition(config, 0)
              if (Math.hypot(position.x - initialTarget.x, position.y - initialTarget.y) > config.targetRadius) {
                setStatus('움직이는 목표 원 안을 눌러 시작하세요!')
                return
              }
            }
            event.currentTarget.setPointerCapture(event.pointerId)
            alchemyPointerId.current = event.pointerId
            lastAlchemyPointer.current = position
            if (!alchemyStartedRef.current) {
              alchemyStartedRef.current = true
              startedAt.current = performance.now()
              alchemyInputs.current = []
              appendAlchemyTrackingPointerSample(alchemyInputs.current, { at: 0, ...position, dragging: true })
              setAlchemyStarted(true)
              setStatus('목표 원 안을 놓치지 마세요!')
              socket?.emit('miniGameReady', {
                sessionId: game.sessionId,
                token: game.token,
              })
            } else {
              recordAlchemyPointer(event, true)
            }
          }}
          onPointerMove={event => {
            if (alchemyPointerId.current !== event.pointerId
              || !event.currentTarget.hasPointerCapture(event.pointerId)) return
            event.preventDefault()
            recordAlchemyPointer(event, true)
          }}
          onPointerUp={stopAlchemyPointer}
          onPointerCancel={event => {
            if (alchemyPointerId.current !== event.pointerId) return
            const position = lastAlchemyPointer.current
            appendAlchemyTrackingPointerSample(alchemyInputs.current, {
              at: Math.max(0, performance.now() - startedAt.current),
              ...position,
              dragging: false,
            })
            alchemyPointerId.current = null
          }}
          onLostPointerCapture={event => {
            if (alchemyPointerId.current !== event.pointerId) return
            const position = lastAlchemyPointer.current
            appendAlchemyTrackingPointerSample(alchemyInputs.current, {
              at: Math.max(0, performance.now() - startedAt.current),
              ...position,
              dragging: false,
            })
            alchemyPointerId.current = null
          }}
        >
          <svg className={styles.alchemyPath} viewBox="0 0 100 100" aria-hidden="true">
            <polyline points={alchemyPathPoints.map(point => `${point.x},${point.y}`).join(' ')} />
          </svg>
          <span
            className={styles.alchemyLiquidBoundary}
            aria-hidden="true"
            style={{ width: `${config.liquidRadius * 2}%`, height: `${config.liquidRadius * 2}%` }}
          />
          <span
            className={`${styles.alchemyTarget} ${alchemyState.onTarget ? styles.alchemyTargetTracked : ''}`}
            aria-hidden="true"
            style={{
              left: `${alchemyState.targetX}%`,
              top: `${alchemyState.targetY}%`,
              width: `${config.targetRadius * 2}%`,
              height: `${config.targetRadius * 2}%`,
            }}
          />
          {alchemyStarted && <span
            className={`${styles.alchemyPointer} ${alchemyState.dragging ? styles.alchemyPointerDragging : ''}`}
            aria-hidden="true"
            style={{
              left: `${alchemyState.pointerX}%`,
              top: `${alchemyState.pointerY}%`,
              width: `${pointerSize}%`,
              height: `${pointerSize}%`,
            }}
          />}
        </div>
        <strong className={styles.alchemyStatus}>{status}</strong>
      </section>
    </div>
  }

  if (game.type === 'hazard_dodge') {
    const config = game.config
    const remaining = Math.max(0, config.durationMs - elapsed)
    const themeClass = config.theme === 'crystal' ? styles.crystalDodgeBoard
      : config.theme === 'ironroot' ? styles.ironrootDodgeBoard
        : config.theme === 'astral' ? styles.astralDodgeBoard : ''
    return <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="위험 회피 미니게임">
      <section className={styles.panel}>
        <header><div><span className={styles.rarity}>{config.label}</span><h2>위험 회피</h2></div><p>WASD · 방향키 · 모바일 조이스틱</p></header>
        <div className={styles.timer}>{(remaining / 1000).toFixed(1)}초</div>
        <div className={`${styles.board} ${styles.dodgeBoard} ${themeClass}`}>
          {dodgeState.hazards.map(hazard => <span
            key={hazard.id}
            className={`${styles.hazard} ${hazard.type === 'bomb' ? styles.bomb : styles.laser} ${hazard.active ? styles.hazardActive : ''}`}
            style={{ left: `${hazard.x}%`, top: `${hazard.y}%`, width: `${hazard.width}%`, height: `${hazard.height}%`, opacity: .3 + hazard.progress * .7 }}
          />)}
          <span
            className={styles.playerToken}
            style={{
              left: `${dodgeState.playerX}%`,
              top: `${dodgeState.playerY}%`,
              width: `${config.playerSize}%`,
              height: `${config.playerSize}%`,
            }}
          >{config.playerLabel}</span>
        </div>
        {controls}
      </section>
    </div>
  }
  if (game.type === 'forge_rhythm') {
    const config = game.config
    const compactTimeline = window.matchMedia('(hover: none), (max-width: 48rem)').matches
    const leadMs = compactTimeline ? 1_250 : 1_650
    const guideStepMs = compactTimeline ? 250 : 330
    const accuracy = Math.round(forgeState.accuracy * 100)
    const quality = Math.round(calculateForgeQualityScore(config, forgeState.accuracy) * 100)
    return <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="단조 리듬 미니게임"
      onPointerDownCapture={blurActiveTextEntry}
    >
      <section className={styles.panel}>
        <header><div><span className={styles.rarity}>{config.label}</span><h2>마력 단조</h2></div><p>Space · Enter · 타격 버튼</p></header>
        <div className={styles.forgeStats}>
          <span>난이도 <b>{config.difficulty}</b></span>
          <span>정확도 <b>{accuracy}%</b></span>
          <span>예상 품질 <b>{quality}%</b></span>
          <span>최대 콤보 <b>{forgeState.maxCombo}</b></span>
        </div>
        <div className={styles.forgeLane}>
          <span className={styles.strikeLine} />
          {Array.from({ length: Math.floor(leadMs / guideStepMs) }, (_, index) => {
            const offsetMs = (index + 1) * guideStepMs
            return <span
              key={`guide:${offsetMs}`}
              className={styles.forgeGuide}
              style={{ left: `${18 + offsetMs / leadMs * 82}%` }}
            />
          })}
          {config.beatTimesMs.map((beat, index) => {
            const left = 18 + (beat - elapsed) / leadMs * 82
            if (left < -8 || left > 108) return null
            return <span key={`${beat}:${index}`} className={styles.forgeNote} style={{ left: `${left}%` }}>
              <i>{index + 1}</i>
            </span>
          })}
        </div>
        <button
          className={styles.strikeButton}
          type="button"
          onPointerDown={event => {
            event.preventDefault()
            event.stopPropagation()
            blurActiveTextEntry()
            strike(event.pointerType === 'touch')
          }}
        >
          망치 내리치기
        </button>
        <strong className={styles.forgeStatus}>{status}</strong>
      </section>
    </div>
  }
  const config = game.config
  const gauge = clampGauge(state.gauge)
  const gaugePercent = Math.floor(gauge * 100)
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
        <div
          className={styles.gauge}
          role="progressbar"
          aria-label="포획 게이지"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={gaugePercent}
        >
          <span style={{ transform: `scaleX(${gauge})`, backgroundColor: getGaugeColor(gauge) }} />
          <b>{gaugePercent}%</b>
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
        {controls}
      </section>
    </div>
  )
}
