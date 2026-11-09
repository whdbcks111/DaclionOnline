import { getGameStartUrl } from '../utils/siteNavigation'
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
      <Link to="/" className={styles.brand}>GAME BOX</Link>
      <nav aria-label="계정 메뉴">
        {!isSessionReady ? <span>계정 확인 중…</span> : sessionInfo ? <>
          <span>{sessionInfo.nickname}님</span><button onClick={logout} disabled={!isConnected}>로그아웃</button>
        </> : <><Link to="/login">로그인</Link><Link to="/register">회원가입</Link></>}
      </nav>
    </header>
    <section className={styles.intro}>
      <h1>어떤 게임을 플레이할까요?</h1>
      <p>직접 만든 웹게임을 모아두었습니다. 마음에 드는 게임을 골라 브라우저에서 바로 시작하세요.</p>
    </section>
    <section aria-labelledby="games-title">
      <div className={styles.sectionTitle}><h2 id="games-title">플레이할 게임</h2><span>3개의 게임</span></div>
      <article className={styles.card}>
        <div className={styles.art} aria-hidden="true"><img src="/icons/map/town-plaza.png" alt="" /></div>
        <div className={styles.cardContent}>
          <span className={styles.eyebrow}>실시간 멀티플레이어 RPG</span>
          <h3>DaclionOnline</h3>
          <p>채팅으로 펼치는 모험. 몬스터를 사냥하고 직업을 성장시키며, 낚시와 제작으로 나만의 일상을 만들어보세요.</p>
          <ul><li>전투와 탐험</li><li>생활과 제작</li><li>파티와 거래</li></ul>
          <a className={styles.play} href={getGameStartUrl()}>게임 시작 →</a>
        </div>
      </article>
      <article className={styles.card}>
        <div className={styles.art} aria-hidden="true">
          <svg viewBox="0 0 240 160" width="100%" style={{ maxWidth: '16rem' }}>
            <rect width="240" height="160" rx="8" fill="#90b77d" />
            <path d="M20 35l3-6 4 5m45 85 3-7 4 6m102-90 3-6 4 5m-30 80 3-6 4 5" fill="none" stroke="#719963" strokeWidth="2" />
            <circle cx="106" cy="81" r="10" fill="#e9b35f" stroke="#fff" strokeWidth="3" />
            <circle cx="150" cy="73" r="10" fill="#6f9ee8" stroke="#344b38" strokeWidth="2" />
            <circle cx="118" cy="119" r="10" fill="#d984a1" stroke="#344b38" strokeWidth="2" />
          </svg>
        </div>
        <div className={styles.cardContent}>
          <span className={styles.eyebrow}>2D 멀티플레이 산책</span><h3>SEED WALK</h3>
          <p>작은 초원에서 다른 플레이어와 함께 걸어보세요. WASD나 모바일 조이스틱으로 자유롭게 이동할 수 있어요.</p>
          <ul><li>공유 초원 맵</li><li>실시간 이동</li><li>모바일 조작</li></ul>
          <Link className={styles.play} to="/games/seed-walk/">게임 시작 →</Link>
        </div>
      </article>
      <article className={styles.card}>
        <div className={styles.art} aria-hidden="true"><svg viewBox="0 0 240 160" width="100%" style={{ maxWidth: '16rem' }}><rect width="240" height="160" fill="#c8dce3"/><path d="M0 130h65m30-35h55m30-40h60" stroke="#596f7d" strokeWidth="14"/><path d="M198 48V15l25 10-25 10" fill="#e7bb64" stroke="#485d66" strokeWidth="2"/><rect x="113" y="59" width="17" height="24" fill="#e9b35f" stroke="#fff" strokeWidth="2"/></svg></div>
        <div className={styles.cardContent}><span className={styles.eyebrow}>멀티플레이 점프맵</span><h3>테스트2</h3><p>긴 점프맵을 다른 플레이어와 함께 건너보세요. 떨어지면 체크포인트에서 다시 시작합니다.</p><Link className={styles.play} to="/games/test2/">게임 시작 →</Link></div>
      </article>
    </section>
  </main>
}
