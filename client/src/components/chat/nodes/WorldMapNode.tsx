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
const BIOME_CANVAS_SCALE = 0.3
const BIOME_SATURATION = 0.62
const BIOME_BRIGHTNESS = 0.76
const BASE_LABEL_SIZE = 12
const MIN_LABEL_ZOOM = 0.75
const MAX_LABEL_ZOOM = 2.5
const LABEL_ZOOM_STEP = 0.25

interface BiomeSeed {
    colorKey: string
    color: readonly [number, number, number]
    point: Point
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

function parseHexColor(color: string): readonly [number, number, number] {
    const [red, green, blue] = [
        Number.parseInt(color.slice(1, 3), 16),
        Number.parseInt(color.slice(3, 5), 16),
        Number.parseInt(color.slice(5, 7), 16),
    ]
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
    const neutralize = (channel: number) => Math.round(
        (luminance + (channel - luminance) * BIOME_SATURATION) * BIOME_BRIGHTNESS,
    )
    return [neutralize(red), neutralize(green), neutralize(blue)]
}

function createBiomeSeeds(data: WorldMapData): BiomeSeed[] {
    return data.locations.flatMap(location => {
        if (!location.visited || !location.mapColor) return []
        const colorKey = location.mapColor.toLowerCase()
        return [{
            colorKey,
            color: parseHexColor(colorKey),
            point: { x: location.x, y: mapY(location) },
        }]
    })
}

function getBiomeSofteningDistance(seeds: readonly BiomeSeed[]): number {
    const nearestOtherBiomeDistances: number[] = []
    for (let seedIndex = 0; seedIndex < seeds.length; seedIndex += 1) {
        let nearestDistanceSquared = Number.POSITIVE_INFINITY
        for (let otherIndex = 0; otherIndex < seeds.length; otherIndex += 1) {
            if (otherIndex === seedIndex || seeds[otherIndex].colorKey === seeds[seedIndex].colorKey) continue
            const dx = seeds[seedIndex].point.x - seeds[otherIndex].point.x
            const dy = seeds[seedIndex].point.y - seeds[otherIndex].point.y
            nearestDistanceSquared = Math.min(nearestDistanceSquared, dx * dx + dy * dy)
        }
        if (Number.isFinite(nearestDistanceSquared)) nearestOtherBiomeDistances.push(Math.sqrt(nearestDistanceSquared))
    }
    if (nearestOtherBiomeDistances.length === 0) return 12
    nearestOtherBiomeDistances.sort((left, right) => left - right)
    const median = nearestOtherBiomeDistances[Math.floor(nearestOtherBiomeDistances.length / 2)]
    return Math.max(8, Math.min(48, median * 0.2))
}

function paintBiomeGradient(
    canvas: HTMLCanvasElement,
    seeds: readonly BiomeSeed[],
    softeningDistance: number,
    view: ViewBox,
    cssWidth: number,
    cssHeight: number,
): void {
    const context = canvas.getContext('2d')
    if (!context || cssWidth <= 0 || cssHeight <= 0) return
    const width = Math.max(1, Math.round(cssWidth * BIOME_CANVAS_SCALE))
    const height = Math.max(1, Math.round(cssHeight * BIOME_CANVAS_SCALE))
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    context.clearRect(0, 0, width, height)
    if (seeds.length === 0) return

    const softeningDistanceSquared = softeningDistance * softeningDistance
    const image = context.createImageData(width, height)
    const pixels = image.data
    const worldXs = new Float64Array(width)
    const worldYs = new Float64Array(height)
    for (let pixelX = 0; pixelX < width; pixelX += 1) {
        worldXs[pixelX] = view.x + (pixelX + 0.5) / width * view.width
    }
    for (let pixelY = 0; pixelY < height; pixelY += 1) {
        worldYs[pixelY] = view.y + (pixelY + 0.5) / height * view.height
    }

    for (let pixelY = 0; pixelY < height; pixelY += 1) {
        const worldY = worldYs[pixelY]
        for (let pixelX = 0; pixelX < width; pixelX += 1) {
            const worldX = worldXs[pixelX]
            let totalWeight = 0
            let red = 0
            let green = 0
            let blue = 0

            for (let seedIndex = 0; seedIndex < seeds.length; seedIndex += 1) {
                const dx = worldX - seeds[seedIndex].point.x
                const dy = worldY - seeds[seedIndex].point.y
                const distanceSquared = dx * dx + dy * dy
                const weight = 1 / (distanceSquared + softeningDistanceSquared)
                const color = seeds[seedIndex].color
                totalWeight += weight
                red += color[0] * weight
                green += color[1] * weight
                blue += color[2] * weight
            }

            const offset = (pixelY * width + pixelX) * 4
            pixels[offset] = Math.round(red / totalWeight)
            pixels[offset + 1] = Math.round(green / totalWeight)
            pixels[offset + 2] = Math.round(blue / totalWeight)
            pixels[offset + 3] = 255
        }
    }
    context.putImageData(image, 0, 0)
}

function getLocalPoint(svg: SVGSVGElement, point: Point): Point {
    const rect = svg.getBoundingClientRect()
    return { x: point.x - rect.left, y: point.y - rect.top }
}

export default function WorldMapNode({ data }: Props) {
    const svgId = useId().replaceAll(':', '')
    const gridId = `world-map-grid-${svgId}`
    const glowId = `world-map-current-glow-${svgId}`
    const containerRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const svgRef = useRef<SVGSVGElement>(null)
    const pointers = useRef(new Map<number, Point>())
    const fitViewRef = useRef(createFitView(data))
    const hasInteracted = useRef(false)
    const [view, setView] = useState(() => createFitView(data))
    const [hoveredId, setHoveredId] = useState<string | null>(null)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [labelZoom, setLabelZoom] = useState(1)
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })

    const locationsById = useMemo(
        () => new Map(data.locations.map(location => [location.id, location])),
        [data.locations],
    )
    const activeLocation = locationsById.get(hoveredId ?? selectedId ?? '')
    const biomeSeeds = useMemo(() => createBiomeSeeds(data), [data])
    const biomeSofteningDistance = useMemo(() => getBiomeSofteningDistance(biomeSeeds), [biomeSeeds])
    const labelFontSize = viewportSize.width > 0
        ? BASE_LABEL_SIZE * view.width / viewportSize.width * labelZoom
        : BASE_LABEL_SIZE * labelZoom

    useEffect(() => {
        const container = containerRef.current
        if (!container) return
        const resize = () => {
            const rect = container.getBoundingClientRect()
            if (rect.width <= 0 || rect.height <= 0) return
            const nextFit = createFitView(data, rect.width / rect.height)
            const svgRect = svgRef.current?.getBoundingClientRect()
            if (svgRect && svgRect.width > 0 && svgRect.height > 0) {
                setViewportSize(current => current.width === svgRect.width && current.height === svgRect.height
                    ? current
                    : { width: svgRect.width, height: svgRect.height })
            }
            fitViewRef.current = nextFit
            if (!hasInteracted.current) setView(nextFit)
        }
        resize()
        const observer = new ResizeObserver(resize)
        observer.observe(container)
        return () => observer.disconnect()
    }, [data])

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas || viewportSize.width <= 0 || viewportSize.height <= 0) return
        const frame = requestAnimationFrame(() => paintBiomeGradient(
            canvas,
            biomeSeeds,
            biomeSofteningDistance,
            view,
            viewportSize.width,
            viewportSize.height,
        ))
        return () => cancelAnimationFrame(frame)
    }, [biomeSeeds, biomeSofteningDistance, view, viewportSize])

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

    const adjustLabelZoom = (delta: number) => {
        setLabelZoom(current => Math.max(
            MIN_LABEL_ZOOM,
            Math.min(MAX_LABEL_ZOOM, Math.round((current + delta) * 100) / 100),
        ))
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
                <span className={styles.labelControls} aria-label="지도 글자 크기">
                    <button
                        type="button"
                        onClick={() => adjustLabelZoom(-LABEL_ZOOM_STEP)}
                        disabled={labelZoom <= MIN_LABEL_ZOOM}
                        aria-label="지도 글자 축소"
                        title="지도 글자 축소"
                    >A−</button>
                    <button
                        type="button"
                        onClick={() => adjustLabelZoom(LABEL_ZOOM_STEP)}
                        disabled={labelZoom >= MAX_LABEL_ZOOM}
                        aria-label="지도 글자 확대"
                        title="지도 글자 확대"
                    >A＋</button>
                </span>
            </div>
            <div className={styles.mapViewport}>
                <canvas ref={canvasRef} className={styles.biomeCanvas} aria-hidden="true" />
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
                </defs>
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
                        {location.visited && <text
                            y={location.mapIcon ? 28 : 22}
                            className={styles.nodeLabel}
                            textAnchor="middle"
                            fontSize={labelFontSize}
                            vectorEffect="non-scaling-stroke"
                        >{location.name}</text>}
                    </g>
                })}
                </svg>
            </div>

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
