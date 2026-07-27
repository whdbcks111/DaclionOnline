import { useState } from 'react'
import ImageViewer from './ImageViewer'
import styles from './ImageNode.module.scss'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

interface Props {
  src: string
  alt: string
  maxHeight: number | string
  width?: number
  height?: number
}

function resolveImageUrl(src: string): string {
  if (/^https?:\/\//i.test(src)) return src
  if (src.startsWith('/uploads/')) return `${SERVER_URL}${src}`
  return src
}

const VIEWPORT_HEIGHT_LIMIT = 34
const PIXEL_HEIGHT_LIMIT = 320

export default function ImageNode({ src, alt, maxHeight, width, height }: Props) {
  const [viewerOpen, setViewerOpen] = useState(false)
  const hasDimensions = width !== undefined && height !== undefined && width > 0 && height > 0
  const ratio = hasDimensions ? width / height : undefined
  const frameWidth = ratio === undefined
    ? undefined
    : `min(100%, ${width}px, ${VIEWPORT_HEIGHT_LIMIT * ratio}vh, ${PIXEL_HEIGHT_LIMIT * ratio}px)`
  const heightLimit = typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight
  const resolvedSrc = resolveImageUrl(src)

  return (
    <>
      <button
        type="button"
        className={styles.frame}
        style={{ width: frameWidth, maxHeight: `min(${heightLimit}, ${VIEWPORT_HEIGHT_LIMIT}vh, ${PIXEL_HEIGHT_LIMIT}px)` }}
        onClick={event => {
          event.stopPropagation()
          setViewerOpen(true)
        }}
        aria-label={`${alt || '이미지'} 전체 화면으로 보기`}
        title="전체 화면으로 보기"
      >
        <img
          className={styles.image}
          src={resolvedSrc}
          alt={alt}
          loading="lazy"
          width={width}
          height={height}
          draggable={false}
        />
      </button>
      <ImageViewer
        open={viewerOpen}
        src={resolvedSrc}
        alt={alt}
        onClose={() => setViewerOpen(false)}
      />
    </>
  )
}
