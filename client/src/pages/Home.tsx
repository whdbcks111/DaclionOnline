// 홈 페이지 (로그인 후 메인 페이지)
import styles from './Home.module.scss'

function Home() {
  return (
    <div className={styles.homeContainer}>
      <div className={styles.chatArea}>
        <div className={styles.chatMessages}>
          {/* 채팅 메시지 표시 영역 */}
        </div>
        <div className={styles.chatInput}>
          <input type="text" placeholder="메시지를 입력하세요" />
          <button>전송</button>
        </div>
      </div>
    </div>
  )
}

export default Home
