import { createContext } from 'react'
import type { ChatNode, ChatMessage as ChatMessageType } from '@shared/types'
import ColorNode from './nodes/ColorNode'
import BgNode from './nodes/BgNode'
import DecoNode from './nodes/DecoNode'
import SizeNode from './nodes/SizeNode'
import HideNode from './nodes/HideNode'
import IconNode from './nodes/IconNode'
import ButtonNode from './nodes/ButtonNode'
import ProgressNode from './nodes/ProgressNode'
import HealthBarNode from './nodes/HealthBarNode'
import ImageNode from './nodes/ImageNode'
import DividerNode from './nodes/DividerNode'
import TabNode from './nodes/TabNode'
import WeightNode from './nodes/WeightNode'
import TooltipNode from './nodes/TooltipNode'
import WorldMapNode from './nodes/WorldMapNode'
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
            return <ButtonNode key={key} action={node.action} closeOnClick={node.closeOnClick} showCommand={node.showCommand} children={node.children} />
        case 'progress':
            return <ProgressNode key={key} value={node.value} length={node.length} color={node.color} thickness={node.thickness} shape={node.shape} />
        case 'health':
            return <HealthBarNode key={key} life={node.life} maxLife={node.maxLife} shields={node.shields} length={node.length} color={node.color} thickness={node.thickness} shape={node.shape} />
        case 'image':
            return <ImageNode key={key} src={node.src} alt={node.alt} maxHeight={node.maxHeight} width={node.width} height={node.height} />
        case 'divider':
            return <DividerNode key={key} title={node.title} />
        case 'tab':
            return <TabNode key={key} width={node.width} children={node.children} />
        case 'weight':
            return <WeightNode key={key} weight={node.weight} children={node.children} />
        case 'tooltip':
            return <TooltipNode key={key} description={node.description} children={node.children} />
        case 'worldMap':
            return <WorldMapNode key={key} data={node.data} />
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
export function resolveColor(color: string): string {
    if (color.startsWith('$')) {
        return `var(--color-${color.slice(1)})`
    }
    return color
}

function preserveActiveComposerFocus(event: React.PointerEvent<HTMLDivElement>): void {
    const target = event.target
    if (!(target instanceof Element) || !target.closest('button')) return
    const activeElement = document.activeElement
    if (activeElement instanceof HTMLElement && activeElement.isContentEditable) {
        event.preventDefault()
    }
}

interface Props {
    message: ChatMessageType
    showHeader: boolean
    highlighted?: boolean
    onReply?: (message: ChatMessageType) => void
    onJumpToMessage?: (messageId: string) => void
}

export default function ChatMessage({
    message,
    showHeader,
    highlighted = false,
    onReply,
    onJumpToMessage,
}: Props) {
    const nodes: ChatNode[] = typeof(message.content) === 'string' ?
        [{ type: 'text', text: message.content }] :
        message.content;
    const hasTopLevelImage = nodes.some(node => node.type === 'image')

    return (
        <ChatMessageContext.Provider value={{ nickname: message.nickname, timestamp: message.timestamp }}>
            <div
                id={message.id ? `chat-message-${message.id}` : undefined}
                data-message-id={message.id}
                className={`${styles.message} ${showHeader ? styles.withHeader : styles.continued} ${highlighted ? styles.highlighted : ''}`}
            >
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
                <div className={`${styles.bodyWrap} ${hasTopLevelImage ? styles.mediaBodyWrap : ''}`}>
                    {showHeader && (
                        <div className={styles.header}>
                            {message.flags?.map((flag, i) => (
                                <span key={i} className={styles.flag} style={{ backgroundColor: resolveColor(flag.color) }}>
                                    {flag.text}
                                </span>
                            ))}
                            {message.newcomer && (
                                <span className={styles.newcomer} title="누적 플레이 24시간 미만" aria-label="새싹 모험가">
                                    🌱
                                </span>
                            )}
                            <span className={styles.nickname}>{message.nickname}</span>
                            {message.karmaMarked && (
                                <span className={styles.karmaMarked} title="카르마가 높은 현상 대상" aria-label="악명 높은 모험가">
                                    🥀
                                </span>
                            )}
                            <span className={styles.timestamp}>{formatTime(message.timestamp)}</span>
                        </div>
                    )}
                    {message.replyTo && (
                        <button
                            type="button"
                            className={styles.replyReference}
                            aria-label={`${message.replyTo.nickname}님의 원본 메시지로 이동`}
                            title="원본 메시지로 이동"
                            onPointerDown={event => event.preventDefault()}
                            onClick={() => onJumpToMessage?.(message.replyTo!.messageId)}
                        >
                            <span className={styles.replyMark} aria-hidden="true">↳</span>
                            <span className={styles.replyAuthor}>{message.replyTo.nickname}</span>
                            <span className={styles.replyExcerpt}>{message.replyTo.preview}</span>
                        </button>
                    )}
                    <div className={`${styles.body} ${hasTopLevelImage ? styles.mediaBody : ''}`}>
                        <div className={styles.content} onPointerDownCapture={preserveActiveComposerFocus}>
                            {nodes.map((node, i) => renderNode(node, i))}
                        </div>
                    </div>
                    {message.private && (
                        <div className={styles.privateLabel}>나에게만 보이는 메시지입니다.</div>
                    )}
                </div>
                {message.id && message.replyable !== false && onReply && (
                    <div className={styles.messageActions}>
                        <button
                            type="button"
                            className={styles.replyAction}
                            aria-label={`${message.nickname}님의 메시지에 답장`}
                            title="답장"
                            onPointerDown={event => event.preventDefault()}
                            onClick={() => onReply(message)}
                        >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M9.5 7 4.5 12l5 5M5 12h8.2c3.8 0 6.3 2.1 6.3 5.5V19" />
                            </svg>
                        </button>
                    </div>
                )}
            </div>
        </ChatMessageContext.Provider>
    )
}
