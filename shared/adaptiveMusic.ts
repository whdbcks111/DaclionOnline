export const MUSIC_VOLUME_STORAGE_KEY = 'daclion:adaptive-music-volume'
export const DEFAULT_MUSIC_VOLUME = 35
export const EXPLORATION_MELODY_MIN_MIDI = 67
export const EXPLORATION_MELODY_MAX_MIDI = 96
export const EXPLORATION_HARMONY_MIN_MIDI = 60
export const EXPLORATION_HARMONY_MAX_MIDI = 84
export const MUSIC_TICKS_PER_QUARTER = 192
export const MUSIC_TICKS_PER_SIXTEENTH = MUSIC_TICKS_PER_QUARTER / 4

export interface ExplorationMixProfile {
    readonly highpassHz: number
    readonly lowEqDb: number
    readonly midEqDb: number
    readonly highEqDb: number
    readonly padVolumeDb: number
    readonly leadVolumeDb: number
    readonly padMaxPolyphony: number
}

export const STANDARD_EXPLORATION_MIX: Readonly<ExplorationMixProfile> = Object.freeze({
    highpassHz: 180,
    lowEqDb: -4.5,
    midEqDb: 1.5,
    highEqDb: 1,
    padVolumeDb: -17,
    leadVolumeDb: -11,
    padMaxPolyphony: 6,
})

export const BRIGHT_EXPLORATION_MIX: Readonly<ExplorationMixProfile> = Object.freeze({
    highpassHz: 260,
    lowEqDb: -7,
    midEqDb: 2,
    highEqDb: 3,
    padVolumeDb: -16,
    leadVolumeDb: -9,
    padMaxPolyphony: 6,
})

export const EXPLORATION_LOOP_MEASURES = 32
export const MUSIC_SCENE_TRANSITION = Object.freeze({
    crossFadeSeconds: 1.9,
})

export interface MusicStorageLike {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
}

/** 오디오 경계에서도 같은 0~100 음량 범위를 사용한다. */
export function normalizeMusicVolume(value: unknown, fallback = DEFAULT_MUSIC_VOLUME): number {
    const numeric = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numeric)) return normalizeMusicVolume(fallback, DEFAULT_MUSIC_VOLUME)
    return Math.min(100, Math.max(0, Math.round(numeric)))
}

export function readMusicVolume(storage: MusicStorageLike | null | undefined): number {
    if (!storage) return DEFAULT_MUSIC_VOLUME
    try {
        const stored = storage.getItem(MUSIC_VOLUME_STORAGE_KEY)
        return stored === null ? DEFAULT_MUSIC_VOLUME : normalizeMusicVolume(stored)
    } catch {
        return DEFAULT_MUSIC_VOLUME
    }
}

export function writeMusicVolume(storage: MusicStorageLike | null | undefined, value: unknown): number {
    const normalized = normalizeMusicVolume(value)
    try { storage?.setItem(MUSIC_VOLUME_STORAGE_KEY, String(normalized)) } catch { /* unavailable storage */ }
    return normalized
}

/** 악보의 음계 간격과 입력 별칭을 함께 소유하는 클래스형 enum. */
export class MusicScale {
    private static readonly all: MusicScale[] = []
    readonly key: string
    readonly label: string
    readonly intervals: readonly number[]

    static readonly IONIAN = new MusicScale('ionian', 'Ionian', [0, 2, 4, 5, 7, 9, 11])
    static readonly AEOLIAN = new MusicScale('aeolian', 'Aeolian', [0, 2, 3, 5, 7, 8, 10])
    static readonly DORIAN = new MusicScale('dorian', 'Dorian', [0, 2, 3, 5, 7, 9, 10])
    static readonly PHRYGIAN = new MusicScale('phrygian', 'Phrygian', [0, 1, 3, 5, 7, 8, 10])
    static readonly LYDIAN = new MusicScale('lydian', 'Lydian', [0, 2, 4, 6, 7, 9, 11])
    static readonly MIXOLYDIAN = new MusicScale('mixolydian', 'Mixolydian', [0, 2, 4, 5, 7, 9, 10])
    static readonly LOCRIAN = new MusicScale('locrian', 'Locrian', [0, 1, 3, 5, 6, 8, 10])
    static readonly HARMONIC_MINOR = new MusicScale('harmonic-minor', 'Harmonic Minor', [0, 2, 3, 5, 7, 8, 11])
    static readonly MAJOR_PENTATONIC = new MusicScale('major-pentatonic', 'Major Pentatonic', [0, 2, 4, 7, 9])
    static readonly MINOR_PENTATONIC = new MusicScale('minor-pentatonic', 'Minor Pentatonic', [0, 3, 5, 7, 10])
    static readonly PHRYGIAN_DOMINANT = new MusicScale('phrygian-dominant', 'Phrygian Dominant', [0, 1, 4, 5, 7, 8, 10])
    static readonly WHOLE_TONE = new MusicScale('whole-tone', 'Whole Tone', [0, 2, 4, 6, 8, 10])
    static readonly DOUBLE_HARMONIC_MAJOR = new MusicScale('double-harmonic-major', 'Double Harmonic Major', [0, 1, 4, 5, 7, 8, 11])

    private constructor(key: string, label: string, intervals: readonly number[]) {
        this.key = key
        this.label = label
        this.intervals = Object.freeze([...intervals])
        MusicScale.all.push(this)
        Object.freeze(this)
    }

    static values(): readonly MusicScale[] { return [...MusicScale.all] }
    static fromKey(key: unknown): MusicScale | undefined {
        return typeof key === 'string'
            ? MusicScale.all.find(scale => scale.key === key.trim().toLowerCase())
            : undefined
    }
    static fromInput(input: string): MusicScale | undefined {
        const normalized = input.trim().toLowerCase()
        return MusicScale.all.find(scale => scale.key === normalized || scale.label.toLowerCase() === normalized)
    }
}

export class MusicCombatState {
    private static readonly all: MusicCombatState[] = []
    readonly key: 'exploration' | 'combat' | 'boss'
    readonly label: string

    static readonly EXPLORATION = new MusicCombatState('exploration', '탐험')
    static readonly COMBAT = new MusicCombatState('combat', '전투')
    static readonly BOSS = new MusicCombatState('boss', '보스 전투')

    private constructor(key: MusicCombatState['key'], label: string) {
        this.key = key
        this.label = label
        MusicCombatState.all.push(this)
        Object.freeze(this)
    }

    static values(): readonly MusicCombatState[] { return [...MusicCombatState.all] }
    static fromKey(key: unknown): MusicCombatState | undefined {
        return typeof key === 'string'
            ? MusicCombatState.all.find(state => state.key === key.trim().toLowerCase())
            : undefined
    }
    static fromInput(input: string): MusicCombatState | undefined {
        const normalized = input.trim().toLocaleLowerCase('ko-KR')
        return MusicCombatState.all.find(state => state.key === normalized
            || state.label.toLocaleLowerCase('ko-KR') === normalized)
    }
}

export interface MusicTargetSnapshot {
    kind: 'monster' | 'player' | 'object'
    isBoss?: boolean
    life: number
    defeated: boolean
}

/** 서버의 실제 교전 상태를 우선하며, 구버전 snapshot에서만 생존 target을 폴백으로 사용한다. */
export function resolveMusicCombatState(
    explicitState: unknown,
    target: MusicTargetSnapshot | null | undefined,
): MusicCombatState {
    const explicit = MusicCombatState.fromKey(explicitState)
    if (explicit) return explicit
    if (!target || target.defeated || target.life <= 0 || target.kind === 'object') {
        return MusicCombatState.EXPLORATION
    }
    return target.kind === 'monster' && target.isBoss
        ? MusicCombatState.BOSS
        : MusicCombatState.COMBAT
}

export type MusicTimbreKey = 'warm' | 'water' | 'wood' | 'dark' | 'metal' | 'air' | 'holy' | 'cosmic'
export type MusicRhythmKey = 'steady' | 'waltz' | 'syncopated' | 'march' | 'pulse' | 'broken' | 'swing'
export type MusicOmniOscillatorType =
    | 'fattriangle'
    | 'sine4'
    | 'triangle'
    | 'amsine'
    | 'fmsquare'
    | 'fatsine'
    | 'amtriangle'
    | 'fmtriangle'
    | 'sine'
    | 'fmsine'

export interface MusicEnvelopeProfile {
    readonly attack: number
    readonly decay: number
    readonly sustain: number
    readonly release: number
}

export interface ExplorationTimbreProfile {
    readonly leadOscillator: MusicOmniOscillatorType
    readonly padOscillator: MusicOmniOscillatorType
    readonly leadEnvelope: Readonly<MusicEnvelopeProfile>
    readonly padEnvelope: Readonly<MusicEnvelopeProfile>
}

export interface ExplorationRhythmProfile {
    readonly chordVelocities: readonly number[]
}

export class MusicMeter {
    private static readonly all: MusicMeter[] = []
    readonly key: '4/4' | '3/4'
    readonly beatsPerMeasure: 4 | 3
    readonly beatUnit: 4
    readonly sixteenthsPerMeasure: number

    static readonly COMMON = new MusicMeter('4/4', 4)
    static readonly WALTZ = new MusicMeter('3/4', 3)

    private constructor(key: MusicMeter['key'], beatsPerMeasure: MusicMeter['beatsPerMeasure']) {
        this.key = key
        this.beatsPerMeasure = beatsPerMeasure
        this.beatUnit = 4
        this.sixteenthsPerMeasure = beatsPerMeasure * 4
        MusicMeter.all.push(this)
        Object.freeze(this)
    }

    static values(): readonly MusicMeter[] { return [...MusicMeter.all] }
    static fromKey(key: unknown): MusicMeter | undefined {
        return typeof key === 'string'
            ? MusicMeter.all.find(meter => meter.key === key.trim())
            : undefined
    }
}

export type MusicPhraseKey = 'motifA' | 'responseA' | 'motifB' | 'cadence'

export interface MusicPhraseToken {
    readonly degree: number | null
    readonly onsetSixteenths: number
    readonly durationSixteenths: number
}

export interface MusicPhraseCell {
    readonly key: MusicPhraseKey
    readonly lengthSixteenths: number
    readonly tokens: readonly MusicPhraseToken[]
}

export interface MusicThemePhraseBook {
    readonly motifA: MusicPhraseCell
    readonly responseA: MusicPhraseCell
    readonly motifB: MusicPhraseCell
    readonly cadence: MusicPhraseCell
}

interface MusicPhraseDegreeBookInput {
    readonly motifA: readonly (number | null)[]
    readonly responseA: readonly (number | null)[]
    readonly motifB: readonly (number | null)[]
    readonly cadence: readonly (number | null)[]
}

const COMMON_PHRASE_DURATIONS: Readonly<Record<Exclude<MusicRhythmKey, 'waltz'>, Readonly<Record<MusicPhraseKey, readonly number[]>>>> = Object.freeze({
    steady: Object.freeze({
        motifA: [4, 4, 4, 4, 4, 4, 4, 4], responseA: [2, 6, 4, 4, 4, 4, 4, 4],
        motifB: [4, 4, 2, 6, 4, 4, 4, 4], cadence: [4, 4, 4, 4, 4, 4, 8],
    }),
    syncopated: Object.freeze({
        motifA: [3, 5, 5, 3, 3, 5, 5, 3], responseA: [5, 3, 3, 5, 5, 3, 3, 5],
        motifB: [3, 5, 4, 4, 5, 3, 4, 4], cadence: [3, 5, 5, 3, 4, 4, 8],
    }),
    march: Object.freeze({
        motifA: [4, 4, 4, 4, 4, 4, 4, 4], responseA: [4, 4, 2, 6, 4, 4, 4, 4],
        motifB: [2, 6, 4, 4, 2, 6, 4, 4], cadence: [4, 4, 4, 4, 2, 6, 8],
    }),
    pulse: Object.freeze({
        motifA: [2, 6, 2, 6, 2, 6, 2, 6], responseA: [2, 6, 4, 4, 2, 6, 4, 4],
        motifB: [4, 4, 2, 6, 4, 4, 2, 6], cadence: [2, 6, 4, 4, 4, 4, 8],
    }),
    broken: Object.freeze({
        motifA: [5, 3, 3, 5, 5, 3, 3, 5], responseA: [3, 5, 5, 3, 3, 5, 5, 3],
        motifB: [5, 3, 4, 4, 3, 5, 4, 4], cadence: [5, 3, 3, 5, 4, 4, 8],
    }),
    swing: Object.freeze({
        motifA: [5, 3, 5, 3, 5, 3, 5, 3], responseA: [3, 5, 3, 5, 3, 5, 3, 5],
        motifB: [5, 3, 4, 4, 5, 3, 4, 4], cadence: [3, 5, 5, 3, 4, 4, 8],
    }),
})

const WALTZ_PHRASE_DURATIONS: Readonly<Record<MusicPhraseKey, readonly number[]>> = Object.freeze({
    motifA: [3, 3, 3, 3, 3, 3, 3, 3],
    responseA: [4, 2, 2, 4, 4, 2, 2, 4],
    motifB: [2, 4, 4, 2, 2, 4, 4, 2],
    cadence: [4, 2, 4, 2, 4, 8],
})

function defineMusicPhraseCell(
    key: MusicPhraseKey,
    degrees: readonly (number | null)[],
    durations: readonly number[],
    expectedLength: number,
): MusicPhraseCell {
    if (degrees.length !== durations.length) {
        throw new Error(`지역 음악 ${key} 음정과 길이 수가 다릅니다.`)
    }
    let onsetSixteenths = 0
    const tokens = degrees.map((degree, index) => {
        const durationSixteenths = durations[index]
        if (!Number.isInteger(durationSixteenths) || durationSixteenths <= 0) {
            throw new Error(`지역 음악 ${key} 음 길이가 올바르지 않습니다.`)
        }
        const token = Object.freeze({ degree, onsetSixteenths, durationSixteenths })
        onsetSixteenths += durationSixteenths
        return token
    })
    if (onsetSixteenths !== expectedLength) {
        throw new Error(`지역 음악 ${key}는 정확히 2마디여야 합니다: ${onsetSixteenths}/${expectedLength}`)
    }
    return Object.freeze({ key, lengthSixteenths: expectedLength, tokens: Object.freeze(tokens) })
}

function defineMusicPhraseBook(
    meter: MusicMeter,
    rhythm: MusicRhythmKey,
    degrees: MusicPhraseDegreeBookInput,
): MusicThemePhraseBook {
    const durationBook = meter === MusicMeter.WALTZ
        ? WALTZ_PHRASE_DURATIONS
        : COMMON_PHRASE_DURATIONS[rhythm === 'waltz' ? 'steady' : rhythm]
    const expectedLength = meter.sixteenthsPerMeasure * 2
    return Object.freeze({
        motifA: defineMusicPhraseCell('motifA', degrees.motifA, durationBook.motifA, expectedLength),
        responseA: defineMusicPhraseCell('responseA', degrees.responseA, durationBook.responseA, expectedLength),
        motifB: defineMusicPhraseCell('motifB', degrees.motifB, durationBook.motifB, expectedLength),
        cadence: defineMusicPhraseCell('cadence', degrees.cadence, durationBook.cadence, expectedLength),
    })
}

function defineEnvelope(profile: MusicEnvelopeProfile): Readonly<MusicEnvelopeProfile> {
    return Object.freeze({ ...profile })
}

function defineTimbreProfile(profile: ExplorationTimbreProfile): Readonly<ExplorationTimbreProfile> {
    return Object.freeze({
        ...profile,
        leadEnvelope: defineEnvelope(profile.leadEnvelope),
        padEnvelope: defineEnvelope(profile.padEnvelope),
    })
}

const EXPLORATION_TIMBRE_PROFILES: Readonly<Record<MusicTimbreKey, Readonly<ExplorationTimbreProfile>>> = Object.freeze({
    warm: defineTimbreProfile({
        leadOscillator: 'fattriangle', padOscillator: 'sine',
        leadEnvelope: { attack: 0.035, decay: 0.2, sustain: 0.18, release: 0.5 },
        padEnvelope: { attack: 0.12, decay: 0.22, sustain: 0.34, release: 0.42 },
    }),
    water: defineTimbreProfile({
        leadOscillator: 'sine4', padOscillator: 'fatsine',
        leadEnvelope: { attack: 0.08, decay: 0.28, sustain: 0.16, release: 0.8 },
        padEnvelope: { attack: 0.24, decay: 0.3, sustain: 0.28, release: 0.58 },
    }),
    wood: defineTimbreProfile({
        leadOscillator: 'triangle', padOscillator: 'fattriangle',
        leadEnvelope: { attack: 0.008, decay: 0.12, sustain: 0.08, release: 0.26 },
        padEnvelope: { attack: 0.06, decay: 0.16, sustain: 0.26, release: 0.3 },
    }),
    dark: defineTimbreProfile({
        leadOscillator: 'amsine', padOscillator: 'sine4',
        leadEnvelope: { attack: 0.12, decay: 0.35, sustain: 0.22, release: 1.1 },
        padEnvelope: { attack: 0.3, decay: 0.36, sustain: 0.32, release: 0.64 },
    }),
    metal: defineTimbreProfile({
        leadOscillator: 'fmsquare', padOscillator: 'fmtriangle',
        leadEnvelope: { attack: 0.004, decay: 0.09, sustain: 0.05, release: 0.18 },
        padEnvelope: { attack: 0.04, decay: 0.18, sustain: 0.18, release: 0.28 },
    }),
    air: defineTimbreProfile({
        leadOscillator: 'fatsine', padOscillator: 'sine',
        leadEnvelope: { attack: 0.18, decay: 0.25, sustain: 0.12, release: 0.9 },
        padEnvelope: { attack: 0.34, decay: 0.24, sustain: 0.24, release: 0.62 },
    }),
    holy: defineTimbreProfile({
        leadOscillator: 'amtriangle', padOscillator: 'fattriangle',
        leadEnvelope: { attack: 0.04, decay: 0.3, sustain: 0.28, release: 0.85 },
        padEnvelope: { attack: 0.16, decay: 0.3, sustain: 0.38, release: 0.56 },
    }),
    cosmic: defineTimbreProfile({
        leadOscillator: 'fmtriangle', padOscillator: 'fmsine',
        leadEnvelope: { attack: 0.02, decay: 0.42, sustain: 0.16, release: 0.72 },
        padEnvelope: { attack: 0.22, decay: 0.38, sustain: 0.3, release: 0.6 },
    }),
})

function defineRhythmProfile(profile: ExplorationRhythmProfile): Readonly<ExplorationRhythmProfile> {
    return Object.freeze({
        chordVelocities: Object.freeze([...profile.chordVelocities]),
    })
}

const EXPLORATION_RHYTHM_PROFILES: Readonly<Record<MusicRhythmKey, Readonly<ExplorationRhythmProfile>>> = Object.freeze({
    steady: defineRhythmProfile({ chordVelocities: [0.27, 0.23, 0.25, 0.22] }),
    waltz: defineRhythmProfile({ chordVelocities: [0.29, 0.19, 0.27, 0.18] }),
    syncopated: defineRhythmProfile({ chordVelocities: [0.24, 0.3, 0.22, 0.28] }),
    march: defineRhythmProfile({ chordVelocities: [0.31, 0.2, 0.29, 0.2] }),
    pulse: defineRhythmProfile({ chordVelocities: [0.3, 0.18, 0.28, 0.18] }),
    broken: defineRhythmProfile({ chordVelocities: [0.22, 0.27, 0.2, 0.25] }),
    swing: defineRhythmProfile({ chordVelocities: [0.26, 0.2, 0.25, 0.19] }),
})

export function getExplorationTimbreProfile(
    timbre: MusicTimbreKey,
): Readonly<ExplorationTimbreProfile> {
    return EXPLORATION_TIMBRE_PROFILES[timbre]
}

export function getExplorationRhythmProfile(
    rhythm: MusicRhythmKey,
): Readonly<ExplorationRhythmProfile> {
    return EXPLORATION_RHYTHM_PROFILES[rhythm]
}

export interface MusicRegister {
    readonly bassOctave: number
    readonly padOctave: number
    readonly leadOctave: number
}

interface LocationMusicThemeInput {
    readonly key: string
    readonly name: string
    readonly mapColor: string
    readonly bpm: number
    readonly root: string
    readonly rootMidi: number
    readonly scale: MusicScale
    readonly phraseDegrees: MusicPhraseDegreeBookInput
    readonly chords: readonly (readonly number[])[]
    readonly register: MusicRegister
    readonly timbre: MusicTimbreKey
    readonly rhythm: MusicRhythmKey
    readonly meter?: MusicMeter
    /** 마을·초반 자연 권역에서 seed가 밝은 화성과 가청 음역을 흐리지 않게 한다. */
    readonly brightExploration?: boolean
}

/** 35개 월드 권역의 대표 악보와 음색을 소유하는 클래스형 enum. */
export class LocationMusicTheme {
    private static readonly all: LocationMusicTheme[] = []
    readonly key: string
    readonly name: string
    readonly mapColor: string
    readonly bpm: number
    readonly root: string
    readonly rootMidi: number
    readonly scale: MusicScale
    readonly meter: MusicMeter
    readonly phrases: MusicThemePhraseBook
    readonly chords: readonly (readonly number[])[]
    readonly register: Readonly<MusicRegister>
    readonly timbre: MusicTimbreKey
    readonly rhythm: MusicRhythmKey
    readonly brightExploration: boolean

    static readonly LUMINAR = new LocationMusicTheme({
        key: 'luminar', name: '개척의 별등불', mapColor: '#d6a85f', bpm: 96, root: 'G3', rootMidi: 55,
        scale: MusicScale.IONIAN, phraseDegrees: { motifA: [0, 1, 2, 3, 4, 6, 4, 2], responseA: [3, 4, 5, 7, 6, 4, 2, 0], motifB: [4, 5, 6, 8, 7, 5, 4, 3], cadence: [0, 1, 3, 4, 4, 2, 0] },
        chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [0, 2, 4]], register: { bassOctave: -2, padOctave: 1, leadOctave: 2 }, timbre: 'warm', rhythm: 'steady', brightExploration: true,
    })
    static readonly LUMINOUS_POND = new LocationMusicTheme({
        key: 'luminous-pond', name: '물빛의 한가로운 파문', mapColor: '#63a9bf', bpm: 78, root: 'D3', rootMidi: 50,
        scale: MusicScale.MAJOR_PENTATONIC, phraseDegrees: { motifA: [0, 1, 2, null, 4, 2, 1, 0], responseA: [2, 3, 4, 3, 2, null, 1, 0], motifB: [0, 2, 3, 4, 3, 2, null, 1], cadence: [0, 1, 4, 2, 0, 0] },
        chords: [[0, 2, 3], [4, 5, 7], [1, 3, 5], [3, 5, 7]], register: { bassOctave: -1, padOctave: 1, leadOctave: 2 }, timbre: 'water', rhythm: 'waltz', meter: MusicMeter.WALTZ, brightExploration: true,
    })
    static readonly MEADOW = new LocationMusicTheme({
        key: 'meadow', name: '첫 바람의 길', mapColor: '#6fa85d', bpm: 108, root: 'C3', rootMidi: 48,
        scale: MusicScale.IONIAN, phraseDegrees: { motifA: [0, 1, 2, 5, 3, 2, 1, 0], responseA: [1, 2, 3, 5, 4, 3, 2, 1], motifB: [3, 4, 5, 6, 5, 3, 2, 1], cadence: [0, 1, 5, 6, 3, 4, 0] },
        chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]], register: { bassOctave: -1, padOctave: 1, leadOctave: 2 }, timbre: 'wood', rhythm: 'steady', brightExploration: true,
    })
    static readonly SILVERWEB = new LocationMusicTheme({
        key: 'silverweb', name: '은실 아래의 사냥', mapColor: '#4f7857', bpm: 94, root: 'E3', rootMidi: 52,
        scale: MusicScale.MIXOLYDIAN, phraseDegrees: { motifA: [0, null, 1, 3, 2, 1, 4, 3], responseA: [3, 4, 5, null, 4, 2, 1, 0], motifB: [5, 4, 2, 3, 1, 2, 4, null], cadence: [0, 1, 6, 5, 3, 2, 0] },
        chords: [[0, 2, 4], [6, 8, 10], [3, 5, 7], [0, 2, 4]], register: { bassOctave: -2, padOctave: 1, leadOctave: 2 }, timbre: 'wood', rhythm: 'syncopated', brightExploration: true,
    })
    static readonly SWAMP = new LocationMusicTheme({
        key: 'swamp', name: '잠든 포자의 숨', mapColor: '#66784f', bpm: 70, root: 'D3', rootMidi: 50,
        scale: MusicScale.PHRYGIAN, phraseDegrees: { motifA: [0, 1, 0, -2, 0, 2, 1, null], responseA: [0, -1, 1, 2, 1, 0, -1, null], motifB: [2, 1, 3, 2, 0, 1, -1, 0], cadence: [0, 1, 1, 2, 0, -1, 0] },
        chords: [[0, 2, 4], [1, 3, 5], [0, 3, 5], [1, 4, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'dark', rhythm: 'broken',
    })
    static readonly EMBER = new LocationMusicTheme({
        key: 'ember', name: '칼데라의 맥박', mapColor: '#bb6542', bpm: 126, root: 'E3', rootMidi: 52,
        scale: MusicScale.PHRYGIAN_DOMINANT, phraseDegrees: { motifA: [0, 1, 3, 1, 0, null, 1, 0], responseA: [1, 2, 3, 4, 3, 2, 1, 0], motifB: [4, 3, 5, 4, 2, 3, 1, 0], cadence: [0, 1, 1, 2, 4, 1, 0] },
        chords: [[0, 2, 4], [1, 3, 5], [4, 6, 8], [0, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'metal', rhythm: 'pulse',
    })
    static readonly FEVERIC_MINE = new LocationMusicTheme({
        key: 'feveric-mine', name: '수정 곡괭이의 메아리', mapColor: '#716558', bpm: 88, root: 'A2', rootMidi: 45,
        scale: MusicScale.MINOR_PENTATONIC, phraseDegrees: { motifA: [0, null, 1, 3, 1, 0, 2, 1], responseA: [0, 1, 2, 3, 2, null, 1, 0], motifB: [0, 2, 3, 4, 3, 2, 1, 0], cadence: [0, 1, 1, 2, 0, 1, 0] },
        chords: [[0, 2, 4], [1, 3, 5], [0, 3, 5], [2, 4, 6]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'metal', rhythm: 'march',
    })
    static readonly TEMPEST = new LocationMusicTheme({
        key: 'tempest', name: '낙뢰능선 질주', mapColor: '#60758a', bpm: 132, root: 'F#3', rootMidi: 54,
        scale: MusicScale.DORIAN, phraseDegrees: { motifA: [0, 1, 3, 2, 4, 3, 5, null], responseA: [5, 4, 6, 5, 3, 2, 4, 3], motifB: [2, 4, 5, 6, 5, 4, 2, 3], cadence: [0, 1, 3, 4, 4, 2, 0] },
        chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [1, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'air', rhythm: 'syncopated',
    })
    static readonly NIGHTWOOD = new LocationMusicTheme({
        key: 'nightwood', name: '달 없는 심재', mapColor: '#3d4845', bpm: 76, root: 'C#3', rootMidi: 49,
        scale: MusicScale.AEOLIAN, phraseDegrees: { motifA: [7, 6, 5, 4, 3, 2, 1, 0], responseA: [5, 4, 3, 2, 1, null, 0, -1], motifB: [2, 1, 3, 2, 0, -1, 1, 0], cadence: [0, 1, 5, 4, 3, 1, 0] },
        chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [0, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'dark', rhythm: 'broken',
    })
    static readonly DAWN_SANCTUM = new LocationMusicTheme({
        key: 'dawn-sanctum', name: '광륜의 새벽', mapColor: '#ddd19a', bpm: 90, root: 'D3', rootMidi: 50,
        scale: MusicScale.LYDIAN, phraseDegrees: { motifA: [0, 1, 2, 3, 4, null, 5, 6], responseA: [7, 6, 5, 4, 3, 2, 1, 0], motifB: [3, 4, 6, 5, 7, 6, 4, 2], cadence: [0, 1, 1, 2, 4, 2, 0] },
        chords: [[0, 2, 4], [1, 3, 5], [4, 6, 8], [0, 2, 4]], register: { bassOctave: -1, padOctave: 1, leadOctave: 2 }, timbre: 'holy', rhythm: 'steady', brightExploration: true,
    })
    static readonly NECROPOLIS = new LocationMusicTheme({
        key: 'necropolis', name: '불멸의 장송', mapColor: '#585365', bpm: 64, root: 'B2', rootMidi: 47,
        scale: MusicScale.HARMONIC_MINOR, phraseDegrees: { motifA: [7, null, 6, 5, 4, 3, 2, 1], responseA: [4, 3, 2, 1, 0, null, -1, 0], motifB: [5, 4, 3, null, 2, 1, -1, 0], cadence: [0, 1, 5, 4, 4, 1, 0] },
        chords: [[0, 2, 4], [5, 7, 9], [4, 6, 8], [0, 3, 6]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'dark', rhythm: 'march',
    })
    static readonly IRONROOT = new LocationMusicTheme({
        key: 'ironroot', name: '매몰된 철근', mapColor: '#75644f', bpm: 92, root: 'E3', rootMidi: 52,
        scale: MusicScale.LOCRIAN, phraseDegrees: { motifA: [0, 1, 2, null, 5, 2, 1, -1], responseA: [3, 2, 4, 3, 1, 0, -1, null], motifB: [4, 3, 2, 1, 3, 2, 0, -1], cadence: [0, 1, 1, 2, 3, -1, 0] },
        chords: [[0, 2, 4], [1, 3, 5], [3, 5, 7], [0, 4, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'metal', rhythm: 'broken',
    })
    static readonly ASTRAL_RIFT = new LocationMusicTheme({
        key: 'astral-rift', name: '일식 너머의 문', mapColor: '#66577f', bpm: 116, root: 'F3', rootMidi: 53,
        scale: MusicScale.LYDIAN, phraseDegrees: { motifA: [0, 2, 1, 3, 2, 4, 3, 5], responseA: [6, 5, 7, 6, 4, 3, 5, 4], motifB: [7, 5, 6, 8, 7, 9, 6, 4], cadence: [0, 1, 3, 4, 4, 2, 0] },
        chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [1, 4, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'cosmic', rhythm: 'syncopated',
    })
    static readonly TWILIGHT_TOMB = new LocationMusicTheme({
        key: 'twilight-tomb', name: '마지막 등불 행렬', mapColor: '#655f73', bpm: 68, root: 'C3', rootMidi: 48,
        scale: MusicScale.AEOLIAN, phraseDegrees: { motifA: [5, 7, 4, null, 3, 3, 2, 1], responseA: [3, 3, 2, null, 1, 1, 0, -1], motifB: [4, 3, 4, 2, 3, 1, 2, 0], cadence: [0, 1, 5, 4, 3, 1, 0] },
        chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [0, 3, 5]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'holy', rhythm: 'march',
    })
    static readonly GLASSDUNE = new LocationMusicTheme({
        key: 'glassdune', name: '유리사막의 신기루', mapColor: '#756344', bpm: 112, root: 'D3', rootMidi: 50,
        scale: MusicScale.HARMONIC_MINOR, phraseDegrees: { motifA: [0, 1, 2, 4, 2, 1, 4, 3], responseA: [5, 4, 6, 5, 3, 2, 1, 0], motifB: [2, 3, 5, 4, 6, 5, 3, 1], cadence: [0, 1, 1, 2, 4, 1, 0] },
        chords: [[0, 2, 4], [1, 3, 5], [4, 6, 8], [0, 3, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'warm', rhythm: 'swing',
    })
    static readonly FROSTVEIL = new LocationMusicTheme({
        key: 'frostveil', name: '빙경의 숨결', mapColor: '#536773', bpm: 84, root: 'A2', rootMidi: 45,
        scale: MusicScale.DORIAN, phraseDegrees: { motifA: [0, null, 1, 2, null, 4, 2, 1], responseA: [4, null, 3, 2, null, 1, 0, null], motifB: [2, 3, null, 5, 4, null, 2, 1], cadence: [0, 1, 3, 4, 1, 0, 0] },
        chords: [[0, 2, 4], [3, 5, 7], [1, 3, 5], [0, 3, 5]], register: { bassOctave: -1, padOctave: 0, leadOctave: 2 }, timbre: 'water', rhythm: 'steady',
    })
    static readonly MISTTIDE = new LocationMusicTheme({
        key: 'misttide', name: '안개조류의 귀향', mapColor: '#42666a', bpm: 100, root: 'E3', rootMidi: 52,
        scale: MusicScale.MIXOLYDIAN, phraseDegrees: { motifA: [0, 1, 2, 3, 5, 3, 2, 1], responseA: [4, 5, 6, 5, 4, 2, 1, 0], motifB: [2, 4, 3, 5, 4, 6, 3, 2], cadence: [0, 1, 3, 4, 2, 0] },
        chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [0, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'water', rhythm: 'waltz', meter: MusicMeter.WALTZ,
    })
    static readonly PARADOX = new LocationMusicTheme({
        key: 'paradox', name: '멈춘 톱니의 역설', mapColor: '#5b5264', bpm: 120, root: 'F#3', rootMidi: 54,
        scale: MusicScale.HARMONIC_MINOR, phraseDegrees: { motifA: [0, 2, 1, 3, 2, 4, 3, 5], responseA: [5, 4, 6, 5, 3, 2, 1, 0], motifB: [1, 3, 2, 4, 3, 5, 4, 2], cadence: [0, 1, 4, 5, 5, 2, 0] },
        chords: [[0, 2, 4], [4, 6, 8], [5, 7, 9], [0, 3, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'metal', rhythm: 'pulse',
    })
    static readonly ASHEN_ABYSS = new LocationMusicTheme({
        key: 'ashen-abyss', name: '흑염의 진군', mapColor: '#563b42', bpm: 108, root: 'C3', rootMidi: 48,
        scale: MusicScale.PHRYGIAN, phraseDegrees: { motifA: [0, 0, 1, 3, 1, 1, 3, 2], responseA: [2, 2, 3, 4, 3, 1, 0, 0], motifB: [4, 3, 5, 4, 2, 1, 3, 2], cadence: [0, 1, 1, 2, 5, 1, 0] },
        chords: [[0, 2, 4], [1, 3, 5], [5, 7, 9], [0, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'dark', rhythm: 'march',
    })
    static readonly VOIDCROWN = new LocationMusicTheme({
        key: 'voidcrown', name: '빈 왕관의 성벽', mapColor: '#44455b', bpm: 96, root: 'G2', rootMidi: 43,
        scale: MusicScale.AEOLIAN, phraseDegrees: { motifA: [0, null, 2, 1, null, 3, 2, 0], responseA: [4, null, 3, 2, null, 1, 0, null], motifB: [5, 4, null, 2, 3, null, 1, 0], cadence: [0, 1, 5, 4, 3, 1, 0] },
        chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [0, 3, 5]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'dark', rhythm: 'pulse',
    })
    static readonly LUNARIS_TRENCH = new LocationMusicTheme({
        key: 'lunaris-trench', name: '백야 아래의 심해성가', mapColor: '#304452', bpm: 62, root: 'C#3', rootMidi: 49,
        scale: MusicScale.LOCRIAN, phraseDegrees: { motifA: [6, null, 5, 4, 3, null, 2, 1], responseA: [3, null, 2, 1, 0, null, -1, -2], motifB: [4, 3, null, 2, 1, 0, null, -1], cadence: [0, 1, 1, 2, 4, -1, 0] },
        chords: [[0, 2, 4], [1, 3, 5], [4, 6, 8], [0, 4, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'water', rhythm: 'broken',
    })
    static readonly WORLDROOT = new LocationMusicTheme({
        key: 'worldroot', name: '태초뿌리의 기억', mapColor: '#40513f', bpm: 88, root: 'D3', rootMidi: 50,
        scale: MusicScale.DORIAN, phraseDegrees: { motifA: [0, 1, 2, 4, 2, null, 4, 3], responseA: [1, 2, 3, 5, 4, 3, 2, 0], motifB: [3, 4, 5, 6, 5, 4, 2, 1], cadence: [0, 1, 3, 4, 1, 0] },
        chords: [[0, 2, 4], [3, 5, 7], [1, 3, 5], [0, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'wood', rhythm: 'waltz', meter: MusicMeter.WALTZ,
    })
    static readonly NEBULA = new LocationMusicTheme({
        key: 'nebula', name: '사건지평의 왕관', mapColor: '#35434b', bpm: 110, root: 'A2', rootMidi: 45,
        scale: MusicScale.LYDIAN, phraseDegrees: { motifA: [0, 2, 3, 4, 5, 7, 6, 5], responseA: [5, 6, 8, 7, 6, 4, 3, 2], motifB: [7, 8, 9, 7, 10, 9, 6, 5], cadence: [0, 1, 3, 4, 4, 2, 0] },
        chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [1, 4, 6]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'cosmic', rhythm: 'syncopated',
    })
    static readonly CHRONOFROST = new LocationMusicTheme({
        key: 'chronofrost', name: '영시의 진자', mapColor: '#36454b', bpm: 80, root: 'E3', rootMidi: 52,
        scale: MusicScale.HARMONIC_MINOR, phraseDegrees: { motifA: [0, 2, 1, 4, 2, 1, 4, 3], responseA: [1, 3, 2, 4, 3, 2, 1, 0], motifB: [4, 3, 5, 4, 2, 3, 1, 0], cadence: [0, 1, 5, 4, 4, 1, 0] },
        chords: [[0, 2, 4], [5, 7, 9], [4, 6, 8], [0, 3, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'water', rhythm: 'pulse',
    })
    static readonly ENDSTAR = new LocationMusicTheme({
        key: 'endstar', name: '최후성좌의 낙하', mapColor: '#493d49', bpm: 118, root: 'B2', rootMidi: 47,
        scale: MusicScale.PHRYGIAN, phraseDegrees: { motifA: [7, 6, 5, 4, 3, 2, 1, 0], responseA: [5, 4, 3, 2, 1, 0, -1, 0], motifB: [8, 7, 5, 6, 4, 3, 1, 2], cadence: [0, 1, 1, 2, 5, -1, 0] },
        chords: [[0, 2, 4], [1, 3, 5], [5, 7, 9], [0, 3, 5]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'cosmic', rhythm: 'syncopated',
    })
    static readonly SKYGRAVE = new LocationMusicTheme({
        key: 'skygrave', name: '하늘묘지의 천장송', mapColor: '#45586a', bpm: 138, root: 'F#3', rootMidi: 54,
        scale: MusicScale.LYDIAN, phraseDegrees: { motifA: [0, null, 2, 3, 4, 5, 6, 7], responseA: [8, 7, 6, 5, 4, null, 3, 2], motifB: [3, 5, 4, 6, 5, 7, 6, 4], cadence: [0, 1, 3, 4, 4, 2, 0] },
        chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [1, 4, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 1 }, timbre: 'air', rhythm: 'syncopated',
    })
    static readonly ABYSSGLASS = new LocationMusicTheme({
        key: 'abyssglass', name: '만압의 수정해', mapColor: '#315869', bpm: 58, root: 'C3', rootMidi: 48,
        scale: MusicScale.DORIAN, phraseDegrees: { motifA: [0, null, 1, 2, null, 4, 2, 1], responseA: [2, null, 3, 4, null, 3, 1, 0], motifB: [4, null, 3, 2, 1, null, 2, 0], cadence: [0, 1, 3, 4, 1, 0, 0] },
        chords: [[0, 2, 4], [3, 5, 7], [1, 3, 5], [0, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'water', rhythm: 'broken',
    })
    static readonly DREAMARCHIVE = new LocationMusicTheme({
        key: 'dreamarchive', name: '꿈서고의 잉크잠', mapColor: '#5a4967', bpm: 72, root: 'Eb3', rootMidi: 51,
        scale: MusicScale.WHOLE_TONE, phraseDegrees: { motifA: [0, 1, 2, 3, 2, 4, 3, 5], responseA: [5, 4, 6, 5, 3, 2, 1, 0], motifB: [2, 4, 3, 5, 4, 6, 5, 3], cadence: [0, 1, 1, 2, 2, 1, 0] },
        chords: [[0, 2, 4], [1, 3, 5], [2, 4, 6], [0, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'cosmic', rhythm: 'broken',
    })
    static readonly THUNDERFORGE = new LocationMusicTheme({
        key: 'thunderforge', name: '천로의 번개망치', mapColor: '#6a5537', bpm: 144, root: 'E3', rootMidi: 52,
        scale: MusicScale.MIXOLYDIAN, phraseDegrees: { motifA: [0, 1, 0, 2, 0, 3, 0, null], responseA: [3, 4, 3, 5, 3, 2, 1, 0], motifB: [4, 3, 5, 4, 6, 5, 3, 2], cadence: [0, 1, 3, 4, 4, 2, 0] },
        chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [0, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'metal', rhythm: 'syncopated',
    })
    static readonly RUSTWORLD = new LocationMusicTheme({
        key: 'rustworld', name: '붉은 산화풍', mapColor: '#68483d', bpm: 104, root: 'F3', rootMidi: 53,
        scale: MusicScale.PHRYGIAN, phraseDegrees: { motifA: [5, 4, 3, 2, 1, 0, -2, 0], responseA: [3, 2, 1, 0, -1, 1, 0, null], motifB: [4, 3, 5, 4, 2, 1, 3, 2], cadence: [0, 1, 1, 2, 3, -1, 0] },
        chords: [[0, 2, 4], [1, 3, 5], [3, 5, 7], [0, 4, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'metal', rhythm: 'swing',
    })
    static readonly PALEECLIPSE = new LocationMusicTheme({
        key: 'paleeclipse', name: '흰그늘의 잔광', mapColor: '#69645b', bpm: 82, root: 'B2', rootMidi: 47,
        scale: MusicScale.LYDIAN, phraseDegrees: { motifA: [0, 1, null, 3, 2, null, 4, 3], responseA: [4, 5, 6, null, 5, 3, 2, 1], motifB: [2, 4, 3, 5, 4, 6, null, 3], cadence: [0, 1, 3, 4, 4, 2, 0] },
        chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [1, 4, 6]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'holy', rhythm: 'broken',
    })
    static readonly CRIMSONGRAVITY = new LocationMusicTheme({
        key: 'crimsongravity', name: '홍중력의 낙하', mapColor: '#6a3d49', bpm: 76, root: 'C#3', rootMidi: 49,
        scale: MusicScale.HARMONIC_MINOR, phraseDegrees: { motifA: [7, 6, 5, null, 4, 3, 2, 1], responseA: [6, 5, 4, null, 3, 2, 1, 0], motifB: [5, 4, 6, 5, 3, 2, 4, 3], cadence: [0, 1, 5, 4, 4, 1, 0] },
        chords: [[0, 2, 4], [5, 7, 9], [4, 6, 8], [0, 3, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'dark', rhythm: 'march',
    })
    static readonly SILENTDIVINE = new LocationMusicTheme({
        key: 'silentdivine', name: '무언림의 기도', mapColor: '#405b4c', bpm: 66, root: 'G2', rootMidi: 43,
        scale: MusicScale.MAJOR_PENTATONIC, phraseDegrees: { motifA: [0, null, 1, null, 2, null, 1, 0], responseA: [3, null, 2, null, 1, null, 0, null], motifB: [0, 1, null, 3, 2, null, 1, 0], cadence: [0, 1, 1, 2, 0, 1, 0] },
        chords: [[0, 2, 4], [1, 3, 5], [2, 4, 6], [0, 2, 5]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'wood', rhythm: 'broken',
    })
    static readonly NULLLIBRARY = new LocationMusicTheme({
        key: 'nulllibrary', name: '지워진 색인의 침묵', mapColor: '#4d4d59', bpm: 54, root: 'D3', rootMidi: 50,
        scale: MusicScale.LOCRIAN, phraseDegrees: { motifA: [0, null, 1, 2, null, 3, 2, 1], responseA: [2, null, 3, 4, null, 2, 1, 0], motifB: [4, null, 3, 2, 1, null, 0, -1], cadence: [0, 1, 1, 2, 4, 0, 0] },
        chords: [[0, 2, 4], [1, 3, 5], [4, 6, 8], [0, 4, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'dark', rhythm: 'broken',
    })
    static readonly ORIGINBOUNDARY = new LocationMusicTheme({
        key: 'originboundary', name: '기원과 종언의 경계', mapColor: '#625a76', bpm: 96, root: 'A2', rootMidi: 45,
        scale: MusicScale.DOUBLE_HARMONIC_MAJOR, phraseDegrees: { motifA: [0, 1, 2, 3, 4, 5, 6, 7], responseA: [7, 6, 5, 4, 3, 2, 1, 0], motifB: [0, 2, 1, 3, 2, 4, 3, 5], cadence: [0, 1, 1, 2, 4, -1, 0] },
        chords: [[0, 2, 4], [1, 3, 5], [4, 6, 8], [0, 3, 6]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'cosmic', rhythm: 'steady',
    })

    private constructor(input: LocationMusicThemeInput) {
        this.key = input.key
        this.name = input.name
        this.mapColor = input.mapColor.toLowerCase()
        this.bpm = input.bpm
        this.root = input.root
        this.rootMidi = input.rootMidi
        this.scale = input.scale
        this.meter = input.meter ?? MusicMeter.COMMON
        this.phrases = defineMusicPhraseBook(this.meter, input.rhythm, input.phraseDegrees)
        this.chords = Object.freeze(input.chords.map(chord => Object.freeze([...chord])))
        this.register = Object.freeze({ ...input.register })
        this.timbre = input.timbre
        this.rhythm = input.rhythm
        this.brightExploration = input.brightExploration ?? false
        LocationMusicTheme.all.push(this)
        Object.freeze(this)
    }

    static values(): readonly LocationMusicTheme[] { return [...LocationMusicTheme.all] }
    static fromKey(key: unknown): LocationMusicTheme | undefined {
        return typeof key === 'string'
            ? LocationMusicTheme.all.find(theme => theme.key === key.trim().toLowerCase())
            : undefined
    }
    static fromInput(input: string): LocationMusicTheme | undefined {
        const normalized = input.trim().toLocaleLowerCase('ko-KR')
        return LocationMusicTheme.all.find(theme => theme.key === normalized
            || theme.name.toLocaleLowerCase('ko-KR') === normalized)
    }
    static fromMapColor(mapColor: unknown): LocationMusicTheme | undefined {
        return typeof mapColor === 'string'
            ? LocationMusicTheme.all.find(theme => theme.mapColor === mapColor.trim().toLowerCase())
            : undefined
    }
}

export function getExplorationMixProfile(theme: LocationMusicTheme): Readonly<ExplorationMixProfile> {
    return theme.brightExploration ? BRIGHT_EXPLORATION_MIX : STANDARD_EXPLORATION_MIX
}

export function getLocationMusicThemeByColor(mapColor: unknown): LocationMusicTheme | undefined {
    return LocationMusicTheme.fromMapColor(mapColor)
}

export function getLocationMusicThemeOrFallback(themeKey: unknown): LocationMusicTheme {
    return LocationMusicTheme.fromKey(themeKey) ?? LocationMusicTheme.LUMINAR
}

/** 표시명이나 좌표 변경에 흔들리지 않는 FNV-1a 기반 장소 seed. */
export function createLocationMusicSeed(themeKey: string, locationId: string): number {
    let hash = 0x811c9dc5
    const input = `${themeKey}:${locationId}`
    for (let index = 0; index < input.length; index++) {
        hash ^= input.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
    }
    return hash >>> 0
}

export function scaleDegreeToMidi(rootMidi: number, scale: MusicScale, degree: number): number {
    const size = scale.intervals.length
    const octave = Math.floor(degree / size)
    const wrapped = ((degree % size) + size) % size
    return rootMidi + octave * 12 + scale.intervals[wrapped]
}

function nextSeed(seed: number): number {
    let value = seed >>> 0
    value ^= value << 13
    value ^= value >>> 17
    value ^= value << 5
    return value >>> 0
}

function clampMidi(value: number): number {
    let normalized = Math.round(value)
    while (normalized < 24) normalized += 12
    while (normalized > 103) normalized -= 12
    return normalized
}

function shiftMidiGroupIntoRange(
    values: readonly number[],
    minimum: number,
    maximum = 103,
): number[] {
    if (values.length === 0) return []
    let shift = 0
    const lowest = Math.min(...values)
    const highest = Math.max(...values)
    while (lowest + shift < minimum) shift += 12
    while (highest + shift > maximum && lowest + shift - 12 >= minimum) shift -= 12
    return values.map(value => shiftMidiIntoRange(clampMidi(value + shift), minimum, maximum))
}

function shiftMidiIntoRange(value: number, minimum: number, maximum: number): number {
    let shifted = value
    while (shifted < minimum) shifted += 12
    while (shifted > maximum) shifted -= 12
    return shifted
}

export type MusicFormSectionKey = 'A' | 'A-prime' | 'B' | 'A-return'

export interface LocationMusicArrangement {
    readonly theme: LocationMusicTheme
    readonly locationId: string
    readonly seed: number
    readonly bpm: number
    readonly meter: MusicMeter
    readonly loopMeasures: number
    readonly loopSixteenths: number
    readonly loopTicks: number
    readonly rhythmPhase: number
    readonly motifMidi: readonly (number | null)[]
    readonly motifAccents: readonly boolean[]
    readonly counterMidi: readonly (number | null)[]
    readonly chordMidi: readonly (readonly number[])[]
    readonly bassMidi: readonly number[]
    readonly explorationLeadSchedule: readonly ExplorationLeadScheduleEvent[]
    readonly explorationChordSchedule: readonly ExplorationChordScheduleEvent[]
    readonly melodySignature: string
    readonly arrangementSignature: string
}

export interface ExplorationLeadScheduleEvent {
    readonly stepSixteenths: number
    readonly note: number | null
    readonly durationSixteenths: number
    readonly accent: boolean
    readonly section: MusicFormSectionKey
    readonly phrase: MusicPhraseKey
    readonly hook: boolean
}

export interface ExplorationChordScheduleEvent {
    readonly stepSixteenths: number
    readonly notes: readonly number[]
    readonly bassNote: number
    readonly durationSixteenths: number
    readonly velocity: number
}

interface PhrasePlacement {
    readonly section: MusicFormSectionKey
    readonly phrase: MusicPhraseKey
    readonly transposeDegrees?: number
}

function createPhraseForm(seed: number): readonly PhrasePlacement[] {
    const bridgeForms: readonly (readonly MusicPhraseKey[])[] = [
        ['motifB', 'responseA', 'motifB', 'cadence'],
        ['motifB', 'motifB', 'responseA', 'cadence'],
        ['motifB', 'responseA', 'responseA', 'cadence'],
        ['motifB', 'motifB', 'motifB', 'cadence'],
    ]
    const bridge = bridgeForms[(seed >>> 4) % bridgeForms.length]
    const bridgeShift = ([-1, 0, 1] as const)[(seed >>> 11) % 3]
    return Object.freeze([
        ...(['motifA', 'responseA', 'motifA', 'responseA'] as const)
            .map(phrase => Object.freeze({ section: 'A' as const, phrase })),
        ...(['motifA', 'responseA', 'motifA', 'cadence'] as const)
            .map(phrase => Object.freeze({ section: 'A-prime' as const, phrase })),
        ...bridge.map((phrase, index) => Object.freeze({
            section: 'B' as const,
            phrase,
            transposeDegrees: phrase === 'motifB' && index > 0 ? bridgeShift : 0,
        })),
        ...(['motifA', 'responseA', 'motifA', 'cadence'] as const)
            .map(phrase => Object.freeze({ section: 'A-return' as const, phrase })),
    ])
}

function resolveThemeLeadShift(theme: LocationMusicTheme): number {
    const degrees = (Object.values(theme.phrases) as MusicPhraseCell[])
        .flatMap(cell => cell.tokens)
        .flatMap(token => token.degree === null ? [] : [token.degree - 1, token.degree, token.degree + 1])
    const values = degrees.map(degree => scaleDegreeToMidi(
        theme.rootMidi + theme.register.leadOctave * 12,
        theme.scale,
        degree,
    ))
    let shift = 0
    while (Math.min(...values) + shift < EXPLORATION_MELODY_MIN_MIDI) shift += 12
    while (Math.max(...values) + shift > EXPLORATION_MELODY_MAX_MIDI
        && Math.min(...values) + shift - 12 >= EXPLORATION_MELODY_MIN_MIDI) shift -= 12
    return shift
}

function createChordVoicingCandidates(chord: readonly number[]): readonly (readonly number[])[] {
    const candidates = new Map<string, readonly number[]>()
    for (let inversion = 0; inversion < chord.length; inversion++) {
        const voiced = [...chord.slice(inversion), ...chord.slice(0, inversion).map(note => note + 12)]
        const closed = shiftMidiGroupIntoRange(voiced, EXPLORATION_HARMONY_MIN_MIDI, EXPLORATION_HARMONY_MAX_MIDI)
        candidates.set(closed.join(','), Object.freeze(closed))
        const opened = [...closed]
        if (opened[opened.length - 1] + 12 <= EXPLORATION_HARMONY_MAX_MIDI) {
            opened[opened.length - 1] += 12
            candidates.set(opened.join(','), Object.freeze(opened))
        }
    }
    return Object.freeze([...candidates.values()])
}

function voiceLeadingCost(left: readonly number[] | undefined, right: readonly number[]): number {
    if (!left) return right.reduce((sum, note) => sum + Math.abs(note - 72), 0)
    return right.reduce((sum, note) => {
        const closest = Math.min(...left.map(previous => Math.abs(note - previous)))
        return sum + closest
    }, Math.abs(right.length - left.length) * 3)
}

const SECTION_CHORD_PROGRESSIONS: Readonly<Record<MusicFormSectionKey, readonly number[]>> = Object.freeze({
    A: Object.freeze([0, 1, 2, 3, 0, 1, 3, 0]),
    'A-prime': Object.freeze([0, 2, 1, 3, 0, 2, 3, 0]),
    B: Object.freeze([2, 3, 1, 2, 3, 1, 2, 0]),
    'A-return': Object.freeze([0, 1, 2, 3, 0, 2, 1, 0]),
})

function samePitchClass(left: number, right: number): boolean {
    return ((left - right) % 12 + 12) % 12 === 0
}

function addChordTonesForLead(
    chord: readonly number[],
    strongLead: number | undefined,
    leadNotes: readonly number[],
): readonly number[] {
    const result = [...chord]
    const orderedLeadNotes = [
        ...(strongLead === undefined ? [] : [strongLead]),
        ...leadNotes,
    ]
    for (const leadNote of orderedLeadNotes) {
        if (result.length >= 4) break
        if (result.some(note => samePitchClass(note, leadNote))) continue
        const pitchClass = ((leadNote % 12) + 12) % 12
        const candidates: number[] = []
        for (let note = EXPLORATION_HARMONY_MIN_MIDI; note <= EXPLORATION_HARMONY_MAX_MIDI; note++) {
            if (note % 12 === pitchClass) candidates.push(note)
        }
        const added = candidates.sort((left, right) => Math.abs(left - 72) - Math.abs(right - 72))[0]
        result.push(added)
    }
    return Object.freeze(result.sort((left, right) => left - right))
}

/** 서버 mapColor 경계와 클라이언트 작곡기를 잇는 안전한 단일 진입점. */
export function composeLocationScore(locationId: string, mapColor: unknown): LocationMusicArrangement {
    const theme = getLocationMusicThemeByColor(mapColor) ?? LocationMusicTheme.LUMINAR
    return resolveLocationMusicArrangement(theme.key, locationId)
}

/** 같은 권역의 고정 훅을 보존하면서 장소별 32마디 B구간·화음 voicing·대선율을 결정한다. */
export function resolveLocationMusicArrangement(themeKey: unknown, locationId: string): LocationMusicArrangement {
    const theme = getLocationMusicThemeOrFallback(themeKey)
    const safeLocationId = locationId.trim() || 'unknown-location'
    const seed = createLocationMusicSeed(theme.key, safeLocationId)
    const rhythmPhase = (seed >>> 13) % 8
    const loopSixteenths = theme.meter.sixteenthsPerMeasure * EXPLORATION_LOOP_MEASURES
    const loopTicks = loopSixteenths * MUSIC_TICKS_PER_SIXTEENTH
    const phraseForm = createPhraseForm(seed)
    const phraseLength = theme.meter.sixteenthsPerMeasure * 2
    const leadShift = resolveThemeLeadShift(theme)
    const motifMidi: (number | null)[] = []
    const motifAccents: boolean[] = []
    const counterMidi: (number | null)[] = []
    const explorationLeadSchedule: ExplorationLeadScheduleEvent[] = []
    for (let placementIndex = 0; placementIndex < phraseForm.length; placementIndex++) {
        const placement = phraseForm[placementIndex]
        const phrase = theme.phrases[placement.phrase]
        const phraseStart = placementIndex * phraseLength
        phrase.tokens.forEach((token, tokenIndex) => {
            const isCadenceEnd = placement.phrase === 'cadence'
                && tokenIndex === phrase.tokens.length - 1
            const degree = token.degree === null
                ? null
                : isCadenceEnd ? 0 : token.degree + (placement.transposeDegrees ?? 0)
            const note = degree === null
                ? null
                : scaleDegreeToMidi(
                    theme.rootMidi + theme.register.leadOctave * 12 + leadShift,
                    theme.scale,
                    degree,
                )
            const stepSixteenths = phraseStart + token.onsetSixteenths
            const hook = placement.phrase === 'motifA'
            const accent = note !== null && (
                tokenIndex === 0
                || stepSixteenths % theme.meter.sixteenthsPerMeasure === 0
                || isCadenceEnd
            )
            motifMidi.push(note)
            motifAccents.push(accent)
            const counterDegree = degree === null || hook || tokenIndex % 2 !== 0
                ? null
                : degree + (placement.section === 'B' ? -2 : 2)
            counterMidi.push(counterDegree === null
                ? null
                : shiftMidiIntoRange(scaleDegreeToMidi(
                    theme.rootMidi + theme.register.leadOctave * 12 + leadShift,
                    theme.scale,
                    counterDegree,
                ), EXPLORATION_MELODY_MIN_MIDI, EXPLORATION_MELODY_MAX_MIDI))
            explorationLeadSchedule.push(Object.freeze({
                stepSixteenths,
                note,
                durationSixteenths: token.durationSixteenths,
                accent,
                section: placement.section,
                phrase: placement.phrase,
                hook,
            }))
        })
    }

    const rawChordMidi = theme.chords.map(chord => {
        return chord.map(degree => clampMidi(scaleDegreeToMidi(
            theme.rootMidi + theme.register.padOctave * 12,
            theme.scale,
            degree,
        )))
    })
    const chordMidi = rawChordMidi.map(chord => shiftMidiGroupIntoRange(
        chord,
        EXPLORATION_HARMONY_MIN_MIDI,
        EXPLORATION_HARMONY_MAX_MIDI,
    ))
    const bassMidi = theme.chords.map(chord => {
        return clampMidi(scaleDegreeToMidi(
            theme.rootMidi + theme.register.bassOctave * 12,
            theme.scale,
            chord[0],
        ))
    })
    const bpm = Math.min(180, Math.max(40, theme.bpm + ((seed >>> 25) % 3) - 1))
    const rhythmProfile = getExplorationRhythmProfile(theme.rhythm)
    const measureSixteenths = theme.meter.sixteenthsPerMeasure
    const explorationChordSchedule: ExplorationChordScheduleEvent[] = []
    let voicingSeed = seed ^ 0x9e37_79b9
    let previousVoicing: readonly number[] | undefined
    for (let measureIndex = 0; measureIndex < EXPLORATION_LOOP_MEASURES; measureIndex++) {
        const placementIndex = Math.floor(measureIndex / 2)
        const placement = phraseForm[placementIndex]
        const measureInSection = measureIndex % 8
        const measureStart = measureIndex * measureSixteenths
        const measureEnd = measureStart + measureSixteenths
        const cadenceTonic = placement.phrase === 'cadence' && measureIndex % 2 === 1
        const preferredIndex = cadenceTonic
            ? 0
            : SECTION_CHORD_PROGRESSIONS[placement.section][measureInSection] % chordMidi.length
        const leadInMeasure = explorationLeadSchedule.filter(event => (
            event.note !== null
            && event.stepSixteenths < measureEnd
            && event.stepSixteenths + event.durationSixteenths > measureStart
        ))
        const strongLead = leadInMeasure.find(event => (
            event.stepSixteenths <= measureStart
            && event.stepSixteenths + event.durationSixteenths > measureStart
        ))?.note ?? undefined
        const sourceIndex = cadenceTonic ? 0 : chordMidi
            .map((chord, index) => {
                const coveredDuration = leadInMeasure.reduce((sum, event) => {
                    if (!chord.some(note => samePitchClass(note, event.note!))) return sum
                    const overlapStart = Math.max(measureStart, event.stepSixteenths)
                    const overlapEnd = Math.min(measureEnd, event.stepSixteenths + event.durationSixteenths)
                    return sum + Math.max(0, overlapEnd - overlapStart)
                }, 0)
                const containsStrongLead = strongLead !== undefined
                    && chord.some(note => samePitchClass(note, strongLead))
                return {
                    index,
                    score: coveredDuration * 8
                        + (containsStrongLead ? 72 : 0)
                        + (index === preferredIndex ? 28 : 0),
                }
            })
            .sort((left, right) => right.score - left.score || left.index - right.index)[0].index
        const harmonizedChord = addChordTonesForLead(
            chordMidi[sourceIndex],
            strongLead,
            leadInMeasure.map(event => event.note!),
        )
        voicingSeed = nextSeed(voicingSeed)
        const candidates = createChordVoicingCandidates(harmonizedChord)
            .map(notes => ({ notes, cost: voiceLeadingCost(previousVoicing, notes) }))
            .sort((left, right) => left.cost - right.cost || left.notes.join(',').localeCompare(right.notes.join(',')))
        const choicePool = candidates.slice(0, Math.min(2, candidates.length))
        const notes = choicePool[voicingSeed % choicePool.length].notes
        previousVoicing = notes
        explorationChordSchedule.push(Object.freeze({
            stepSixteenths: measureStart,
            notes: Object.freeze([...notes]),
            bassNote: bassMidi[sourceIndex],
            durationSixteenths: measureSixteenths,
            velocity: rhythmProfile.chordVelocities[measureIndex % rhythmProfile.chordVelocities.length]
                * (placement.section === 'B' ? 0.94 : 1),
        }))
    }
    const melodySignature = explorationLeadSchedule
        .map(event => `${event.stepSixteenths}:${event.note ?? 'r'}:${event.durationSixteenths}`)
        .join(',')
    const arrangementSignature = [
        melodySignature,
        explorationChordSchedule.map(event => `${event.stepSixteenths}:${event.notes.join('.')}`).join(','),
        `bpm:${bpm}`,
    ].join('|')

    return Object.freeze({
        theme,
        locationId: safeLocationId,
        seed,
        bpm,
        meter: theme.meter,
        loopMeasures: EXPLORATION_LOOP_MEASURES,
        loopSixteenths,
        loopTicks,
        rhythmPhase,
        motifMidi: Object.freeze(motifMidi),
        motifAccents: Object.freeze(motifAccents),
        counterMidi: Object.freeze(counterMidi),
        chordMidi: Object.freeze(chordMidi.map(chord => Object.freeze(chord))),
        bassMidi: Object.freeze(bassMidi),
        explorationLeadSchedule: Object.freeze(explorationLeadSchedule),
        explorationChordSchedule: Object.freeze(explorationChordSchedule),
        melodySignature,
        arrangementSignature,
    })
}
