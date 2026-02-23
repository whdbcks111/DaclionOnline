import type { ChatNode } from '@shared/types'
import { renderNode, resolveColor } from '../ChatMessage'

interface Props {
    color: string
    children: ChatNode[]
}

export default function ColorNode({ color, children }: Props) {
    return (
        <span style={{ color: resolveColor(color) }}>
            {children.map((node, i) => renderNode(node, i))}
        </span>
    )
}
