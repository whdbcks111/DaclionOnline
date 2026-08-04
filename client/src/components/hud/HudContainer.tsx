import { useCallback } from 'react'
import { useHud, HUD_DEFINITIONS, type AnchorPoint } from '../../context/HudContext'
import type { HudConfig } from '../../context/HudContext'
import PlayerStatusHud from './huds/PlayerStatusHud'
import TargetStatusHud from './huds/TargetStatusHud'
import LocationHud from './huds/LocationHud'
import MinimapHud from './huds/MinimapHud'
import QuickSlotHud from './huds/QuickSlotHud'
import PartyHud from './huds/PartyHud'
import SkillQuickHud from './huds/SkillQuickHud'
import ItemQuickHud from './huds/ItemQuickHud'
import ConsumableBundleHud from './huds/ConsumableBundleHud'
import { getUiScale } from '../../utils/displayPreferences'
import styles from './HudContainer.module.scss'

const HUD_COMPONENTS: Record<string, React.ComponentType> = {
  'player-status': PlayerStatusHud,
  'target-status': TargetStatusHud,
  'player-location': LocationHud,
  'minimap': MinimapHud,
  'quick-slots': QuickSlotHud,
  'party-status': PartyHud,
}

const ANCHOR_DATA: Record<AnchorPoint, { tx: number; ty: number; origin: string }> = {
  topLeft:      { tx: 0,    ty: 0,    origin: 'top left' },
  topMiddle:    { tx: -50,  ty: 0,    origin: 'top center' },
  topRight:     { tx: -100, ty: 0,    origin: 'top right' },
  middleLeft:   { tx: 0,    ty: -50,  origin: 'center left' },
  center:       { tx: -50,  ty: -50,  origin: 'center center' },
  middleRight:  { tx: -100, ty: -50,  origin: 'center right' },
  bottomLeft:   { tx: 0,    ty: -100, origin: 'bottom left' },
  bottomMiddle: { tx: -50,  ty: -100, origin: 'bottom center' },
  bottomRight:  { tx: -100, ty: -100, origin: 'bottom right' },
}

function getPositionStyle(cfg: HudConfig, viewportWidth: number, viewportHeight: number): React.CSSProperties {
  const ux = cfg.posUnitX ?? '%'
  const uy = cfg.posUnitY ?? '%'
  const pa = cfg.posAnchor ?? 'topLeft'
  const isRight  = pa === 'topRight'  || pa === 'bottomRight'
  const isBottom = pa === 'bottomLeft' || pa === 'bottomRight'
  const x = Math.max(0, Math.min(viewportWidth, ux === '%' ? cfg.x / 100 * viewportWidth : cfg.x))
  const y = Math.max(0, Math.min(viewportHeight, uy === '%' ? cfg.y / 100 * viewportHeight : cfg.y))
  return {
    left: `${isRight ? viewportWidth - x : x}px`,
    top: `${isBottom ? viewportHeight - y : y}px`,
  }
}

export default function HudContainer() {
  const {
    configs,
    editMode,
    setPosition,
    opacity,
    scale,
    gridSnapEnabled,
    gridSize,
    hudViewportWidth,
    hudViewportHeight,
  } = useHud()

  const handleMouseDown = useCallback((id: string, e: React.MouseEvent) => {
    if (!editMode) return
    if ((e.target as HTMLElement).closest('input, button, textarea, select, a')) return
    e.preventDefault()
    const cfg = configs[id]
    const startMouseX = e.clientX
    const startMouseY = e.clientY
    const startX = cfg?.x ?? 50
    const startY = cfg?.y ?? 50
    const pa = cfg?.posAnchor ?? 'topLeft'
    const unitX = cfg?.posUnitX ?? '%'
    const unitY = cfg?.posUnitY ?? '%'
    const isRight  = pa === 'topRight'  || pa === 'bottomRight'
    const isBottom = pa === 'bottomLeft' || pa === 'bottomRight'
    const uiScale = getUiScale()

    const onMouseMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startMouseX) / uiScale
      const dy = (ev.clientY - startMouseY) / uiScale
      const newX = unitX === '%'
        ? Math.max(0, Math.min(100, startX + (isRight  ? -(dx / hudViewportWidth)  * 100 : (dx / hudViewportWidth)  * 100)))
        : Math.max(0, startX + (isRight  ? -dx : dx))
      const newY = unitY === '%'
        ? Math.max(0, Math.min(100, startY + (isBottom ? -(dy / hudViewportHeight) * 100 : (dy / hudViewportHeight) * 100)))
        : Math.max(0, startY + (isBottom ? -dy : dy))
      setPosition(id, newX, newY)
    }
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [editMode, configs, hudViewportHeight, hudViewportWidth, setPosition])

  const handleTouchStart = useCallback((id: string, e: React.TouchEvent) => {
    if (!editMode) return
    const touch = e.touches[0]
    const cfg = configs[id]
    const startMouseX = touch.clientX
    const startMouseY = touch.clientY
    const startX = cfg?.x ?? 50
    const startY = cfg?.y ?? 50
    const pa = cfg?.posAnchor ?? 'topLeft'
    const unitX = cfg?.posUnitX ?? '%'
    const unitY = cfg?.posUnitY ?? '%'
    const isRight  = pa === 'topRight'  || pa === 'bottomRight'
    const isBottom = pa === 'bottomLeft' || pa === 'bottomRight'
    const uiScale = getUiScale()

    const onTouchMove = (ev: TouchEvent) => {
      const t = ev.touches[0]
      const dx = (t.clientX - startMouseX) / uiScale
      const dy = (t.clientY - startMouseY) / uiScale
      const newX = unitX === '%'
        ? Math.max(0, Math.min(100, startX + (isRight  ? -(dx / hudViewportWidth)  * 100 : (dx / hudViewportWidth)  * 100)))
        : Math.max(0, startX + (isRight  ? -dx : dx))
      const newY = unitY === '%'
        ? Math.max(0, Math.min(100, startY + (isBottom ? -(dy / hudViewportHeight) * 100 : (dy / hudViewportHeight) * 100)))
        : Math.max(0, startY + (isBottom ? -dy : dy))
      setPosition(id, newX, newY)
    }
    const cleanup = () => {
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', cleanup)
      window.removeEventListener('touchcancel', cleanup)
    }
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', cleanup)
    window.addEventListener('touchcancel', cleanup)
  }, [editMode, configs, hudViewportHeight, hudViewportWidth, setPosition])

  return (
    <>
      {editMode && gridSnapEnabled && (
        <div
          className={styles.editGrid}
          style={{
            '--hud-grid-size': `${gridSize}px`,
            width: `${hudViewportWidth}px`,
            height: `${hudViewportHeight}px`,
          } as React.CSSProperties}
          aria-hidden
        />
      )}
      <SkillQuickHud />
      <ItemQuickHud />
      <ConsumableBundleHud />
      {HUD_DEFINITIONS.map(def => {
        const cfg = configs[def.id]
        if (!cfg?.visible) return null
        const Component = HUD_COMPONENTS[def.id]
        if (!Component) return null
        const { tx: baseTx, ty: baseTy, origin } = ANCHOR_DATA[cfg.anchor ?? 'topLeft']
        const effectiveOpacity = (cfg.opacity ?? 1) * opacity
        const effectiveScale   = (cfg.scale   ?? 1) * scale
        return (
          <div
            key={def.id}
            className={`${styles.hudItem} ${editMode ? styles.editMode : ''}`}
            style={{
              ...getPositionStyle(cfg, hudViewportWidth, hudViewportHeight),
              opacity: effectiveOpacity,
              transform: `translate(${baseTx}%, ${baseTy}%) scale(${effectiveScale})`,
              transformOrigin: origin,
            }}
            onMouseDown={e => handleMouseDown(def.id, e)}
            onTouchStart={e => handleTouchStart(def.id, e)}
          >
            <Component />
            {editMode && (
              <div className={styles.editOverlay}>
                <span className={styles.editLabel}>⠿ {def.label}</span>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
