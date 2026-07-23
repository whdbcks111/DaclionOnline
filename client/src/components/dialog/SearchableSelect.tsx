import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import type { FormDialogOption } from './FormDialog'
import styles from './SearchableSelect.module.scss'

interface SearchableSelectProps {
  value: string
  options: readonly FormDialogOption[]
  placeholder?: string
  allowEmpty?: boolean
  onChange: (value: string) => void
}

const VIEWPORT_EDGE = 12
const POPOVER_GAP = 4
const MOBILE_BREAKPOINT = 480
const IDEAL_POPOVER_HEIGHT = 512
const MIN_DESKTOP_POPOVER_HEIGHT = 224

export default function SearchableSelect({ value, options, placeholder = '검색하거나 선택하세요', allowEmpty, onChange }: SearchableSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>()
  const selected = options.find(option => option.value === value)
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase()
    if (!keyword) return options
    return options.filter(option => `${option.label} ${option.value} ${option.description ?? ''}`.toLocaleLowerCase().includes(keyword))
  }, [options, query])

  const updatePopoverPosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const maxViewportHeight = Math.max(0, viewportHeight - VIEWPORT_EDGE * 2)

    if (viewportWidth <= MOBILE_BREAKPOINT) {
      setPopoverStyle({
        right: VIEWPORT_EDGE,
        bottom: VIEWPORT_EDGE,
        left: VIEWPORT_EDGE,
        width: 'auto',
        height: Math.min(IDEAL_POPOVER_HEIGHT, maxViewportHeight),
      })
      return
    }

    const availableBelow = viewportHeight - rect.bottom - VIEWPORT_EDGE - POPOVER_GAP
    const availableAbove = rect.top - VIEWPORT_EDGE - POPOVER_GAP
    const openAbove = availableBelow < MIN_DESKTOP_POPOVER_HEIGHT && availableAbove > availableBelow
    const availableHeight = Math.max(0, openAbove ? availableAbove : availableBelow)
    const width = Math.min(Math.max(rect.width, 416), viewportWidth - VIEWPORT_EDGE * 2)
    const left = Math.min(
      Math.max(VIEWPORT_EDGE, rect.left),
      Math.max(VIEWPORT_EDGE, viewportWidth - width - VIEWPORT_EDGE),
    )
    const anchoredPosition = openAbove
      ? { bottom: viewportHeight - rect.top + POPOVER_GAP }
      : { top: rect.bottom + POPOVER_GAP }

    setPopoverStyle({
      ...anchoredPosition,
      left,
      width,
      height: Math.min(IDEAL_POPOVER_HEIGHT, availableHeight),
    })
  }, [])

  useEffect(() => {
    if (!open) return
    const initialFrame = requestAnimationFrame(updatePopoverPosition)
    const close = (event: PointerEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const reposition = () => updatePopoverPosition()
    const observer = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(reposition)
    if (rootRef.current) observer?.observe(rootRef.current)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      cancelAnimationFrame(initialFrame)
      observer?.disconnect()
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, updatePopoverPosition])

  const choose = (next: string) => {
    onChange(next)
    setQuery('')
    setOpen(false)
  }

  const popover = open && popoverStyle
    ? createPortal(
      <div ref={popoverRef} className={styles.popover} style={popoverStyle}>
        <input
          autoFocus
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
      </div>,
      document.body,
    )
    : null

  return <>
    <div ref={rootRef} className={styles.root}>
      <button
        ref={triggerRef}
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
    </div>
    {popover}
  </>
}
