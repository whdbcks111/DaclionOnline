import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router-dom'
import Phaser from 'phaser'
import type { SeedWalkJoinResult, SeedWalkSnapshot } from '@shared/seedWalk'
import { SEED_WALK_VERSION } from '@shared/seedWalk'
import { useSocket } from '../../context/SocketContext'
import { SeedWalkScene } from './SeedWalkScene'
import styles from './SeedWalk.module.scss'

const KEY_AXES: Record<string, readonly [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
}

export default function SeedWalk() {
  const { socket, sessionInfo, isConnected, isSessionReady } = useSocket()
  const [state, setState] = useState<SeedWalkSnapshot | null>(null)
  const [selfId, setSelfId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const latest = useRef<SeedWalkSnapshot | null>(null)
  const active = useRef(false)
  const sequence = useRef(0)
  const keys = useRef(new Set<string>())
  const touch = useRef({ x: 0, y: 0 })
  const stickPointer = useRef<number | null>(null)
  const [stick, setStick] = useState({ x: 0, y: 0 })

  const sendInput = () => {
    if (!socket?.connected || !active.current) return
    let x = 0, y = 0
    for (const key of keys.current) {
      const axis = KEY_AXES[key]
      if (axis) { x += axis[0]; y += axis[1] }
    }
    x += touch.current.x; y += touch.current.y
    const magnitude = Math.max(1, Math.hypot(x, y))
    socket.emit('seedWalkInput', { seq: ++sequence.current, x: x / magnitude, y: y / magnitude })
  }
  const releaseStick = () => { touch.current = { x: 0, y: 0 }; stickPointer.current = null; setStick({ x: 0, y: 0 }); sendInput() }
  const stop = () => { keys.current.clear(); releaseStick() }
  const moveStick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== stickPointer.current) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const dx = (event.clientX - bounds.left - bounds.width / 2) / (bounds.width * .275)
    const dy = (event.clientY - bounds.top - bounds.height / 2) / (bounds.height * .275)
    const length = Math.hypot(dx, dy)
    const distance = Math.min(1, length)
    const x = length ? dx / length : 0, y = length ? dy / length : 0
    setStick({ x: x * distance, y: y * distance })
    const strength = Math.max(0, (distance - .15) / .85)
    touch.current = { x: x * strength, y: y * strength }
    sendInput()
  }

  useEffect(() => {
    if (isSessionReady && !sessionInfo) {
      keys.current.clear(); touch.current = { x: 0, y: 0 }; active.current = false; latest.current = null;
      setState(null); setSelfId(null); setJoining(false)
    }
  }, [isSessionReady, sessionInfo?.userId])

  useEffect(() => {
    if (!socket || !isConnected || !sessionInfo) return
    const joined = (result: SeedWalkJoinResult) => {
      setJoining(false)
      if (!result.ok) { setError(result.error); active.current = false; latest.current = null; setState(null); setSelfId(null); return }
      if (result.state.version !== SEED_WALK_VERSION) { setError('게임이 업데이트되었습니다. 새로고침해주세요.'); socket.emit('seedWalkLeave'); active.current = false; return }
      latest.current = result.state
      setState(result.state); setSelfId(result.selfId); setError('')
    }
    const snapshot = (next: SeedWalkSnapshot) => {
      if (next.worldId !== latest.current?.worldId || next.tick <= latest.current.tick) return
      latest.current = next; setState(next)
    }
    socket.on('seedWalkJoined', joined)
    socket.on('seedWalkState', snapshot)
    if (active.current) { setJoining(true); sequence.current = 0; socket.emit('seedWalkJoin') }
    return () => { socket.off('seedWalkJoined', joined); socket.off('seedWalkState', snapshot); socket.emit('seedWalkLeave') }
  }, [socket, isConnected, sessionInfo?.userId])

  useEffect(() => {
    if (!state || selfId === null || !stage.current) return
    const parent = stage.current
    const game = new Phaser.Game({
      type: Phaser.AUTO, parent, width: parent.clientWidth, height: parent.clientHeight,
      backgroundColor: '#90b77d', banner: false, audio: { noAudio: true },
      render: { antialias: true }, scene: new SeedWalkScene(selfId, () => latest.current),
      scale: { mode: Phaser.Scale.NONE },
    })
    const resize = new ResizeObserver(() => { if (parent.clientWidth && parent.clientHeight) game.scale.resize(parent.clientWidth, parent.clientHeight) })
    resize.observe(parent)
    return () => { resize.disconnect(); game.destroy(true) }
  }, [state?.worldId, selfId, !!sessionInfo])

  useEffect(() => {
    if (!state || !sessionInfo || !isConnected) return
    const down = (event: KeyboardEvent) => {
      if (!KEY_AXES[event.code] || (event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)))) return
      event.preventDefault(); if (keys.current.has(event.code)) return; keys.current.add(event.code); sendInput()
    }
    const up = (event: KeyboardEvent) => { if (KEY_AXES[event.code]) { event.preventDefault(); keys.current.delete(event.code); sendInput() } }
    const hidden = () => { if (document.hidden) stop() }
    const timer = window.setInterval(sendInput, 100)
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    window.addEventListener('blur', stop); document.addEventListener('visibilitychange', hidden)
    return () => {
      window.clearInterval(timer); stop()
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up)
      window.removeEventListener('blur', stop); document.removeEventListener('visibilitychange', hidden)
    }
  }, [!!state, socket, isConnected, sessionInfo?.userId])

  const leave = () => {
    stop(); active.current = false; socket?.emit('seedWalkLeave')
    latest.current = null; setState(null); setSelfId(null); setJoining(false)
  }
  const start = () => {
    stop(); active.current = true; sequence.current = 0
    setError(''); setJoining(true)
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    socket?.emit('seedWalkJoin')
  }
  const playing = !!state && !!sessionInfo
  const me = state?.players.find(player => player.id === selfId)
  return <main className={styles.page}>
    <header className={styles.header}>
      <div><Link to="/" className={styles.brand}>GAME BOX</Link><span className={styles.divider}>/</span><strong>SEED WALK</strong></div>
      <nav>{playing && <button onClick={leave}>맵 나가기</button>}<Link to="/">포털로 돌아가기</Link></nav>
    </header>
    {playing ? <>
      <div className={styles.toolbar}><span>{state.players.length}명 접속</span><span className={styles.keys}>WASD / 방향키로 이동</span></div>
      <div className={styles.stage}>
        <div className={styles.canvas} ref={stage} aria-label="SEED WALK 실시간 멀티플레이 맵" />
        {(!isConnected || joining) && <div className={styles.connection} role="status">다시 연결하고 있습니다…</div>}
        <div className={styles.compass}>N ↑</div>
        <div className={styles.joystick} role="group" aria-label="드래그해서 이동하는 조이스틱" tabIndex={0}
          onPointerDown={event => { if (stickPointer.current !== null) return; event.preventDefault(); stickPointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); moveStick(event) }}
          onPointerMove={event => { if (event.pointerId === stickPointer.current) { event.preventDefault(); moveStick(event) } }}
          onPointerUp={event => { if (event.pointerId === stickPointer.current) releaseStick() }}
          onPointerCancel={event => { if (event.pointerId === stickPointer.current) releaseStick() }}
          onLostPointerCapture={event => { if (event.pointerId === stickPointer.current) releaseStick() }}>
          <span className={styles.stickRing} aria-hidden="true" />
          <span className={styles.stickThumb} aria-hidden="true" style={{ transform: `translate(-50%, -50%) translate(${stick.x * 2.2}rem, ${stick.y * 2.2}rem)` }} />
          <span className={styles.stickLabel}>이동</span>
        </div>
        <span className={styles.position}>{me ? `${Math.floor(me.x)}, ${Math.floor(me.y)}` : '접속 중'}</span>
      </div>
      <footer className={styles.status}><span>WASD · 방향키 · 모바일 조이스틱</span><span>연못과 바위는 지나갈 수 없어요.</span></footer>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </> : <section className={styles.lobby}>
      <div className={styles.intro}><h1>함께 걷는 작은 초원.</h1><p>풀밭과 연못 사이를 자유롭게 산책하세요.</p><div className={styles.legend}><span>● 풀밭</span><span>■ 연못</span><span>◆ 바위</span></div></div>
      <div className={styles.card}><h2>산책 시작하기</h2>
        <form onSubmit={event => { event.preventDefault(); start() }}>
          {isSessionReady && !sessionInfo ? <Link className={styles.login} to="/login?next=seed-walk">로그인하고 시작</Link> : <button disabled={!isConnected || !sessionInfo || joining}>{joining ? '맵에 접속 중…' : '게임 시작 →'}</button>}
        </form>
        <p className={styles.hint}>WASD · 방향키 · 모바일 조이스틱<br />최대 32명 · 전투 없이 자유로운 이동</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    </section>}
  </main>
}
