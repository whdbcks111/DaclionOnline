export const UI_SCALE_MIN = 0.6
export const UI_SCALE_MAX = 2
export const UI_SCALE_STEP = 0.05
export const UI_SCALE_DEFAULT = 1

const UI_SCALE_STORAGE_KEY = 'daclion-ui-scale'
export const UI_SCALE_CHANGE_EVENT = 'daclion-ui-scale-change'

let viewportSyncInitialized = false

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
  return {
    width: window.innerWidth / safeScale,
    height: window.innerHeight / safeScale,
  }
}

function syncUiViewportVariables(scale = getUiScale()): void {
  const viewport = getUiViewportSize(scale)
  document.documentElement.style.setProperty('--app-viewport-width', `${viewport.width}px`)
  document.documentElement.style.setProperty('--app-viewport-height', `${viewport.height}px`)
  document.documentElement.style.setProperty('--app-viewport-menu-height', `${viewport.height * 0.45}px`)
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
  const scale = setUiScale(getUiScale())
  if (!viewportSyncInitialized) {
    viewportSyncInitialized = true
    window.addEventListener('resize', () => syncUiViewportVariables())
  }
  return scale
}

export function formatUiScale(value: number): string {
  return `${Math.round(normalizeUiScale(value) * 100)}%`
}
