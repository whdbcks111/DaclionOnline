import { useHud } from '../../../context/HudContext'
import ProgressNode from '../../chat/nodes/ProgressNode'
import HealthBarNode from '../../chat/nodes/HealthBarNode'
import { renderNode } from '../../chat/ChatMessage'
import type { StatusEffectHudData } from '@shared/types'
import styles from './PlayerStatusHud.module.scss'

function pct(value: number, max: number) {
  return max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
}

function formatDuration(seconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(seconds))
  const minutes = Math.floor(totalSeconds / 60)
  const remainder = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function StatusEffectIndicator({ effect }: { effect: StatusEffectHudData }) {
  const remaining = Math.max(0, Math.min(100, effect.durationRatio * 100))

  return (
    <div
      className={styles.effect}
      tabIndex={0}
      aria-label={`${effect.label} 레벨 ${effect.level}, ${formatDuration(effect.duration)} 남음`}
    >
      <div className={styles.effectIcon}>
        <img
          src={`/icons/${effect.icon}.png`}
          alt={effect.label}
          onError={event => { event.currentTarget.hidden = true }}
        />
        <svg className={styles.effectProgress} viewBox="0 0 100 100" aria-hidden="true">
          <circle
            className={styles.effectProgressFill}
            cx="50"
            cy="50"
            r="25"
            pathLength="100"
            strokeDasharray={`${remaining} 100`}
          />
          <circle className={styles.effectProgressBorder} cx="50" cy="50" r="48" />
        </svg>
        <span className={styles.effectLevel}>Lv.{effect.level}</span>
      </div>
      <div className={styles.effectTooltip} role="tooltip">
        <strong>{effect.label} · Lv.{effect.level}</strong>
        <span className={styles.effectDescription}>
          {effect.description.map((node, index) => renderNode(node, index))}
        </span>
        <span className={styles.effectTime}>
          {formatDuration(effect.duration)} / {formatDuration(effect.maxDuration)}
        </span>
      </div>
    </div>
  )
}

export default function PlayerStatusHud() {
  const { playerStats } = useHud()
  if (!playerStats) return null

  const { userId, nickname, level, exp, maxExp, life, maxLife, shields, mentality, maxMentality, thirsty, maxThirsty, hungry, maxHungry, attackCooldown, maxAttackCooldown } = playerStats
  const statusEffects = playerStats.statusEffects ?? []
  const attackReady = maxAttackCooldown > 0 ? pct(maxAttackCooldown - attackCooldown, maxAttackCooldown) : 100

  return (
    <div className={styles.hud}>
      <div className={styles.title}>
        <span>{nickname}</span>
        <span className={styles.level}>Lv.{level}</span>
        <span className={styles.userId}>ID {userId}</span>
      </div>
      <div className={styles.bars}>
        <div className={`${styles.row} ${styles.expRow}`}>
          <span className={styles.label}>EXP</span>
          <div className={styles.track}>
            <ProgressNode value={pct(exp, maxExp) / 100} length="100%" color="$secondary" thickness={6} shape="rounded" />
          </div>
          <span className={styles.value}>{exp.toLocaleString()} / {maxExp.toLocaleString()}</span>
        </div>
        <div className={styles.pairedRow}>
          <div className={styles.row}>
            <span className={styles.label}>HP</span>
            <div className={styles.track}>
              <HealthBarNode life={life} maxLife={maxLife} shields={shields ?? []} length="100%" color="$life" thickness={6} shape="rounded" />
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
      {statusEffects.length > 0 && (
        <div className={styles.effects} aria-label="현재 상태이상">
          {statusEffects.map(effect => <StatusEffectIndicator key={effect.id} effect={effect} />)}
        </div>
      )}
    </div>
  )
}
