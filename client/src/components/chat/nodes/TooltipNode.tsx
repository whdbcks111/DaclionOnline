import { useState, useRef, useLayoutEffect } from 'react'
import type { ChatNode } from '@shared/types'
import { renderNode } from '../ChatMessage'
import styles from './TooltipNode.module.scss'

interface Props {
    description: ChatNode[]
    children: ChatNode[]
}

type Phase = 'hidden' | 'measuring' | 'visible'

export default function TooltipNode({ description, children }: Props) {
    const [phase, setPhase] = useState<Phase>('hidden')
    const [rawPos, setRawPos] = useState({ top: 0, left: 0 })
    const [finalPos, setFinalPos] = useState({ top: 0, left: 0 })
    const triggerRef = useRef<HTMLSpanElement>(null)
    const tooltipRef = useRef<HTMLSpanElement>(null)

    const handleMouseEnter = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect()
            setRawPos({ top: rect.top, left: rect.left + rect.width / 2 })
        }
        setPhase('measuring')
    }

    useLayoutEffect(() => {
        if (phase !== 'measuring' || !tooltipRef.current) return
        const rect = tooltipRef.current.getBoundingClientRect()
        const margin = 8
        const vw = window.innerWidth

        let { top, left } = rawPos

        // 좌우 보정
        if (rect.left < margin) left += margin - rect.left
        else if (rect.right > vw - margin) left -= rect.right - (vw - margin)

        // 상단 보정: 위로 잘리면 트리거 아래로 이동
        if (rect.top < margin) top += margin - rect.top

        setFinalPos({ top, left })
        setPhase('visible')
    }, [phase, rawPos])

    return (
        <span className={styles.wrapper}>
            <span
                ref={triggerRef}
                className={styles.trigger}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={() => setPhase('hidden')}
            >
                {children.map((node, i) => renderNode(node, i))}
            </span>
            {phase !== 'hidden' && (
                <span
                    ref={tooltipRef}
                    className={styles.tooltip}
                    style={{
                        top: phase === 'measuring' ? rawPos.top : finalPos.top,
                        left: phase === 'measuring' ? rawPos.left : finalPos.left,
                        opacity: phase === 'measuring' ? 0 : 1,
                    }}
                >
                    {description.map((node, i) => renderNode(node, i))}
                </span>
            )}
        </span>
    )
}
