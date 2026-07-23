import type { ChatMessage, ChatNode, ChatTypeKey } from './types.js'

export const MAX_CHAT_REPLY_PREVIEW_LENGTH = 120
export const CHAT_ADVERTISEMENT_COOLDOWN_MS = 30_000
export const CHAT_WHISPER_DISPLAY = Object.freeze({
    label: '귓속말',
    color: '#8b949e',
})

/** 전송 범위와 표시 메타데이터를 함께 소유하는 공유 클래스형 enum. */
export class ChatType {
    private static readonly entries: ChatType[] = []
    readonly key: ChatTypeKey
    readonly label: string
    readonly color: string | null
    readonly requiredPermission: number

    static readonly CHANNEL = new ChatType('channel', '채널', null, 0)
    static readonly NEARBY = new ChatType('nearby', '근처', '#8b5cf6', 0)
    static readonly PARTY = new ChatType('party', '파티', '#f59e0b', 0)
    static readonly ADVERTISEMENT = new ChatType('advertisement', '광고', '#2a9d8f', 0)
    static readonly NOTICE = new ChatType('notice', '공지', '#08c26e', 10)

    private constructor(
        key: ChatTypeKey,
        label: string,
        color: string | null,
        requiredPermission: number,
    ) {
        this.key = key
        this.label = label
        this.color = color
        this.requiredPermission = requiredPermission
        ChatType.entries.push(this)
    }

    static values(): readonly ChatType[] {
        return [...ChatType.entries]
    }

    static fromKey(key: unknown): ChatType | undefined {
        return typeof key === 'string'
            ? ChatType.entries.find(entry => entry.key === key)
            : undefined
    }

    static fromInput(input: string): ChatType | undefined {
        const normalized = input.trim().toLocaleLowerCase('ko-KR')
        return ChatType.entries.find(entry =>
            entry.key === normalized || entry.label.toLocaleLowerCase('ko-KR') === normalized)
    }
}

function nodeText(node: ChatNode): string {
    switch (node.type) {
        case 'text':
            return node.text
        case 'image':
            return '사진'
        case 'worldMap':
            return '지도'
        case 'icon':
            return ''
        case 'progress':
        case 'health':
            return '진행 정보'
        case 'divider':
            return node.title ?? ''
        case 'color':
        case 'bg':
        case 'deco':
        case 'weight':
        case 'size':
        case 'button':
        case 'tab':
        case 'tooltip':
            return node.children.map(nodeText).join('')
        case 'hide':
            return node.children.length > 0
                ? node.children.map(nodeText).join('')
                : node.title
    }
}

/** 구조화 채팅을 답장 카드에 노출 가능한 한 줄 요약으로 변환한다. */
export function summarizeChatContent(
    content: ChatMessage['content'],
    maxLength = MAX_CHAT_REPLY_PREVIEW_LENGTH,
): string {
    const raw = typeof content === 'string'
        ? content
        : content.map(nodeText).join(' ')
    const normalized = raw.replace(/\s+/g, ' ').trim() || '메시지'
    if (normalized.length <= maxLength) return normalized
    return `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`
}

/** 서버가 발급한 메시지 ID만 답장 payload에서 허용한다. */
export function isChatMessageId(value: unknown): value is string {
    return typeof value === 'string'
        && value.length >= 3
        && value.length <= 80
        && /^m[a-z0-9]+_[a-z0-9]+$/i.test(value)
}
