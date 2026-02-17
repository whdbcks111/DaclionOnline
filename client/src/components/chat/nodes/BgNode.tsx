import type { ChatNode } from '@shared/types'
import { renderNode } from '../ChatMessage'

interface Props {
    color: string
    children: ChatNode[]
}

export default function BgNode({ color, children }: Props) {
    return (
        <span style={{ backgroundColor: color, borderRadius: '2px', padding: '0 2px' }}>
            {children.map((node, i) => renderNode(node, i))}
        </span>
    )
}
