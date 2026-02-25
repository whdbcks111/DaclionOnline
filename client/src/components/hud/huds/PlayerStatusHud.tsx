import { useHud } from '../../../context/HudContext'
import ProgressNode from '../../chat/nodes/ProgressNode'
import styles from './PlayerStatusHud.module.scss'

function pct(value: number, max: number) {
  return max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
}

export default function PlayerStatusHud() {
  const { playerStats } = useHud()
  if (!playerStats) return null

  const { userId, nickname, life, maxLife, mentality, maxMentality, thirsty, maxThirsty, hungry, maxHungry, attackCooldown, maxAttackCooldown } = playerStats
  const attackReady = maxAttackCooldown > 0 ? pct(maxAttackCooldown - attackCooldown, maxAttackCooldown) : 100

  return (
    <div className={styles.hud}>
      <div className={styles.title}>
        <span>{nickname}</span>
        <span className={styles.userId}>ID {userId}</span>
      </div>
      <div className={styles.bars}>
        <div className={styles.pairedRow}>
          <div className={styles.row}>
            <span className={styles.label}>HP</span>
            <div className={styles.track}>
              <ProgressNode value={pct(life, maxLife) / 100} length="100%" color="$life" thickness={6} shape="rounded" />
            </div>
            <span className={styles.value}>{Math.floor(pct(life, maxLife))}%</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>MP</span>
            <div className={styles.track}>
              <ProgressNode value={pct(mentality, maxMentality) / 100} length="100%" color="$magic" thickness={6} shape="rounded" />
            </div>
            <span className={styles.value}>{Math.floor(pct(mentality, maxMentality))}%</span>
          </div>
        </div>
        <div className={styles.pairedRow}>
          <div className={styles.row}>
            <span className={styles.label}>배고픔</span>
            <div className={styles.track}>
              <ProgressNode value={pct(hungry, maxHungry) / 100} length="100%" color="$hungry" thickness={6} shape="rounded" />
            </div>
            <span className={styles.value}>{Math.floor(pct(hungry, maxHungry))}%</span>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>목마름</span>
            <div className={styles.track}>
              <ProgressNode value={pct(thirsty, maxThirsty) / 100} length="100%" color="$thirsty" thickness={6} shape="rounded" />
            </div>
            <span className={styles.value}>{Math.floor(pct(thirsty, maxThirsty))}%</span>
          </div>
        </div>
        <div className={styles.halfRow}>
          <div className={styles.row}>
            <span className={styles.label}>공격</span>
            <div className={styles.track}>
              <ProgressNode value={attackReady / 100} length="100%" color="white" thickness={6} shape="rounded" />
            </div>
            <span className={styles.value}>{attackCooldown > 0 ? `${attackCooldown.toFixed(1)}s` : '준비'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
