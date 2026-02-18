import { createContext } from 'react'
import type { ChatNode, ChatMessage as ChatMessageType } from '@shared/types'
import ColorNode from './nodes/ColorNode'
import BgNode from './nodes/BgNode'
import DecoNode from './nodes/DecoNode'
import SizeNode from './nodes/SizeNode'
import HideNode from './nodes/HideNode'
import IconNode from './nodes/IconNode'
import ButtonNode from './nodes/ButtonNode'
import styles from './ChatMessage.module.scss'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

export const ChatMessageContext = createContext<{ nickname: string; timestamp: number }>({
    nickname: '', timestamp: 0,
})

export function renderNode(node: ChatNode, key: number): React.ReactNode {
    switch (node.type) {
        case 'text':
            return <span key={key}>{node.text}</span>
        case 'color':
            return <ColorNode key={key} color={node.color} children={node.children} />
        case 'bg':
            return <BgNode key={key} color={node.color} children={node.children} />
        case 'deco':
            return <DecoNode key={key} decoration={node.decoration} children={node.children} />
        case 'size':
            return <SizeNode key={key} size={node.size} children={node.children} />
        case 'hide':
            return <HideNode key={key} title={node.title} children={node.children} />
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

function getProfileImageURL(profileImage: string) {
    if(/^https?:\/\/|^\//.test(profileImage)) {
        return `url("${profileImage}")`;
    }

    return `url("${SERVER_URL}/uploads/profiles/${profileImage}")`;
}

/** $prefix는 CSS 변수로 변환 (예: "$primary" → "var(--color-primary)") */
function resolveFlagColor(color: string): string {
    if (color.startsWith('$')) {
        return `var(--color-${color.slice(1)})`
    }
    return color
}

interface Props {
    message: ChatMessageType
    showHeader: boolean
}

export default function ChatMessage({ message, showHeader }: Props) {
    const nodes: ChatNode[] = typeof(message.content) === 'string' ?
        [{ type: 'text', text: message.content }] :
        message.content;

    return (
        <ChatMessageContext.Provider value={{ nickname: message.nickname, timestamp: message.timestamp }}>
            <div className={`${styles.message} ${showHeader ? styles.withHeader : styles.continued}`}>
                <div className={styles.avatarSlot}>
                    {showHeader && (
                        <div
                            className={styles.avatar}
                            style={message.profileImage ? {
                                backgroundImage: getProfileImageURL(message.profileImage)
                            } : undefined}
                        />
                    )}
                </div>
                <div className={styles.bodyWrap}>
                    {showHeader && (
                        <div className={styles.header}>
                            {message.flags?.map((flag, i) => (
                                <span key={i} className={styles.flag} style={{ backgroundColor: resolveFlagColor(flag.color) }}>
                                    {flag.text}
                                </span>
                            ))}
                            <span className={styles.nickname}>{message.nickname}</span>
                            <span className={styles.timestamp}>{formatTime(message.timestamp)}</span>
                        </div>
                    )}
                    <div className={styles.body}>
                        <div className={styles.content}>
                            {nodes.map((node, i) => renderNode(node, i))}
                        </div>
                        {message.private && (
                            <div className={styles.privateLabel}>나에게만 보이는 메시지입니다.</div>
                        )}
                    </div>
                </div>
            </div>
        </ChatMessageContext.Provider>
    )
}
