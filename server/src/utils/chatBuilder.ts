import type { ChatNode } from "../../../shared/types.js"
import { mergeTextNodes } from "./chatParser.js"

class ChatBuilder {
    private nodes: ChatNode[] = []

    text(t: string): this {
        this.nodes.push({ type: 'text', text: t })
        return this
    }

    color(color: string, build: (b: ChatBuilder) => ChatBuilder): this {
        const inner = new ChatBuilder()
        build(inner)
        this.nodes.push({ type: 'color', color, children: inner.nodes })
        return this
    }

    icon(name: string): this {
        this.nodes.push({ type: 'icon', name })
        return this
    }

    bg(color: string, build: (b: ChatBuilder) => ChatBuilder): this {
        const inner = new ChatBuilder()
        build(inner)
        this.nodes.push({ type: 'bg', color, children: inner.nodes })
        return this
    }

    deco(decoration: string, build: (b: ChatBuilder) => ChatBuilder): this {
        const inner = new ChatBuilder()
        build(inner)
        this.nodes.push({ type: 'deco', decoration, children: inner.nodes })
        return this
    }

    size(size: string, build: (b: ChatBuilder) => ChatBuilder): this {
        const inner = new ChatBuilder()
        build(inner)
        this.nodes.push({ type: 'size', size, children: inner.nodes })
        return this
    }

    hide(title: string, build: (b: ChatBuilder) => ChatBuilder): this {
        const inner = new ChatBuilder()
        build(inner)
        this.nodes.push({ type: 'hide', title, children: inner.nodes })
        return this
    }

    button(action: string, build: (b: ChatBuilder) => ChatBuilder): this {
        const inner = new ChatBuilder()
        build(inner)
        this.nodes.push({ type: 'button', action, children: inner.nodes })
        return this
    }

    build(): ChatNode[] {
        return mergeTextNodes(this.nodes)
    }
}

export function chat(): ChatBuilder {
    return new ChatBuilder()
}
