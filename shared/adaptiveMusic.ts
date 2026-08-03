export const MUSIC_VOLUME_STORAGE_KEY = 'daclion:adaptive-music-volume'
export const DEFAULT_MUSIC_VOLUME = 35
export const EXPLORATION_MELODY_MIN_MIDI = 67
export const EXPLORATION_MELODY_MAX_MIDI = 96
export const EXPLORATION_HARMONY_MIN_MIDI = 60
export const EXPLORATION_HARMONY_MAX_MIDI = 84
export const MUSIC_THEME_MOTIF_STEPS = 16

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

export const EXPLORATION_LOOP_MEASURES = 4
export const MUSIC_SCENE_TRANSITION = Object.freeze({
    quantize: '4n' as const,
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
export type MusicNoteLength = '16n' | '8n' | '8n.' | '4n' | '4n.'
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
    /** 두 마디 안에서 16개 motif slot이 시작되는 16분음표 위치. */
    readonly leadStepSixteenths: readonly number[]
    readonly leadNoteLengths: readonly MusicNoteLength[]
    readonly chordStepSixteenths: readonly number[]
    readonly chordNoteLengths: readonly MusicNoteLength[]
    readonly chordVelocities: readonly number[]
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
        leadStepSixteenths: Object.freeze([...profile.leadStepSixteenths]),
        leadNoteLengths: Object.freeze([...profile.leadNoteLengths]),
        chordStepSixteenths: Object.freeze([...profile.chordStepSixteenths]),
        chordNoteLengths: Object.freeze([...profile.chordNoteLengths]),
        chordVelocities: Object.freeze([...profile.chordVelocities]),
    })
}

const EXPLORATION_RHYTHM_PROFILES: Readonly<Record<MusicRhythmKey, Readonly<ExplorationRhythmProfile>>> = Object.freeze({
    steady: defineRhythmProfile({
        leadStepSixteenths: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30],
        leadNoteLengths: ['8n', '8n', '8n', '8n', '8n', '8n', '8n', '4n', '8n', '8n', '8n', '8n', '8n', '8n', '8n', '4n'],
        chordStepSixteenths: [0, 8, 16, 24],
        chordNoteLengths: ['4n', '4n', '4n', '4n'],
        chordVelocities: [0.27, 0.23, 0.25, 0.22],
    }),
    waltz: defineRhythmProfile({
        leadStepSixteenths: [0, 3, 5, 7, 8, 11, 13, 15, 16, 19, 21, 23, 24, 27, 29, 31],
        leadNoteLengths: ['8n.', '16n', '8n', '16n', '8n.', '16n', '8n', '16n', '8n.', '16n', '8n', '16n', '8n.', '16n', '8n', '16n'],
        chordStepSixteenths: [0, 6, 16, 22],
        chordNoteLengths: ['4n.', '8n', '4n.', '8n'],
        chordVelocities: [0.29, 0.19, 0.27, 0.18],
    }),
    syncopated: defineRhythmProfile({
        leadStepSixteenths: [0, 3, 4, 7, 8, 11, 12, 15, 16, 19, 20, 23, 24, 27, 28, 31],
        leadNoteLengths: ['16n', '8n', '16n', '8n', '16n', '8n', '16n', '8n', '16n', '8n', '16n', '8n', '16n', '8n', '16n', '8n'],
        chordStepSixteenths: [0, 7, 16, 23],
        chordNoteLengths: ['8n', '4n', '8n', '4n'],
        chordVelocities: [0.24, 0.3, 0.22, 0.28],
    }),
    march: defineRhythmProfile({
        leadStepSixteenths: [0, 2, 4, 6, 8, 10, 12, 15, 16, 18, 20, 22, 24, 26, 28, 31],
        leadNoteLengths: ['8n', '16n', '8n', '16n', '8n', '16n', '8n', '4n', '8n', '16n', '8n', '16n', '8n', '16n', '8n', '4n'],
        chordStepSixteenths: [0, 8, 16, 25],
        chordNoteLengths: ['4n', '8n', '4n', '8n'],
        chordVelocities: [0.31, 0.2, 0.29, 0.2],
    }),
    pulse: defineRhythmProfile({
        leadStepSixteenths: [0, 1, 4, 5, 8, 9, 12, 13, 16, 17, 20, 21, 24, 25, 28, 29],
        leadNoteLengths: ['16n', '16n', '8n', '16n', '16n', '16n', '8n', '16n', '16n', '16n', '8n', '16n', '16n', '16n', '8n', '16n'],
        chordStepSixteenths: [0, 4, 16, 20],
        chordNoteLengths: ['8n', '8n', '8n', '8n'],
        chordVelocities: [0.3, 0.18, 0.28, 0.18],
    }),
    broken: defineRhythmProfile({
        leadStepSixteenths: [0, 3, 5, 7, 9, 12, 14, 15, 16, 19, 21, 23, 25, 28, 30, 31],
        leadNoteLengths: ['16n', '8n.', '16n', '8n', '16n', '8n.', '16n', '16n', '16n', '8n.', '16n', '8n', '16n', '8n.', '16n', '16n'],
        chordStepSixteenths: [0, 10, 16, 27],
        chordNoteLengths: ['8n', '8n.', '8n', '8n.'],
        chordVelocities: [0.22, 0.27, 0.2, 0.25],
    }),
    swing: defineRhythmProfile({
        leadStepSixteenths: [0, 3, 4, 7, 8, 11, 12, 14, 16, 19, 20, 23, 24, 27, 28, 30],
        leadNoteLengths: ['8n.', '16n', '8n.', '16n', '8n.', '16n', '8n', '16n', '8n.', '16n', '8n.', '16n', '8n.', '16n', '8n', '16n'],
        chordStepSixteenths: [0, 7, 16, 22],
        chordNoteLengths: ['8n.', '16n', '8n.', '16n'],
        chordVelocities: [0.26, 0.2, 0.25, 0.19],
    }),
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
    readonly motif: readonly (number | null)[]
    readonly chords: readonly (readonly number[])[]
    readonly register: MusicRegister
    readonly timbre: MusicTimbreKey
    readonly rhythm: MusicRhythmKey
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
    readonly motif: readonly (number | null)[]
    readonly chords: readonly (readonly number[])[]
    readonly register: Readonly<MusicRegister>
    readonly timbre: MusicTimbreKey
    readonly rhythm: MusicRhythmKey
    readonly brightExploration: boolean

    static readonly LUMINAR = new LocationMusicTheme({
        key: 'luminar', name: '개척의 별등불', mapColor: '#d6a85f', bpm: 96, root: 'G3', rootMidi: 55,
        scale: MusicScale.IONIAN, motif: [0, 2, 4, 7, null, 6, 4, 2, 3, 5, 8, 7, 5, 4, 2, 0],
        chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [0, 2, 4]], register: { bassOctave: -2, padOctave: 1, leadOctave: 2 }, timbre: 'warm', rhythm: 'steady', brightExploration: true,
    })
    static readonly LUMINOUS_POND = new LocationMusicTheme({
        key: 'luminous-pond', name: '물빛의 한가로운 파문', mapColor: '#63a9bf', bpm: 78, root: 'D3', rootMidi: 50,
        scale: MusicScale.MAJOR_PENTATONIC, motif: [0, null, 2, 1, null, 3, 2, null, 4, 2, null, 1, 2, null, 0, null],
        chords: [[0, 2, 3], [4, 5, 7], [1, 3, 5], [3, 5, 7]], register: { bassOctave: -1, padOctave: 1, leadOctave: 2 }, timbre: 'water', rhythm: 'waltz', brightExploration: true,
    })
    static readonly MEADOW = new LocationMusicTheme({
        key: 'meadow', name: '첫 바람의 길', mapColor: '#6fa85d', bpm: 108, root: 'C3', rootMidi: 48,
        scale: MusicScale.IONIAN, motif: [0, 2, null, 4, 2, 5, null, 3, 1, 3, 5, null, 4, 2, 1, 0],
        chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]], register: { bassOctave: -1, padOctave: 1, leadOctave: 2 }, timbre: 'wood', rhythm: 'steady', brightExploration: true,
    })
    static readonly SILVERWEB = new LocationMusicTheme({
        key: 'silverweb', name: '은실 아래의 사냥', mapColor: '#4f7857', bpm: 94, root: 'E3', rootMidi: 52,
        scale: MusicScale.MIXOLYDIAN, motif: [0, null, 3, 2, 5, null, 1, 4, null, 6, 3, null, 2, 5, 1, null],
        chords: [[0, 2, 4], [6, 8, 10], [3, 5, 7], [0, 2, 4]], register: { bassOctave: -2, padOctave: 1, leadOctave: 2 }, timbre: 'wood', rhythm: 'syncopated', brightExploration: true,
    })
    static readonly SWAMP = new LocationMusicTheme({
        key: 'swamp', name: '잠든 포자의 숨', mapColor: '#66784f', bpm: 70, root: 'D3', rootMidi: 50,
        scale: MusicScale.PHRYGIAN, motif: [0, 1, null, 0, -1, null, 2, 1, null, 3, 0, null, -1, 1, 0, null],
        chords: [[0, 2, 4], [1, 3, 5], [0, 3, 5], [1, 4, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'dark', rhythm: 'broken',
    })
    static readonly EMBER = new LocationMusicTheme({
        key: 'ember', name: '칼데라의 맥박', mapColor: '#bb6542', bpm: 126, root: 'E3', rootMidi: 52,
        scale: MusicScale.PHRYGIAN_DOMINANT, motif: [0, 1, 4, 1, 0, null, 5, 4, 1, 0, 6, 5, 4, null, 1, 0],
        chords: [[0, 2, 4], [1, 3, 5], [4, 6, 8], [0, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'metal', rhythm: 'pulse',
    })
    static readonly FEVERIC_MINE = new LocationMusicTheme({
        key: 'feveric-mine', name: '수정 곡괭이의 메아리', mapColor: '#716558', bpm: 88, root: 'A2', rootMidi: 45,
        scale: MusicScale.MINOR_PENTATONIC, motif: [0, null, 0, 3, 0, null, 4, 3, 0, 2, 0, null, 5, 3, 2, 0],
        chords: [[0, 2, 4], [1, 3, 5], [0, 3, 5], [2, 4, 6]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'metal', rhythm: 'march',
    })
    static readonly TEMPEST = new LocationMusicTheme({
        key: 'tempest', name: '낙뢰능선 질주', mapColor: '#60758a', bpm: 132, root: 'F#3', rootMidi: 54,
        scale: MusicScale.DORIAN, motif: [0, 4, 7, null, 2, 6, 9, null, 5, 1, 6, null, 8, 4, 2, 7],
        chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [1, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'air', rhythm: 'syncopated',
    })
    static readonly NIGHTWOOD = new LocationMusicTheme({
        key: 'nightwood', name: '달 없는 심재', mapColor: '#3d4845', bpm: 76, root: 'C#3', rootMidi: 49,
        scale: MusicScale.AEOLIAN, motif: [7, 5, 4, 2, null, 3, 1, 0, 5, null, 2, 1, -1, null, 0, null],
        chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [0, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'dark', rhythm: 'broken',
    })
    static readonly DAWN_SANCTUM = new LocationMusicTheme({
        key: 'dawn-sanctum', name: '광륜의 새벽', mapColor: '#ddd19a', bpm: 90, root: 'D3', rootMidi: 50,
        scale: MusicScale.LYDIAN, motif: [0, null, 1, 3, 4, null, 6, 8, 7, 6, null, 4, 3, 1, 0, 2],
        chords: [[0, 2, 4], [1, 3, 5], [4, 6, 8], [0, 2, 4]], register: { bassOctave: -1, padOctave: 1, leadOctave: 2 }, timbre: 'holy', rhythm: 'steady', brightExploration: true,
    })
    static readonly NECROPOLIS = new LocationMusicTheme({
        key: 'necropolis', name: '불멸의 장송', mapColor: '#585365', bpm: 64, root: 'B2', rootMidi: 47,
        scale: MusicScale.HARMONIC_MINOR, motif: [7, null, 5, null, 4, 3, null, 1, 0, null, -1, null, 1, 0, null, null],
        chords: [[0, 2, 4], [5, 7, 9], [4, 6, 8], [0, 3, 6]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'dark', rhythm: 'march',
    })
    static readonly IRONROOT = new LocationMusicTheme({
        key: 'ironroot', name: '매몰된 철근', mapColor: '#75644f', bpm: 92, root: 'E3', rootMidi: 52,
        scale: MusicScale.LOCRIAN, motif: [0, 4, null, 1, 5, 2, null, 6, 3, 0, 4, null, 2, -1, 1, null],
        chords: [[0, 2, 4], [1, 3, 5], [3, 5, 7], [0, 4, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'metal', rhythm: 'broken',
    })
    static readonly ASTRAL_RIFT = new LocationMusicTheme({
        key: 'astral-rift', name: '일식 너머의 문', mapColor: '#66577f', bpm: 116, root: 'F3', rootMidi: 53,
        scale: MusicScale.LYDIAN, motif: [0, 6, 2, 9, 4, null, 7, 1, 8, 3, null, 10, 6, 2, 5, null],
        chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [1, 4, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'cosmic', rhythm: 'syncopated',
    })
    static readonly TWILIGHT_TOMB = new LocationMusicTheme({
        key: 'twilight-tomb', name: '마지막 등불 행렬', mapColor: '#655f73', bpm: 68, root: 'C3', rootMidi: 48,
        scale: MusicScale.AEOLIAN, motif: [5, 5, 4, null, 3, 3, 2, null, 1, 1, 0, null, -1, 0, null, null],
        chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [0, 3, 5]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'holy', rhythm: 'march',
    })
    static readonly GLASSDUNE = new LocationMusicTheme({
        key: 'glassdune', name: '유리사막의 신기루', mapColor: '#756344', bpm: 112, root: 'D3', rootMidi: 50,
        scale: MusicScale.HARMONIC_MINOR, motif: [0, 1, 4, 3, 5, 4, 1, null, 6, 5, 2, 3, 1, 0, 4, null],
        chords: [[0, 2, 4], [1, 3, 5], [4, 6, 8], [0, 3, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'warm', rhythm: 'swing',
    })
    static readonly FROSTVEIL = new LocationMusicTheme({
        key: 'frostveil', name: '빙경의 숨결', mapColor: '#536773', bpm: 84, root: 'A2', rootMidi: 45,
        scale: MusicScale.DORIAN, motif: [0, null, 4, null, 2, 5, null, 2, 7, null, 5, null, 3, 1, 0, null],
        chords: [[0, 2, 4], [3, 5, 7], [1, 3, 5], [0, 3, 5]], register: { bassOctave: -1, padOctave: 0, leadOctave: 2 }, timbre: 'water', rhythm: 'steady',
    })
    static readonly MISTTIDE = new LocationMusicTheme({
        key: 'misttide', name: '안개조류의 귀향', mapColor: '#42666a', bpm: 100, root: 'E3', rootMidi: 52,
        scale: MusicScale.MIXOLYDIAN, motif: [0, 1, 3, 6, 3, 1, null, 2, 4, 7, 4, 2, null, 1, 0, null],
        chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [0, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'water', rhythm: 'waltz',
    })
    static readonly PARADOX = new LocationMusicTheme({
        key: 'paradox', name: '멈춘 톱니의 역설', mapColor: '#5b5264', bpm: 120, root: 'F#3', rootMidi: 54,
        scale: MusicScale.HARMONIC_MINOR, motif: [0, 4, 1, 6, 2, 7, 3, null, 3, 7, 2, 6, 1, 4, 0, null],
        chords: [[0, 2, 4], [4, 6, 8], [5, 7, 9], [0, 3, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'metal', rhythm: 'pulse',
    })
    static readonly ASHEN_ABYSS = new LocationMusicTheme({
        key: 'ashen-abyss', name: '흑염의 진군', mapColor: '#563b42', bpm: 108, root: 'C3', rootMidi: 48,
        scale: MusicScale.PHRYGIAN, motif: [0, 0, 4, 3, 1, 1, 5, 4, 2, 2, 6, 5, 3, 1, 0, 0],
        chords: [[0, 2, 4], [1, 3, 5], [5, 7, 9], [0, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'dark', rhythm: 'march',
    })
    static readonly VOIDCROWN = new LocationMusicTheme({
        key: 'voidcrown', name: '빈 왕관의 성벽', mapColor: '#44455b', bpm: 96, root: 'G2', rootMidi: 43,
        scale: MusicScale.AEOLIAN, motif: [0, null, 4, 0, null, 6, 1, null, 5, null, 2, 7, null, 3, 0, null],
        chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [0, 3, 5]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'dark', rhythm: 'pulse',
    })
    static readonly LUNARIS_TRENCH = new LocationMusicTheme({
        key: 'lunaris-trench', name: '백야 아래의 심해성가', mapColor: '#304452', bpm: 62, root: 'C#3', rootMidi: 49,
        scale: MusicScale.LOCRIAN, motif: [6, null, 4, 3, null, 1, 0, -1, null, 2, 1, null, -2, 0, null, null],
        chords: [[0, 2, 4], [1, 3, 5], [4, 6, 8], [0, 4, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'water', rhythm: 'broken',
    })
    static readonly WORLDROOT = new LocationMusicTheme({
        key: 'worldroot', name: '태초뿌리의 기억', mapColor: '#40513f', bpm: 88, root: 'D3', rootMidi: 50,
        scale: MusicScale.DORIAN, motif: [0, 2, 5, 2, null, 3, 6, 3, 1, null, 4, 7, 4, 2, null, 0],
        chords: [[0, 2, 4], [3, 5, 7], [1, 3, 5], [0, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'wood', rhythm: 'waltz',
    })
    static readonly NEBULA = new LocationMusicTheme({
        key: 'nebula', name: '사건지평의 왕관', mapColor: '#35434b', bpm: 110, root: 'A2', rootMidi: 45,
        scale: MusicScale.LYDIAN, motif: [0, 3, 6, 9, 7, 10, 8, null, 5, 8, 11, 9, 6, 4, 7, null],
        chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [1, 4, 6]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'cosmic', rhythm: 'syncopated',
    })
    static readonly CHRONOFROST = new LocationMusicTheme({
        key: 'chronofrost', name: '영시의 진자', mapColor: '#36454b', bpm: 80, root: 'E3', rootMidi: 52,
        scale: MusicScale.HARMONIC_MINOR, motif: [0, 5, 1, 4, 2, 3, 2, 4, 1, 5, 0, 6, -1, 5, 0, null],
        chords: [[0, 2, 4], [5, 7, 9], [4, 6, 8], [0, 3, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'water', rhythm: 'pulse',
    })
    static readonly ENDSTAR = new LocationMusicTheme({
        key: 'endstar', name: '최후성좌의 낙하', mapColor: '#493d49', bpm: 118, root: 'B2', rootMidi: 47,
        scale: MusicScale.PHRYGIAN, motif: [10, 7, 9, 5, 8, 4, 6, 2, 5, 1, 3, 0, 2, -1, 0, null],
        chords: [[0, 2, 4], [1, 3, 5], [5, 7, 9], [0, 3, 5]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'cosmic', rhythm: 'syncopated',
    })
    static readonly SKYGRAVE = new LocationMusicTheme({
        key: 'skygrave', name: '하늘묘지의 천장송', mapColor: '#45586a', bpm: 138, root: 'F#3', rootMidi: 54,
        scale: MusicScale.LYDIAN, motif: [0, null, 3, 6, null, 4, 7, 10, null, 8, 11, 9, 6, null, 3, 0],
        chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [1, 4, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 1 }, timbre: 'air', rhythm: 'syncopated',
    })
    static readonly ABYSSGLASS = new LocationMusicTheme({
        key: 'abyssglass', name: '만압의 수정해', mapColor: '#315869', bpm: 58, root: 'C3', rootMidi: 48,
        scale: MusicScale.DORIAN, motif: [0, null, null, 3, 1, null, 5, null, 2, null, null, 6, 4, null, 1, null],
        chords: [[0, 2, 4], [3, 5, 7], [1, 3, 5], [0, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'water', rhythm: 'broken',
    })
    static readonly DREAMARCHIVE = new LocationMusicTheme({
        key: 'dreamarchive', name: '꿈서고의 잉크잠', mapColor: '#5a4967', bpm: 72, root: 'Eb3', rootMidi: 51,
        scale: MusicScale.WHOLE_TONE, motif: [0, 2, 5, 1, 6, 3, null, 4, 0, 6, 2, 5, 1, null, 3, 7],
        chords: [[0, 2, 4], [1, 3, 5], [2, 4, 6], [0, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'cosmic', rhythm: 'broken',
    })
    static readonly THUNDERFORGE = new LocationMusicTheme({
        key: 'thunderforge', name: '천로의 번개망치', mapColor: '#6a5537', bpm: 144, root: 'E3', rootMidi: 52,
        scale: MusicScale.MIXOLYDIAN, motif: [0, 4, 0, 6, 0, 8, 0, null, 3, 7, 3, 9, 3, 6, 4, 0],
        chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [0, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'metal', rhythm: 'syncopated',
    })
    static readonly RUSTWORLD = new LocationMusicTheme({
        key: 'rustworld', name: '붉은 산화풍', mapColor: '#68483d', bpm: 104, root: 'F3', rootMidi: 53,
        scale: MusicScale.PHRYGIAN, motif: [5, 2, 0, 1, 4, 1, -1, 0, 3, 0, -2, 1, 5, 2, 0, null],
        chords: [[0, 2, 4], [1, 3, 5], [3, 5, 7], [0, 4, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'metal', rhythm: 'swing',
    })
    static readonly PALEECLIPSE = new LocationMusicTheme({
        key: 'paleeclipse', name: '흰그늘의 잔광', mapColor: '#69645b', bpm: 82, root: 'B2', rootMidi: 47,
        scale: MusicScale.LYDIAN, motif: [0, 3, null, 6, 4, null, 7, 5, null, 8, 6, null, 4, 2, null, 1],
        chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [1, 4, 6]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'holy', rhythm: 'broken',
    })
    static readonly CRIMSONGRAVITY = new LocationMusicTheme({
        key: 'crimsongravity', name: '홍중력의 낙하', mapColor: '#6a3d49', bpm: 76, root: 'C#3', rootMidi: 49,
        scale: MusicScale.HARMONIC_MINOR, motif: [9, 7, 4, null, 8, 5, 2, null, 6, 3, 1, null, 4, 2, 0, -1],
        chords: [[0, 2, 4], [5, 7, 9], [4, 6, 8], [0, 3, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'dark', rhythm: 'march',
    })
    static readonly SILENTDIVINE = new LocationMusicTheme({
        key: 'silentdivine', name: '무언림의 기도', mapColor: '#405b4c', bpm: 66, root: 'G2', rootMidi: 43,
        scale: MusicScale.MAJOR_PENTATONIC, motif: [0, null, null, 2, null, 4, null, null, 3, null, 1, null, 2, null, 0, null],
        chords: [[0, 2, 4], [1, 3, 5], [2, 4, 6], [0, 2, 5]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'wood', rhythm: 'broken',
    })
    static readonly NULLLIBRARY = new LocationMusicTheme({
        key: 'nulllibrary', name: '지워진 색인의 침묵', mapColor: '#4d4d59', bpm: 54, root: 'D3', rootMidi: 50,
        scale: MusicScale.LOCRIAN, motif: [0, null, 4, null, null, 1, 5, null, 2, null, null, 6, null, 3, null, null],
        chords: [[0, 2, 4], [1, 3, 5], [4, 6, 8], [0, 4, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'dark', rhythm: 'broken',
    })
    static readonly ORIGINBOUNDARY = new LocationMusicTheme({
        key: 'originboundary', name: '기원과 종언의 경계', mapColor: '#625a76', bpm: 96, root: 'A2', rootMidi: 45,
        scale: MusicScale.DOUBLE_HARMONIC_MAJOR, motif: [0, 1, 4, 5, 7, 8, 11, null, 11, 8, 7, 5, 4, 1, 0, -1],
        chords: [[0, 2, 4], [1, 3, 5], [4, 6, 8], [0, 3, 6]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'cosmic', rhythm: 'steady',
    })

    private constructor(input: LocationMusicThemeInput) {
        if (input.motif.length !== MUSIC_THEME_MOTIF_STEPS) {
            throw new Error(`지역 음악 motif는 ${MUSIC_THEME_MOTIF_STEPS} step이어야 합니다: ${input.key}`)
        }
        this.key = input.key
        this.name = input.name
        this.mapColor = input.mapColor.toLowerCase()
        this.bpm = input.bpm
        this.root = input.root
        this.rootMidi = input.rootMidi
        this.scale = input.scale
        this.motif = Object.freeze([...input.motif])
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

function reflectDegreeIntoRange(value: number, minimum: number, maximum: number): number {
    const span = maximum - minimum
    if (span <= 0) return minimum
    const period = span * 2
    const wrapped = ((value - minimum) % period + period) % period
    return minimum + (wrapped <= span ? wrapped : period - wrapped)
}

function varyMusicNoteLength(base: MusicNoteLength, random: number): MusicNoteLength {
    const variants: Readonly<Record<MusicNoteLength, readonly MusicNoteLength[]>> = {
        '16n': ['16n', '8n'],
        '8n': ['16n', '8n', '8n.'],
        '8n.': ['8n', '8n.', '4n'],
        '4n': ['8n.', '4n', '4n.'],
        '4n.': ['4n', '4n.'],
    }
    const choices = variants[base]
    return choices[random % choices.length]
}

function createLocationResponseOnsets(
    baseSteps: readonly number[],
    seed: number,
): readonly number[] {
    const steps: number[] = []
    let random = seed ^ 0x51ed_270b
    for (let index = 0; index < baseSteps.length; index++) {
        random = nextSeed(random)
        const base = baseSteps[index]
        const jitter = index % 4 === 0 ? 0 : [-1, 0, 1][(random >>> 6) % 3]
        const minimum = index === 0 ? 0 : steps[index - 1] + 1
        const nextBase = baseSteps[index + 1] ?? 32
        const maximum = Math.max(minimum, nextBase - 1)
        steps.push(Math.min(maximum, Math.max(minimum, base + jitter)))
    }
    return Object.freeze(steps)
}

export interface LocationMusicArrangement {
    readonly theme: LocationMusicTheme
    readonly locationId: string
    readonly seed: number
    readonly bpm: number
    readonly rhythmPhase: number
    readonly motifMidi: readonly (number | null)[]
    readonly motifAccents: readonly boolean[]
    readonly counterMidi: readonly (number | null)[]
    readonly chordMidi: readonly (readonly number[])[]
    readonly bassMidi: readonly number[]
    readonly explorationLeadSchedule: readonly ExplorationLeadScheduleEvent[]
    readonly explorationChordSchedule: readonly ExplorationChordScheduleEvent[]
    readonly melodySignature: string
}

export interface ExplorationLeadScheduleEvent {
    readonly stepSixteenths: number
    readonly note: number | null
    readonly duration: MusicNoteLength
    readonly accent: boolean
}

export interface ExplorationChordScheduleEvent {
    readonly stepSixteenths: number
    readonly notes: readonly number[]
    readonly duration: MusicNoteLength
    readonly velocity: number
}

/** 서버 mapColor 경계와 클라이언트 작곡기를 잇는 안전한 단일 진입점. */
export function composeLocationScore(locationId: string, mapColor: unknown): LocationMusicArrangement {
    const theme = getLocationMusicThemeByColor(mapColor) ?? LocationMusicTheme.LUMINAR
    return resolveLocationMusicArrangement(theme.key, locationId)
}

/** 같은 권역 악보의 조성과 화성을 보존하면서 장소별 4마디 A/B 선율·리듬·대선율을 결정한다. */
export function resolveLocationMusicArrangement(themeKey: unknown, locationId: string): LocationMusicArrangement {
    const theme = getLocationMusicThemeOrFallback(themeKey)
    const safeLocationId = locationId.trim() || 'unknown-location'
    const seed = createLocationMusicSeed(theme.key, safeLocationId)
    const motifLength = theme.motif.length
    const phraseCount = Math.max(1, Math.floor(motifLength / 4))
    const firstRotation = (seed % phraseCount) * 4
    const secondSeed = nextSeed(seed ^ 0xa5a5_9e37)
    const secondRotation = (secondSeed % phraseCount) * 4
    const octaveShift = theme.brightExploration ? 0 : ((seed >>> 9) % 3) - 1
    const rhythmPhase = (seed >>> 13) % 8
    const randomByPass = [seed || 0x9e37_79b9, secondSeed || 0x85eb_ca6b]
    const motifMidi: (number | null)[] = []
    const motifAccents: boolean[] = []
    const counterMidi: (number | null)[] = []
    const passSlotCount = MUSIC_THEME_MOTIF_STEPS
    const totalSlotCount = passSlotCount * 2
    const ornamentOffsets = theme.brightExploration ? [-1, 0, 1, 0] : [-1, 0, 1, 2]
    const authoredDegrees = theme.motif.filter((degree): degree is number => degree !== null)
    const authoredMinimumDegree = Math.min(...authoredDegrees)
    const authoredMaximumDegree = Math.max(...authoredDegrees)
    const responseStepOffsets = [-3, -2, -1, 1, 2, 3]
    const responseAnchorOffsets = [-2, -1, 0, 1, 2]
    let responseDegree = authoredDegrees[(secondSeed >>> 7) % authoredDegrees.length]

    for (let globalIndex = 0; globalIndex < totalSlotCount; globalIndex++) {
        const pass = Math.floor(globalIndex / passSlotCount)
        const index = globalIndex % passSlotCount
        const rotation = pass === 0 ? firstRotation : secondRotation
        const random = randomByPass[pass] = nextSeed(randomByPass[pass])
        const cadenceAnchor = pass === 1 && index === passSlotCount - 1
        const authoredDegree = theme.motif[(index + rotation) % motifLength]
        const structuralAnchor = index % 4 === 0 || cadenceAnchor
        let degree: number | null
        if (pass === 0) {
            const insertedRest = authoredDegree !== null
                && !structuralAnchor
                && index > 0
                && random % 19 === 0
            const ornament = structuralAnchor
                ? 0
                : ornamentOffsets[(random >>> 8) % ornamentOffsets.length]
            const ornamentedDegree = authoredDegree === null
                ? null
                : Math.min(
                    authoredMaximumDegree,
                    Math.max(authoredMinimumDegree, authoredDegree + ornament),
                )
            degree = ornamentedDegree === null || insertedRest ? null : ornamentedDegree
        } else if (cadenceAnchor) {
            responseDegree = 0
            degree = 0
        } else if (structuralAnchor) {
            const anchorBase = authoredDegree ?? responseDegree
            responseDegree = reflectDegreeIntoRange(
                anchorBase + responseAnchorOffsets[(random >>> 11) % responseAnchorOffsets.length],
                authoredMinimumDegree,
                authoredMaximumDegree,
            )
            degree = responseDegree
        } else {
            responseDegree = reflectDegreeIntoRange(
                responseDegree + responseStepOffsets[(random >>> 5) % responseStepOffsets.length],
                authoredMinimumDegree,
                authoredMaximumDegree,
            )
            const responseRest = authoredDegree === null ? random % 4 === 0 : random % 11 === 0
            degree = responseRest ? null : responseDegree
        }
        const midi = degree === null
            ? null
            : clampMidi(scaleDegreeToMidi(
                theme.rootMidi + theme.register.leadOctave * 12 + octaveShift * 12,
                theme.scale,
                degree,
            ))
        motifMidi.push(midi)
        motifAccents.push(midi !== null
            && ((random >>> 3) % 5 === 0 || (index + rhythmPhase) % 4 === 0 || cadenceAnchor))

        const counterDegree = degree === null || (globalIndex + rhythmPhase) % 2 !== 0
            ? null
            : degree + 2 + ((seed >>> 21) % 3)
        counterMidi.push(counterDegree === null
            ? null
            : clampMidi(scaleDegreeToMidi(
                theme.rootMidi + theme.register.leadOctave * 12,
                theme.scale,
                counterDegree,
            )))
    }

    const liftedMotif = shiftMidiGroupIntoRange(
        motifMidi.filter((note): note is number => note !== null),
        EXPLORATION_MELODY_MIN_MIDI,
        EXPLORATION_MELODY_MAX_MIDI,
    )
    let liftedMotifIndex = 0
    const explorationMotifMidi = motifMidi.map(note => note === null ? null : liftedMotif[liftedMotifIndex++])

    const bossCounterMidi = counterMidi.map(note => note === null
        ? null
        : shiftMidiIntoRange(note, EXPLORATION_MELODY_MIN_MIDI, EXPLORATION_MELODY_MAX_MIDI))

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
    const bpm = Math.min(180, Math.max(40, theme.bpm + ((seed >>> 25) % 5) - 2))
    const rhythmProfile = getExplorationRhythmProfile(theme.rhythm)
    const responseOnsets = createLocationResponseOnsets(rhythmProfile.leadStepSixteenths, secondSeed)
    let scheduleRandom = secondSeed ^ 0xc2b2_ae35
    const explorationLeadSchedule = explorationMotifMidi.map((note, index) => {
        const pass = Math.floor(index / passSlotCount)
        const slot = index % passSlotCount
        if (pass === 1) scheduleRandom = nextSeed(scheduleRandom)
        return Object.freeze({
            stepSixteenths: pass * 32 + (pass === 0
                ? rhythmProfile.leadStepSixteenths[slot]
                : responseOnsets[slot]),
            note,
            duration: pass === 0
                ? rhythmProfile.leadNoteLengths[slot]
                : slot === passSlotCount - 1
                    ? '4n'
                    : varyMusicNoteLength(rhythmProfile.leadNoteLengths[slot], scheduleRandom),
            accent: motifAccents[index],
        })
    })
    const explorationChordSchedule = Array.from({ length: 8 }, (_, index) => {
        const pass = Math.floor(index / 4)
        const slot = index % 4
        return Object.freeze({
            stepSixteenths: pass * 32 + rhythmProfile.chordStepSixteenths[slot],
            notes: Object.freeze([...chordMidi[slot]]),
            duration: rhythmProfile.chordNoteLengths[slot],
            velocity: rhythmProfile.chordVelocities[slot] * (pass === 0 ? 1 : 0.92),
        })
    })
    const melodySignature = explorationLeadSchedule
        .map(event => `${event.stepSixteenths}:${event.note ?? 'r'}:${event.duration}`)
        .join(',')

    return Object.freeze({
        theme,
        locationId: safeLocationId,
        seed,
        bpm,
        rhythmPhase,
        motifMidi: Object.freeze(explorationMotifMidi),
        motifAccents: Object.freeze(motifAccents),
        counterMidi: Object.freeze(bossCounterMidi),
        chordMidi: Object.freeze(chordMidi.map(chord => Object.freeze(chord))),
        bassMidi: Object.freeze(bassMidi),
        explorationLeadSchedule: Object.freeze(explorationLeadSchedule),
        explorationChordSchedule: Object.freeze(explorationChordSchedule),
        melodySignature,
    })
}
