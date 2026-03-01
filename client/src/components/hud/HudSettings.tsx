import { useRef, useCallback, useState } from 'react'
import { useHud, HUD_DEFINITIONS, type AnchorPoint, type PosAnchor } from '../../context/HudContext'
import styles from './HudSettings.module.scss'

interface Props {
  onClose: () => void
}

function fill(value: number, min: number, max: number) {
  return `${((value - min) / (max - min)) * 100}%`
}

const ANCHOR_POINTS: AnchorPoint[] = [
  'topLeft',    'topMiddle',    'topRight',
  'middleLeft', 'center',       'middleRight',
  'bottomLeft', 'bottomMiddle', 'bottomRight',
]

const ANCHOR_LABELS: Record<AnchorPoint, string> = {
  topLeft: '좌상단', topMiddle: '상단 중앙', topRight: '우상단',
  middleLeft: '좌측 중앙', center: '중앙', middleRight: '우측 중앙',
  bottomLeft: '좌하단', bottomMiddle: '하단 중앙', bottomRight: '우하단',
}

const POS_ANCHOR_POINTS: PosAnchor[] = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']

const POS_ANCHOR_LABELS: Record<PosAnchor, string> = {
  topLeft: '좌상단', topRight: '우상단', bottomLeft: '좌하단', bottomRight: '우하단',
}

export default function HudSettings({ onClose }: Props) {
  const {
    configs, setVisible, setAnchor, setPosUnit, setPosAnchor, setHudOpacity, setHudScale, resetPosition,
    editMode, setEditMode, opacity, setOpacity, scale, setScale,
  } = useHud()
  const [openSettingsId, setOpenSettingsId] = useState<string | null>(null)
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
          const currentAnchor    = cfg?.anchor    ?? 'topLeft'
          const currentPosAnchor = cfg?.posAnchor ?? 'topLeft'
          const currentUnit      = cfg?.posUnit   ?? '%'
          const hudOpacity       = cfg?.opacity
          const hudScale         = cfg?.scale
          const isOpen = openSettingsId === def.id
          return (
            <div key={def.id} className={styles.hudRow}>
              <div className={styles.hudRowTop}>
                <span className={styles.rowLabel}>{def.label}</span>
                <div className={styles.hudRowActions}>
                  <button
                    className={`${styles.settingsBtn} ${isOpen ? styles.settingsBtnActive : ''}`}
                    title="설정"
                    onClick={() => setOpenSettingsId(isOpen ? null : def.id)}
                  >⚙</button>
                  <label className={styles.switch}>
                    <input
                      type="checkbox"
                      checked={cfg?.visible ?? false}
                      onChange={e => setVisible(def.id, e.target.checked)}
                    />
                    <span className={styles.slider} />
                  </label>
                </div>
              </div>

              {isOpen && (
                <div className={styles.hudDetail}>

                  {/* 현재 위치 + 리셋 */}
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>
                      X: {currentUnit === '%' ? `${cfg?.x?.toFixed(1) ?? 0}%` : `${Math.round(cfg?.x ?? 0)}px`}
                      {'  '}
                      Y: {currentUnit === '%' ? `${cfg?.y?.toFixed(1) ?? 0}%` : `${Math.round(cfg?.y ?? 0)}px`}
                    </span>
                    <button className={styles.resetBtn} onClick={() => resetPosition(def.id)}>↺ 초기화</button>
                  </div>

                  {/* 좌표 단위 */}
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>좌표 단위</span>
                    <div className={styles.unitToggle}>
                      <button
                        className={`${styles.unitBtn} ${currentUnit === '%' ? styles.unitActive : ''}`}
                        onClick={() => setPosUnit(def.id, '%')}
                      >%</button>
                      <button
                        className={`${styles.unitBtn} ${currentUnit === 'px' ? styles.unitActive : ''}`}
                        onClick={() => setPosUnit(def.id, 'px')}
                      >px</button>
                    </div>
                  </div>

                  {/* 좌표 기준점 */}
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>좌표 기준점</span>
                    <div className={styles.posAnchorGrid}>
                      {POS_ANCHOR_POINTS.map(pa => (
                        <button
                          key={pa}
                          className={`${styles.posAnchorCell} ${currentPosAnchor === pa ? styles.anchorActive : ''}`}
                          title={POS_ANCHOR_LABELS[pa]}
                          onClick={() => setPosAnchor(def.id, pa)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* 정렬 기준 (셀프 앵커) */}
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>정렬 기준</span>
                    <div className={styles.anchorGrid}>
                      {ANCHOR_POINTS.map(anchor => (
                        <button
                          key={anchor}
                          className={`${styles.anchorCell} ${currentAnchor === anchor ? styles.anchorActive : ''}`}
                          title={ANCHOR_LABELS[anchor]}
                          onClick={() => setAnchor(def.id, anchor)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* 개별 투명도 (전역에 곱셈) */}
                  <div className={styles.detailSliderRow}>
                    <div className={styles.detailSliderLabel}>
                      <span className={styles.detailLabel}>투명도</span>
                      <span className={styles.detailValue}>{Math.round((hudOpacity ?? 1) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={Math.round((hudOpacity ?? 1) * 100)}
                      onChange={e => setHudOpacity(def.id, Number(e.target.value) / 100)}
                      className={styles.rangeSlider}
                      style={{ '--fill': fill(Math.round((hudOpacity ?? 1) * 100), 10, 100) } as React.CSSProperties}
                    />
                  </div>

                  {/* 개별 크기 (전역에 곱셈, 50~200%) */}
                  <div className={styles.detailSliderRow}>
                    <div className={styles.detailSliderLabel}>
                      <span className={styles.detailLabel}>크기</span>
                      <span className={styles.detailValue}>{Math.round((hudScale ?? 1) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={200}
                      value={Math.round((hudScale ?? 1) * 100)}
                      onChange={e => setHudScale(def.id, Number(e.target.value) / 100)}
                      className={styles.rangeSlider}
                      style={{ '--fill': fill(Math.round((hudScale ?? 1) * 100), 50, 200) } as React.CSSProperties}
                    />
                  </div>

                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
