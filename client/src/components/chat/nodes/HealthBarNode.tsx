import type { ShieldBarSegment } from '@shared/types'
import { resolveColor } from '../ChatMessage'
import styles from './HealthBarNode.module.scss'

interface Props {
  life: number
  maxLife: number
  shields: readonly ShieldBarSegment[]
  length: number | string
  color: string
  thickness: number
  shape: 'rounded' | 'square'
}

interface VisualSegment extends ShieldBarSegment {
  left: number
  width: number
  overflow: boolean
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function getVisualSegments(lifeRatio: number, maxLife: number, shields: readonly ShieldBarSegment[]): VisualSegment[] {
  if (maxLife <= 0) return []
  const result: VisualSegment[] = []
  let cursor = lifeRatio
  for (const shield of shields) {
    const ratio = Math.max(0, shield.amount) / maxLife
    const end = cursor + ratio
    const normalStart = clamp(cursor, 0, 1)
    const normalEnd = clamp(end, 0, 1)
    if (normalEnd > normalStart) {
      result.push({ ...shield, left: normalStart, width: normalEnd - normalStart, overflow: false })
    }
    const overflowStart = clamp(cursor - 1, 0, 1)
    const overflowEnd = clamp(end - 1, 0, 1)
    if (overflowEnd > overflowStart) {
      result.push({ ...shield, left: overflowStart, width: overflowEnd - overflowStart, overflow: true })
    }
    cursor = end
  }
  return result
}

export default function HealthBarNode({ life, maxLife, shields, length, color, thickness, shape }: Props) {
  const lifeRatio = maxLife > 0 ? clamp(life / maxLife, 0, 1) : 0
  const totalShield = shields.reduce((sum, shield) => sum + Math.max(0, shield.amount), 0)
  const radius = shape === 'rounded' ? thickness / 2 : 0
  const segments = getVisualSegments(lifeRatio, maxLife, shields)

  return (
    <span
      className={styles.track}
      title={`생명력 ${life.toFixed(1)} / ${maxLife.toFixed(1)}${totalShield > 0 ? ` · 보호막 ${totalShield.toFixed(1)}` : ''}`}
      aria-label={`생명력 ${life.toFixed(1)} / ${maxLife.toFixed(1)}, 보호막 ${totalShield.toFixed(1)}`}
      style={{ width: length, height: thickness, borderRadius: radius }}
    >
      <span
        className={styles.life}
        style={{ width: `${lifeRatio * 100}%`, backgroundColor: resolveColor(color) }}
      />
      {segments.map((segment, index) => (
        <span
          key={`${segment.type}:${index}`}
          className={`${styles.shield} ${segment.overflow ? styles.overflow : ''}`}
          style={{
            left: `${segment.left * 100}%`,
            width: `${segment.width * 100}%`,
            backgroundColor: segment.color,
          }}
        />
      ))}
    </span>
  )
}
