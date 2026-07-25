import { useEffect, useState } from 'react'
import { Dialog } from './dialog'
import {
  UI_SCALE_DEFAULT,
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  UI_SCALE_STEP,
  formatUiScale,
  getUiScale,
  normalizeUiScale,
  setUiScale,
} from '../utils/displayPreferences'
import styles from './DisplaySettingsDialog.module.scss'

interface Props {
  open: boolean
  onClose: () => void
}

export default function DisplaySettingsDialog({ open, onClose }: Props) {
  const [scale, setScale] = useState(UI_SCALE_DEFAULT)

  useEffect(() => {
    if (open) setScale(getUiScale())
  }, [open])

  const adjust = (delta: number) => {
    setScale(current => normalizeUiScale(current + delta))
  }

  const apply = () => {
    setUiScale(scale)
    onClose()
  }

  return (
    <Dialog
      open={open}
      title="페이지 확대율"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className={styles.secondaryButton} onClick={() => setScale(UI_SCALE_DEFAULT)}>
            기본값
          </button>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>
            취소
          </button>
          <button type="button" className={styles.primaryButton} onClick={apply}>
            적용
          </button>
        </>
      )}
    >
      <div className={styles.content}>
        <p>브라우저 확대와 별개로 게임 화면을 5% 단위로 조절합니다. 설정은 이 기기에 저장됩니다.</p>
        <output className={styles.value} htmlFor="page-scale-range">{formatUiScale(scale)}</output>
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.stepButton}
            aria-label="5% 축소"
            onClick={() => adjust(-UI_SCALE_STEP)}
            disabled={scale <= UI_SCALE_MIN}
          >
            −
          </button>
          <input
            id="page-scale-range"
            type="range"
            min={UI_SCALE_MIN}
            max={UI_SCALE_MAX}
            step={UI_SCALE_STEP}
            value={scale}
            aria-label="페이지 확대율"
            onChange={event => setScale(normalizeUiScale(Number(event.target.value)))}
          />
          <button
            type="button"
            className={styles.stepButton}
            aria-label="5% 확대"
            onClick={() => adjust(UI_SCALE_STEP)}
            disabled={scale >= UI_SCALE_MAX}
          >
            +
          </button>
        </div>
        <div className={styles.rangeLabels}>
          <span>{formatUiScale(UI_SCALE_MIN)}</span>
          <span>{formatUiScale(UI_SCALE_MAX)}</span>
        </div>
      </div>
    </Dialog>
  )
}
