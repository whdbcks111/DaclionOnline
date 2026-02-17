import type { ChatNode } from '@shared/types'
import { renderNode } from '../ChatMessage'

interface Props {
    decoration: string
    children: ChatNode[]
}

export default function DecoNode({ decoration, children }: Props) {
    return (
        <span style={{ textDecoration: decoration }}>
            {children.map((node, i) => renderNode(node, i))}
        </span>
    )
}
