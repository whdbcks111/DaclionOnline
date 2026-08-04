export const UI_SCALE_MIN = 0.6
export const UI_SCALE_MAX = 2
export const UI_SCALE_STEP = 0.05
export const UI_SCALE_DEFAULT = 1

const UI_SCALE_STORAGE_KEY = 'daclion-ui-scale'
export const UI_SCALE_CHANGE_EVENT = 'daclion-ui-scale-change'
export const UI_VIEWPORT_CHANGE_EVENT = 'daclion-ui-viewport-change'

let viewportSyncInitialized = false
let stablePhysicalViewport: { width: number; height: number } | null = null
let orientationFrame = 0
let orientationTrailingTimer = 0

export interface ViewportMeasurement {
  innerWidth: number
  innerHeight: number
  visualViewport?: {
    width: number
    height: number
    scale: number
  } | null
}

export function normalizeUiScale(value: number): number {
  if (!Number.isFinite(value)) return UI_SCALE_DEFAULT
  const clamped = Math.max(UI_SCALE_MIN, Math.min(UI_SCALE_MAX, value))
  return Math.round(clamped / UI_SCALE_STEP) * UI_SCALE_STEP
}

export function getUiScale(): number {
  const stored = Number(localStorage.getItem(UI_SCALE_STORAGE_KEY))
  return normalizeUiScale(stored || UI_SCALE_DEFAULT)
}

export function getUiViewportSize(scale = getUiScale()): { width: number; height: number } {
  const safeScale = normalizeUiScale(scale)
  const viewport = stablePhysicalViewport ?? readPhysicalViewport()
  return {
    width: viewport.width / safeScale,
    height: viewport.height / safeScale,
  }
}

function normalizeViewportDimension(value: number, fallback: number): number {
  const resolved = Number.isFinite(value) && value > 0 ? value : fallback
  return Math.max(1, Math.round(resolved))
}

/**
 * visualViewport의 CSS px 크기는 브라우저 page scale의 역수로 변한다.
 * scale을 다시 곱하면 회전 중 Safari가 직전 가로 layout viewport를 유지하거나
 * 페이지를 축소해도 실제 화면 기준 크기를 복원할 수 있다.
 */
export function resolvePhysicalViewportSize(measurement: ViewportMeasurement): { width: number; height: number } {
  const visual = measurement.visualViewport
  const hasValidVisualViewport = visual
    && Number.isFinite(visual.scale) && visual.scale > 0
    && Number.isFinite(visual.width) && visual.width > 0
    && Number.isFinite(visual.height) && visual.height > 0
  const visualWidth = hasValidVisualViewport
    ? visual.width * visual.scale
    : measurement.innerWidth
  const visualHeight = hasValidVisualViewport
    ? visual.height * visual.scale
    : measurement.innerHeight
  return {
    width: normalizeViewportDimension(visualWidth, measurement.innerWidth),
    height: normalizeViewportDimension(visualHeight, measurement.innerHeight),
  }
}

function readPhysicalViewport(): { width: number; height: number } {
  const visual = window.visualViewport
  return resolvePhysicalViewportSize({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    visualViewport: visual && {
      width: visual.width,
      height: visual.height,
      scale: visual.scale,
    },
  })
}

function hasFocusedEditable(): boolean {
  const active = document.activeElement
  return active instanceof HTMLInputElement
    || active instanceof HTMLTextAreaElement
    || (active instanceof HTMLElement && active.isContentEditable)
}

function isLandscape(viewport: { width: number; height: number }): boolean {
  return viewport.width >= viewport.height
}

function syncUiViewportVariables(scale = getUiScale(), notify = true): void {
  const viewport = getUiViewportSize(scale)
  document.documentElement.style.setProperty('--app-viewport-width', `${viewport.width}px`)
  document.documentElement.style.setProperty('--app-viewport-height', `${viewport.height}px`)
  document.documentElement.style.setProperty('--app-viewport-menu-height', `${viewport.height * 0.45}px`)
  if (notify) {
    window.dispatchEvent(new CustomEvent(UI_VIEWPORT_CHANGE_EVENT, { detail: viewport }))
  }
}

function acceptPhysicalViewport(force = false): void {
  const next = readPhysicalViewport()
  const previous = stablePhysicalViewport
  if (previous && !force) {
    const keyboardResize = isLandscape(previous) === isLandscape(next)
      && Math.abs(next.width - previous.width) < 48
      && next.height < previous.height - 120
      && hasFocusedEditable()
    if (keyboardResize) return
  }
  if (previous && previous.width === next.width && previous.height === next.height) return
  stablePhysicalViewport = next
  syncUiViewportVariables()
}

/** orientationchange가 보고하는 과도 좌표 대신 레이아웃이 안정된 다음 프레임과 trailing 시점을 채택한다. */
function scheduleOrientationViewportSync(): void {
  if (orientationFrame) cancelAnimationFrame(orientationFrame)
  if (orientationTrailingTimer) window.clearTimeout(orientationTrailingTimer)
  orientationFrame = requestAnimationFrame(() => {
    orientationFrame = requestAnimationFrame(() => {
      orientationFrame = 0
      acceptPhysicalViewport(true)
    })
  })
  orientationTrailingTimer = window.setTimeout(() => {
    orientationTrailingTimer = 0
    acceptPhysicalViewport(true)
  }, 400)
}

/** CSS zoom과 역보정 viewport를 함께 적용해 body portal까지 브라우저 배율과 유사하게 조절한다. */
export function setUiScale(value: number): number {
  const normalized = normalizeUiScale(value)
  document.documentElement.style.setProperty('--app-ui-scale', String(normalized))
  syncUiViewportVariables(normalized)
  localStorage.setItem(UI_SCALE_STORAGE_KEY, String(normalized))
  window.dispatchEvent(new CustomEvent(UI_SCALE_CHANGE_EVENT, { detail: normalized }))
  return normalized
}

export function initializeUiScale(): number {
  stablePhysicalViewport = readPhysicalViewport()
  const scale = setUiScale(getUiScale())
  if (!viewportSyncInitialized) {
    viewportSyncInitialized = true
    const onResize = () => {
      const next = readPhysicalViewport()
      if (stablePhysicalViewport && isLandscape(next) !== isLandscape(stablePhysicalViewport)) {
        scheduleOrientationViewportSync()
        return
      }
      acceptPhysicalViewport()
    }
    window.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', scheduleOrientationViewportSync)
    window.screen.orientation?.addEventListener('change', scheduleOrientationViewportSync)
  }
  return scale
}

export function formatUiScale(value: number): string {
  return `${Math.round(normalizeUiScale(value) * 100)}%`
}
