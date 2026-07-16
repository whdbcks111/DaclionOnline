import { useHud } from '../../../context/HudContext'
import ProgressNode from '../../chat/nodes/ProgressNode'
import styles from './PartyHud.module.scss'

function ratio(value: number, max: number): number {
  return max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
}

export default function PartyHud() {
  const { playerStats } = useHud()
  const party = playerStats?.party
  if (!party) return null

  return (
    <section className={styles.hud} aria-label="파티원 상태">
      <div className={styles.title}>파티 · {party.members.length}명</div>
      <div className={styles.members}>
        {party.members.map(member => (
          <div
            key={member.userId}
            className={`${styles.member} ${member.sameLocation ? '' : styles.remote}`}
          >
            <div className={styles.identity}>
              <span className={styles.leader}>{member.isLeader ? '♛' : ''}</span>
              <span className={styles.name}>{member.nickname}</span>
              <span className={styles.level}>Lv.{member.level}</span>
              {!member.sameLocation && <span className={styles.distance}>다른 장소</span>}
            </div>
            <div className={styles.resourceRow}>
              <span>HP</span>
              <div className={styles.track}>
                <ProgressNode value={ratio(member.life, member.maxLife)} length="100%" color="$life" thickness={6} shape="rounded" />
              </div>
              <span className={styles.value}>{Math.ceil(member.life)}/{Math.ceil(member.maxLife)}</span>
            </div>
            <div className={styles.resourceRow}>
              <span>MP</span>
              <div className={styles.track}>
                <ProgressNode value={ratio(member.mentality, member.maxMentality)} length="100%" color="$magic" thickness={6} shape="rounded" />
              </div>
              <span className={styles.value}>{Math.ceil(member.mentality)}/{Math.ceil(member.maxMentality)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
