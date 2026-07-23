import type { ChatMessage, ChatNode } from './types.js'

export const MAX_CHAT_REPLY_PREVIEW_LENGTH = 120

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
