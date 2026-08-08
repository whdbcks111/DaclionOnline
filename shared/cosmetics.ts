export type CosmeticFrameKey = 'azure' | 'amethyst' | 'aurora' | 'transcendent'

export interface CosmeticFrameDefinition {
    readonly key: CosmeticFrameKey
    readonly name: string
    readonly description: string
    readonly requiredLevel?: number
    readonly requiresAscension?: boolean
    readonly animated: boolean
}

export const COSMETIC_FRAMES: readonly CosmeticFrameDefinition[] = Object.freeze([
    Object.freeze({
        key: 'azure',
        name: '청람',
        description: '푸른빛이 도는 단정한 프레임',
        requiredLevel: 1_000,
        animated: false,
    }),
    Object.freeze({
        key: 'amethyst',
        name: '자수정',
        description: '보랏빛으로 겹쳐진 고레벨 프레임',
        requiredLevel: 2_000,
        animated: false,
    }),
    Object.freeze({
        key: 'aurora',
        name: '오로라',
        description: '색이 천천히 흐르는 애니메이션 프레임',
        requiredLevel: 3_000,
        animated: true,
    }),
    Object.freeze({
        key: 'transcendent',
        name: '초월자',
        description: '초월을 달성한 영혼에게 해금되는 애니메이션 프레임',
        requiresAscension: true,
        animated: true,
    }),
])

export function getCosmeticFrame(key: unknown): CosmeticFrameDefinition | undefined {
    return typeof key === 'string' ? COSMETIC_FRAMES.find(frame => frame.key === key) : undefined
}

export type ChatEmoteKey = 'wave' | 'cheer' | 'heart' | 'surprise' | 'sparkle' | 'transcendent'

export interface ChatEmoteDefinition {
    readonly key: ChatEmoteKey
    readonly name: string
    readonly glyph: string
    readonly description: string
    readonly goldPrice?: number
    readonly requiredLevel?: number
    readonly requiresAscension?: boolean
}

export const CHAT_EMOTES: readonly ChatEmoteDefinition[] = Object.freeze([
    Object.freeze({ key: 'wave', name: '손흔들기', glyph: '👋', description: '처음부터 사용할 수 있습니다.' }),
    Object.freeze({ key: 'cheer', name: '응원', glyph: '🙌', description: 'Gold로 해금합니다.', goldPrice: 15_000 }),
    Object.freeze({ key: 'heart', name: '하트', glyph: '💖', description: 'Gold로 해금합니다.', goldPrice: 30_000 }),
    Object.freeze({ key: 'surprise', name: '깜짝', glyph: '😲', description: 'Gold로 해금합니다.', goldPrice: 60_000 }),
    Object.freeze({ key: 'sparkle', name: '반짝', glyph: '✨', description: 'Lv.1,000에 영구 해금됩니다.', requiredLevel: 1_000 }),
    Object.freeze({
        key: 'transcendent',
        name: '초월',
        glyph: '🌌',
        description: '초월 달성 시 영구 해금됩니다.',
        requiresAscension: true,
    }),
])

export function getChatEmote(key: unknown): ChatEmoteDefinition | undefined {
    return typeof key === 'string' ? CHAT_EMOTES.find(emote => emote.key === key) : undefined
}
