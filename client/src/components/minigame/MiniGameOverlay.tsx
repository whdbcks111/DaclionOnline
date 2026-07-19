import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type {
  FishingSimulationState,
  ForgeRhythmSimulationState,
  MiniGameActionSample,
  HazardDodgeSimulationState,
  MiniGameInputSample,
  MiniGameStartData,
} from '@shared/minigames'
import {
  appendMiniGameInputSample,
  calculateForgeQualityScore,
  resolveForgeStrikeTime,
  simulateForgeRhythm,
  simulateHazardDodge,
  simulateFishingCapture,
  snapshotMiniGameInputs,
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
  const [elapsed, setElapsed] = useState(0)
  const [joystickDirection, setJoystickDirection] = useState({ x: 0, y: 0 })
  const [status, setStatus] = useState('물고기를 채집 영역 안에 유지하세요!')
  const startedAt = useRef(0)
  const inputs = useRef<MiniGameInputSample[]>([{ at: 0, x: 0, y: 0 }])
  const actions = useRef<MiniGameActionSample[]>([])
  const direction = useRef({ x: 0, y: 0 })
  const submitted = useRef(false)
  const pressedKeys = useRef(new Set<string>())
  const joystickRef = useRef<HTMLDivElement>(null)
  const forgeAudioRef = useRef<AudioContext | null>(null)
  const nextForgeCueRef = useRef(0)
  const displayedElapsedRef = useRef(0)

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
    playForgeSound('strike')
  }, [game?.type, playForgeSound])

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
      blurActiveTextEntry()
      setGame(data)
      if (data.type === 'fishing_capture') {
        setState({ ...INITIAL_STATE, gauge: data.config.initialGauge })
        setStatus(`${data.config.rarityLabel} 등급 입질!`)
      } else if (data.type === 'hazard_dodge') {
        setDodgeState(INITIAL_DODGE_STATE)
        setElapsed(0)
        setStatus(`위험 구역을 피해 ${(data.config.durationMs / 1_000).toFixed(0)}초 동안 버티세요!`)
      } else {
        setForgeState(INITIAL_FORGE_STATE)
        setElapsed(0)
        setStatus('박자에 맞춰 망치를 내리치세요!')
      }
      startedAt.current = performance.now()
      displayedElapsedRef.current = 0
      inputs.current = [{ at: 0, x: 0, y: 0 }]
      actions.current = []
      nextForgeCueRef.current = 0
      direction.current = { x: 0, y: 0 }
      setJoystickDirection({ x: 0, y: 0 })
      pressedKeys.current.clear()
      submitted.current = false
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
    if (!game) return
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
    if (!game || !socket) return
    let frame = 0
    const tick = () => {
      const elapsedMs = Math.min(game.config.durationMs, performance.now() - startedAt.current)
      const next = game.type === 'fishing_capture'
        ? simulateFishingCapture(game.config, inputs.current, elapsedMs)
        : game.type === 'hazard_dodge'
          ? simulateHazardDodge(game.config, inputs.current, elapsedMs)
          : simulateForgeRhythm(game.config, actions.current, elapsedMs)
      if (game.type === 'fishing_capture') setState(next as FishingSimulationState)
      else if (game.type === 'hazard_dodge') {
        setDodgeState(next as HazardDodgeSimulationState)
        setElapsed(elapsedMs)
      } else {
        setForgeState(next as ForgeRhythmSimulationState)
        setElapsed(elapsedMs)
      }
      if (next.finished && !submitted.current) {
        submitted.current = true
        setStatus('결과를 확인하는 중...')
        socket.emit('miniGameResult', {
          sessionId: game.sessionId,
          token: game.token,
          elapsedMs,
          inputs: snapshotMiniGameInputs(inputs.current, elapsedMs),
          actions: actions.current.filter(action => action.at <= elapsedMs).map(action => ({ ...action })),
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
        event.currentTarget.releasePointerCapture(event.pointerId)
        setDirection(0, 0)
      }}
      onPointerCancel={() => setDirection(0, 0)}
    >
      <span style={{ transform: `translate(${joystickDirection.x * 65}%, ${joystickDirection.y * 65}%)` }} />
    </div>
  </div>

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
            style={{ left: `${dodgeState.playerX}%`, top: `${dodgeState.playerY}%`, width: `${config.playerSize}%` }}
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
