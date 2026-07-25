export const UI_SCALE_MIN = 0.6
export const UI_SCALE_MAX = 2
export const UI_SCALE_STEP = 0.05
export const UI_SCALE_DEFAULT = 1

const UI_SCALE_STORAGE_KEY = 'daclion-ui-scale'

export function normalizeUiScale(value: number): number {
  if (!Number.isFinite(value)) return UI_SCALE_DEFAULT
  const clamped = Math.max(UI_SCALE_MIN, Math.min(UI_SCALE_MAX, value))
  return Math.round(clamped / UI_SCALE_STEP) * UI_SCALE_STEP
}

export function getUiScale(): number {
  const stored = Number(localStorage.getItem(UI_SCALE_STORAGE_KEY))
  return normalizeUiScale(stored || UI_SCALE_DEFAULT)
}

/** CSS zoom을 한곳에서 적용해 body portal을 포함한 전체 게임 UI를 같은 비율로 조절한다. */
export function setUiScale(value: number): number {
  const normalized = normalizeUiScale(value)
  document.documentElement.style.setProperty('--app-ui-scale', String(normalized))
  localStorage.setItem(UI_SCALE_STORAGE_KEY, String(normalized))
  return normalized
}

export function initializeUiScale(): number {
  return setUiScale(getUiScale())
}

export function formatUiScale(value: number): string {
  return `${Math.round(normalizeUiScale(value) * 100)}%`
}
