import { parseCommandInput } from '@shared/commandInput'
import type { CommandInfo } from '@shared/types'

function commandAliases(command: CommandInfo): string[] {
    return command.aliases?.map(alias => alias.toLowerCase()) ?? []
}

export function resolveCommandInput(commands: CommandInfo[], raw: string) {
    const input = parseCommandInput(raw)
    if (!input) return undefined
    const command = commands.find(cmd => {
        const aliases = commandAliases(cmd)
        return input.hasSlash
            ? cmd.name.toLowerCase() === input.token || aliases.includes(input.token)
            : aliases.includes(input.token)
    })
    return command ? { ...input, command } : undefined
}

export function isCommandAutocompleteInput(commands: CommandInfo[], raw: string): boolean {
    if (raw.trimStart().startsWith('/')) return true
    return resolveCommandInput(commands, raw) !== undefined
}

export function getFilteredCommands(commands: CommandInfo[], filter: string) {
    const normalized = filter.trimStart()
    if (normalized === '/') return commands
    const input = parseCommandInput(normalized)
    if (!input) return []
    const query = input.token
    return commands.filter(cmd => {
        const name = cmd.name.toLowerCase()
        const aliases = commandAliases(cmd)
        return input.hasSlash
            ? name.startsWith(query) || query.startsWith(name)
                || aliases.some(alias => alias.startsWith(query) || query.startsWith(alias))
            : aliases.includes(query)
    })
}
