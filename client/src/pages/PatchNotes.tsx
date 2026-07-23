import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatPatchNoteDate, getPatchNotes } from '@shared/patchNotes'
import styles from './PatchNotes.module.scss'

export default function PatchNotes() {
  const navigate = useNavigate()
  const notes = useMemo(() => getPatchNotes(), [])
  const [selectedDate, setSelectedDate] = useState(notes[0]?.date ?? '')
  const selected = notes.find(note => note.date === selectedDate) ?? notes[0]

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div>
          <p>DaclionOnline</p>
          <h1>패치노트</h1>
        </div>
        <button type="button" onClick={() => navigate('/home')}>게임으로 돌아가기</button>
      </header>

      <div className={styles.layout}>
        <nav className={styles.dateNav} aria-label="패치노트 날짜">
          <h2>업데이트 기록</h2>
          {notes.map(note => (
            <button
              type="button"
              key={note.date}
              className={note.date === selected?.date ? styles.activeDate : ''}
              onClick={() => setSelectedDate(note.date)}
            >
              <time dateTime={note.date}>{formatPatchNoteDate(note.date)}</time>
              <span>{note.title}</span>
            </button>
          ))}
        </nav>

        {selected ? (
          <article className={styles.content}>
            <div className={styles.date}>{formatPatchNoteDate(selected.date)}</div>
            <h2>{selected.title}</h2>
            <p className={styles.lead}>{selected.summary}</p>
            {selected.sections.map(section => (
              <section className={styles.section} key={section.categoryKey}>
                <h3>{section.categoryLabel}</h3>
                <ul>
                  {section.items.map(item => <li key={item}>{item}</li>)}
                </ul>
              </section>
            ))}
          </article>
        ) : (
          <article className={styles.content}>
            <h2>아직 등록된 패치노트가 없습니다.</h2>
          </article>
        )}
      </div>
    </main>
  )
}
