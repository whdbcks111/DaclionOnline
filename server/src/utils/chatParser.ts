import type { ChatNode } from "../../../shared/types.js"

// ── 태그 레지스트리 ──

interface TagDefinition {
    /** selfclose: [tag=value], wrap: [tag=value]...[/tag] */
    kind: 'selfclose' | 'wrap'
    /** value 검증 (실패 시 일반 텍스트 처리) */
    validate?: (value: string) => boolean
    /** 파싱된 데이터로 ChatNode 생성 */
    createNode: (value: string, children?: ChatNode[]) => ChatNode
}

const tagRegistry = new Map<string, TagDefinition>()
let cachedRegex: RegExp | null = null

export function registerChatTag(name: string, def: TagDefinition): void {
    tagRegistry.set(name, def)
    cachedRegex = null // 레지스트리 변경 시 regex 재생성
}

function getTagRegex(): RegExp {
    if (cachedRegex) return cachedRegex

    const allNames = Array.from(tagRegistry.keys()).join('|')
    const wrapNames = Array.from(tagRegistry.entries())
        .filter(([, d]) => d.kind === 'wrap')
        .map(([n]) => n)
        .join('|')

    cachedRegex = new RegExp(
        `\\[(${allNames})=([^\\]]*)\\]` +
        (wrapNames ? `|\\[\\/(${wrapNames})\\]` : ''),
        'g'
    )
    return cachedRegex
}

// ── 토크나이저 ──

interface Token {
    type: 'text' | 'open' | 'close' | 'selfclose'
    tag?: string
    value?: string
    text?: string
}

function tokenize(input: string): Token[] {
    const tokens: Token[] = []
    const regex = getTagRegex()
    regex.lastIndex = 0
    let lastIndex = 0

    for (const match of input.matchAll(regex)) {
        if (match.index > lastIndex) {
            tokens.push({ type: 'text', text: input.slice(lastIndex, match.index) })
        }

        if (match[3]) {
            // 닫는 태그: [/tag]
            tokens.push({ type: 'close', tag: match[3] })
        } else {
            const tag = match[1]
            const def = tagRegistry.get(tag)
            if (def?.kind === 'selfclose') {
                tokens.push({ type: 'selfclose', tag, value: match[2] })
            } else {
                tokens.push({ type: 'open', tag, value: match[2] })
            }
        }

        lastIndex = match.index + match[0].length
    }

    if (lastIndex < input.length) {
        tokens.push({ type: 'text', text: input.slice(lastIndex) })
    }

    return tokens
}

// ── 노드 빌더 ──

function buildNodes(tokens: Token[], index: number, stopTag?: string): { nodes: ChatNode[], nextIndex: number } {
    const nodes: ChatNode[] = []

    while (index < tokens.length) {
        const token = tokens[index]

        if (token.type === 'text') {
            nodes.push({ type: 'text', text: token.text! })
            index++
        } else if (token.type === 'selfclose') {
            const def = tagRegistry.get(token.tag!)
            if (def && (!def.validate || def.validate(token.value!))) {
                nodes.push(def.createNode(token.value!))
            } else {
                nodes.push({ type: 'text', text: `[${token.tag}=${token.value}]` })
            }
            index++
        } else if (token.type === 'close') {
            if (token.tag === stopTag) {
                return { nodes, nextIndex: index + 1 }
            }
            nodes.push({ type: 'text', text: `[/${token.tag}]` })
            index++
        } else if (token.type === 'open') {
            const def = tagRegistry.get(token.tag!)
            if (def && (!def.validate || def.validate(token.value!))) {
                const result = buildNodes(tokens, index + 1, token.tag!)
                nodes.push(def.createNode(token.value!, result.nodes))
                index = result.nextIndex
            } else {
                nodes.push({ type: 'text', text: `[${token.tag}=${token.value}]` })
                index++
            }
        } else {
            index++
        }
    }

    return { nodes, nextIndex: index }
}

// ── 텍스트 노드 병합 ──

export function mergeTextNodes(nodes: ChatNode[]): ChatNode[] {
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

// ── 파싱 ──

export function parseChatMessage(input: string): ChatNode[] {
    const tokens = tokenize(input)
    const { nodes } = buildNodes(tokens, 0)
    return mergeTextNodes(nodes)
}

// ── 기본 태그 등록 ──

const NAMED_COLORS = new Set([
    'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink',
    'cyan', 'white', 'black', 'gray', 'gold', 'silver', 'lime',
])

function isValidColor(value: string): boolean {
    if (NAMED_COLORS.has(value)) return true
    return /^#[0-9a-fA-F]{3,6}$/.test(value)
}

const ICON_NAMES = new Set([
    'sword', 'shield', 'heart', 'star', 'crown', 'coin',
    'potion', 'scroll', 'gem', 'fire', 'ice', 'lightning',
    'arrow', 'skull', 'check', 'cross', 'info', 'warning',
])

registerChatTag('color', {
    kind: 'wrap',
    validate: isValidColor,
    createNode: (color, children) => ({ type: 'color', color, children: children! }),
})

registerChatTag('icon', {
    kind: 'selfclose',
    validate: (v) => ICON_NAMES.has(v),
    createNode: (name) => ({ type: 'icon', name }),
})

registerChatTag('button', {
    kind: 'wrap',
    createNode: (action, children) => ({ type: 'button', action, children: children! }),
})

registerChatTag('bg', {
    kind: 'wrap',
    validate: isValidColor,
    createNode: (color, children) => ({ type: 'bg', color, children: children! }),
})

const DECORATIONS = new Set(['underline', 'line-through', 'overline'])

registerChatTag('deco', {
    kind: 'wrap',
    validate: (v) => DECORATIONS.has(v),
    createNode: (decoration, children) => ({ type: 'deco', decoration, children: children! }),
})

const SIZES = new Set(['xs', 'sm', 'md', 'lg', 'xl'])

registerChatTag('size', {
    kind: 'wrap',
    validate: (v) => SIZES.has(v),
    createNode: (size, children) => ({ type: 'size', size, children: children! }),
})

registerChatTag('hide', {
    kind: 'wrap',
    createNode: (title, children) => ({ type: 'hide', title, children: children! }),
})

// [tab=width]...[/tab]  — 고정 너비 인라인 블록
registerChatTag('tab', {
    kind: 'wrap',
    validate: (v) => !isNaN(parseInt(v)) && parseInt(v) > 0,
    createNode: (v, children) => ({ type: 'tab', width: parseInt(v), children: children! }),
})

// [progress=value,length,color,thickness,shape]
// 예) [progress=0.75,120,red,10,rounded]
registerChatTag('progress', {
    kind: 'selfclose',
    validate: (v) => {
        const parts = v.split(',')
        const val = parseFloat(parts[0])
        return !isNaN(val) && val >= 0 && val <= 1
    },
    createNode: (v) => {
        const parts = v.split(',')
        const value = Math.max(0, Math.min(1, parseFloat(parts[0])))
        const length = parts[1] ? parseInt(parts[1]) : 100
        const color = parts[2]?.trim() || 'green'
        const thickness = parts[3] ? parseInt(parts[3]) : 8
        const shape = parts[4]?.trim() === 'square' ? 'square' : 'rounded'
        return { type: 'progress', value, length, color, thickness, shape }
    },
})
