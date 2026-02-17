import type { ChatNode } from '@shared/types'
import { renderNode } from '../ChatMessage'

const SIZE_MAP: Record<string, string> = {
    xs: '0.75em', sm: '0.875em', md: '1em', lg: '1.25em', xl: '1.5em',
}

interface Props {
    size: string
    children: ChatNode[]
}

export default function SizeNode({ size, children }: Props) {
    return (
        <span style={{ fontSize: SIZE_MAP[size] ?? '1em' }}>
            {children.map((node, i) => renderNode(node, i))}
        </span>
    )
}
