import { getUiViewportSize } from '../utils/displayPreferences'

export interface ItemHudConfig {
  itemDataId: string
  name: string
  icon: string
  visible: boolean
  /** HudContext가 소유한 퀵 버튼 좌표 단위와 기준점에서의 중심 거리. */
  x: number
  y: number
}

export function createDefaultItemHudConfig(
  item: Pick<ItemHudConfig, 'itemDataId' | 'name' | 'icon'>,
  index = 0,
): ItemHudConfig {
  const viewportWidth = typeof window === 'undefined' ? 1024 : getUiViewportSize().width
  const columns = viewportWidth <= 600 ? 4 : 8
  const column = Math.max(0, index) % columns
  const row = Math.floor(Math.max(0, index) / columns)
  return {
    ...item,
    visible: false,
    x: (column + 1) * 100 / (columns + 1),
    y: Math.max(12, 64 - row * 12),
  }
}
