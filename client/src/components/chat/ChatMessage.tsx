import type { ChatNode, ChatMessage as ChatMessageType } from '@shared/types'
import { parseChatMessage } from '@shared/chatParser'
import ColorNode from './nodes/ColorNode'
import IconNode from './nodes/IconNode'
import ButtonNode from './nodes/ButtonNode'
import styles from './ChatMessage.module.scss'

export function renderNode(node: ChatNode, key: number): React.ReactNode {
    switch (node.type) {
        case 'text':
            return <span key={key}>{node.text}</span>
        case 'color':
            return <ColorNode key={key} color={node.color} children={node.children} />
        case 'icon':
            return <IconNode key={key} name={node.name} />
        case 'button':
            return <ButtonNode key={key} action={node.action} children={node.children} />
    }
}

function formatTime(timestamp: number): string {
    const date = new Date(timestamp)
    const h = date.getHours().toString().padStart(2, '0')
    const m = date.getMinutes().toString().padStart(2, '0')
    return `${h}:${m}`
}

interface Props {
    message: ChatMessageType
    showHeader: boolean
}

export default function ChatMessage({ message, showHeader }: Props) {
    const nodes = parseChatMessage(message.content)

    return (
        <div className={`${styles.message} ${showHeader ? styles.withHeader : styles.continued}`}>
            <div className={styles.avatarSlot}>
                {showHeader && <div className={styles.avatar} />}
            </div>
            <div className={styles.body}>
                {showHeader && (
                    <div className={styles.header}>
                        <span className={styles.nickname}>{message.nickname}</span>
                        <span className={styles.timestamp}>{formatTime(message.timestamp)}</span>
                    </div>
                )}
                <div className={styles.content}>
                    {nodes.map((node, i) => renderNode(node, i))}
                </div>
            </div>
        </div>
    )
}
