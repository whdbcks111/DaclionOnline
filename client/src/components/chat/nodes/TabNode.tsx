import type { ChatNode } from '@shared/types'
import { renderNode } from '../ChatMessage'

interface Props {
    width: number
    children: ChatNode[]
}

export default function TabNode({ width, children }: Props) {
    return (
        <span style={{ display: 'inline-block', minWidth: width, verticalAlign: 'top' }}>
            {children.map((node, i) => renderNode(node, i))}
        </span>
    )
}
