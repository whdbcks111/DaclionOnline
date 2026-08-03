export const MUSIC_VOLUME_STORAGE_KEY = 'daclion:adaptive-music-volume'
export const DEFAULT_MUSIC_VOLUME = 35
export const EXPLORATION_MELODY_MIN_MIDI = 67
export const EXPLORATION_MELODY_MAX_MIDI = 96
export const EXPLORATION_HARMONY_MIN_MIDI = 60
export const EXPLORATION_HARMONY_MAX_MIDI = 84

export interface ExplorationMixProfile {
    readonly highpassHz: number
    readonly lowEqDb: number
    readonly midEqDb: number
    readonly highEqDb: number
    readonly padVolumeDb: number
    readonly leadVolumeDb: number
    readonly padAttackSeconds: number
    readonly padReleaseSeconds: number
    readonly padNoteLength: '4n'
    readonly padMaxPolyphony: number
}

export const STANDARD_EXPLORATION_MIX: Readonly<ExplorationMixProfile> = Object.freeze({
    highpassHz: 180,
    lowEqDb: -4.5,
    midEqDb: 1.5,
    highEqDb: 1,
    padVolumeDb: -17,
    leadVolumeDb: -11,
    padAttackSeconds: 0.16,
    padReleaseSeconds: 0.25,
    padNoteLength: '4n',
    padMaxPolyphony: 6,
})

export const BRIGHT_EXPLORATION_MIX: Readonly<ExplorationMixProfile> = Object.freeze({
    highpassHz: 260,
    lowEqDb: -7,
    midEqDb: 2,
    highEqDb: 3,
    padVolumeDb: -16,
    leadVolumeDb: -9,
    padAttackSeconds: 0.08,
    padReleaseSeconds: 0.22,
    padNoteLength: '4n',
    padMaxPolyphony: 6,
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
        scale: MusicScale.IONIAN, motif: [0, 2, 4, 5, 4, 2, 1, null, 0, 2, 4, 7, 5, 4, 2, null],
        chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [0, 2, 5]], register: { bassOctave: -2, padOctave: 1, leadOctave: 2 }, timbre: 'warm', rhythm: 'steady', brightExploration: true,
    })
    static readonly LUMINOUS_POND = new LocationMusicTheme({
        key: 'luminous-pond', name: '물빛의 한가로운 파문', mapColor: '#63a9bf', bpm: 78, root: 'D3', rootMidi: 50,
        scale: MusicScale.MAJOR_PENTATONIC, motif: [0, 1, 2, null, 3, 2, 1, null, 0, 2, 3, 4, 3, 2, null, null],
        chords: [[0, 2, 4], [1, 3, 5], [2, 4, 6], [0, 2, 5]], register: { bassOctave: -1, padOctave: 1, leadOctave: 2 }, timbre: 'water', rhythm: 'waltz', brightExploration: true,
    })
    static readonly MEADOW = new LocationMusicTheme({
        key: 'meadow', name: '첫 바람의 길', mapColor: '#6fa85d', bpm: 108, root: 'C3', rootMidi: 48,
        scale: MusicScale.IONIAN, motif: [0, 2, 4, 2, 1, 3, 5, null, 0, 2, 4, 5, 4, 2, 1, null],
        chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [0, 3, 5]], register: { bassOctave: -1, padOctave: 1, leadOctave: 2 }, timbre: 'wood', rhythm: 'steady', brightExploration: true,
    })
    static readonly SILVERWEB = new LocationMusicTheme({
        key: 'silverweb', name: '은실 아래의 사냥', mapColor: '#4f7857', bpm: 94, root: 'E3', rootMidi: 52,
        scale: MusicScale.MIXOLYDIAN, motif: [0, 2, 3, 5, 3, 2, 0, null, 0, 2, 5, 6, 5, 3, 1, null],
        chords: [[0, 2, 4], [1, 3, 5], [3, 5, 7], [0, 3, 5]], register: { bassOctave: -2, padOctave: 1, leadOctave: 2 }, timbre: 'wood', rhythm: 'syncopated', brightExploration: true,
    })
    static readonly SWAMP = new LocationMusicTheme({
        key: 'swamp', name: '잠든 포자의 숨', mapColor: '#66784f', bpm: 70, root: 'D3', rootMidi: 50,
        scale: MusicScale.PHRYGIAN, motif: [0, 1, 2, 0, null, 1, 3, 2, 0, null, 4, 3, 1, 0, null, null],
        chords: [[0, 2, 4], [1, 3, 5], [0, 3, 5], [1, 4, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'dark', rhythm: 'broken',
    })
    static readonly EMBER = new LocationMusicTheme({
        key: 'ember', name: '칼데라의 맥박', mapColor: '#bb6542', bpm: 126, root: 'E3', rootMidi: 52,
        scale: MusicScale.PHRYGIAN_DOMINANT, motif: [0, 1, 2, 1, 0, 4, 3, 1, 0, 1, 2, 4, 3, 2, 1, null],
        chords: [[0, 2, 4], [1, 3, 5], [4, 6, 8], [0, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'metal', rhythm: 'pulse',
    })
    static readonly FEVERIC_MINE = new LocationMusicTheme({
        key: 'feveric-mine', name: '수정 곡괭이의 메아리', mapColor: '#716558', bpm: 88, root: 'A2', rootMidi: 45,
        scale: MusicScale.MINOR_PENTATONIC, motif: [0, 3, 4, 3, null, 0, 2, 3, 0, 3, 4, 6, 4, 3, null, null],
        chords: [[0, 2, 4], [1, 3, 5], [0, 3, 5], [2, 4, 6]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'metal', rhythm: 'march',
    })
    static readonly TEMPEST = new LocationMusicTheme({
        key: 'tempest', name: '낙뢰능선 질주', mapColor: '#60758a', bpm: 132, root: 'F#3', rootMidi: 54,
        scale: MusicScale.DORIAN, motif: [0, 4, 5, 6, 4, 2, 5, null, 0, 4, 6, 8, 6, 5, 2, null],
        chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [1, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'air', rhythm: 'syncopated',
    })
    static readonly NIGHTWOOD = new LocationMusicTheme({
        key: 'nightwood', name: '달 없는 심재', mapColor: '#3d4845', bpm: 76, root: 'C#3', rootMidi: 49,
        scale: MusicScale.AEOLIAN, motif: [4, 2, 1, 0, null, 2, 1, 0, 4, 3, 2, 0, 1, null, 0, null],
        chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [0, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'dark', rhythm: 'broken',
    })
    static readonly DAWN_SANCTUM = new LocationMusicTheme({
        key: 'dawn-sanctum', name: '광륜의 새벽', mapColor: '#ddd19a', bpm: 90, root: 'D3', rootMidi: 50,
        scale: MusicScale.LYDIAN, motif: [0, 1, 3, 4, 6, 4, 3, null, 0, 3, 4, 7, 6, 4, 1, null],
        chords: [[0, 2, 4], [1, 3, 5], [4, 6, 8], [0, 3, 5]], register: { bassOctave: -1, padOctave: 1, leadOctave: 2 }, timbre: 'holy', rhythm: 'steady', brightExploration: true,
    })
    static readonly NECROPOLIS = new LocationMusicTheme({
        key: 'necropolis', name: '불멸의 장송', mapColor: '#585365', bpm: 64, root: 'B2', rootMidi: 47,
        scale: MusicScale.HARMONIC_MINOR, motif: [0, 5, 4, 6, 5, 4, 2, null, 0, 5, 4, 3, 2, 1, 0, null],
        chords: [[0, 2, 4], [5, 7, 9], [4, 6, 8], [0, 3, 6]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'dark', rhythm: 'march',
    })
    static readonly IRONROOT = new LocationMusicTheme({
        key: 'ironroot', name: '매몰된 철근', mapColor: '#75644f', bpm: 92, root: 'E3', rootMidi: 52,
        scale: MusicScale.LOCRIAN, motif: [0, 1, 4, 3, 0, null, 2, 4, 0, 1, 3, 5, 4, 2, null, null],
        chords: [[0, 2, 4], [1, 3, 5], [3, 5, 7], [0, 4, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'metal', rhythm: 'broken',
    })
    static readonly ASTRAL_RIFT = new LocationMusicTheme({
        key: 'astral-rift', name: '일식 너머의 문', mapColor: '#66577f', bpm: 116, root: 'F3', rootMidi: 53,
        scale: MusicScale.LYDIAN, motif: [0, 3, 4, 6, 7, 4, 3, null, 0, 4, 7, 9, 7, 6, 3, null],
        chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [1, 4, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'cosmic', rhythm: 'syncopated',
    })
    static readonly TWILIGHT_TOMB = new LocationMusicTheme({
        key: 'twilight-tomb', name: '마지막 등불 행렬', mapColor: '#655f73', bpm: 68, root: 'C3', rootMidi: 48,
        scale: MusicScale.AEOLIAN, motif: [0, 4, 5, 4, 2, null, 1, 0, 0, 4, 5, 7, 5, 4, 2, null],
        chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [0, 3, 5]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'holy', rhythm: 'march',
    })
    static readonly GLASSDUNE = new LocationMusicTheme({
        key: 'glassdune', name: '유리사막의 신기루', mapColor: '#756344', bpm: 112, root: 'D3', rootMidi: 50,
        scale: MusicScale.HARMONIC_MINOR, motif: [0, 1, 2, 3, 2, 1, 6, null, 0, 2, 4, 5, 4, 3, 1, null],
        chords: [[0, 2, 4], [1, 3, 5], [4, 6, 8], [0, 3, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'warm', rhythm: 'swing',
    })
    static readonly FROSTVEIL = new LocationMusicTheme({
        key: 'frostveil', name: '빙경의 숨결', mapColor: '#536773', bpm: 84, root: 'A2', rootMidi: 45,
        scale: MusicScale.DORIAN, motif: [0, 1, 2, 4, 5, 4, 2, null, 0, 2, 5, 7, 5, 4, 1, null],
        chords: [[0, 2, 4], [3, 5, 7], [1, 3, 5], [0, 3, 5]], register: { bassOctave: -1, padOctave: 0, leadOctave: 2 }, timbre: 'water', rhythm: 'steady',
    })
    static readonly MISTTIDE = new LocationMusicTheme({
        key: 'misttide', name: '안개조류의 귀향', mapColor: '#42666a', bpm: 100, root: 'E3', rootMidi: 52,
        scale: MusicScale.MIXOLYDIAN, motif: [0, 1, 3, 4, 3, 1, 0, null, 0, 3, 4, 6, 4, 3, 1, null],
        chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [0, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'water', rhythm: 'waltz',
    })
    static readonly PARADOX = new LocationMusicTheme({
        key: 'paradox', name: '멈춘 톱니의 역설', mapColor: '#5b5264', bpm: 120, root: 'F#3', rootMidi: 54,
        scale: MusicScale.HARMONIC_MINOR, motif: [0, 4, 6, 4, 0, 2, 5, 3, 0, 4, 6, 7, 6, 4, 2, null],
        chords: [[0, 2, 4], [4, 6, 8], [5, 7, 9], [0, 3, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'metal', rhythm: 'pulse',
    })
    static readonly ASHEN_ABYSS = new LocationMusicTheme({
        key: 'ashen-abyss', name: '흑염의 진군', mapColor: '#563b42', bpm: 108, root: 'C3', rootMidi: 48,
        scale: MusicScale.PHRYGIAN, motif: [0, 1, 4, 5, 4, 1, 0, null, 0, 4, 5, 7, 5, 4, 1, null],
        chords: [[0, 2, 4], [1, 3, 5], [5, 7, 9], [0, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'dark', rhythm: 'march',
    })
    static readonly VOIDCROWN = new LocationMusicTheme({
        key: 'voidcrown', name: '빈 왕관의 성벽', mapColor: '#44455b', bpm: 96, root: 'G2', rootMidi: 43,
        scale: MusicScale.AEOLIAN, motif: [0, 4, 2, 1, 0, 4, 3, null, 0, 4, 6, 5, 4, 2, 1, null],
        chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [0, 3, 5]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'dark', rhythm: 'pulse',
    })
    static readonly LUNARIS_TRENCH = new LocationMusicTheme({
        key: 'lunaris-trench', name: '백야 아래의 심해성가', mapColor: '#304452', bpm: 62, root: 'C#3', rootMidi: 49,
        scale: MusicScale.LOCRIAN, motif: [0, 1, 4, 3, null, 1, 0, null, 0, 4, 5, 3, 1, 0, null, null],
        chords: [[0, 2, 4], [1, 3, 5], [4, 6, 8], [0, 4, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'water', rhythm: 'broken',
    })
    static readonly WORLDROOT = new LocationMusicTheme({
        key: 'worldroot', name: '태초뿌리의 기억', mapColor: '#40513f', bpm: 88, root: 'D3', rootMidi: 50,
        scale: MusicScale.DORIAN, motif: [0, 2, 3, 5, 3, 2, 0, null, 0, 3, 5, 7, 5, 3, 1, null],
        chords: [[0, 2, 4], [3, 5, 7], [1, 3, 5], [0, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'wood', rhythm: 'waltz',
    })
    static readonly NEBULA = new LocationMusicTheme({
        key: 'nebula', name: '사건지평의 왕관', mapColor: '#35434b', bpm: 110, root: 'A2', rootMidi: 45,
        scale: MusicScale.LYDIAN, motif: [0, 2, 3, 6, 7, 6, 3, null, 0, 3, 6, 9, 7, 6, 2, null],
        chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [1, 4, 6]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'cosmic', rhythm: 'syncopated',
    })
    static readonly CHRONOFROST = new LocationMusicTheme({
        key: 'chronofrost', name: '영시의 진자', mapColor: '#36454b', bpm: 80, root: 'E3', rootMidi: 52,
        scale: MusicScale.HARMONIC_MINOR, motif: [0, 4, 5, 6, 5, 4, 0, null, 6, 4, 5, 4, 2, 1, 0, null],
        chords: [[0, 2, 4], [5, 7, 9], [4, 6, 8], [0, 3, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'water', rhythm: 'pulse',
    })
    static readonly ENDSTAR = new LocationMusicTheme({
        key: 'endstar', name: '최후성좌의 낙하', mapColor: '#493d49', bpm: 118, root: 'B2', rootMidi: 47,
        scale: MusicScale.PHRYGIAN, motif: [0, 1, 4, 5, 4, 1, 0, null, 7, 5, 4, 3, 1, 0, -1, null],
        chords: [[0, 2, 4], [1, 3, 5], [5, 7, 9], [0, 3, 5]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'cosmic', rhythm: 'syncopated',
    })
    static readonly SKYGRAVE = new LocationMusicTheme({
        key: 'skygrave', name: '하늘묘지의 천장송', mapColor: '#45586a', bpm: 138, root: 'F#3', rootMidi: 54,
        scale: MusicScale.LYDIAN, motif: [0, 4, 3, 6, 7, 4, 3, null, 0, 7, 6, 10, 7, 6, 3, null],
        chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [1, 4, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 1 }, timbre: 'air', rhythm: 'syncopated',
    })
    static readonly ABYSSGLASS = new LocationMusicTheme({
        key: 'abyssglass', name: '만압의 수정해', mapColor: '#315869', bpm: 58, root: 'C3', rootMidi: 48,
        scale: MusicScale.DORIAN, motif: [0, 2, 3, 1, null, 0, 4, 3, 0, null, 2, 5, 3, 1, null, null],
        chords: [[0, 2, 4], [3, 5, 7], [1, 3, 5], [0, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'water', rhythm: 'broken',
    })
    static readonly DREAMARCHIVE = new LocationMusicTheme({
        key: 'dreamarchive', name: '꿈서고의 잉크잠', mapColor: '#5a4967', bpm: 72, root: 'Eb3', rootMidi: 51,
        scale: MusicScale.WHOLE_TONE, motif: [0, 1, 2, 3, null, 5, 4, 2, 0, 2, 4, 6, 5, 3, null, null],
        chords: [[0, 2, 4], [1, 3, 5], [2, 4, 6], [0, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'cosmic', rhythm: 'broken',
    })
    static readonly THUNDERFORGE = new LocationMusicTheme({
        key: 'thunderforge', name: '천로의 번개망치', mapColor: '#6a5537', bpm: 144, root: 'E3', rootMidi: 52,
        scale: MusicScale.MIXOLYDIAN, motif: [0, 4, 6, 5, 0, 4, 3, null, 0, 4, 6, 8, 6, 5, 3, null],
        chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [0, 3, 5]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'metal', rhythm: 'syncopated',
    })
    static readonly RUSTWORLD = new LocationMusicTheme({
        key: 'rustworld', name: '붉은 산화풍', mapColor: '#68483d', bpm: 104, root: 'F3', rootMidi: 53,
        scale: MusicScale.PHRYGIAN, motif: [0, 1, 2, 1, 0, 3, 2, null, 0, 1, 4, 3, 2, 1, 0, null],
        chords: [[0, 2, 4], [1, 3, 5], [3, 5, 7], [0, 4, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'metal', rhythm: 'swing',
    })
    static readonly PALEECLIPSE = new LocationMusicTheme({
        key: 'paleeclipse', name: '흰그늘의 잔광', mapColor: '#69645b', bpm: 82, root: 'B2', rootMidi: 47,
        scale: MusicScale.LYDIAN, motif: [0, 3, 4, 2, null, 0, 4, 6, null, 3, 4, 7, 6, 2, null, null],
        chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [1, 4, 6]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'holy', rhythm: 'broken',
    })
    static readonly CRIMSONGRAVITY = new LocationMusicTheme({
        key: 'crimsongravity', name: '홍중력의 낙하', mapColor: '#6a3d49', bpm: 76, root: 'C#3', rootMidi: 49,
        scale: MusicScale.HARMONIC_MINOR, motif: [0, 4, 5, 4, null, 2, 1, 0, 7, 5, 4, 2, null, 1, 0, null],
        chords: [[0, 2, 4], [5, 7, 9], [4, 6, 8], [0, 3, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'dark', rhythm: 'march',
    })
    static readonly SILENTDIVINE = new LocationMusicTheme({
        key: 'silentdivine', name: '무언림의 기도', mapColor: '#405b4c', bpm: 66, root: 'G2', rootMidi: 43,
        scale: MusicScale.MAJOR_PENTATONIC, motif: [0, 1, 2, 3, null, null, 2, 1, 0, null, 2, 4, 3, 1, null, null],
        chords: [[0, 2, 4], [1, 3, 5], [2, 4, 6], [0, 2, 5]], register: { bassOctave: -1, padOctave: 0, leadOctave: 1 }, timbre: 'wood', rhythm: 'broken',
    })
    static readonly NULLLIBRARY = new LocationMusicTheme({
        key: 'nulllibrary', name: '지워진 색인의 침묵', mapColor: '#4d4d59', bpm: 54, root: 'D3', rootMidi: 50,
        scale: MusicScale.LOCRIAN, motif: [0, 1, null, 4, null, 5, 3, null, 0, null, 2, 5, null, 1, 0, null],
        chords: [[0, 2, 4], [1, 3, 5], [4, 6, 8], [0, 4, 6]], register: { bassOctave: -2, padOctave: -1, leadOctave: 0 }, timbre: 'dark', rhythm: 'broken',
    })
    static readonly ORIGINBOUNDARY = new LocationMusicTheme({
        key: 'originboundary', name: '기원과 종언의 경계', mapColor: '#625a76', bpm: 96, root: 'A2', rootMidi: 45,
        scale: MusicScale.DOUBLE_HARMONIC_MAJOR, motif: [0, 1, 2, 3, 4, 5, 6, null, 6, 5, 4, 3, 2, 1, 0, null],
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
    return values.map(value => clampMidi(value + shift))
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
    readonly melodySignature: string
}

/** 서버 mapColor 경계와 클라이언트 작곡기를 잇는 안전한 단일 진입점. */
export function composeLocationScore(locationId: string, mapColor: unknown): LocationMusicArrangement {
    const theme = getLocationMusicThemeByColor(mapColor) ?? LocationMusicTheme.LUMINAR
    return resolveLocationMusicArrangement(theme.key, locationId)
}

/** 같은 권역 악보의 조성과 화성을 보존하면서 장소별 선율 회전·쉼·강세·옥타브·대선율을 결정한다. */
export function resolveLocationMusicArrangement(themeKey: unknown, locationId: string): LocationMusicArrangement {
    const theme = getLocationMusicThemeOrFallback(themeKey)
    const safeLocationId = locationId.trim() || 'unknown-location'
    const seed = createLocationMusicSeed(theme.key, safeLocationId)
    const motifLength = theme.motif.length
    const rotation = (seed % Math.max(1, Math.floor(motifLength / 4))) * 4
    const octaveShift = theme.brightExploration ? 0 : ((seed >>> 9) % 3) - 1
    const rhythmPhase = (seed >>> 13) % 8
    let random = seed || 0x9e3779b9
    const motifMidi: (number | null)[] = []
    const motifAccents: boolean[] = []
    const counterMidi: (number | null)[] = []

    for (let index = 0; index < motifLength; index++) {
        random = nextSeed(random)
        const baseDegree = theme.motif[(index + rotation) % motifLength]
        const insertedRest = baseDegree !== null && index > 0 && index < motifLength - 1 && random % 19 === 0
        const degree = baseDegree === null || insertedRest ? null : baseDegree
        const midi = degree === null
            ? null
            : clampMidi(scaleDegreeToMidi(
                theme.rootMidi + theme.register.leadOctave * 12 + octaveShift * 12,
                theme.scale,
                degree,
            ))
        motifMidi.push(midi)
        motifAccents.push(midi !== null && ((random >>> 3) % 5 === 0 || (index + rhythmPhase) % 4 === 0))

        const counterDegree = degree === null || (index + rhythmPhase) % 2 !== 0
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

    const liftedCounter = shiftMidiGroupIntoRange(
        counterMidi.filter((note): note is number => note !== null),
        EXPLORATION_MELODY_MIN_MIDI,
        EXPLORATION_MELODY_MAX_MIDI,
    )
    let liftedCounterIndex = 0
    const bossCounterMidi = counterMidi.map(note => note === null ? null : liftedCounter[liftedCounterIndex++])

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
    const melodySignature = [
        explorationMotifMidi.map(note => note ?? 'r').join(','),
        motifAccents.map(accent => accent ? '1' : '0').join(''),
        bossCounterMidi.map(note => note ?? 'r').join(','),
        `p${rhythmPhase}`,
    ].join('|')

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
        melodySignature,
    })
}
