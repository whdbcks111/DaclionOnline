import { useEffect, useRef } from 'react'
import type { CommandInfo } from '@shared/types'
import styles from './CommandAutocomplete.module.scss'

interface Props {
    commands: CommandInfo[]
    filter: string
    activeIndex: number
    onSelect: (name: string) => void
}

export function getFilteredCommands(commands: CommandInfo[], filter: string) {
    const query = filter.slice(1).toLowerCase()
    const filtered = commands.filter(cmd =>
        cmd.name.startsWith(query) || query.startsWith(cmd.name) || 
            cmd.aliases?.some(a => a.startsWith(query) || query.startsWith(a))
    )

    return filtered;
}

export default function CommandAutocomplete({ commands, filter, activeIndex, onSelect }: Props) {
    const containerRef = useRef<HTMLDivElement>(null)

    // filter 이후 텍스트로 prefix 매칭
    const filtered = getFilteredCommands(commands, filter);

    // 활성 항목이 보이도록 스크롤
    useEffect(() => {
        const container = containerRef.current
        if (!container) return
        const active = container.children[activeIndex] as HTMLElement | undefined
        active?.scrollIntoView({ block: 'nearest' })
    }, [activeIndex])

    if (filtered.length === 0) return null

    return (
        <div ref={containerRef} className={styles.container}>
            {filtered.map((cmd, i) => {
                const argsStr = cmd.args
                    ?.map(a => a.required ? `<${a.name}>` : `[${a.name}]`)
                    .join(' ')

                return (
                    <div
                        key={cmd.name}
                        className={`${styles.item} ${i === activeIndex ? styles.active : ''}`}
                        onMouseDown={e => {
                            e.preventDefault()
                            onSelect(cmd.name)
                        }}
                    >
                        <span className={styles.name}>/{cmd.name}</span>
                        <span className={styles.description}>{cmd.description}</span>
                        {argsStr && <span className={styles.args}>{argsStr}</span>}
                    </div>
                )
            })}
        </div>
    )
}
