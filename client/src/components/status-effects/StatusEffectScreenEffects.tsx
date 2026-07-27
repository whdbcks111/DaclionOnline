import type { CSSProperties } from 'react'
import { StatusScreenEffectPreset, type StatusScreenVisualState } from './statusEffectVisuals'
import styles from './StatusEffectScreenEffects.module.scss'

interface StatusEffectLayerStyle extends CSSProperties {
  '--status-effect-opacity': number
}

export default function StatusEffectScreenEffects({ state }: { state: StatusScreenVisualState }) {
  const activeByKey = new Map(
    state.activeEffects.map(effect => [effect.preset.key, effect.intensity]),
  )

  return (
    <div className={styles.root} aria-hidden="true">
      {StatusScreenEffectPreset.values().map(preset => {
        const intensity = activeByKey.get(preset.key)
        return (
          <div
            key={preset.key}
            className={`${styles.layer} ${styles[preset.key]} ${intensity === undefined ? '' : styles.active}`}
            style={{
              '--status-effect-opacity': intensity ?? 0,
              borderImageSource: `url("${preset.image}")`,
            } as StatusEffectLayerStyle}
          />
        )
      })}
    </div>
  )
}
