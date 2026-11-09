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
      <p className={styles.eyebrow}>WEB GAME COLLECTION</p>
      <h1>하나의 계정으로,<br />새로운 세계마다 새로운 모험.</h1>
      <p>직접 만든 웹게임을 모아두었습니다. 마음에 드는 게임을 골라 브라우저에서 바로 시작하세요.</p>
      <p>기존 DaclionOnline 계정으로 로그인할 수 있습니다. 캐릭터와 모험 기록도 그대로 이어집니다.</p>
    </section>
    <section aria-labelledby="games-title">
      <div className={styles.sectionTitle}><h2 id="games-title">플레이할 게임</h2><span>2개의 게임</span></div>
      <article className={styles.card}>
        <div className={styles.art} aria-hidden="true"><img src="/icons/map/town-plaza.png" alt="" /></div>
        <div className={styles.cardContent}>
          <span className={styles.eyebrow}>실시간 멀티플레이어 RPG</span>
          <h3>DaclionOnline</h3>
          <p>채팅으로 펼치는 모험. 몬스터를 사냥하고 직업을 성장시키며, 낚시와 제작으로 나만의 일상을 만들어보세요.</p>
          <ul><li>전투와 탐험</li><li>생활과 제작</li><li>파티와 거래</li></ul>
          <a className={styles.play} href={getGameStartUrl()}>게임 시작 →</a>
          <small>첫 플레이 시 캐릭터 이름만 설정하면 됩니다.</small>
        </div>
      </article>
      <article className={styles.card}>
        <div className={styles.art} aria-hidden="true">
          <svg viewBox="0 0 240 160" width="100%" style={{ maxWidth: '16rem' }}>
            <rect width="240" height="160" rx="8" fill="#90b77d" />
            <path d="M0 80H240M120 0V160" stroke="#d5c49a" strokeWidth="25" />
            <rect x="22" y="18" width="60" height="40" rx="5" fill="#588f9b" />
            <rect x="173" y="109" width="39" height="31" rx="5" fill="#727e7e" />
            <circle cx="106" cy="81" r="10" fill="#e9b35f" stroke="#fff" strokeWidth="3" />
            <circle cx="150" cy="73" r="10" fill="#6f9ee8" stroke="#344b38" strokeWidth="2" />
            <circle cx="118" cy="119" r="10" fill="#d984a1" stroke="#344b38" strokeWidth="2" />
          </svg>
        </div>
        <div className={styles.cardContent}>
          <span className={styles.eyebrow}>2D 멀티플레이 산책</span><h3>SEED WALK</h3>
          <p>시드로 만들어지는 작은 세계에서 함께 걸어보세요. 같은 시드를 입력하면 같은 맵에서 만나고, WASD로 자유롭게 이동할 수 있어요.</p>
          <ul><li>시드 기반 맵</li><li>실시간 이동</li><li>모바일 조작</li></ul>
          <Link className={styles.play} to="/games/seed-walk/">게임 시작 →</Link>
          <small>GAME BOX 계정으로 바로 시작할 수 있습니다.</small>
        </div>
      </article>
    </section>
    <footer>다운로드 없이 브라우저에서 즐기는 웹게임</footer>
  </main>
}
