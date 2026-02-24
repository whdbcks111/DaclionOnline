import { useRef, useCallback } from 'react'
import { useHud, HUD_DEFINITIONS } from '../../context/HudContext'
import styles from './HudSettings.module.scss'

interface Props {
  onClose: () => void
}

function fill(value: number, min: number, max: number) {
  return `${((value - min) / (max - min)) * 100}%`
}

export default function HudSettings({ onClose }: Props) {
  const { configs, setVisible, editMode, setEditMode, opacity, setOpacity, scale, setScale } = useHud()
  const panelRef = useRef<HTMLDivElement>(null)
  const posRef = useRef({ x: window.innerWidth - 316, y: 60 })

  const handleClose = () => {
    setEditMode(false)
    onClose()
  }

  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const startPanelX = posRef.current.x
    const startPanelY = posRef.current.y

    const onMouseMove = (ev: MouseEvent) => {
      posRef.current.x = Math.max(0, Math.min(window.innerWidth - 300, startPanelX + ev.clientX - startX))
      posRef.current.y = Math.max(0, Math.min(window.innerHeight - 60, startPanelY + ev.clientY - startY))
      if (panelRef.current) {
        panelRef.current.style.left = `${posRef.current.x}px`
        panelRef.current.style.top = `${posRef.current.y}px`
      }
    }
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  const handleHeaderTouchStart = useCallback((e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    const touch = e.touches[0]
    const startX = touch.clientX
    const startY = touch.clientY
    const startPanelX = posRef.current.x
    const startPanelY = posRef.current.y

    const onTouchMove = (ev: TouchEvent) => {
      const t = ev.touches[0]
      posRef.current.x = Math.max(0, Math.min(window.innerWidth - 300, startPanelX + t.clientX - startX))
      posRef.current.y = Math.max(0, Math.min(window.innerHeight - 60, startPanelY + t.clientY - startY))
      if (panelRef.current) {
        panelRef.current.style.left = `${posRef.current.x}px`
        panelRef.current.style.top = `${posRef.current.y}px`
      }
    }
    const cleanup = () => {
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', cleanup)
      window.removeEventListener('touchcancel', cleanup)
    }
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', cleanup)
    window.addEventListener('touchcancel', cleanup)
  }, [])

  return (
    <div
      ref={panelRef}
      className={styles.panel}
      style={{ left: posRef.current.x, top: posRef.current.y }}
    >
      <div
        className={styles.header}
        onMouseDown={handleHeaderMouseDown}
        onTouchStart={handleHeaderTouchStart}
      >
        <span>HUD 설정</span>
        <button className={styles.closeBtn} onClick={handleClose}>✕</button>
      </div>

      <div className={styles.editModeRow}>
        <div>
          <div className={styles.rowLabel}>위치 편집 모드</div>
          <div className={styles.rowDesc}>HUD를 드래그해서 위치를 조정합니다</div>
        </div>
        <label className={styles.switch}>
          <input
            type="checkbox"
            checked={editMode}
            onChange={e => setEditMode(e.target.checked)}
          />
          <span className={styles.slider} />
        </label>
      </div>

      <div className={styles.opacityRow}>
        <div className={styles.rowLabel}>
          전체 투명도
          <span className={styles.opacityValue}>{Math.round(opacity * 100)}%</span>
        </div>
        <input
          type="range"
          min={10}
          max={100}
          value={Math.round(opacity * 100)}
          onChange={e => setOpacity(Number(e.target.value) / 100)}
          className={styles.rangeSlider}
          style={{ '--fill': fill(Math.round(opacity * 100), 10, 100) } as React.CSSProperties}
        />
      </div>

      <div className={styles.opacityRow}>
        <div className={styles.rowLabel}>
          전체 크기
          <span className={styles.opacityValue}>{Math.round(scale * 100)}%</span>
        </div>
        <input
          type="range"
          min={30}
          max={100}
          value={Math.round(scale * 100)}
          onChange={e => setScale(Number(e.target.value) / 100)}
          className={styles.rangeSlider}
          style={{ '--fill': fill(Math.round(scale * 100), 30, 100) } as React.CSSProperties}
        />
      </div>

      <div className={styles.divider} />

      <div className={styles.list}>
        {HUD_DEFINITIONS.map(def => {
          const cfg = configs[def.id]
          return (
            <div key={def.id} className={styles.row}>
              <span className={styles.rowLabel}>{def.label}</span>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={cfg?.visible ?? false}
                  onChange={e => setVisible(def.id, e.target.checked)}
                />
                <span className={styles.slider} />
              </label>
            </div>
          )
        })}
      </div>
    </div>
  )
}
