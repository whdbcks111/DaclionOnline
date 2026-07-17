import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import styles from './Dialog.module.scss'

interface DialogProps {
  open: boolean
  title: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  closeOnBackdrop?: boolean
  className?: string
}

export default function Dialog({ open, title, children, footer, onClose, closeOnBackdrop = true, className = '' }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>('input, select, textarea, button:not([disabled])')?.focus()
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocus.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className={styles.backdrop} onMouseDown={event => {
      if (closeOnBackdrop && event.target === event.currentTarget) onClose()
    }}>
      <div ref={panelRef} className={`${styles.dialog} ${className}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <header className={styles.header}>
          <h2 id="dialog-title">{title}</h2>
          <button type="button" className={styles.close} aria-label="닫기" onClick={onClose}>×</button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
