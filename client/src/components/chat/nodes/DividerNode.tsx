import styles from './DividerNode.module.scss'

export default function DividerNode({ title }: { title?: string }) {
  return (
    <span className={styles.divider} role="separator" aria-label={title}>
      <span className={styles.line} />
      {title && <span className={styles.title}>{title}</span>}
      {title && <span className={styles.line} />}
    </span>
  )
}
