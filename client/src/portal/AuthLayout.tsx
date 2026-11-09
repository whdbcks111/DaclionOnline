import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styles from './AuthLayout.module.scss'

export default function AuthLayout({ title, description, children, footer }: {
  title: string
  description: string
  children: ReactNode
  footer: ReactNode
}) {
  return <main className={styles.page}>
    <header className={styles.header}>
      <Link className={styles.brand} to="/" aria-label="GAME BOX 홈">
        <span className={styles.mark} aria-hidden="true"><i /><i /><i /><i /></span>
        GAME BOX
      </Link>
      <Link className={styles.back} to="/">← 포털로 돌아가기</Link>
    </header>
    <div className={styles.content}>
      <section className={styles.intro} aria-label="GAME BOX 계정 안내">
        <span className={styles.eyebrow}>ONE ACCOUNT. MORE PLAY.</span>
        <p className={styles.statement}>다음 모험을 여는<br />하나의 계정.</p>
        <p className={styles.introText}>GAME BOX의 웹게임을 한곳에서 만나보세요.<br />게임마다 새로 가입할 필요 없이 바로 이어집니다.</p>
        <div className={styles.benefits}>
          <div><span>01</span><p><strong>하나로 연결되는 플레이</strong>포털 계정 하나로 여러 게임을 시작하세요.</p></div>
          <div><span>02</span><p><strong>게임마다 나만의 캐릭터</strong>캐릭터 이름과 모험 기록은 게임별로 관리해요.</p></div>
        </div>
      </section>
      <section className={styles.card} aria-labelledby="auth-title">
        <div className={styles.cardHeader}><h1 id="auth-title">{title}</h1><p>{description}</p></div>
        {children}
        <footer className={styles.footer}>{footer}</footer>
      </section>
    </div>
    <p className={styles.note}>브라우저에서 시작하는, 당신의 다음 플레이.</p>
  </main>
}
