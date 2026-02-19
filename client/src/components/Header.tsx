import styles from './Header.module.scss'

interface Props {
    userCount: number
    onMenuClick: () => void
}

export default function Header({ userCount, onMenuClick }: Props) {
    return (
        <header className={styles.header}>
            <button className={styles.menuButton} onClick={onMenuClick} aria-label="메뉴 열기">
                <img src="/icons/hamburger_icon.png" className={styles.hamburgerIcon} alt="" />
            </button>
            <h1 className={styles.title}>Daclion Online</h1>
            <div className={styles.userCount}>
                <span className={styles.dot} />
                {userCount}명
            </div>
        </header>
    )
}
