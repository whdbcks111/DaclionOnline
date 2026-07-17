import { useEffect, useState } from 'react'
import Dialog from './Dialog'
import styles from './Dialog.module.scss'

export interface FormDialogOption {
  value: string
  label: string
  description?: string
}

export interface FormDialogField {
  name: string
  label: string
  type?: 'text' | 'number' | 'select' | 'textarea' | 'checkbox'
  options?: readonly FormDialogOption[]
  defaultValue?: string | number | boolean
  placeholder?: string
  help?: string
  required?: boolean
  min?: number
  max?: number
  step?: number
}

export type FormDialogValues = Record<string, string | number | boolean>

interface FormDialogProps {
  open: boolean
  title: string
  description?: string
  fields?: readonly FormDialogField[]
  submitLabel?: string
  danger?: boolean
  onClose: () => void
  onSubmit: (values: FormDialogValues) => void | string | Promise<void | string>
}

function initialValues(fields: readonly FormDialogField[]): FormDialogValues {
  return Object.fromEntries(fields.map(field => [
    field.name,
    field.defaultValue
      ?? (field.type === 'checkbox'
        ? false
        : field.type === 'select' && field.required
          ? field.options?.[0]?.value ?? ''
          : ''),
  ]))
}

export default function FormDialog({ open, title, description, fields = [], submitLabel = '실행', danger, onClose, onSubmit }: FormDialogProps) {
  const [values, setValues] = useState<FormDialogValues>(() => initialValues(fields))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setValues(initialValues(fields))
    setError('')
    setSubmitting(false)
  }, [open, fields])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const result = await onSubmit(values)
      if (typeof result === 'string' && result) setError(result)
      else onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '처리 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      title={title}
      onClose={onClose}
      closeOnBackdrop={!submitting}
      footer={(
        <>
          <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={submitting}>취소</button>
          <button type="submit" form="common-form-dialog" className={danger ? styles.dangerButton : styles.primaryButton} disabled={submitting}>
            {submitting ? '처리 중…' : submitLabel}
          </button>
        </>
      )}
    >
      <form id="common-form-dialog" className={styles.form} onSubmit={submit}>
        {description && <p className={styles.description}>{description}</p>}
        {fields.map(field => (
          <label key={field.name} className={field.type === 'checkbox' ? styles.checkboxField : styles.field}>
            {field.type !== 'checkbox' && <span>{field.label}{field.required && <b aria-hidden="true"> *</b>}</span>}
            {field.type === 'select' ? (
              <select
                value={String(values[field.name] ?? '')}
                required={field.required}
                onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))}
              >
                {!field.required && <option value="">선택 안 함</option>}
                {field.options?.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            ) : field.type === 'textarea' ? (
              <textarea
                value={String(values[field.name] ?? '')}
                required={field.required}
                placeholder={field.placeholder}
                rows={5}
                onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))}
              />
            ) : field.type === 'checkbox' ? (
              <><input type="checkbox" checked={Boolean(values[field.name])} onChange={event => setValues(current => ({ ...current, [field.name]: event.target.checked }))} /><span>{field.label}</span></>
            ) : (
              <input
                type={field.type ?? 'text'}
                value={String(values[field.name] ?? '')}
                required={field.required}
                placeholder={field.placeholder}
                min={field.min}
                max={field.max}
                step={field.step}
                onChange={event => setValues(current => ({ ...current, [field.name]: field.type === 'number' ? event.target.valueAsNumber : event.target.value }))}
              />
            )}
            {field.help && <small>{field.help}</small>}
          </label>
        ))}
        {error && <div className={styles.error} role="alert">{error}</div>}
      </form>
    </Dialog>
  )
}
