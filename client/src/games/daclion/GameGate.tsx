import { useEffect, useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import type { GameEntryResult } from '@shared/types'
import { useSocket } from '../../context/SocketContext'
import styles from '../../portal/Portal.module.scss'

/** 캐릭터가 서버에서 준비된 다음에만 게임 화면과 게임 이벤트를 시작한다. */
export default function GameGate() {
  const { socket, sessionInfo, isConnected, isSessionReady } = useSocket()
  const [result, setResult] = useState<GameEntryResult>({})
  const [nickname, setNickname] = useState('')
  const [busy, setBusy] = useState(true)
  useEffect(() => {
    setResult({})
    if (!socket || !isConnected || !sessionInfo) return
    const onResult = (data: GameEntryResult) => { setResult(data); setBusy(false) }
    socket.on('gameEntryResult', onResult)
    setBusy(true)
    socket.emit('enterGame', { gameId: 'daclion' })
    return () => { socket.off('gameEntryResult', onResult); socket.emit('leaveGame') }
  }, [socket, isConnected, sessionInfo?.userId])

  if (isSessionReady && sessionInfo && isConnected && result.ok) return <Outlet />
  return <main className={styles.page}><div className={styles.setup}>
    <Link to="/">← 포털로 돌아가기</Link>
    <h1>DaclionOnline</h1>
    {!isConnected || !isSessionReady ? <p role="status">서버에 연결하고 있습니다…</p> : !sessionInfo ? <>
      <p>포털 계정으로 로그인하면 모험을 시작할 수 있습니다.</p>
      <Link className={styles.play} to="/login?next=daclion">포털 로그인</Link>
    </> : result.needsProfile || result.error ? <>
      <p>{result.needsProfile ? '처음 오셨군요! 게임에서 사용할 캐릭터 이름을 정해주세요. 포털 닉네임과 다르게 사용할 수 있습니다.' : '게임에 연결하지 못했습니다. 다시 접속해주세요.'}</p>
      <form onSubmit={event => {
        event.preventDefault(); setBusy(true)
        socket?.emit('enterGame', { gameId: 'daclion', ...(result.needsProfile ? { nickname } : {}) })
      }}>
        {result.needsProfile && <><label htmlFor="character-name">캐릭터 이름</label>
          <input id="character-name" value={nickname} onChange={event => setNickname(event.target.value)} required minLength={1} maxLength={12} autoComplete="off" disabled={busy} /></>}
        {result.error && <p role="alert" className={styles.error}>{result.error}</p>}
        <button disabled={busy}>{busy ? '접속 중…' : result.needsProfile ? '캐릭터 만들고 시작' : '다시 접속'}</button>
      </form>
    </> : <p role="status">모험을 준비하고 있습니다…</p>}
  </div></main>
}
