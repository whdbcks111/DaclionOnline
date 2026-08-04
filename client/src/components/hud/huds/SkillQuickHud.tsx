import { useCallback, useEffect, useMemo, useState } from 'react'
import { useHud } from '../../../context/HudContext'
import {
  AUTO_ATTACK_HUD_ID,
  BASIC_ATTACK_HUD_ID,
  createDefaultSkillHudConfig,
} from '../../../context/skillHudConfig'
import { useSocket } from '../../../context/SocketContext'
import type { SkillHudData } from '@shared/types'
import { getUiScale } from '../../../utils/displayPreferences'
import styles from './SkillQuickHud.module.scss'

const EMPTY_SKILLS: SkillHudData[] = []

interface QuickButtonData extends SkillHudData {
  command: string
  showLevel: boolean
}

function cooldownState(skill: SkillHudData, now: number, receivedAt: number) {
  const elapsed = Math.max(0, now - receivedAt) / 1000
  const personalRemaining = Math.max(0, skill.remainingCooldown - elapsed)
  const cadenceRemaining = Math.max(0, (skill.cadenceRemaining ?? 0) - elapsed)
  const cadenceWins = cadenceRemaining > personalRemaining
  const remaining = cadenceWins ? cadenceRemaining : personalRemaining
  const duration = cadenceWins ? (skill.cadenceDuration ?? 0) : skill.maxCooldown
  const ratio = duration > 0 ? Math.min(1, remaining / duration) : 0
  return {
    remaining,
    progressDegrees: (1 - ratio) * 360,
    waitLabel: cadenceWins ? '전투 기술 연계 대기' : '재사용 대기',
  }
}

function hasPendingWait(skill: SkillHudData, elapsedSeconds = 0) {
  return Math.max(skill.remainingCooldown, skill.cadenceRemaining ?? 0) > elapsedSeconds
}

export default function SkillQuickHud() {
  const {
    playerStats,
    playerStatsReceivedAt,
    skillHudConfigs,
    setSkillHudPosition,
    editMode,
    opacity,
    scale,
    quickButtonScale,
    skillQuickButtonOpacity,
    quickButtonPosAnchor,
    quickButtonPosUnitX,
    quickButtonPosUnitY,
    hudViewportWidth,
    hudViewportHeight,
  } = useHud()
  const { socket } = useSocket()
  const [now, setNow] = useState(0)
  const skills = playerStats?.skills ?? EMPTY_SKILLS
  const quickButtons = useMemo<QuickButtonData[]>(() => {
    if (!playerStats) return []
    return [
      {
        id: BASIC_ATTACK_HUD_ID,
        name: '공격',
        icon: 'attributes/atk',
        level: 0,
        isActive: false,
        remainingCooldown: playerStats.attackCooldown,
        maxCooldown: playerStats.maxAttackCooldown,
        command: '/공격',
        showLevel: false,
      },
      {
        id: AUTO_ATTACK_HUD_ID,
        name: '자동공격',
        icon: 'attributes/attackSpeed',
        level: 0,
        isActive: playerStats.autoAttackEnabled,
        remainingCooldown: 0,
        maxCooldown: 0,
        command: '/자동공격',
        showLevel: false,
      },
      ...skills.map(skill => ({
        ...skill,
        command: `/스킬 ${skill.id}`,
        showLevel: true,
      })),
    ]
  }, [playerStats, skills])

  useEffect(() => {
    let timer: number | undefined
    const tick = () => {
      const current = Date.now()
      setNow(current)
      if (quickButtons.some(button => hasPendingWait(button, (current - playerStatsReceivedAt) / 1000))) {
        timer = window.setTimeout(tick, 100)
      }
    }
    if (quickButtons.some(button => hasPendingWait(button))) timer = window.setTimeout(tick, 100)
    return () => { if (timer !== undefined) window.clearTimeout(timer) }
  }, [playerStatsReceivedAt, quickButtons])

  const startDrag = useCallback((skillId: string, event: React.PointerEvent<HTMLDivElement>) => {
    if (!editMode) return
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startY = event.clientY
    const isRight = quickButtonPosAnchor === 'topRight' || quickButtonPosAnchor === 'bottomRight'
    const isBottom = quickButtonPosAnchor === 'bottomLeft' || quickButtonPosAnchor === 'bottomRight'
    const uiScale = getUiScale()
    const onMove = (moveEvent: PointerEvent) => {
      if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) <= 3) return
      const clientX = moveEvent.clientX / uiScale
      const clientY = moveEvent.clientY / uiScale
      setSkillHudPosition(
        skillId,
        quickButtonPosUnitX === '%'
          ? (isRight ? hudViewportWidth - clientX : clientX) / hudViewportWidth * 100
          : (isRight ? hudViewportWidth - clientX : clientX),
        quickButtonPosUnitY === '%'
          ? (isBottom ? hudViewportHeight - clientY : clientY) / hudViewportHeight * 100
          : (isBottom ? hudViewportHeight - clientY : clientY),
      )
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', cleanup)
      window.removeEventListener('pointercancel', cleanup)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', cleanup)
    window.addEventListener('pointercancel', cleanup)
  }, [
    editMode,
    hudViewportHeight,
    hudViewportWidth,
    quickButtonPosAnchor,
    quickButtonPosUnitX,
    quickButtonPosUnitY,
    setSkillHudPosition,
  ])

  const activate = useCallback((button: QuickButtonData) => {
    if (editMode) {
      return
    }
    socket?.emit('chatButtonClick', { action: button.command })
  }, [editMode, socket])

  return (
    <>
      {quickButtons.map((skill, index) => {
        const config = skillHudConfigs[skill.id] ?? createDefaultSkillHudConfig(skill.id, index)
        if (!config.visible) return null
        const cooldown = cooldownState(skill, now, playerStatsReceivedAt)
        const coolingDown = cooldown.remaining > 0
        const isRight = quickButtonPosAnchor === 'topRight' || quickButtonPosAnchor === 'bottomRight'
        const isBottom = quickButtonPosAnchor === 'bottomLeft' || quickButtonPosAnchor === 'bottomRight'
        const x = Math.max(0, Math.min(
          hudViewportWidth,
          quickButtonPosUnitX === '%' ? config.x / 100 * hudViewportWidth : config.x,
        ))
        const y = Math.max(0, Math.min(
          hudViewportHeight,
          quickButtonPosUnitY === '%' ? config.y / 100 * hudViewportHeight : config.y,
        ))
        return (
          <div
            key={skill.id}
            className={`${styles.skillHud} ${editMode ? styles.editMode : ''}`}
            style={{
              left: `${isRight ? hudViewportWidth - x : x}px`,
              top: `${isBottom ? hudViewportHeight - y : y}px`,
              opacity: opacity * skillQuickButtonOpacity,
              transform: `translate(-50%, -50%) scale(${scale * quickButtonScale})`,
            }}
            onPointerDown={event => {
              if (editMode) startDrag(skill.id, event)
              else event.preventDefault()
            }}
          >
            <button
              type="button"
              className={`${styles.skillButton} ${skill.isActive ? styles.active : ''}`}
              title={`${skill.name}${skill.showLevel ? ` Lv.${skill.level}` : ''}${coolingDown ? ` · ${cooldown.waitLabel} ${cooldown.remaining.toFixed(1)}초` : ''}`}
              aria-label={`${skill.name} 퀵 버튼 사용`}
              aria-disabled={coolingDown}
              onClick={() => activate(skill)}
            >
              <img src={`/icons/${skill.icon}.png`} alt="" draggable={false} />
              {coolingDown && (
                <span
                  className={styles.cooldownMask}
                  style={{ '--cooldown-progress': `${cooldown.progressDegrees}deg` } as React.CSSProperties}
                >
                  <span className={styles.cooldownText}>
                    {cooldown.remaining >= 10 ? Math.ceil(cooldown.remaining) : cooldown.remaining.toFixed(1)}
                  </span>
                </span>
              )}
              {editMode && <span className={styles.dragHandle}>⠿</span>}
            </button>
            <span className={styles.skillName}>{skill.name}</span>
          </div>
        )
      })}
    </>
  )
}
