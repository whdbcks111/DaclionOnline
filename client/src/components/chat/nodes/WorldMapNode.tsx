import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import type { WorldMapData, WorldMapLocationData } from '@shared/types'
import styles from './WorldMapNode.module.scss'

interface Props {
    data: WorldMapData
}

interface Point {
    x: number
    y: number
}

interface ViewBox {
    x: number
    y: number
    width: number
    height: number
}

const DEFAULT_ASPECT = 16 / 9
const MIN_SPAN = 180
const MIN_BIOME_RADIUS = 52
const MAX_BIOME_RADIUS = 108

interface BiomeNode extends Point {
    id: string
    radius: number
}

interface BiomeSegment {
    id: string
    from: Point
    to: Point
    width: number
}

interface BiomeRegion {
    color: string
    nodes: BiomeNode[]
    segments: BiomeSegment[]
}

interface BiomeTransition extends BiomeSegment {
    fromColor: string
    toColor: string
}

interface BiomeGeometry {
    regions: BiomeRegion[]
    transitions: BiomeTransition[]
}

function mapY(location: WorldMapLocationData): number {
    return -location.y
}

function createFitView(data: WorldMapData, aspect = DEFAULT_ASPECT): ViewBox {
    if (data.locations.length === 0) return { x: -160, y: -90, width: 320, height: 180 }

    const xs = data.locations.map(location => location.x)
    const ys = data.locations.map(mapY)
    const rawWidth = Math.max(MIN_SPAN, Math.max(...xs) - Math.min(...xs))
    const rawHeight = Math.max(MIN_SPAN / DEFAULT_ASPECT, Math.max(...ys) - Math.min(...ys))
    const padding = Math.max(42, Math.max(rawWidth, rawHeight) * 0.12)
    let width = rawWidth + padding * 2
    let height = rawHeight + padding * 2

    if (width / height > aspect) height = width / aspect
    else width = height * aspect

    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2
    return { x: centerX - width / 2, y: centerY - height / 2, width, height }
}

function midpoint(a: Point, b: Point): Point {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function distance(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y)
}

function getBiomeRadius(location: WorldMapLocationData, locations: readonly WorldMapLocationData[]): number {
    const nearest = locations.reduce((minimum, candidate) => {
        if (candidate.id === location.id) return minimum
        return Math.min(minimum, Math.hypot(candidate.x - location.x, candidate.y - location.y))
    }, Number.POSITIVE_INFINITY)
    if (!Number.isFinite(nearest)) return 78
    return Math.max(MIN_BIOME_RADIUS, Math.min(MAX_BIOME_RADIUS, nearest * 0.82))
}

function createBiomeGeometry(data: WorldMapData): BiomeGeometry {
    const visited = data.locations.filter(location => location.visited && location.mapColor)
    const visitedById = new Map(visited.map(location => [location.id, location]))
    const radii = new Map(visited.map(location => [location.id, getBiomeRadius(location, visited)]))
    const regions = new Map<string, BiomeRegion>()
    const transitions: BiomeTransition[] = []
    const getRegion = (color: string) => {
        const key = color.toLowerCase()
        const existing = regions.get(key)
        if (existing) return existing
        const region: BiomeRegion = { color: key, nodes: [], segments: [] }
        regions.set(key, region)
        return region
    }

    for (const location of visited) {
        getRegion(location.mapColor!).nodes.push({
            id: location.id,
            x: location.x,
            y: mapY(location),
            radius: radii.get(location.id) ?? MIN_BIOME_RADIUS,
        })
    }

    for (const connection of data.connections) {
        if (!connection.discovered) continue
        const from = visitedById.get(connection.from)
        const to = visitedById.get(connection.to)
        if (!from?.mapColor || !to?.mapColor) continue
        const fromPoint = { x: from.x, y: mapY(from) }
        const toPoint = { x: to.x, y: mapY(to) }
        const fromRadius = radii.get(from.id) ?? MIN_BIOME_RADIUS
        const toRadius = radii.get(to.id) ?? MIN_BIOME_RADIUS
        const width = Math.max(MIN_BIOME_RADIUS * 1.35, Math.min(fromRadius, toRadius) * 1.7)
        const segmentId = `${connection.from}:${connection.to}`

        if (from.mapColor.toLowerCase() === to.mapColor.toLowerCase()) {
            getRegion(from.mapColor).segments.push({ id: segmentId, from: fromPoint, to: toPoint, width })
            continue
        }

        transitions.push({
            id: segmentId,
            from: fromPoint,
            to: toPoint,
            width,
            fromColor: from.mapColor.toLowerCase(),
            toColor: to.mapColor.toLowerCase(),
        })
    }

    return { regions: [...regions.values()], transitions }
}

function getLocalPoint(svg: SVGSVGElement, point: Point): Point {
    const rect = svg.getBoundingClientRect()
    return { x: point.x - rect.left, y: point.y - rect.top }
}

export default function WorldMapNode({ data }: Props) {
    const svgId = useId().replaceAll(':', '')
    const gridId = `world-map-grid-${svgId}`
    const glowId = `world-map-current-glow-${svgId}`
    const biomeFilterId = `world-map-biome-boundary-${svgId}`
    const containerRef = useRef<HTMLDivElement>(null)
    const svgRef = useRef<SVGSVGElement>(null)
    const pointers = useRef(new Map<number, Point>())
    const fitViewRef = useRef(createFitView(data))
    const hasInteracted = useRef(false)
    const [view, setView] = useState(() => createFitView(data))
    const [hoveredId, setHoveredId] = useState<string | null>(null)
    const [selectedId, setSelectedId] = useState<string | null>(null)

    const locationsById = useMemo(
        () => new Map(data.locations.map(location => [location.id, location])),
        [data.locations],
    )
    const activeLocation = locationsById.get(hoveredId ?? selectedId ?? '')
    const biomeGeometry = useMemo(() => createBiomeGeometry(data), [data])

    useEffect(() => {
        const container = containerRef.current
        if (!container) return
        const resize = () => {
            const rect = container.getBoundingClientRect()
            if (rect.width <= 0 || rect.height <= 0) return
            const nextFit = createFitView(data, rect.width / rect.height)
            fitViewRef.current = nextFit
            if (!hasInteracted.current) setView(nextFit)
        }
        resize()
        const observer = new ResizeObserver(resize)
        observer.observe(container)
        return () => observer.disconnect()
    }, [data])

    const zoomAt = useCallback((factor: number, localPoint?: Point) => {
        const svg = svgRef.current
        if (!svg) return
        hasInteracted.current = true
        const rect = svg.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return
        const point = localPoint ?? { x: rect.width / 2, y: rect.height / 2 }
        setView(current => {
            const fit = fitViewRef.current
            const minWidth = fit.width / 7
            const maxWidth = fit.width * 2
            const nextWidth = Math.min(maxWidth, Math.max(minWidth, current.width * factor))
            const ratio = nextWidth / current.width
            const nextHeight = current.height * ratio
            const worldX = current.x + point.x / rect.width * current.width
            const worldY = current.y + point.y / rect.height * current.height
            return {
                x: worldX - point.x / rect.width * nextWidth,
                y: worldY - point.y / rect.height * nextHeight,
                width: nextWidth,
                height: nextHeight,
            }
        })
    }, [])

    const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
        event.preventDefault()
        zoomAt(event.deltaY > 0 ? 1.12 : 0.88, getLocalPoint(event.currentTarget, {
            x: event.clientX,
            y: event.clientY,
        }))
    }

    const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return
        hasInteracted.current = true
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
        event.currentTarget.setPointerCapture(event.pointerId)
    }

    const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
        const previous = pointers.current.get(event.pointerId)
        if (!previous) return
        const svg = event.currentTarget
        const rect = svg.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return

        const before = [...pointers.current.values()]
        const nextPoint = { x: event.clientX, y: event.clientY }
        pointers.current.set(event.pointerId, nextPoint)
        const after = [...pointers.current.values()]

        if (before.length >= 2 && after.length >= 2) {
            const oldMid = midpoint(before[0], before[1])
            const newMid = midpoint(after[0], after[1])
            const oldDistance = distance(before[0], before[1])
            const newDistance = distance(after[0], after[1])
            if (oldDistance <= 0 || newDistance <= 0) return
            const oldLocal = getLocalPoint(svg, oldMid)
            const newLocal = getLocalPoint(svg, newMid)
            setView(current => {
                const fit = fitViewRef.current
                const scale = oldDistance / newDistance
                const nextWidth = Math.min(fit.width * 2, Math.max(fit.width / 7, current.width * scale))
                const appliedScale = nextWidth / current.width
                const nextHeight = current.height * appliedScale
                const worldX = current.x + oldLocal.x / rect.width * current.width
                const worldY = current.y + oldLocal.y / rect.height * current.height
                return {
                    x: worldX - newLocal.x / rect.width * nextWidth,
                    y: worldY - newLocal.y / rect.height * nextHeight,
                    width: nextWidth,
                    height: nextHeight,
                }
            })
            return
        }

        setView(current => ({
            ...current,
            x: current.x - (nextPoint.x - previous.x) * current.width / rect.width,
            y: current.y - (nextPoint.y - previous.y) * current.height / rect.height,
        }))
    }

    const releasePointer = (event: ReactPointerEvent<SVGSVGElement>) => {
        pointers.current.delete(event.pointerId)
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
        }
    }

    const resetView = () => {
        hasInteracted.current = false
        setView(fitViewRef.current)
    }

    return (
        <div className={styles.mapShell} ref={containerRef}>
            <div className={styles.toolbar}>
                <span className={styles.legend}><i className={styles.visitedDot} />방문</span>
                <span className={styles.legend}><i className={styles.unknownDot} />인접 미방문</span>
                <span className={styles.spacer} />
                <button type="button" onClick={() => zoomAt(0.8)} aria-label="지도 확대">＋</button>
                <button type="button" onClick={() => zoomAt(1.25)} aria-label="지도 축소">－</button>
                <button type="button" onClick={resetView}>전체 보기</button>
            </div>
            <svg
                ref={svgRef}
                className={styles.map}
                viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
                onWheel={handleWheel}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={releasePointer}
                onPointerCancel={releasePointer}
                onPointerLeave={() => setHoveredId(null)}
                role="img"
                aria-label="방문 장소 지도"
            >
                <defs>
                    <pattern id={gridId} width="50" height="50" patternUnits="userSpaceOnUse">
                        <path d="M 50 0 L 0 0 0 50" className={styles.gridLine} fill="none" />
                    </pattern>
                    <filter id={glowId} x="-80%" y="-80%" width="260%" height="260%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                    <filter id={biomeFilterId} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
                        <feTurbulence type="fractalNoise" baseFrequency="0.014 0.019" numOctaves="2" seed="17" result="boundaryNoise" />
                        <feDisplacementMap in="SourceGraphic" in2="boundaryNoise" scale="11" xChannelSelector="R" yChannelSelector="G" result="organicShape" />
                        <feGaussianBlur in="organicShape" stdDeviation="7" result="softEdge" />
                        <feComponentTransfer in="softEdge" result="fadedEdge">
                            <feFuncA type="linear" slope="0.32" />
                        </feComponentTransfer>
                        <feMerge>
                            <feMergeNode in="fadedEdge" />
                            <feMergeNode in="organicShape" />
                        </feMerge>
                    </filter>
                    {biomeGeometry.transitions.map((transition, index) => (
                        <linearGradient
                            key={transition.id}
                            id={`${biomeFilterId}-transition-${index}`}
                            gradientUnits="userSpaceOnUse"
                            x1={transition.from.x}
                            y1={transition.from.y}
                            x2={transition.to.x}
                            y2={transition.to.y}
                        >
                            <stop offset="0%" stopColor={transition.fromColor} />
                            <stop offset="32%" stopColor={transition.fromColor} />
                            <stop offset="68%" stopColor={transition.toColor} />
                            <stop offset="100%" stopColor={transition.toColor} />
                        </linearGradient>
                    ))}
                </defs>
                <g className={styles.biomeLayer} filter={`url(#${biomeFilterId})`} aria-hidden="true">
                    {biomeGeometry.regions.map(region => (
                        <g
                            key={region.color}
                            fill={region.color}
                            stroke={region.color}
                        >
                            {region.segments.map(segment => (
                                <line
                                    key={segment.id}
                                    x1={segment.from.x}
                                    y1={segment.from.y}
                                    x2={segment.to.x}
                                    y2={segment.to.y}
                                    strokeWidth={segment.width}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            ))}
                            {region.nodes.map(node => (
                                <circle key={node.id} cx={node.x} cy={node.y} r={node.radius} stroke="none" />
                            ))}
                        </g>
                    ))}
                    {biomeGeometry.transitions.map((transition, index) => (
                        <line
                            key={transition.id}
                            x1={transition.from.x}
                            y1={transition.from.y}
                            x2={transition.to.x}
                            y2={transition.to.y}
                            stroke={`url(#${biomeFilterId}-transition-${index})`}
                            strokeWidth={transition.width}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    ))}
                </g>
                <rect x={view.x} y={view.y} width={view.width} height={view.height} fill={`url(#${gridId})`} />

                {data.connections.map(connection => {
                    const from = locationsById.get(connection.from)
                    const to = locationsById.get(connection.to)
                    if (!from || !to) return null
                    return <line
                        key={`${connection.from}:${connection.to}`}
                        x1={from.x}
                        y1={mapY(from)}
                        x2={to.x}
                        y2={mapY(to)}
                        className={connection.discovered ? styles.discoveredPath : styles.unknownPath}
                        vectorEffect="non-scaling-stroke"
                    />
                })}

                {data.locations.map(location => {
                    const y = mapY(location)
                    const active = activeLocation?.id === location.id
                    return <g
                        key={location.id}
                        className={`${styles.blip} ${location.visited ? styles.visited : styles.unknown} ${active ? styles.active : ''}`}
                        transform={`translate(${location.x} ${y})`}
                        tabIndex={0}
                        role="button"
                        aria-label={`${location.name}, ${location.zoneLabel}, 좌표 ${location.x}, ${location.y}, ${location.z}`}
                        onPointerEnter={() => setHoveredId(location.id)}
                        onPointerLeave={() => setHoveredId(null)}
                        onFocus={() => setHoveredId(location.id)}
                        onBlur={() => setHoveredId(null)}
                        onClick={event => {
                            event.stopPropagation()
                            setSelectedId(current => current === location.id ? null : location.id)
                        }}
                    >
                        {location.current && <circle r="17" className={styles.currentRing} filter={`url(#${glowId})`} />}
                        {location.mapIcon ? (
                            <>
                                <circle r="16" className={styles.iconBackdrop} />
                                <image
                                    href={`/icons/map/${location.mapIcon}.png`}
                                    x={-14}
                                    y={-14}
                                    width={28}
                                    height={28}
                                    className={styles.landmarkIcon}
                                />
                            </>
                        ) : <circle r={location.current ? 8 : 6} className={styles.nodeDot} vectorEffect="non-scaling-stroke" />}
                        {location.visited && <text y={location.mapIcon ? 28 : 22} className={styles.nodeLabel} textAnchor="middle">{location.name}</text>}
                    </g>
                })}
            </svg>

            {activeLocation && (
                <aside className={styles.infoCard} aria-live="polite">
                    <strong>{activeLocation.name}</strong>
                    <span>{activeLocation.zoneLabel} · {activeLocation.visited ? '방문 완료' : '미방문'}</span>
                    <span>좌표 {activeLocation.x}, {activeLocation.y}, {activeLocation.z}</span>
                </aside>
            )}
            {data.locations.length === 0 && <div className={styles.empty}>지도에 표시할 장소가 없습니다.</div>}
            <div className={styles.help}>드래그로 이동 · 휠 또는 두 손가락으로 확대/축소</div>
        </div>
    )
}
