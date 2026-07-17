import { useHud } from '../../../context/HudContext'
import { useSocket } from '../../../context/SocketContext'
import type { EntityBarInfo } from '@shared/types'
import ProgressNode from '../../chat/nodes/ProgressNode'
import styles from './LocationHud.module.scss'

function EntityRow({
  entity,
  index,
  color,
  showActions = false,
  actionsDisabled = false,
}: {
  entity: EntityBarInfo
  index: number
  color: string
  showActions?: boolean
  actionsDisabled?: boolean
}) {
  const { socket } = useSocket()
  const ratio = entity.maxLife > 0 ? Math.max(0, Math.min(1, entity.life / entity.maxLife)) : 0
  const label = entity.userId !== undefined ? `#${entity.userId}` : `${index}.`
  const defeated = entity.life <= 0
  const runObjectCommand = (command: '공격' | '대상지정') => {
    if (actionsDisabled || defeated) return
    socket?.emit('chatButtonClick', { action: `/${command} ${index}` })
  }
  return (
    <div className={styles.entityRow}>
      <span className={styles.entityIndex}>{label}</span>
      <span className={styles.entityName}>Lv.{entity.level} {entity.name}</span>
      <ProgressNode value={ratio} length={60} color={color} thickness={5} shape="rounded" />
      {showActions && (
        <span className={styles.entityActions}>
          <button
            type="button"
            disabled={actionsDisabled || defeated}
            title={`${index}번 오브젝트 공격`}
            onClick={() => runObjectCommand('공격')}
          >공격</button>
          <button
            type="button"
            disabled={actionsDisabled || defeated}
            title={`${index}번 오브젝트 대상 지정`}
            onClick={() => runObjectCommand('대상지정')}
          >대상 지정</button>
        </span>
      )}
    </div>
  )
}

export default function LocationHud() {
  const { locationInfo, configs, editMode } = useHud()
  if (!locationInfo) return null
  const showObjectActions = configs['player-location']?.showObjectActions ?? true

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.locationName}>{locationInfo.name}</span>
        <span className={styles.coords}>({locationInfo.x}, {locationInfo.y}, {locationInfo.z})</span>
      </div>
      {locationInfo.objects.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>오브젝트</div>
          {locationInfo.objects.map((object, i) => (
            <EntityRow
              key={i}
              entity={object}
              index={i + 1}
              color="$enemy"
              showActions={showObjectActions}
              actionsDisabled={editMode}
            />
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
