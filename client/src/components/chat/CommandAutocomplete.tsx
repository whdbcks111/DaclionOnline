import { useEffect, useRef } from 'react'
import type { CommandInfo, CommandArgInfo, CompletionItem } from '@shared/types'
import styles from './CommandAutocomplete.module.scss'

function completionValue(item: CompletionItem): string {
    return typeof item === 'string' ? item : item.value
}

function completionDescription(item: CompletionItem): string | undefined {
    return typeof item === 'string' ? undefined : item.description
}

interface Props {
    commands: CommandInfo[]
    filter: string
    activeIndex: number
    onSelect: (name: string) => void
    /** 현재 입력 중인 파라미터 힌트 (명령어가 완성된 후 파라미터 입력 중일 때) */
    paramHint?: CommandArgInfo & { argIndex: number; totalArgs: number }
    /** 파라미터 자동완성 목록 (이미 필터링된 목록) */
    paramCompletions?: CompletionItem[]
    onSelectCompletion?: (value: string) => void
}

export function getFilteredCommands(commands: CommandInfo[], filter: string) {
    const query = filter.slice(1).toLowerCase()
    const filtered = commands.filter(cmd =>
        cmd.name.startsWith(query) || query.startsWith(cmd.name) ||
            cmd.aliases?.some(a => a.startsWith(query) || query.startsWith(a))
    )

    return filtered;
}

export default function CommandAutocomplete({
    commands, filter, activeIndex, onSelect,
    paramHint, paramCompletions, onSelectCompletion,
}: Props) {
    const containerRef = useRef<HTMLDivElement>(null)
    const isParamMode = paramHint !== undefined

    // 활성 항목이 보이도록 스크롤
    useEffect(() => {
        const container = containerRef.current
        if (!container) return
        // hint row(1개) 이후부터 completion items 시작
        const offset = isParamMode ? 1 : 0
        const active = container.children[activeIndex + offset] as HTMLElement | undefined
        active?.scrollIntoView({ block: 'nearest' })
    }, [activeIndex, isParamMode])

    // 파라미터 모드
    if (isParamMode) {
        const completions = paramCompletions ?? []
        if (!paramHint && completions.length === 0) return null

        const label = paramHint.isText ? `${paramHint.name}:텍스트` : paramHint.name
        const argPos = `${paramHint.argIndex + 1} / ${paramHint.totalArgs}`

        return (
            <div ref={containerRef} className={styles.container}>
                <div className={styles.hint}>
                    <span className={styles.hintLabel}>{label}</span>
                    <span className={styles.hintPos}>{argPos}</span>
                    <span className={styles.description}>{paramHint.description}</span>
                    {paramHint.required && <span className={styles.required}>필수</span>}
                </div>
                {completions.map((c, i) => {
                    const val = completionValue(c)
                    const desc = completionDescription(c)
                    return (
                        <div
                            key={val}
                            className={`${styles.item} ${i === activeIndex ? styles.active : ''}`}
                            onMouseDown={e => {
                                e.preventDefault()
                                onSelectCompletion?.(val)
                            }}
                        >
                            <span className={styles.name}>{val}</span>
                            {desc && <span className={styles.completionDesc}>{desc}</span>}
                        </div>
                    )
                })}
            </div>
        )
    }

    // 명령어 모드
    const filtered = getFilteredCommands(commands, filter)
    if (filtered.length === 0) return null

    return (
        <div ref={containerRef} className={styles.container}>
            {filtered.map((cmd, i) => {
                const argsStr = cmd.args
                    ?.map(a => {
                        const label = a.isText ? `${a.name}:텍스트` : a.name
                        return a.required ? `<${label}>` : `[${label}]`
                    })
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
