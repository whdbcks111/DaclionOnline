import { useState, useContext, createContext } from 'react'
import type { ChatNode } from '@shared/types'
import { renderNode, ChatMessageContext } from '../ChatMessage'
import styles from './HideNode.module.scss'

export const HideCloseContext = createContext<(() => void) | null>(null)

interface Props {
    title: string
    children: ChatNode[]
}

function formatDateTime(timestamp: number): string {
    const date = new Date(timestamp)
    const y = date.getFullYear()
    const mo = (date.getMonth() + 1).toString().padStart(2, '0')
    const d = date.getDate().toString().padStart(2, '0')
    const h = date.getHours().toString().padStart(2, '0')
    const m = date.getMinutes().toString().padStart(2, '0')
    return `${y}.${mo}.${d} ${h}:${m}`
}

export default function HideNode({ title, children }: Props) {
    const [open, setOpen] = useState(false)
    const msgCtx = useContext(ChatMessageContext)
    const close = () => setOpen(false)

    return (
        <>
            <button className={styles.button} onClick={() => setOpen(true)}>
                {title}
            </button>
            {open && (
                <div className={styles.overlay}>
                    <div className={styles.overlayHeader}>
                        <button className={styles.backButton} onClick={close}>
                            ←
                        </button>
                        <span className={styles.senderName}>{msgCtx.nickname}</span>
                        <span className={styles.date}>{formatDateTime(msgCtx.timestamp)}</span>
                    </div>
                    <div className={styles.overlayBody}>
                        <HideCloseContext.Provider value={close}>
                            {children.map((node, i) => renderNode(node, i))}
                        </HideCloseContext.Provider>
                    </div>
                </div>
            )}
        </>
    )
}
