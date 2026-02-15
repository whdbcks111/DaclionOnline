import type { ChatNode } from './types.js'

// 허용된 색상 이름
const NAMED_COLORS = new Set([
    'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink',
    'cyan', 'white', 'black', 'gray', 'gold', 'silver', 'lime',
])

// 허용된 아이콘 이름
const ICON_NAMES = new Set([
    'sword', 'shield', 'heart', 'star', 'crown', 'coin',
    'potion', 'scroll', 'gem', 'fire', 'ice', 'lightning',
    'arrow', 'skull', 'check', 'cross', 'info', 'warning',
])

function isValidColor(value: string): boolean {
    if (NAMED_COLORS.has(value)) return true
    return /^#[0-9a-fA-F]{3,6}$/.test(value)
}

// 태그 정규식: [tag=value] 또는 [/tag]
const TAG_REGEX = /\[(color|icon|button)=([^\]]*)\]|\[\/(color|button)\]/g

interface Token {
    type: 'text' | 'open' | 'close' | 'selfclose'
    tag?: string
    value?: string
    text?: string
}

function tokenize(input: string): Token[] {
    const tokens: Token[] = []
    let lastIndex = 0

    for (const match of input.matchAll(TAG_REGEX)) {
        // 태그 앞의 텍스트
        if (match.index > lastIndex) {
            tokens.push({ type: 'text', text: input.slice(lastIndex, match.index) })
        }

        if (match[3]) {
            // 닫는 태그: [/color] 또는 [/button]
            tokens.push({ type: 'close', tag: match[3] })
        } else if (match[1] === 'icon') {
            // 셀프클로징: [icon=name]
            tokens.push({ type: 'selfclose', tag: 'icon', value: match[2] })
        } else {
            // 여는 태그: [color=red] 또는 [button=action:trade]
            tokens.push({ type: 'open', tag: match[1], value: match[2] })
        }

        lastIndex = match.index + match[0].length
    }

    // 남은 텍스트
    if (lastIndex < input.length) {
        tokens.push({ type: 'text', text: input.slice(lastIndex) })
    }

    return tokens
}

function buildNodes(tokens: Token[], index: number, stopTag?: string): { nodes: ChatNode[], nextIndex: number } {
    const nodes: ChatNode[] = []

    while (index < tokens.length) {
        const token = tokens[index]

        if (token.type === 'text') {
            nodes.push({ type: 'text', text: token.text! })
            index++
        } else if (token.type === 'selfclose') {
            if (token.tag === 'icon' && ICON_NAMES.has(token.value!)) {
                nodes.push({ type: 'icon', name: token.value! })
            } else {
                // 허용되지 않은 아이콘은 텍스트로
                nodes.push({ type: 'text', text: `[icon=${token.value}]` })
            }
            index++
        } else if (token.type === 'close') {
            if (token.tag === stopTag) {
                // 매칭되는 닫는 태그
                return { nodes, nextIndex: index + 1 }
            }
            // 매칭 안 되는 닫는 태그는 텍스트로
            nodes.push({ type: 'text', text: `[/${token.tag}]` })
            index++
        } else if (token.type === 'open') {
            if (token.tag === 'color' && isValidColor(token.value!)) {
                const result = buildNodes(tokens, index + 1, 'color')
                nodes.push({ type: 'color', color: token.value!, children: result.nodes })
                index = result.nextIndex
            } else if (token.tag === 'button' && token.value!) {
                const result = buildNodes(tokens, index + 1, 'button')
                nodes.push({ type: 'button', action: token.value!, children: result.nodes })
                index = result.nextIndex
            } else {
                // 허용되지 않은 태그는 텍스트로
                nodes.push({ type: 'text', text: `[${token.tag}=${token.value}]` })
                index++
            }
        } else {
            index++
        }
    }

    return { nodes, nextIndex: index }
}

// 인접 텍스트 노드 병합
function mergeTextNodes(nodes: ChatNode[]): ChatNode[] {
    const result: ChatNode[] = []

    for (const node of nodes) {
        if (node.type === 'text' && result.length > 0 && result[result.length - 1].type === 'text') {
            (result[result.length - 1] as { type: 'text'; text: string }).text += node.text
        } else if ('children' in node && node.children) {
            result.push({ ...node, children: mergeTextNodes(node.children) } as ChatNode)
        } else {
            result.push(node)
        }
    }

    return result
}

export function parseChatMessage(input: string): ChatNode[] {
    const tokens = tokenize(input)
    const { nodes } = buildNodes(tokens, 0)
    return mergeTextNodes(nodes)
}
