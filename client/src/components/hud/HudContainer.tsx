import { useCallback } from 'react'
import { useHud, HUD_DEFINITIONS } from '../../context/HudContext'
import PlayerStatusHud from './huds/PlayerStatusHud'
import styles from './HudContainer.module.scss'

const HUD_COMPONENTS: Record<string, React.ComponentType> = {
  'player-status': PlayerStatusHud,
}

export default function HudContainer() {
  const { configs, editMode, setPosition, opacity, scale } = useHud()

  const handleMouseDown = useCallback((id: string, e: React.MouseEvent) => {
    if (!editMode) return
    e.preventDefault()
    const cfg = configs[id]
    const startX = e.clientX
    const startY = e.clientY
    const startPctX = cfg?.x ?? 50
    const startPctY = cfg?.y ?? 50

    const onMouseMove = (ev: MouseEvent) => {
      const newX = Math.max(0, Math.min(95, startPctX + ((ev.clientX - startX) / window.innerWidth) * 100))
      const newY = Math.max(0, Math.min(95, startPctY + ((ev.clientY - startY) / window.innerHeight) * 100))
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
    const startX = touch.clientX
    const startY = touch.clientY
    const startPctX = cfg?.x ?? 50
    const startPctY = cfg?.y ?? 50

    const onTouchMove = (ev: TouchEvent) => {
      const t = ev.touches[0]
      const newX = Math.max(0, Math.min(95, startPctX + ((t.clientX - startX) / window.innerWidth) * 100))
      const newY = Math.max(0, Math.min(95, startPctY + ((t.clientY - startY) / window.innerHeight) * 100))
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
        return (
          <div
            key={def.id}
            className={`${styles.hudItem} ${editMode ? styles.editMode : ''}`}
            style={{ left: `${cfg.x}%`, top: `${cfg.y}%`, opacity, transform: `scale(${scale})`, transformOrigin: 'top left' }}
            onMouseDown={e => handleMouseDown(def.id, e)}
            onTouchStart={e => handleTouchStart(def.id, e)}
          >
            {editMode && (
              <div className={styles.dragHandle}>⠿ {def.label}</div>
            )}
            <Component />
          </div>
        )
      })}
    </>
  )
}
