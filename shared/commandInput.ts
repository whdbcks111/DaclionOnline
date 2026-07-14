export interface CommandInputParts {
    token: string
    remainder: string
    hasSlash: boolean
    hasSeparator: boolean
}

/** 채팅 입력의 첫 단어를 명령 토큰과 나머지 인자로 분리한다. */
export function parseCommandInput(raw: string): CommandInputParts | undefined {
    const normalized = raw.trimStart()
    if (!normalized) return undefined

    const hasSlash = normalized.startsWith('/')
    const body = hasSlash ? normalized.slice(1) : normalized
    const separatorIndex = body.search(/\s/)
    const token = (separatorIndex === -1 ? body : body.slice(0, separatorIndex)).toLowerCase()
    if (!token) return undefined

    return {
        token,
        remainder: separatorIndex === -1 ? '' : body.slice(separatorIndex + 1),
        hasSlash,
        hasSeparator: separatorIndex !== -1,
    }
}
