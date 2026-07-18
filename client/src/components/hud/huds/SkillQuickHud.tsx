import { useCallback, useEffect, useMemo, useState } from 'react'
import { useHud } from '../../../context/HudContext'
import { BASIC_ATTACK_HUD_ID, createDefaultSkillHudConfig } from '../../../context/skillHudConfig'
import { useSocket } from '../../../context/SocketContext'
import type { SkillHudData } from '@shared/types'
import styles from './SkillQuickHud.module.scss'

const EMPTY_SKILLS: SkillHudData[] = []

interface QuickButtonData extends SkillHudData {
  command: string
  showLevel: boolean
}

function cooldownState(skill: SkillHudData, now: number, receivedAt: number) {
  const elapsed = Math.max(0, now - receivedAt) / 1000
  const remaining = Math.max(0, skill.remainingCooldown - elapsed)
  const ratio = skill.maxCooldown > 0 ? Math.min(1, remaining / skill.maxCooldown) : 0
  return { remaining, progressDegrees: (1 - ratio) * 360 }
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
      if (quickButtons.some(button => button.remainingCooldown * 1000 > current - playerStatsReceivedAt)) {
        timer = window.setTimeout(tick, 100)
      }
    }
    if (quickButtons.some(button => button.remainingCooldown > 0)) timer = window.setTimeout(tick, 100)
    return () => { if (timer !== undefined) window.clearTimeout(timer) }
  }, [playerStatsReceivedAt, quickButtons])

  const startDrag = useCallback((skillId: string, event: React.PointerEvent<HTMLDivElement>) => {
    if (!editMode) return
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startY = event.clientY
    const onMove = (moveEvent: PointerEvent) => {
      if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) <= 3) return
      setSkillHudPosition(
        skillId,
        moveEvent.clientX / window.innerWidth * 100,
        moveEvent.clientY / window.innerHeight * 100,
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
  }, [editMode, setSkillHudPosition])

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
        return (
          <div
            key={skill.id}
            className={`${styles.skillHud} ${editMode ? styles.editMode : ''}`}
            style={{
              left: `${config.x}%`,
              top: `${config.y}%`,
              opacity,
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
              title={`${skill.name}${skill.showLevel ? ` Lv.${skill.level}` : ''}${coolingDown ? ` · 재사용 대기 ${cooldown.remaining.toFixed(1)}초` : ''}`}
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
