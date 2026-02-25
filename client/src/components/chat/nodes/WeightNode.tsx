import type { ChatNode } from '@shared/types'
import { renderNode } from '../ChatMessage'

interface Props {
    weight: string
    children: ChatNode[]
}

export default function WeightNode({ weight, children }: Props) {
    return (
        <span style={{ fontWeight: weight }}>
            {children.map((node, i) => renderNode(node, i))}
        </span>
    )
}
