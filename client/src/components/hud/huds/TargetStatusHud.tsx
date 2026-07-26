import type { TargetHudData } from '@shared/types'
import { useHud } from '../../../context/HudContext'
import HealthBarNode from '../../chat/nodes/HealthBarNode'
import ProgressNode from '../../chat/nodes/ProgressNode'
import { StatusEffectList } from './PlayerStatusHud'
import styles from './TargetStatusHud.module.scss'

function ratio(value: number, max: number): number {
  return max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
}

function resourceValue(value: number, max: number): string {
  return `${Math.max(0, Math.ceil(value)).toLocaleString()}/${Math.max(0, Math.ceil(max)).toLocaleString()}`
}

export default function TargetStatusHud() {
  const { playerStats, editMode } = useHud()
  const target = playerStats?.target

  if (!target && !editMode) return null

  const preview: TargetHudData = target ?? {
    kind: 'monster',
    name: '타게팅 대상',
    level: 1,
    life: 100,
    maxLife: 100,
    shields: [],
    mentality: 100,
    maxMentality: 100,
    defeated: false,
    defeatLabel: '사망',
    statusEffects: [],
  }
  const analysis = preview.monsterAnalysis

  return (
    <section className={`${styles.hud} ${target ? '' : styles.preview}`} aria-label="타게팅 대상 상태">
      <div className={styles.identity}>
        {preview.icon && <img className={styles.targetIcon} src={`/icons/${preview.icon}.png`} alt="" />}
        <span className={styles.name}>{preview.name}</span>
        <span className={styles.level}>Lv.{preview.level}</span>
        {preview.userId !== undefined && <span className={styles.userId}>ID {preview.userId}</span>}
        {preview.defeated && <span className={styles.defeated}>({preview.defeatLabel})</span>}
      </div>
      <div className={styles.resources}>
        <div className={styles.resourceRow}>
          <span className={styles.label}>HP</span>
          <div className={styles.track}>
            <HealthBarNode
              life={preview.life}
              maxLife={preview.maxLife}
              shields={preview.shields}
              length="100%"
              color="$life"
              thickness={7}
              shape="rounded"
            />
          </div>
          <span className={styles.value}>{resourceValue(preview.life, preview.maxLife)}</span>
        </div>
        {preview.maxMentality > 0 && (
          <div className={styles.resourceRow}>
            <span className={styles.label}>MP</span>
            <div className={styles.track}>
              <ProgressNode
                value={ratio(preview.mentality, preview.maxMentality)}
                length="100%"
                color="$magic"
                thickness={6}
                shape="rounded"
              />
            </div>
            <span className={styles.value}>{resourceValue(preview.mentality, preview.maxMentality)}</span>
          </div>
        )}
      </div>

      <StatusEffectList effects={preview.statusEffects} label="대상의 상태이상" />

      {analysis && (
        <div className={styles.analysis}>
          {analysis.affinities.length > 0 && (
            <div className={styles.affinities} aria-label="대상 속성">
              {analysis.affinities.map(affinity => (
                <span key={affinity.label} className={styles.affinity}>
                  <img src={`/icons/${affinity.icon}.png`} alt="" />
                  {affinity.label}
                </span>
              ))}
            </div>
          )}
          {analysis.combatAttributes.length > 0 && (
            <div className={styles.attributeGrid} aria-label="대상 전투 능력치">
              {analysis.combatAttributes.map(attribute => (
                <span key={attribute.label} className={styles.attribute}>
                  <img src={`/icons/${attribute.icon}.png`} alt="" />
                  <span>{attribute.label}</span>
                  <strong>{attribute.value}</strong>
                </span>
              ))}
            </div>
          )}
          {analysis.attackSummary && (
            <div className={styles.summaryRow}>
              <span>기본 공격</span>
              <strong>{analysis.attackSummary}</strong>
            </div>
          )}
          {analysis.tier >= 3 && (
            <div className={styles.reward}>
              <div className={styles.summaryRow}>
                <span>보상</span>
                <strong>EXP {analysis.experienceReward} · {analysis.goldReward}G</strong>
              </div>
              {analysis.dropNames.length > 0 && <div>전리품 · {analysis.dropNames.join(', ')}</div>}
              {analysis.skillNames.length > 0 && <div>기술 · {analysis.skillNames.join(', ')}</div>}
            </div>
          )}
          {analysis.nextSensibility !== undefined && (
            <div className={styles.lockHint}>감각 {analysis.nextSensibility}에서 추가 분석 정보가 열립니다.</div>
          )}
        </div>
      )}
    </section>
  )
}
