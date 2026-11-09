import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styles from './AuthLayout.module.scss'

export default function AuthLayout({ title, description, children, footer }: {
  title: string
  description?: string
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
      <section className={styles.card} aria-labelledby="auth-title">
        <div className={styles.cardHeader}><h1 id="auth-title">{title}</h1>{description && <p>{description}</p>}</div>
        {children}
        <footer className={styles.footer}>{footer}</footer>
      </section>
    </div>
  </main>
}
