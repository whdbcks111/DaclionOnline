import { useHud } from '../../../context/HudContext'
import type { EntityBarInfo } from '@shared/types'
import ProgressNode from '../../chat/nodes/ProgressNode'
import styles from './LocationHud.module.scss'

function EntityRow({ entity, index, color }: { entity: EntityBarInfo; index: number; color: string }) {
  const ratio = entity.maxLife > 0 ? Math.max(0, Math.min(1, entity.life / entity.maxLife)) : 0
  const label = entity.userId !== undefined ? `#${entity.userId}` : `${index}.`
  return (
    <div className={styles.entityRow}>
      <span className={styles.entityIndex}>{label}</span>
      <span className={styles.entityName}>Lv.{entity.level} {entity.name}</span>
      <ProgressNode value={ratio} length={60} color={color} thickness={5} shape="rounded" />
    </div>
  )
}

export default function LocationHud() {
  const { locationInfo } = useHud()
  if (!locationInfo) return null

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.locationName}>{locationInfo.name}</span>
        <span className={styles.coords}>({locationInfo.x}, {locationInfo.y}, {locationInfo.z})</span>
      </div>
      {locationInfo.monsters.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>몬스터</div>
          {locationInfo.monsters.map((m, i) => (
            <EntityRow key={i} entity={m} index={i + 1} color="$enemy" />
          ))}
        </div>
      )}
      {locationInfo.players.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>플레이어</div>
          {locationInfo.players.map((p, i) => (
            <EntityRow key={i} entity={p} index={i + 1} color="$life" />
          ))}
        </div>
      )}
    </div>
  )
}
