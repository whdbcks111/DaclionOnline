import { useMemo, useState } from 'react'
import { useHud } from '../../../context/HudContext'
import { useSocket } from '../../../context/SocketContext'
import styles from './MinimapHud.module.scss'

const SIZE = 160
const CENTER = SIZE / 2
const PADDING = 30
const DRAWABLE = CENTER - PADDING
const MIN_DIST = 25

function fillPct(v: number) {
  return `${((v - 30) / (200 - 30)) * 100}%`
}

export default function MinimapHud() {
  const { locationInfo, configs, editMode } = useHud()
  const { socket } = useSocket()
  const [zoom, setZoom] = useState(1)
  const showTravelActions = configs.minimap?.showTravelActions ?? false

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
    const scale = (DRAWABLE * zoom) / maxDist

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
  }, [locationInfo, zoom])

  if (!locationInfo || !nodes) return null

  return (
    <div className={styles.container}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className={styles.svg}>
        <defs>
          <clipPath id="minimap-clip">
            <rect x={0} y={0} width={SIZE} height={SIZE} />
          </clipPath>
        </defs>
        <g clipPath="url(#minimap-clip)">
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
        </g>
      </svg>

      <div className={styles.locationName}>{locationInfo.name}</div>

      <div className={styles.zoomRow}>
        <span className={styles.zoomLabel}>줌</span>
        <input
          type="range"
          min={30}
          max={200}
          value={Math.round(zoom * 100)}
          onChange={e => setZoom(Number(e.target.value) / 100)}
          className={styles.zoomSlider}
          style={{ '--fill': fillPct(Math.round(zoom * 100)) } as React.CSSProperties}
        />
        <span className={styles.zoomValue}>{Math.round(zoom * 100)}%</span>
      </div>

      {showTravelActions && (
        <div className={styles.travelList}>
          <div className={styles.travelTitle}>이동 가능한 지역</div>
          {locationInfo.adjacentLocations.some(location => location.status === 'visible') ? (
            locationInfo.adjacentLocations
              .filter(location => location.status === 'visible')
              .map(location => (
                <div key={location.locationId} className={styles.travelRow}>
                  <span className={styles.travelName}>{location.name}</span>
                  <button
                    type="button"
                    disabled={editMode}
                    onClick={() => socket?.emit('chatButtonClick', { action: `/이동 ${location.locationId}` })}
                  >이동</button>
                </div>
              ))
          ) : (
            <div className={styles.emptyTravelList}>현재 이동 가능한 지역이 없습니다.</div>
          )}
        </div>
      )}
    </div>
  )
}
