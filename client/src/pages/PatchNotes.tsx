import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatPatchNoteDate, formatPatchNoteVersion, getPatchNotes } from '@shared/patchNotes'
import styles from './PatchNotes.module.scss'

export default function PatchNotes() {
  const navigate = useNavigate()
  const notes = useMemo(() => getPatchNotes(), [])
  const [selectedVersion, setSelectedVersion] = useState(notes[0]?.version ?? '')
  const selected = notes.find(note => note.version === selectedVersion) ?? notes[0]

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
        <nav className={styles.versionNav} aria-label="패치노트 버전">
          <h2>업데이트 기록</h2>
          {notes.map(note => (
            <button
              type="button"
              key={note.version}
              className={note.version === selected?.version ? styles.activeVersion : ''}
              onClick={() => setSelectedVersion(note.version)}
            >
              <strong>{formatPatchNoteVersion(note.version)}</strong>
              <time dateTime={note.releasedAt}>{formatPatchNoteDate(note.releasedAt)}</time>
            </button>
          ))}
        </nav>

        {selected ? (
          <article className={styles.content}>
            <div className={styles.releaseMeta}>
              <strong>{formatPatchNoteVersion(selected.version)}</strong>
              <time dateTime={selected.releasedAt}>{formatPatchNoteDate(selected.releasedAt)}</time>
            </div>
            {selected.sections.map(section => (
              <section className={styles.section} key={section.categoryKey}>
                <h3>[{section.categoryMarker}] {section.categoryLabel}</h3>
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
