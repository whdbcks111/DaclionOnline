import { useHud } from '../../../context/HudContext'
import { useSocket } from '../../../context/SocketContext'
import type {
  EntityBarInfo,
  LocationNpcInfo,
  LocationObjectAction,
} from '@shared/types'
import HealthBarNode from '../../chat/nodes/HealthBarNode'
import styles from './LocationHud.module.scss'

const OBJECT_ACTIONS: Record<LocationObjectAction, { command: string; label: string }> = {
  attack: { command: '공격', label: '공격' },
  target: { command: '대상지정', label: '대상 지정' },
  interact: { command: '상호작용', label: '상호작용' },
}

const QUEST_MARKER_CLASSES: Record<string, string> = {
  ready: styles.questReady,
  available: styles.questAvailable,
  active: styles.questActive,
}

function formatRespawnTime(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor(total % 3600 / 60)
  const remainingSeconds = total % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    : `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function EntityRow({
  entity,
  index,
  color,
  objectActions,
  showPvpAction = false,
  actionsDisabled = false,
}: {
  entity: EntityBarInfo
  index: number
  color: string
  objectActions?: readonly LocationObjectAction[]
  showPvpAction?: boolean
  actionsDisabled?: boolean
}) {
  const { socket } = useSocket()
  const label = entity.userId !== undefined ? `#${entity.userId}` : `${index}.`
  const defeated = entity.life <= 0
  const runObjectCommand = (command: string) => {
    if (actionsDisabled || defeated) return
    const action = entity.userId !== undefined
      ? `/대상지정p #${entity.userId}`
      : `/${command} ${index}`
    socket?.emit('chatButtonClick', { action })
  }
  return (
    <div className={styles.entityRow}>
      <span className={styles.entityIndex}>{label}</span>
      {entity.icon && <img className={styles.entityIcon} src={`/icons/${entity.icon}.png`} alt="" />}
      <span className={styles.entityName}>
        {entity.isBoss && <span className={styles.bossCrown} aria-label="보스" title="보스">♛</span>}
        {entity.isBoss && ' '}
        Lv.{entity.level} {entity.name}
      </span>
      {entity.respawn && (
        <span
          className={styles.respawn}
          title={`기본 리젠 시간 ${formatRespawnTime(entity.respawn.duration)}`}
        >
          리젠 {formatRespawnTime(defeated ? entity.respawn.remaining : entity.respawn.duration)}
          {defeated ? ' 남음' : ''}
        </span>
      )}
      <HealthBarNode life={entity.life} maxLife={entity.maxLife} shields={entity.shields ?? []} length={60} color={color} thickness={5} shape="rounded" />
      {objectActions && objectActions.length > 0 && (
        <span className={styles.entityActions}>
          {objectActions.map(action => {
            const presentation = OBJECT_ACTIONS[action]
            return <button
              key={action}
              type="button"
              disabled={actionsDisabled || defeated}
              title={`${index}번 오브젝트 ${presentation.label}`}
              onClick={() => runObjectCommand(presentation.command)}
            >{presentation.label}</button>
          })}
        </span>
      )}
      {showPvpAction && (
        <span className={styles.entityActions}>
          <button
            type="button"
            disabled={actionsDisabled || defeated}
            title={`${entity.name} PVP 대상 지정`}
            onClick={() => runObjectCommand('대상지정')}
          >PVP 대상</button>
        </span>
      )}
    </div>
  )
}

function NpcRow({
  npc,
  index,
  showAction,
  actionDisabled,
}: {
  npc: LocationNpcInfo
  index: number
  showAction: boolean
  actionDisabled: boolean
}) {
  const { socket } = useSocket()
  const markerClass = npc.questMarker
    ? QUEST_MARKER_CLASSES[npc.questMarker.key]
    : undefined
  return (
    <div className={styles.npcRow}>
      <span className={styles.entityIndex}>{index}.</span>
      {npc.questMarker && (
        <span
          className={`${styles.questMarker} ${markerClass ?? ''}`}
          title={npc.questMarker.label}
        >{npc.questMarker.symbol}</span>
      )}
      <span className={styles.npcName} title={npc.description || undefined}>{npc.name}</span>
      {npc.description && <span className={styles.npcDescription}>{npc.description}</span>}
      {showAction && (
        <span className={styles.entityActions}>
          <button
            type="button"
            disabled={actionDisabled}
            title={`${npc.name}과 대화`}
            onClick={() => socket?.emit('chatButtonClick', { action: `/대화 ${index}` })}
          >대화</button>
        </span>
      )}
    </div>
  )
}

export default function LocationHud() {
  const { locationInfo, playerStats, configs, editMode } = useHud()
  if (!locationInfo) return null
  const showObjectActions = configs['player-location']?.showObjectActions ?? true

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.locationName}>{locationInfo.name}</span>
        <span className={styles.zone}>{locationInfo.zoneLabel}</span>
        <span className={styles.coords}>({locationInfo.x}, {locationInfo.y}, {locationInfo.z})</span>
      </div>
      {Boolean(locationInfo.capabilities?.length) && (
        <div className={styles.capabilities} aria-label="현재 장소 이용 가능 기능">
          {locationInfo.capabilities?.map(capability => (
            <span key={capability.key} className={styles.capability}>
              <img src={`/icons/${capability.icon}.png`} alt="" aria-hidden="true" />
              {capability.label}
            </span>
          ))}
        </div>
      )}
      {locationInfo.objects.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>오브젝트</div>
          {locationInfo.objects.map((object, i) => (
            <EntityRow
              key={i}
              entity={object}
              index={i + 1}
              color="$enemy"
              objectActions={showObjectActions ? object.actions : undefined}
              actionsDisabled={editMode}
            />
          ))}
        </div>
      )}
      {locationInfo.npcs.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>NPC</div>
          {locationInfo.npcs.map((npc, i) => (
            <NpcRow
              key={`${npc.name}-${i}`}
              npc={npc}
              index={i + 1}
              showAction={showObjectActions}
              actionDisabled={editMode}
            />
          ))}
        </div>
      )}
      {locationInfo.players.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>플레이어</div>
          {locationInfo.players.map((p, i) => (
            <EntityRow
              key={p.userId ?? i}
              entity={p}
              index={i + 1}
              color="$life"
              showPvpAction={showObjectActions && locationInfo.pvpAllowed && p.userId !== playerStats?.userId}
              actionsDisabled={editMode}
            />
          ))}
        </div>
      )}
    </div>
  )
}
