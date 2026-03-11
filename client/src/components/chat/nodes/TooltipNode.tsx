import { useState } from 'react'
import type { ChatNode } from '@shared/types'
import { renderNode } from '../ChatMessage'
import styles from './TooltipNode.module.scss'

interface Props {
    description: ChatNode[]
    children: ChatNode[]
}

export default function TooltipNode({ description, children }: Props) {
    const [visible, setVisible] = useState(false)

    return (
        <span className={styles.wrapper}>
            <span
                className={styles.trigger}
                onMouseEnter={() => setVisible(true)}
                onMouseLeave={() => setVisible(false)}
            >
                {children.map((node, i) => renderNode(node, i))}
            </span>
            {visible && (
                <span className={styles.tooltip}>
                    {description.map((node, i) => renderNode(node, i))}
                </span>
            )}
        </span>
    )
}
