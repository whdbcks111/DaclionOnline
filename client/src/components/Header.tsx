import styles from './Header.module.scss'

interface Props {
    totalCount: number
    channelCount: number
    onMenuClick: () => void
    channelName: string
}

export default function Header({ totalCount, channelCount, onMenuClick, channelName }: Props) {
    return (
        <header className={styles.header}>
            <button className={styles.menuButton} onClick={onMenuClick} aria-label="메뉴 열기">
                <img src="/icons/hamburger_icon.png" className={styles.hamburgerIcon} alt="" />
            </button>
            <h1 className={styles.title}>{channelName}</h1>
            <div className={styles.userCount}>
                <span className={styles.dot} />
                <span>{channelCount}명</span>
                <span className={styles.totalCount}>/ 전체 {totalCount}명</span>
            </div>
        </header>
    )
}
