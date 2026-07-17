export interface SkillHudConfig {
  skillId: string
  visible: boolean
  /** viewport 기준 중심 좌표(%) */
  x: number
  y: number
}

export const BASIC_ATTACK_HUD_ID = 'system:basic_attack'

export function createDefaultSkillHudConfig(skillId: string, index = 0): SkillHudConfig {
  const viewportWidth = typeof window === 'undefined' ? 1024 : window.innerWidth
  const columns = viewportWidth <= 600 ? 4 : 8
  const column = Math.max(0, index) % columns
  const row = Math.floor(Math.max(0, index) / columns)
  return {
    skillId,
    visible: false,
    x: (column + 1) * 100 / (columns + 1),
    y: Math.max(12, 78 - row * 12),
  }
}
