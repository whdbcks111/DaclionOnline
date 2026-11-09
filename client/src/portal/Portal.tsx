import { Link } from 'react-router-dom'
import { useSocket } from '../context/SocketContext'
import styles from './Portal.module.scss'

export default function Portal() {
  const { socket, sessionInfo, isConnected, isSessionReady } = useSocket()
  const logout = () => {
    const token = document.cookie.split('; ').find(value => value.startsWith('sessionToken='))?.slice('sessionToken='.length)
    if (token) socket?.emit('logout', token)
    document.cookie = 'sessionToken=; path=/; max-age=0'
  }
  return <main className={styles.page}>
    <header className={styles.header}>
      <Link to="/" className={styles.brand}>웹게임 포털</Link>
      <nav aria-label="계정 메뉴">
        {!isSessionReady ? <span>계정 확인 중…</span> : sessionInfo ? <>
          <span>{sessionInfo.nickname}님</span><button onClick={logout} disabled={!isConnected}>로그아웃</button>
        </> : <><Link to="/login">로그인</Link><Link to="/register">회원가입</Link></>}
      </nav>
    </header>
    <section className={styles.intro}>
      <p className={styles.eyebrow}>WEB GAME COLLECTION</p>
      <h1>하나의 계정으로,<br />새로운 세계마다 새로운 모험.</h1>
      <p>직접 만든 웹게임을 모아두었습니다. 마음에 드는 게임을 골라 브라우저에서 바로 시작하세요.</p>
      <p>기존 DaclionOnline 계정으로 로그인할 수 있습니다. 캐릭터와 모험 기록도 그대로 이어집니다.</p>
    </section>
    <section aria-labelledby="games-title">
      <div className={styles.sectionTitle}><h2 id="games-title">플레이할 게임</h2><span>1개의 게임</span></div>
      <article className={styles.card}>
        <div className={styles.art} aria-hidden="true"><img src="/icons/map/town-plaza.png" alt="" /></div>
        <div className={styles.cardContent}>
          <span className={styles.eyebrow}>실시간 멀티플레이어 RPG</span>
          <h3>DaclionOnline</h3>
          <p>채팅으로 펼치는 모험. 몬스터를 사냥하고 직업을 성장시키며, 낚시와 제작으로 나만의 일상을 만들어보세요.</p>
          <ul><li>전투와 탐험</li><li>생활과 제작</li><li>파티와 거래</li></ul>
          <Link className={styles.play} to="/games/daclion/">게임 시작 →</Link>
          <small>첫 플레이 시 캐릭터 이름만 설정하면 됩니다.</small>
        </div>
      </article>
    </section>
    <footer>다운로드 없이 브라우저에서 즐기는 웹게임</footer>
  </main>
}
