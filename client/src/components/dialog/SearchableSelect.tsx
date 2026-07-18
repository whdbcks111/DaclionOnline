import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormDialogOption } from './FormDialog'
import styles from './SearchableSelect.module.scss'

interface SearchableSelectProps {
  value: string
  options: readonly FormDialogOption[]
  placeholder?: string
  allowEmpty?: boolean
  onChange: (value: string) => void
}

export default function SearchableSelect({ value, options, placeholder = '검색하거나 선택하세요', allowEmpty, onChange }: SearchableSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = options.find(option => option.value === value)
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase()
    if (!keyword) return options
    return options.filter(option => `${option.label} ${option.value} ${option.description ?? ''}`.toLocaleLowerCase().includes(keyword))
  }, [options, query])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const choose = (next: string) => {
    onChange(next)
    setQuery('')
    setOpen(false)
  }

  return <div ref={rootRef} className={styles.root}>
    <button
      type="button"
      className={styles.trigger}
      role="combobox"
      aria-expanded={open}
      aria-haspopup="listbox"
      onClick={() => setOpen(current => !current)}
    >
      <span className={selected ? '' : styles.placeholder}>{selected?.label ?? placeholder}</span>
      <i aria-hidden="true">⌄</i>
    </button>
    {open && <div className={styles.popover}>
      <input
        ref={inputRef}
        type="search"
        value={query}
        placeholder="이름 또는 코드 검색"
        onChange={event => setQuery(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && filtered[0]) {
            event.preventDefault()
            choose(filtered[0].value)
          }
        }}
      />
      <div className={styles.options} role="listbox">
        {allowEmpty && <button type="button" role="option" aria-selected={!value} onClick={() => choose('')}>
          <span>선택 안 함</span>
        </button>}
        {filtered.map(option => <button
          key={option.value}
          type="button"
          role="option"
          aria-selected={option.value === value}
          className={option.value === value ? styles.selected : ''}
          onClick={() => choose(option.value)}
        >
          <span>{option.label}</span>
          {option.description && <small>{option.description}</small>}
        </button>)}
        {!filtered.length && <p>검색 결과가 없습니다.</p>}
      </div>
    </div>}
  </div>
}
