import { useMemo } from 'react'
import { useHud } from '../../../context/HudContext'
import styles from './MinimapHud.module.scss'

const SIZE = 160
const CENTER = SIZE / 2
const PADDING = 30
const DRAWABLE = CENTER - PADDING
const MIN_DIST = 25

export default function MinimapHud() {
  const { locationInfo } = useHud()

  const nodes = useMemo(() => {
    if (!locationInfo) return null
    const { adjacentLocations } = locationInfo

    if (!adjacentLocations || adjacentLocations.length === 0) {
      return { current: { x: CENTER, y: CENTER }, adjacent: [] }
    }

    const deltas = adjacentLocations.map(adj => ({
      dx: adj.x - locationInfo.x,
      dy: adj.y - locationInfo.y,
      name: adj.name,
    }))

    const maxDist = Math.max(...deltas.map(d => Math.sqrt(d.dx * d.dx + d.dy * d.dy)), 1)
    const scale = DRAWABLE / maxDist

    const adjacent = deltas.map(d => {
      let sx = d.dx * scale
      let sy = d.dy * scale
      const dist = Math.sqrt(sx * sx + sy * sy)
      if (dist > 0 && dist < MIN_DIST) {
        sx = (sx / dist) * MIN_DIST
        sy = (sy / dist) * MIN_DIST
      }
      return {
        x: CENTER + sx,
        y: CENTER - sy,
        name: d.name,
      }
    })

    return { current: { x: CENTER, y: CENTER }, adjacent }
  }, [locationInfo])

  if (!locationInfo || !nodes) return null

  return (
    <div className={styles.container}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {nodes.adjacent.map((adj, i) => (
          <line
            key={`line-${i}`}
            x1={nodes.current.x}
            y1={nodes.current.y}
            x2={adj.x}
            y2={adj.y}
            stroke="white"
            strokeOpacity={0.3}
            strokeWidth={1}
          />
        ))}

        {nodes.adjacent.map((adj, i) => (
          <g key={`node-${i}`}>
            <circle cx={adj.x} cy={adj.y} r={4} fill="white" fillOpacity={0.85} />
            <text
              x={adj.x}
              y={adj.y + 12}
              textAnchor="middle"
              fill="white"
              fillOpacity={0.7}
              fontSize={9}
            >
              {adj.name}
            </text>
          </g>
        ))}

        <circle
          cx={nodes.current.x}
          cy={nodes.current.y}
          r={6}
          fill="var(--color-primary)"
        />
      </svg>
      <div className={styles.locationName}>{locationInfo.name}</div>
    </div>
  )
}
