import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react'
import styles from './ImageViewer.module.scss'

interface Point {
  x: number
  y: number
}

interface ViewState extends Point {
  scale: number
}

interface PinchGesture {
  distance: number
  midpoint: Point
  view: ViewState
}

interface Props {
  open: boolean
  src: string
  alt: string
  onClose: () => void
}

const MIN_SCALE = 1
const MAX_SCALE = 8
const ZOOM_STEP = 1.35
const DRAG_START_DISTANCE = 4
const INITIAL_VIEW: ViewState = { scale: MIN_SCALE, x: 0, y: 0 }

function distance(left: Point, right: Point): number {
  return Math.hypot(left.x - right.x, left.y - right.y)
}

function midpoint(left: Point, right: Point): Point {
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
  }
}

function clampScale(scale: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale))
}

function getLocalPoint(element: HTMLElement, clientPoint: Point): Point {
  const rect = element.getBoundingClientRect()
  return {
    x: (clientPoint.x - rect.left) * element.clientWidth / Math.max(1, rect.width),
    y: (clientPoint.y - rect.top) * element.clientHeight / Math.max(1, rect.height),
  }
}

export default function ImageViewer({ open, src, alt, onClose }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  const pointersRef = useRef(new Map<number, Point>())
  const pointerStartRef = useRef<Point | null>(null)
  const pinchRef = useRef<PinchGesture | null>(null)
  const draggedRef = useRef(false)
  const viewRef = useRef<ViewState>(INITIAL_VIEW)
  const [view, setViewState] = useState<ViewState>(INITIAL_VIEW)

  useLayoutEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const setView = useCallback((next: ViewState | ((current: ViewState) => ViewState)) => {
    setViewState(current => {
      const resolved = typeof next === 'function' ? next(current) : next
      viewRef.current = resolved
      return resolved
    })
  }, [])

  const clampOffset = useCallback((next: ViewState): ViewState => {
    const viewport = viewportRef.current
    const image = imageRef.current
    if (!viewport || !image) return next

    const maxX = Math.max(0, (image.offsetWidth * next.scale - viewport.clientWidth) / 2)
    const maxY = Math.max(0, (image.offsetHeight * next.scale - viewport.clientHeight) / 2)
    return {
      scale: next.scale,
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    }
  }, [])

  const resetView = useCallback(() => {
    setView(INITIAL_VIEW)
  }, [setView])

  const zoomAt = useCallback((nextScaleInput: number, focalPoint?: Point) => {
    const viewport = viewportRef.current
    if (!viewport) return
    const nextScale = clampScale(nextScaleInput)
    const focal = focalPoint ?? { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }
    const center = { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }

    setView(current => {
      if (nextScale === current.scale) return current
      const ratio = nextScale / current.scale
      return clampOffset({
        scale: nextScale,
        x: focal.x - center.x - (focal.x - center.x - current.x) * ratio,
        y: focal.y - center.y - (focal.y - center.y - current.y) * ratio,
      })
    })
  }, [clampOffset, setView])

  useLayoutEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    resetView()
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus())
    const previousOverflow = document.body.style.overflow
    const activePointers = pointersRef.current
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
      if (event.key === '+' || event.key === '=') zoomAt(viewRef.current.scale * ZOOM_STEP)
      if (event.key === '-') zoomAt(viewRef.current.scale / ZOOM_STEP)
      if (event.key === '0') resetView()
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      activePointers.clear()
      pinchRef.current = null
      previousFocusRef.current?.focus()
    }
  }, [open, resetView, src, zoomAt])

  useEffect(() => {
    if (!open) return
    const handleResize = () => setView(current => clampOffset(current))
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [clampOffset, open, setView])

  if (!open) return null

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    zoomAt(
      viewRef.current.scale * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP),
      getLocalPoint(event.currentTarget, { x: event.clientX, y: event.clientY }),
    )
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = getLocalPoint(event.currentTarget, { x: event.clientX, y: event.clientY })
    pointersRef.current.set(event.pointerId, point)

    if (pointersRef.current.size === 1) {
      pointerStartRef.current = point
      draggedRef.current = false
      pinchRef.current = null
      return
    }

    const pointers = [...pointersRef.current.values()]
    pinchRef.current = {
      distance: Math.max(1, distance(pointers[0], pointers[1])),
      midpoint: midpoint(pointers[0], pointers[1]),
      view: viewRef.current,
    }
    draggedRef.current = true
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const previous = pointersRef.current.get(event.pointerId)
    if (!previous) return
    event.preventDefault()
    const nextPoint = getLocalPoint(event.currentTarget, { x: event.clientX, y: event.clientY })
    pointersRef.current.set(event.pointerId, nextPoint)

    const pointers = [...pointersRef.current.values()]
    if (pointers.length >= 2 && pinchRef.current) {
      const gesture = pinchRef.current
      const currentMidpoint = midpoint(pointers[0], pointers[1])
      const nextScale = clampScale(
        gesture.view.scale * distance(pointers[0], pointers[1]) / gesture.distance,
      )
      const ratio = nextScale / gesture.view.scale
      const center = {
        x: event.currentTarget.clientWidth / 2,
        y: event.currentTarget.clientHeight / 2,
      }
      setView(clampOffset({
        scale: nextScale,
        x: currentMidpoint.x - center.x
          - (gesture.midpoint.x - center.x - gesture.view.x) * ratio,
        y: currentMidpoint.y - center.y
          - (gesture.midpoint.y - center.y - gesture.view.y) * ratio,
      }))
      return
    }

    const start = pointerStartRef.current
    if (!draggedRef.current && start && distance(start, nextPoint) >= DRAG_START_DISTANCE) {
      draggedRef.current = true
    }
    if (!draggedRef.current || viewRef.current.scale <= MIN_SCALE) return

    setView(current => clampOffset({
      ...current,
      x: current.x + nextPoint.x - previous.x,
      y: current.y + nextPoint.y - previous.y,
    }))
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const remaining = [...pointersRef.current.values()]
    if (remaining.length === 1) {
      pointerStartRef.current = remaining[0]
      pinchRef.current = null
    } else if (remaining.length === 0) {
      pointerStartRef.current = null
      pinchRef.current = null
    }
  }

  const handleBackdropClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const imageBounds = imageRef.current?.getBoundingClientRect()
    const clickedImage = imageBounds !== undefined
      && event.clientX >= imageBounds.left
      && event.clientX <= imageBounds.right
      && event.clientY >= imageBounds.top
      && event.clientY <= imageBounds.bottom
    if (!draggedRef.current && !clickedImage) onClose()
    draggedRef.current = false
  }

  return createPortal(
    <div
      className={styles.viewer}
      role="dialog"
      aria-modal="true"
      aria-label={alt || '이미지 전체 화면 보기'}
    >
      <div className={styles.toolbar}>
        <span className={styles.zoomValue}>{Math.round(view.scale * 100)}%</span>
        <button
          type="button"
          onClick={() => zoomAt(viewRef.current.scale / ZOOM_STEP)}
          disabled={view.scale <= MIN_SCALE}
          aria-label="이미지 축소"
        >−</button>
        <button type="button" onClick={resetView} disabled={view.scale === MIN_SCALE}>
          맞춤
        </button>
        <button
          type="button"
          onClick={() => zoomAt(viewRef.current.scale * ZOOM_STEP)}
          disabled={view.scale >= MAX_SCALE}
          aria-label="이미지 확대"
        >＋</button>
        <button
          ref={closeButtonRef}
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="이미지 뷰어 닫기"
        >×</button>
      </div>
      <div
        ref={viewportRef}
        className={`${styles.viewport} ${view.scale > MIN_SCALE ? styles.zoomed : ''}`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onClick={handleBackdropClick}
        onDoubleClick={resetView}
      >
        <img
          ref={imageRef}
          className={styles.image}
          src={src}
          alt={alt}
          draggable={false}
          onLoad={() => setView(current => clampOffset(current))}
          style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})` }}
        />
      </div>
      <div className={styles.hint}>휠 또는 두 손가락으로 확대 · 드래그로 이동 · 두 번 눌러 맞춤</div>
    </div>,
    document.body,
  )
}
