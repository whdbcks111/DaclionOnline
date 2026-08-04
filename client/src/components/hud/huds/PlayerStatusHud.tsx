import { useHud } from '../../../context/HudContext'
import ProgressNode from '../../chat/nodes/ProgressNode'
import HealthBarNode from '../../chat/nodes/HealthBarNode'
import { renderNode } from '../../chat/ChatMessage'
import type { EquipmentDurabilityHudData, StatusEffectHudData } from '@shared/types'
import { resolveStatusScreenVisualState } from '../../status-effects/statusEffectVisuals'
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

export function StatusEffectIndicator({ effect }: { effect: StatusEffectHudData }) {
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

export function StatusEffectList({
  effects,
  label = '현재 상태이상',
}: {
  effects: readonly StatusEffectHudData[]
  label?: string
}) {
  if (effects.length === 0) return null
  return (
    <div className={styles.effects} aria-label={label}>
      {effects.map(effect => <StatusEffectIndicator key={effect.id} effect={effect} />)}
    </div>
  )
}

function DurabilityGroup({
  label,
  items,
}: {
  label: string
  items: readonly EquipmentDurabilityHudData[]
}) {
  if (items.length === 0) return null
  return (
    <div className={styles.durabilityGroup}>
      <span className={styles.durabilityGroupLabel}>{label}</span>
      <div className={styles.durabilityItems}>
        {items.map(item => {
          const percent = Math.round(Math.max(0, Math.min(1, item.ratio)) * 100)
          const conditionClass = percent <= 20
            ? styles.durabilityDanger
            : percent <= 50
              ? styles.durabilityWarning
              : styles.durabilityHealthy
          return (
            <div
              key={`${item.slot}:${item.itemDataId}`}
              className={styles.durabilityItem}
              title={`${item.slotLabel} · ${item.name}: ${item.current}/${item.max}`}
              aria-label={`${item.slotLabel} ${item.name} 내구도 ${item.current}/${item.max}`}
            >
              <img src={`/icons/${item.icon}.png`} alt="" aria-hidden="true" />
              <span className={styles.durabilitySlot}>{item.slotLabel}</span>
              <span className={styles.durabilityTrack} aria-hidden="true">
                <span
                  className={`${styles.durabilityFill} ${conditionClass}`}
                  style={{ width: `${percent}%` }}
                />
              </span>
              <span className={styles.durabilityValue}>{percent}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function PlayerStatusHud() {
  const { playerStats, configs } = useHud()
  if (!playerStats) return null

  const { userId, nickname, equippedTitle, level, exp, maxExp, life, maxLife, shields, mentality, maxMentality, thirsty, maxThirsty, hungry, maxHungry, attackCooldown, maxAttackCooldown } = playerStats
  const statusEffects = playerStats.statusEffects ?? []
  const equipmentDurability = playerStats.equipmentDurability ?? []
  const weaponDurability = equipmentDurability.filter(item => item.group === 'weapon')
  const armorDurability = equipmentDurability.filter(item => item.group === 'armor')
  const showArmorDurability = configs['player-status']?.showArmorDurability ?? true
  const hasVisibleDurability = weaponDurability.length > 0
    || (showArmorDurability && armorDurability.length > 0)
  const statusVisualState = resolveStatusScreenVisualState(statusEffects)
  const attackReady = maxAttackCooldown > 0 ? pct(maxAttackCooldown - attackCooldown, maxAttackCooldown) : 100

  return (
    <div className={styles.hud}>
      <div className={styles.title}>
        {equippedTitle && <span className={styles.equippedTitle}>[{equippedTitle}]</span>}
        <span>{nickname}</span>
        <span className={styles.level}>Lv.{level}</span>
        <span className={styles.userId}>ID {userId}</span>
        <div
          className={styles.compactExp}
          aria-label={`경험치 ${exp.toLocaleString()} / ${maxExp.toLocaleString()}`}
        >
          <span className={styles.expLabel}>EXP</span>
          <div className={styles.expTrack}>
            <ProgressNode value={pct(exp, maxExp) / 100} length="100%" color="$secondary" thickness={4} shape="rounded" />
          </div>
          <span className={styles.expValue}>{exp.toLocaleString()}/{maxExp.toLocaleString()}</span>
        </div>
      </div>
      <div className={styles.bars}>
        <div className={styles.pairedRow}>
          <div className={styles.row}>
            <span className={styles.label}>HP</span>
            <div className={styles.track}>
              <HealthBarNode
                life={life}
                maxLife={maxLife}
                shields={shields ?? []}
                length="100%"
                color={statusVisualState.lifeColor ?? '$life'}
                thickness={6}
                shape="rounded"
              />
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
      {hasVisibleDurability && (
        <div className={styles.durability} aria-label="장착 장비 내구도">
          <DurabilityGroup
            label="무기"
            items={weaponDurability}
          />
          {showArmorDurability && <DurabilityGroup label="보호구" items={armorDurability} />}
        </div>
      )}
      <StatusEffectList effects={statusEffects} />
    </div>
  )
}
