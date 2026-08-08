import type { FormDialogOption } from './FormDialog'
import SearchableSelect from './SearchableSelect'
import styles from './Dialog.module.scss'

interface RewardBundle {
  items: Array<{ itemDataId: string; count: number }>
  gold: number
  titleIds: string[]
  skills: Array<{ skillDataId: string; level: number }>
}

export interface RewardBundleOptions {
  items: readonly FormDialogOption[]
  titles: readonly FormDialogOption[]
  skills: readonly FormDialogOption[]
}

interface Props {
  value: string
  options: RewardBundleOptions
  onChange: (value: string) => void
}

const emptyBundle = (): RewardBundle => ({ items: [], gold: 0, titleIds: [], skills: [] })

function parseBundle(value: string): RewardBundle {
  try {
    const parsed = JSON.parse(value) as Partial<RewardBundle>
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      gold: typeof parsed.gold === 'number' ? parsed.gold : 0,
      titleIds: Array.isArray(parsed.titleIds) ? parsed.titleIds : [],
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
    }
  } catch {
    return emptyBundle()
  }
}

export default function RewardBundleEditor({ value, options, onChange }: Props) {
  const bundle = parseBundle(value)
  const update = (next: RewardBundle) => onChange(JSON.stringify(next))

  return (
    <div className={styles.rewardEditor}>
      <label className={styles.field}>
        <span>Gold</span>
        <input type="number" min={0} max={1_000_000_000} step={1} value={bundle.gold} onChange={event => update({ ...bundle, gold: event.target.valueAsNumber || 0 })} />
      </label>

      <section className={styles.rewardSection}>
        <header><b>아이템 목록</b><button type="button" onClick={() => update({ ...bundle, items: [...bundle.items, { itemDataId: options.items[0]?.value ?? '', count: 1 }] })} disabled={!options.items.length || bundle.items.length >= 20}>+ 아이템</button></header>
        {bundle.items.map((item, index) => <div className={styles.rewardRow} key={`item-${index}`}>
          <SearchableSelect value={item.itemDataId} options={options.items} placeholder="아이템 검색" onChange={itemDataId => update({ ...bundle, items: bundle.items.map((current, currentIndex) => currentIndex === index ? { ...current, itemDataId } : current) })} />
          <input aria-label="아이템 수량" type="number" min={1} step={1} value={item.count} onChange={event => update({ ...bundle, items: bundle.items.map((current, currentIndex) => currentIndex === index ? { ...current, count: event.target.valueAsNumber || 1 } : current) })} />
          <button type="button" className={styles.removeReward} onClick={() => update({ ...bundle, items: bundle.items.filter((_, currentIndex) => currentIndex !== index) })}>삭제</button>
        </div>)}
      </section>

      <section className={styles.rewardSection}>
        <header><b>칭호 목록</b><button type="button" onClick={() => update({ ...bundle, titleIds: [...bundle.titleIds, options.titles.find(option => !bundle.titleIds.includes(option.value))?.value ?? ''] })} disabled={!options.titles.some(option => !bundle.titleIds.includes(option.value)) || bundle.titleIds.length >= 20}>+ 칭호</button></header>
        {bundle.titleIds.map((titleId, index) => <div className={styles.rewardRow} key={`title-${index}`}>
          <SearchableSelect value={titleId} options={options.titles.filter(option => option.value === titleId || !bundle.titleIds.includes(option.value))} placeholder="칭호 검색" onChange={nextId => update({ ...bundle, titleIds: bundle.titleIds.map((current, currentIndex) => currentIndex === index ? nextId : current) })} />
          <button type="button" className={styles.removeReward} onClick={() => update({ ...bundle, titleIds: bundle.titleIds.filter((_, currentIndex) => currentIndex !== index) })}>삭제</button>
        </div>)}
      </section>

      <section className={styles.rewardSection}>
        <header><b>스킬 목록</b><button type="button" onClick={() => update({ ...bundle, skills: [...bundle.skills, { skillDataId: options.skills.find(option => !bundle.skills.some(skill => skill.skillDataId === option.value))?.value ?? '', level: 1 }] })} disabled={!options.skills.some(option => !bundle.skills.some(skill => skill.skillDataId === option.value)) || bundle.skills.length >= 20}>+ 스킬</button></header>
        {bundle.skills.map((skill, index) => <div className={styles.rewardRow} key={`skill-${index}`}>
          <SearchableSelect value={skill.skillDataId} options={options.skills.filter(option => option.value === skill.skillDataId || !bundle.skills.some(current => current.skillDataId === option.value))} placeholder="스킬 검색" onChange={skillDataId => update({ ...bundle, skills: bundle.skills.map((current, currentIndex) => currentIndex === index ? { ...current, skillDataId } : current) })} />
          <input aria-label="스킬 레벨" type="number" min={1} step={1} value={skill.level} onChange={event => update({ ...bundle, skills: bundle.skills.map((current, currentIndex) => currentIndex === index ? { ...current, level: event.target.valueAsNumber || 1 } : current) })} />
          <button type="button" className={styles.removeReward} onClick={() => update({ ...bundle, skills: bundle.skills.filter((_, currentIndex) => currentIndex !== index) })}>삭제</button>
        </div>)}
      </section>
    </div>
  )
}
