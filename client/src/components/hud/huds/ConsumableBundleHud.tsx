import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useHud } from '../../../context/HudContext'
import { useSocket } from '../../../context/SocketContext'
import { getUiScale } from '../../../utils/displayPreferences'
import type { ConsumableBundleUseResult } from '@shared/types'
import styles from './ConsumableBundleHud.module.scss'

const BUNDLE_REQUEST_TIMEOUT_MS = 30_000

export default function ConsumableBundleHud() {
  const {
    playerStats,
    consumableBundleHudConfigs,
    setConsumableBundlePosition,
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
  const [busyBundleIds, setBusyBundleIds] = useState<ReadonlySet<string>>(new Set())
  const requestBundles = useRef(new Map<string, string>())
  const requestTimeouts = useRef(new Map<string, number>())
  const usableItems = useMemo(() => new Map(
    (playerStats?.usableItems ?? []).map(item => [item.itemDataId, item]),
  ), [playerStats?.usableItems])

  useEffect(() => {
    if (!socket) return
    const clearPending = () => {
      for (const timeoutId of requestTimeouts.current.values()) window.clearTimeout(timeoutId)
      requestTimeouts.current.clear()
      requestBundles.current.clear()
      setBusyBundleIds(new Set())
    }
    const onResult = (result: ConsumableBundleUseResult) => {
      const bundleId = requestBundles.current.get(result.requestId)
      if (!bundleId) return
      requestBundles.current.delete(result.requestId)
      const timeoutId = requestTimeouts.current.get(result.requestId)
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      requestTimeouts.current.delete(result.requestId)
      setBusyBundleIds(previous => {
        const next = new Set(previous)
        next.delete(bundleId)
        return next
      })
    }
    socket.on('consumableBundleUseResult', onResult)
    socket.on('disconnect', clearPending)
    return () => {
      socket.off('consumableBundleUseResult', onResult)
      socket.off('disconnect', clearPending)
      clearPending()
    }
  }, [socket])

  const startDrag = useCallback((id: string, event: React.PointerEvent<HTMLDivElement>) => {
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
      setConsumableBundlePosition(
        id,
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
    setConsumableBundlePosition,
  ])

  const activate = useCallback((bundleId: string, itemDataIds: string[], available: number) => {
    if (!socket || editMode || available <= 0 || busyBundleIds.has(bundleId)
      || [...requestBundles.current.values()].includes(bundleId)) return
    const requestId = `bundle:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
    requestBundles.current.set(requestId, bundleId)
    requestTimeouts.current.set(requestId, window.setTimeout(() => {
      requestTimeouts.current.delete(requestId)
      const pendingBundleId = requestBundles.current.get(requestId)
      requestBundles.current.delete(requestId)
      if (!pendingBundleId) return
      setBusyBundleIds(previous => {
        const next = new Set(previous)
        next.delete(pendingBundleId)
        return next
      })
    }, BUNDLE_REQUEST_TIMEOUT_MS))
    setBusyBundleIds(previous => new Set(previous).add(bundleId))
    socket.emit('useConsumableBundle', { requestId, itemDataIds })
  }, [busyBundleIds, editMode, socket])

  return (
    <>
      {Object.values(consumableBundleHudConfigs).map(config => {
        if (!config.visible) return null
        const available = config.items.filter(item => {
          const current = usableItems.get(item.itemDataId)
          return current?.bundleEligible && current.count > 0
        }).length
        const busy = busyBundleIds.has(config.id)
        const unavailable = available <= 0
        const isRight = quickButtonPosAnchor === 'topRight' || quickButtonPosAnchor === 'bottomRight'
        const isBottom = quickButtonPosAnchor === 'bottomLeft' || quickButtonPosAnchor === 'bottomRight'
        const x = Math.max(0, Math.min(
          hudViewportWidth,
          quickButtonPosUnitX === '%' ? config.x / 100 * hudViewportWidth : config.x,
        ))
        const y = Math.max(0, Math.min(
          hudViewportHeight,
          quickButtonPosUnitY === '%' ? config.y / 100 * hudViewportHeight : config.y,
        ))
        return (
          <div
            key={config.id}
            className={`${styles.bundleHud} ${editMode ? styles.editMode : ''} ${unavailable ? styles.unavailable : ''}`}
            style={{
              left: `${isRight ? hudViewportWidth - x : x}px`,
              top: `${isBottom ? hudViewportHeight - y : y}px`,
              opacity,
              transform: `translate(-50%, -50%) scale(${scale * quickButtonScale})`,
            }}
            onPointerDown={event => {
              if (editMode) startDrag(config.id, event)
              else event.preventDefault()
            }}
          >
            <button
              type="button"
              className={styles.bundleButton}
              title={`${config.name} · ${config.items.map(item => item.name).join(', ')}`}
              aria-label={`${config.name} 소모품 묶음 사용`}
              aria-disabled={unavailable || busy}
              onClick={() => activate(config.id, config.items.map(item => item.itemDataId), available)}
            >
              <img src={`/icons/${config.items[0]?.icon ?? 'items/health_potion'}.png`} alt="" draggable={false} />
              <span className={styles.bundleBadge}>{busy ? '…' : `${available}/${config.items.length}`}</span>
              {editMode && <span className={styles.dragHandle}>⠿</span>}
            </button>
            <span className={styles.bundleName}>{config.name}</span>
          </div>
        )
      })}
    </>
  )
}
