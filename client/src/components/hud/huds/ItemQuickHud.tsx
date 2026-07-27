import { useCallback, useMemo } from 'react'
import { useHud } from '../../../context/HudContext'
import { useSocket } from '../../../context/SocketContext'
import { getUiScale } from '../../../utils/displayPreferences'
import styles from './ItemQuickHud.module.scss'

export default function ItemQuickHud() {
  const {
    playerStats,
    itemHudConfigs,
    setItemHudPosition,
    editMode,
    opacity,
    scale,
    quickButtonScale,
    quickButtonPosAnchor,
    quickButtonPosUnitX,
    quickButtonPosUnitY,
    hudViewportWidth,
    hudViewportHeight,
  } = useHud()
  const { socket } = useSocket()
  const counts = useMemo(() => new Map(
    (playerStats?.usableItems ?? []).map(item => [item.itemDataId, item.count]),
  ), [playerStats?.usableItems])

  const startDrag = useCallback((itemDataId: string, event: React.PointerEvent<HTMLDivElement>) => {
    if (!editMode) return
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startY = event.clientY
    const isRight = quickButtonPosAnchor === 'topRight' || quickButtonPosAnchor === 'bottomRight'
    const isBottom = quickButtonPosAnchor === 'bottomLeft' || quickButtonPosAnchor === 'bottomRight'
    const uiScale = getUiScale()
    const onMove = (moveEvent: PointerEvent) => {
      if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) <= 3) return
      const clientX = moveEvent.clientX / uiScale
      const clientY = moveEvent.clientY / uiScale
      setItemHudPosition(
        itemDataId,
        quickButtonPosUnitX === '%'
          ? (isRight ? hudViewportWidth - clientX : clientX) / hudViewportWidth * 100
          : (isRight ? hudViewportWidth - clientX : clientX),
        quickButtonPosUnitY === '%'
          ? (isBottom ? hudViewportHeight - clientY : clientY) / hudViewportHeight * 100
          : (isBottom ? hudViewportHeight - clientY : clientY),
      )
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', cleanup)
      window.removeEventListener('pointercancel', cleanup)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', cleanup)
    window.addEventListener('pointercancel', cleanup)
  }, [
    editMode,
    hudViewportHeight,
    hudViewportWidth,
    quickButtonPosAnchor,
    quickButtonPosUnitX,
    quickButtonPosUnitY,
    setItemHudPosition,
  ])

  const activate = useCallback((itemDataId: string, count: number) => {
    if (editMode || count <= 0) return
    socket?.emit('chatButtonClick', { action: `/사용 item:${itemDataId}` })
  }, [editMode, socket])

  return (
    <>
      {Object.values(itemHudConfigs).map(config => {
        if (!config.visible) return null
        const count = counts.get(config.itemDataId) ?? 0
        const unavailable = count <= 0
        const isRight = quickButtonPosAnchor === 'topRight' || quickButtonPosAnchor === 'bottomRight'
        const isBottom = quickButtonPosAnchor === 'bottomLeft' || quickButtonPosAnchor === 'bottomRight'
        const x = quickButtonPosUnitX === '%' ? config.x / 100 * hudViewportWidth : config.x
        const y = quickButtonPosUnitY === '%' ? config.y / 100 * hudViewportHeight : config.y
        return (
          <div
            key={config.itemDataId}
            className={`${styles.itemHud} ${editMode ? styles.editMode : ''} ${unavailable ? styles.unavailable : ''}`}
            style={{
              left: `${isRight ? hudViewportWidth - x : x}px`,
              top: `${isBottom ? hudViewportHeight - y : y}px`,
              opacity,
              transform: `translate(-50%, -50%) scale(${scale * quickButtonScale})`,
            }}
            onPointerDown={event => {
              if (editMode) startDrag(config.itemDataId, event)
              else event.preventDefault()
            }}
          >
            <button
              type="button"
              className={styles.itemButton}
              title={`${config.name} · ${unavailable ? '보유 없음' : `${count}개 보유`}`}
              aria-label={`${config.name} 퀵 버튼 사용`}
              aria-disabled={unavailable}
              onClick={() => activate(config.itemDataId, count)}
            >
              <img src={`/icons/${config.icon}.png`} alt="" draggable={false} />
              <span className={styles.count}>{count}</span>
              {editMode && <span className={styles.dragHandle}>⠿</span>}
            </button>
            <span className={styles.itemName}>{config.name}</span>
          </div>
        )
      })}
    </>
  )
}
