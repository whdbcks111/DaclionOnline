import styles from './ImageNode.module.scss'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

interface Props {
  src: string
  alt: string
  maxHeight: number | string
}

function resolveImageUrl(src: string): string {
  if (/^https?:\/\//i.test(src)) return src
  if (src.startsWith('/uploads/')) return `${SERVER_URL}${src}`
  return src
}

export default function ImageNode({ src, alt, maxHeight }: Props) {
  return (
    <span className={styles.frame} style={{ maxHeight }}>
      <img className={styles.image} src={resolveImageUrl(src)} alt={alt} loading="lazy" />
    </span>
  )
}
