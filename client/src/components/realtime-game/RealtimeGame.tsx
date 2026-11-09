import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router-dom'
import Phaser from 'phaser'
import type { SeedWalkJoinResult, SeedWalkSnapshot } from '@shared/seedWalk'
import { SEED_WALK_VERSION, SEED_WALK_CHAT_LIMIT } from '@shared/seedWalk'
import { useTheme } from '../../context/ThemeContext'
import { useSocket } from '../../context/SocketContext'
import { RealtimeScene } from './RealtimeScene'
import { TEST2_VERSION, type Test2Snapshot } from '@shared/test2'
import styles from './RealtimeGame.module.scss'

const KEY_AXES: Record<string, readonly [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
}

export default function RealtimeGame({ platformer = false }: { platformer?: boolean }) {
  const prefix = platformer ? 'test2' : 'seedWalk'
  const title = platformer ? '테스트2' : 'SEED WALK'
  const version = platformer ? TEST2_VERSION : SEED_WALK_VERSION
  const jump = useRef(0)
  const { theme, toggleTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const paused = useRef(false)
  const menu = useRef<HTMLDialogElement>(null)
  const { socket, sessionInfo, isConnected, isSessionReady } = useSocket()
  const [state, setState] = useState<SeedWalkSnapshot | null>(null)
  const [selfId, setSelfId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [joining, setJoining] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatText, setChatText] = useState('')
  const chatEditing = useRef(false)
  const chatInput = useRef<HTMLInputElement>(null)
  const bubbles = useRef(new Map<number, HTMLDivElement>())
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
    if (chatEditing.current || paused.current) { socket.emit(`${prefix}Input`, platformer ? { seq: ++sequence.current, x: 0, jump: jump.current } : { seq: ++sequence.current, x: 0, y: 0 }); return }
    let x = 0, y = 0
    for (const key of keys.current) {
      const axis = KEY_AXES[key]
      if (axis) { x += axis[0]; y += axis[1] }
    }
    x += touch.current.x; y += touch.current.y
    const magnitude = Math.max(1, Math.hypot(x, y))
    socket.emit(`${prefix}Input`, platformer ? { seq: ++sequence.current, x: Math.max(-1, Math.min(1, x)), jump: jump.current } : { seq: ++sequence.current, x: x / magnitude, y: y / magnitude })
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

  const openChat = () => { if (paused.current) return; stop(); chatEditing.current = true; setChatOpen(true) }
  const closeChat = () => { chatEditing.current = false; setChatOpen(false); setChatText(''); chatInput.current?.blur() }
  const closeMenu = () => { paused.current = false; setMenuOpen(false) }
  const openMenu = () => { closeChat(); stop(); paused.current = true; setMenuOpen(true) }
  useEffect(() => {
    if (menuOpen) menu.current?.showModal()
    else menu.current?.close()
  }, [menuOpen])
  useEffect(() => { if (!state || !sessionInfo) closeMenu() }, [!!state, !!sessionInfo])
  useEffect(() => { if (chatOpen) chatInput.current?.focus() }, [chatOpen])
  useEffect(() => { if (!state || !isConnected) closeChat() }, [!!state, isConnected])

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
      if (result.state.version !== version) { setError('게임이 업데이트되었습니다. 새로고침해주세요.'); socket.emit(`${prefix}Leave`); active.current = false; return }
      latest.current = result.state
      setState(result.state); setSelfId(result.selfId); setError('')
    }
    const snapshot = (next: SeedWalkSnapshot) => {
      if (next.worldId !== latest.current?.worldId || next.tick <= latest.current.tick) return
      latest.current = next; setState(next)
    }
    socket.on(`${prefix}Joined`, joined)
    socket.on(`${prefix}State`, snapshot)
    if (active.current) { setJoining(true); sequence.current = 0; jump.current = 0; socket.emit(`${prefix}Join`) }
    return () => { socket.off(`${prefix}Joined`, joined); socket.off(`${prefix}State`, snapshot); socket.emit(`${prefix}Leave`) }
  }, [socket, isConnected, sessionInfo?.userId])

  useEffect(() => {
    if (!state || selfId === null || !stage.current) return
    const parent = stage.current
    const game = new Phaser.Game({
      type: Phaser.AUTO, parent, width: parent.clientWidth, height: parent.clientHeight,
      backgroundColor: platformer ? '#c8dce3' : '#90b77d', banner: false, audio: { noAudio: true },
      render: { antialias: true }, scene: new RealtimeScene(selfId, () => latest.current, (id, x, y) => {
        const bubble = bubbles.current.get(id)
        if (bubble) { bubble.style.left = `${x}px`; bubble.style.top = `${y}px` }
      }, platformer),
      scale: { mode: Phaser.Scale.NONE },
    })
    const resize = new ResizeObserver(() => { if (parent.clientWidth && parent.clientHeight) game.scale.resize(parent.clientWidth, parent.clientHeight) })
    resize.observe(parent)
    return () => { resize.disconnect(); game.destroy(true) }
  }, [state?.worldId, selfId, !!sessionInfo])

  useEffect(() => {
    if (!state || !sessionInfo || !isConnected) return
    const down = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return
      const editable = event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))
      if (event.code === 'Escape' && !event.repeat) {
        event.preventDefault()
        if (chatEditing.current) closeChat()
        else if (paused.current) closeMenu()
        else openMenu()
        return
      }
      if (paused.current) return
      if (event.code === 'Enter' && !editable && !event.repeat) { event.preventDefault(); openChat(); return }
      if (chatEditing.current) return
      if (platformer && ['Space', 'KeyW', 'ArrowUp'].includes(event.code) && !editable) { event.preventDefault(); if (!event.repeat) { jump.current++; sendInput() }; return }
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
    closeMenu(); closeChat(); stop(); active.current = false; socket?.emit(`${prefix}Leave`)
    latest.current = null; setState(null); setSelfId(null); setJoining(false)
  }
  const start = () => {
    stop(); active.current = true; sequence.current = 0; jump.current = 0
    setError(''); setJoining(true)
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    socket?.emit(`${prefix}Join`)
  }
  const playing = !!state && !!sessionInfo
  return <main className={styles.page}>
    {!playing && <header className={styles.header}>
      <div><Link to="/" className={styles.brand}>GAME BOX</Link><span className={styles.divider}>/</span><strong>{title}</strong></div>
      <nav><Link to="/">포털로 돌아가기</Link></nav>
    </header>}
    {playing ? <>
      <div className={styles.stage}>
        <div className={styles.canvas} ref={stage} aria-label={`${title} 실시간 멀티플레이 맵`} />
        {(!isConnected || joining) && <div className={styles.connection} role="status">다시 연결하고 있습니다…</div>}
        {state.players.filter(player => player.bubble).map(player => <div key={player.id} className={styles.bubble}
          ref={element => { if (element) bubbles.current.set(player.id, element); else bubbles.current.delete(player.id) }}>{player.bubble!.text}</div>)}
        <button className={styles.chatButton} onClick={openChat} disabled={!isConnected || joining} aria-label="채팅"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 4h16v12H9l-5 4Z" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg></button>
        {chatOpen && <form className={styles.chatForm} onSubmit={event => {
          event.preventDefault()
          if (!chatEditing.current) return
          if (chatText.trim() && isConnected) socket?.emit(`${prefix}Chat`, chatText)
          closeChat()
        }}>
          <input ref={chatInput} aria-label="채팅 메시지" value={chatText} onChange={event => setChatText(event.target.value)} maxLength={SEED_WALK_CHAT_LIMIT}
            autoComplete="off" placeholder="메시지 입력" onKeyDown={event => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) { if (event.key === 'Enter') event.preventDefault(); return }
              if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeChat() }
            }} />
          <button type="submit" disabled={!isConnected}>보내기</button><button type="button" onClick={closeChat} aria-label="채팅 닫기">×</button>
        </form>}
        <button className={styles.menuButton} aria-label="메뉴 열기" onClick={openMenu}><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg></button>
        <dialog ref={menu} className={styles.menu} aria-labelledby="walk-menu-title" onCancel={event => { event.preventDefault(); closeMenu() }} onClick={event => { if (event.target === event.currentTarget) closeMenu() }}>
          <div className={styles.menuContent}>
            <h2 id="walk-menu-title">{title}</h2>
            <p>{state.players.length}명 접속</p>
            <button onClick={closeMenu} autoFocus>계속하기</button>
            <button onClick={toggleTheme}>{theme === 'dark' ? '밝은 테마' : '어두운 테마'}</button>
            {platformer && <button onClick={() => { socket?.emit('test2Respawn'); closeMenu() }}>체크포인트로 돌아가기</button>}
            {platformer && <p>체크포인트 {(state as Test2Snapshot).players.find(p => p.id === selfId)?.checkpoint ?? 0} / 20</p>}
            <button onClick={leave}>맵 나가기</button>
            <Link to="/">포털로 돌아가기</Link>
          </div>
        </dialog>
        {platformer && <button className={styles.jumpButton} aria-label="점프" onPointerDown={event => { event.preventDefault(); if (!paused.current && !chatEditing.current) { jump.current++; sendInput() } }}>↑</button>}
        {platformer && (state as Test2Snapshot).players.find(p => p.id === selfId)?.finished && <div className={styles.finish} role="status">완주!</div>}
        <div className={styles.joystick} role="group" aria-label="드래그해서 이동하는 조이스틱" tabIndex={0}
          onPointerDown={event => { if (paused.current || chatEditing.current || stickPointer.current !== null) return; event.preventDefault(); stickPointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); moveStick(event) }}
          onPointerMove={event => { if (event.pointerId === stickPointer.current) { event.preventDefault(); moveStick(event) } }}
          onPointerUp={event => { if (event.pointerId === stickPointer.current) releaseStick() }}
          onPointerCancel={event => { if (event.pointerId === stickPointer.current) releaseStick() }}
          onLostPointerCapture={event => { if (event.pointerId === stickPointer.current) releaseStick() }}>
          <span className={styles.stickRing} aria-hidden="true" />
          <span className={styles.stickThumb} aria-hidden="true" style={{ transform: `translate(-50%, -50%) translate(${stick.x * 2.2}rem, ${stick.y * 2.2}rem)` }} />
        </div>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </> : <section className={styles.lobby}>
      <div className={styles.intro}><h1>{title}</h1></div>
      <div className={styles.card}><h2>{platformer ? '점프맵' : '산책 시작하기'}</h2>
        <form onSubmit={event => { event.preventDefault(); start() }}>
          {isSessionReady && !sessionInfo ? <Link className={styles.login} to={`/login?next=${platformer ? 'test2' : 'seed-walk'}`}>로그인하고 시작</Link> : <button disabled={!isConnected || !sessionInfo || joining}>{joining ? '맵에 접속 중…' : '게임 시작 →'}</button>}
        </form>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    </section>}
  </main>
}
