import { useCallback } from 'react'
import { useHud, HUD_DEFINITIONS, type AnchorPoint } from '../../context/HudContext'
import type { HudConfig } from '../../context/HudContext'
import PlayerStatusHud from './huds/PlayerStatusHud'
import LocationHud from './huds/LocationHud'
import MinimapHud from './huds/MinimapHud'
import styles from './HudContainer.module.scss'

const HUD_COMPONENTS: Record<string, React.ComponentType> = {
  'player-status': PlayerStatusHud,
  'player-location': LocationHud,
  'minimap': MinimapHud,
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

function getPositionStyle(cfg: HudConfig): React.CSSProperties {
  const unit = cfg.posUnit ?? '%'
  const u = unit === '%' ? '%' : 'px'
  const pa = cfg.posAnchor ?? 'topLeft'
  const isRight  = pa === 'topRight'  || pa === 'bottomRight'
  const isBottom = pa === 'bottomLeft' || pa === 'bottomRight'
  return {
    [isRight  ? 'right' : 'left']: `${cfg.x}${u}`,
    [isBottom ? 'bottom' : 'top']: `${cfg.y}${u}`,
  }
}

export default function HudContainer() {
  const { configs, editMode, setPosition, opacity, scale } = useHud()

  const handleMouseDown = useCallback((id: string, e: React.MouseEvent) => {
    if (!editMode) return
    e.preventDefault()
    const cfg = configs[id]
    const startMouseX = e.clientX
    const startMouseY = e.clientY
    const startX = cfg?.x ?? 50
    const startY = cfg?.y ?? 50
    const pa = cfg?.posAnchor ?? 'topLeft'
    const unit = cfg?.posUnit ?? '%'
    const isRight  = pa === 'topRight'  || pa === 'bottomRight'
    const isBottom = pa === 'bottomLeft' || pa === 'bottomRight'

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startMouseX
      const dy = ev.clientY - startMouseY
      let newX, newY
      if (unit === '%') {
        const dxPct = (dx / window.innerWidth) * 100
        const dyPct = (dy / window.innerHeight) * 100
        newX = Math.max(0, Math.min(100, startX + (isRight  ? -dxPct : dxPct)))
        newY = Math.max(0, Math.min(100, startY + (isBottom ? -dyPct : dyPct)))
      } else {
        newX = Math.max(0, startX + (isRight  ? -dx : dx))
        newY = Math.max(0, startY + (isBottom ? -dy : dy))
      }
      setPosition(id, newX, newY)
    }
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [editMode, configs, setPosition])

  const handleTouchStart = useCallback((id: string, e: React.TouchEvent) => {
    if (!editMode) return
    const touch = e.touches[0]
    const cfg = configs[id]
    const startMouseX = touch.clientX
    const startMouseY = touch.clientY
    const startX = cfg?.x ?? 50
    const startY = cfg?.y ?? 50
    const pa = cfg?.posAnchor ?? 'topLeft'
    const unit = cfg?.posUnit ?? '%'
    const isRight  = pa === 'topRight'  || pa === 'bottomRight'
    const isBottom = pa === 'bottomLeft' || pa === 'bottomRight'

    const onTouchMove = (ev: TouchEvent) => {
      const t = ev.touches[0]
      const dx = t.clientX - startMouseX
      const dy = t.clientY - startMouseY
      let newX, newY
      if (unit === '%') {
        const dxPct = (dx / window.innerWidth) * 100
        const dyPct = (dy / window.innerHeight) * 100
        newX = Math.max(0, Math.min(100, startX + (isRight  ? -dxPct : dxPct)))
        newY = Math.max(0, Math.min(100, startY + (isBottom ? -dyPct : dyPct)))
      } else {
        newX = Math.max(0, startX + (isRight  ? -dx : dx))
        newY = Math.max(0, startY + (isBottom ? -dy : dy))
      }
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
  }, [editMode, configs, setPosition])

  return (
    <>
      {HUD_DEFINITIONS.map(def => {
        const cfg = configs[def.id]
        if (!cfg?.visible) return null
        const Component = HUD_COMPONENTS[def.id]
        if (!Component) return null
        const pa = cfg.posAnchor ?? 'topLeft'
        const posIsRight  = pa === 'topRight'  || pa === 'bottomRight'
        const posIsBottom = pa === 'bottomLeft' || pa === 'bottomRight'
        const { tx: baseTx, ty: baseTy, origin } = ANCHOR_DATA[cfg.anchor ?? 'topLeft']
        // right/bottom CSS props already anchor from that edge, so the self-anchor offset direction flips
        const tx = (posIsRight  ? 100 : 0) + baseTx
        const ty = (posIsBottom ? 100 : 0) + baseTy
        const effectiveOpacity = (cfg.opacity ?? 1) * opacity
        const effectiveScale   = (cfg.scale   ?? 1) * scale
        return (
          <div
            key={def.id}
            className={`${styles.hudItem} ${editMode ? styles.editMode : ''}`}
            style={{
              ...getPositionStyle(cfg),
              opacity: effectiveOpacity,
              transform: `translate(${tx}%, ${ty}%) scale(${effectiveScale})`,
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
