import { useCallback, useEffect, useState } from 'react'
import { useHud } from '../../../context/HudContext'
import { createDefaultSkillHudConfig } from '../../../context/skillHudConfig'
import { useSocket } from '../../../context/SocketContext'
import type { SkillHudData } from '@shared/types'
import styles from './SkillQuickHud.module.scss'

const EMPTY_SKILLS: SkillHudData[] = []

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
  } = useHud()
  const { socket } = useSocket()
  const [now, setNow] = useState(0)
  const skills = playerStats?.skills ?? EMPTY_SKILLS

  useEffect(() => {
    let timer: number | undefined
    const tick = () => {
      const current = Date.now()
      setNow(current)
      if (skills.some(skill => skill.remainingCooldown * 1000 > current - playerStatsReceivedAt)) {
        timer = window.setTimeout(tick, 100)
      }
    }
    if (skills.some(skill => skill.remainingCooldown > 0)) timer = window.setTimeout(tick, 100)
    return () => { if (timer !== undefined) window.clearTimeout(timer) }
  }, [playerStatsReceivedAt, skills])

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

  const activate = useCallback((skill: SkillHudData) => {
    if (editMode) {
      return
    }
    socket?.emit('chatButtonClick', { action: `/스킬 ${skill.name}` })
  }, [editMode, socket])

  return (
    <>
      {skills.map((skill, index) => {
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
              transform: `translate(-50%, -50%) scale(${scale})`,
            }}
            onPointerDown={event => startDrag(skill.id, event)}
          >
            <button
              type="button"
              className={`${styles.skillButton} ${skill.isActive ? styles.active : ''}`}
              title={`${skill.name} Lv.${skill.level}${coolingDown ? ` · 재사용 대기 ${cooldown.remaining.toFixed(1)}초` : ''}`}
              aria-label={`${skill.name} 스킬 사용`}
              aria-disabled={coolingDown}
              onClick={() => activate(skill)}
            >
              <span className={styles.fallbackIcon}>{skill.name.slice(0, 1)}</span>
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
