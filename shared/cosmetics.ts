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

export type ChatEmoteKey =
    | 'wave' | 'smile' | 'cheer' | 'heart' | 'surprise' | 'applause'
    | 'thinking' | 'sweat' | 'cry' | 'laugh' | 'rage' | 'sleepy'
    | 'wink' | 'thumbs_up' | 'bow' | 'dance' | 'toast' | 'sparkle'
    | 'fire' | 'snow' | 'fishing' | 'treasure' | 'smith' | 'cook'
    | 'victory' | 'crown' | 'dragon' | 'ghost' | 'cosmic' | 'transcendent'

export interface ChatEmoteDefinition {
    readonly key: ChatEmoteKey
    readonly name: string
    /** `/icons` 아래의 확장자 없는 투명 PNG 경로입니다. */
    readonly image: string
    readonly description: string
    readonly goldPrice?: number
    readonly requiredLevel?: number
    readonly requiresAscension?: boolean
    /** 자연 조건 없이 감정표현 뽑기권으로만 해금됩니다. */
    readonly raffleOnly?: boolean
    /** false이면 낚시 뽑기권 후보에서 제외합니다. */
    readonly raffleEligible?: boolean
}

export const CHAT_EMOTES: readonly ChatEmoteDefinition[] = Object.freeze([
    Object.freeze({ key: 'wave', name: '손흔들기', image: 'emotes/wave', description: '처음부터 사용할 수 있습니다.', raffleEligible: false }),
    Object.freeze({ key: 'smile', name: '햇살미소', image: 'emotes/smile', description: 'Lv.50에 영구 해금됩니다.', requiredLevel: 50 }),
    Object.freeze({ key: 'cheer', name: '응원', image: 'emotes/cheer', description: 'Gold 또는 뽑기권으로 해금합니다.', goldPrice: 15_000 }),
    Object.freeze({ key: 'heart', name: '보석하트', image: 'emotes/heart', description: 'Gold 또는 뽑기권으로 해금합니다.', goldPrice: 30_000 }),
    Object.freeze({ key: 'surprise', name: '깜짝슬라임', image: 'emotes/surprise', description: 'Gold 또는 뽑기권으로 해금합니다.', goldPrice: 60_000 }),
    Object.freeze({ key: 'applause', name: '박수갈채', image: 'emotes/applause', description: 'Lv.200에 영구 해금됩니다.', requiredLevel: 200 }),
    Object.freeze({ key: 'thinking', name: '고민중', image: 'emotes/thinking', description: 'Gold 또는 뽑기권으로 해금합니다.', goldPrice: 25_000 }),
    Object.freeze({ key: 'sweat', name: '식은땀', image: 'emotes/sweat', description: '감정표현 뽑기권 전용입니다.', raffleOnly: true }),
    Object.freeze({ key: 'cry', name: '폭풍눈물', image: 'emotes/cry', description: '감정표현 뽑기권 전용입니다.', raffleOnly: true }),
    Object.freeze({ key: 'laugh', name: '곰돌이웃음', image: 'emotes/laugh', description: 'Lv.1,500에 영구 해금됩니다.', requiredLevel: 1_500 }),
    Object.freeze({ key: 'rage', name: '여우분노', image: 'emotes/rage', description: 'Lv.500에 영구 해금됩니다.', requiredLevel: 500 }),
    Object.freeze({ key: 'sleepy', name: '졸린고양이', image: 'emotes/sleepy', description: '감정표현 뽑기권 전용입니다.', raffleOnly: true }),
    Object.freeze({ key: 'wink', name: '토끼윙크', image: 'emotes/wink', description: '감정표현 뽑기권 전용입니다.', raffleOnly: true }),
    Object.freeze({ key: 'thumbs_up', name: '수달최고', image: 'emotes/thumbs_up', description: 'Gold 또는 뽑기권으로 해금합니다.', goldPrice: 45_000 }),
    Object.freeze({ key: 'bow', name: '펭귄인사', image: 'emotes/bow', description: '감정표현 뽑기권 전용입니다.', raffleOnly: true }),
    Object.freeze({ key: 'dance', name: '우파루파춤', image: 'emotes/dance', description: '감정표현 뽑기권 전용입니다.', raffleOnly: true }),
    Object.freeze({ key: 'toast', name: '레서판다건배', image: 'emotes/toast', description: 'Gold 또는 뽑기권으로 해금합니다.', goldPrice: 75_000 }),
    Object.freeze({ key: 'sparkle', name: '별빛부엉이', image: 'emotes/sparkle', description: 'Lv.1,000에 영구 해금됩니다.', requiredLevel: 1_000 }),
    Object.freeze({ key: 'fire', name: '불꽃도마뱀', image: 'emotes/fire', description: 'Gold 또는 뽑기권으로 해금합니다.', goldPrice: 100_000 }),
    Object.freeze({ key: 'snow', name: '눈꽃여우', image: 'emotes/snow', description: '감정표현 뽑기권 전용입니다.', raffleOnly: true }),
    Object.freeze({ key: 'fishing', name: '고양이낚시', image: 'emotes/fishing', description: '감정표현 뽑기권 전용입니다.', raffleOnly: true }),
    Object.freeze({ key: 'treasure', name: '너구리보물', image: 'emotes/treasure', description: '감정표현 뽑기권 전용입니다.', raffleOnly: true }),
    Object.freeze({ key: 'smith', name: '곰대장장이', image: 'emotes/smith', description: '감정표현 뽑기권 전용입니다.', raffleOnly: true }),
    Object.freeze({ key: 'cook', name: '강아지요리사', image: 'emotes/cook', description: '감정표현 뽑기권 전용입니다.', raffleOnly: true }),
    Object.freeze({ key: 'victory', name: '사자승리', image: 'emotes/victory', description: '감정표현 뽑기권 전용입니다.', raffleOnly: true }),
    Object.freeze({ key: 'crown', name: '고양이왕관', image: 'emotes/crown', description: 'Lv.2,500에 영구 해금됩니다.', requiredLevel: 2_500 }),
    Object.freeze({ key: 'dragon', name: '아기용', image: 'emotes/dragon', description: '감정표현 뽑기권 전용입니다.', raffleOnly: true }),
    Object.freeze({ key: 'ghost', name: '유령강아지', image: 'emotes/ghost', description: '감정표현 뽑기권 전용입니다.', raffleOnly: true }),
    Object.freeze({ key: 'cosmic', name: '우주박쥐', image: 'emotes/cosmic', description: '감정표현 뽑기권 전용입니다.', raffleOnly: true }),
    Object.freeze({
        key: 'transcendent',
        name: '초월',
        image: 'emotes/transcendent',
        description: '초월 달성 시 영구 해금됩니다.',
        requiresAscension: true,
        raffleEligible: false,
    }),
])

export function getChatEmote(key: unknown): ChatEmoteDefinition | undefined {
    return typeof key === 'string' ? CHAT_EMOTES.find(emote => emote.key === key) : undefined
}
