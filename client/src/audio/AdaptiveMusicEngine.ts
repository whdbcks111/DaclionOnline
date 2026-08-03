import * as Tone from 'tone'
import {
  MUSIC_SCENE_TRANSITION,
  MUSIC_TICKS_PER_QUARTER,
  MUSIC_TICKS_PER_SIXTEENTH,
  MusicCombatState,
  composeLocationScore,
  getExplorationMixProfile,
  getExplorationTimbreProfile,
  type LocationMusicArrangement,
  type MusicRhythmKey,
  normalizeMusicVolume,
} from '@shared/adaptiveMusic'

const CROSSFADE_SECONDS = MUSIC_SCENE_TRANSITION.crossFadeSeconds
const LAYER_RAMP_SECONDS = 0.9
const VISIBILITY_FADE_SECONDS = 0.35
const MASTER_OUTPUT_CEILING = 0.88
const VOLUME_TAPER_EXPONENT = 1.2
const COMMON_SPACE_SEND = 0.08

type TickTime = `${number}i`

interface MusicScene {
  readonly locationId: string
  readonly mapColor: string | undefined
  readonly combatState: MusicCombatState
}

interface NoteEvent {
  time: TickTime
  note: number
  velocity: number
  duration: TickTime
}

interface ChordEvent {
  time: TickTime
  notes: readonly number[]
  velocity: number
  duration: TickTime
}

interface PercussionEvent {
  time: TickTime
  kind: 'kick' | 'noise'
  note: number
  velocity: number
  duration: TickTime
}

interface DisposableAudio {
  dispose(): unknown
}

interface DisposablePart extends DisposableAudio {
  start(time: TickTime, offset: TickTime): unknown
  stop(): unknown
  cancel(): unknown
}

const RHYTHM_KICKS: Readonly<Record<MusicRhythmKey, readonly number[]>> = {
  steady: [0, 4, 8, 12],
  waltz: [0, 6, 10],
  syncopated: [0, 3, 8, 11, 14],
  march: [0, 4, 8, 10, 12],
  pulse: [0, 2, 4, 8, 10, 12],
  broken: [0, 5, 9, 14],
  swing: [0, 3, 6, 8, 11, 14],
}

function tickTime(ticks: number): TickTime {
  return `${Math.max(0, Math.round(ticks))}i`
}

function sixteenthTime(step: number): TickTime {
  return tickTime(step * MUSIC_TICKS_PER_SIXTEENTH)
}

function nextQuarterTick(): number {
  const currentTicks = Tone.getTransport().getTicksAtTime(Tone.now())
  return Math.ceil((currentTicks + 1) / MUSIC_TICKS_PER_QUARTER) * MUSIC_TICKS_PER_QUARTER
}

function volumeToGain(volume: number): number {
  const normalized = normalizeMusicVolume(volume) / 100
  return normalized === 0 ? 0 : Math.pow(normalized, VOLUME_TAPER_EXPONENT) * MASTER_OUTPUT_CEILING
}

function createLoopingPart<Value extends { time: string }>(
  callback: (time: number, value: Value) => void,
  events: Value[],
  loopTicks: number,
): Tone.Part<Value> {
  const part = new Tone.Part<Value>()
  part.callback = callback
  for (const event of events) part.add(event)
  part.loop = true
  part.loopStart = tickTime(0)
  part.loopEnd = tickTime(loopTicks)
  part.humanize = false
  return part
}

class MusicVoiceBank {
  readonly output: Tone.Gain
  private readonly explorationGain: Tone.Gain
  private readonly combatGain: Tone.Gain
  private readonly bossGain: Tone.Gain
  private readonly parts: DisposablePart[] = []
  private readonly nodes: DisposableAudio[] = []
  private started = false
  private disposed = false

  constructor(arrangement: LocationMusicArrangement, destination: Tone.InputNode) {
    this.output = new Tone.Gain(1).connect(destination)
    this.explorationGain = new Tone.Gain(0)
    this.combatGain = new Tone.Gain(0).connect(this.output)
    this.bossGain = new Tone.Gain(0).connect(this.output)
    const explorationMix = getExplorationMixProfile(arrangement.theme)
    const explorationEq = new Tone.EQ3({
      low: explorationMix.lowEqDb,
      mid: explorationMix.midEqDb,
      high: explorationMix.highEqDb,
      lowFrequency: 320,
      highFrequency: 2_400,
    }).connect(this.output)
    const explorationHighpass = new Tone.Filter({
      type: 'highpass',
      frequency: explorationMix.highpassHz,
      rolloff: -24,
      Q: 0.7,
    }).connect(explorationEq)
    this.explorationGain.connect(explorationHighpass)

    const timbreProfile = getExplorationTimbreProfile(arrangement.theme.timbre)
    const pad = new Tone.PolySynth({
      maxPolyphony: explorationMix.padMaxPolyphony,
      voice: Tone.Synth,
      options: {
        oscillator: { type: timbreProfile.padOscillator },
        envelope: { ...timbreProfile.padEnvelope },
      },
    }).connect(this.explorationGain)
    pad.volume.value = explorationMix.padVolumeDb
    const lead = new Tone.Synth({
      oscillator: { type: timbreProfile.leadOscillator },
      envelope: { ...timbreProfile.leadEnvelope },
    }).connect(this.explorationGain)
    lead.volume.value = explorationMix.leadVolumeDb
    const bass = new Tone.MonoSynth({
      oscillator: { type: arrangement.theme.timbre === 'metal' ? 'square' : 'triangle' },
      filter: { Q: 1.2, type: 'lowpass', rolloff: -12 },
      envelope: { attack: 0.02, decay: 0.2, sustain: 0.32, release: 0.3 },
      filterEnvelope: { attack: 0.01, decay: 0.16, sustain: 0.15, release: 0.3, baseFrequency: 90, octaves: 2.2 },
    }).connect(this.combatGain)
    bass.volume.value = -14
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.035,
      octaves: 3,
      envelope: { attack: 0.002, decay: 0.13, sustain: 0, release: 0.08 },
    }).connect(this.combatGain)
    kick.volume.value = -18
    const noise = new Tone.NoiseSynth({
      noise: { type: arrangement.theme.timbre === 'water' ? 'pink' : 'white' },
      envelope: { attack: 0.002, decay: 0.05, sustain: 0, release: 0.03 },
    }).connect(this.combatGain)
    noise.volume.value = -27
    const counter = new Tone.Synth({
      oscillator: { type: arrangement.theme.timbre === 'cosmic' ? 'sine' : 'triangle' },
      envelope: { attack: 0.015, decay: 0.1, sustain: 0.08, release: 0.25 },
    }).connect(this.bossGain)
    counter.volume.value = -18
    const bossHarmony = new Tone.PolySynth({
      maxPolyphony: 4,
      voice: Tone.Synth,
      options: {
        oscillator: { type: arrangement.theme.timbre === 'dark' ? 'sine' : 'triangle' },
        envelope: { attack: 0.18, decay: 0.22, sustain: 0.28, release: 0.75 },
      },
    }).connect(this.bossGain)
    bossHarmony.volume.value = -20
    const bossKick = new Tone.MembraneSynth({
      pitchDecay: 0.025,
      octaves: 4,
      envelope: { attack: 0.002, decay: 0.16, sustain: 0, release: 0.08 },
    }).connect(this.bossGain)
    bossKick.volume.value = -15
    const bossNoise = new Tone.NoiseSynth({
      noise: { type: 'brown' },
      envelope: { attack: 0.002, decay: 0.08, sustain: 0, release: 0.04 },
    }).connect(this.bossGain)
    bossNoise.volume.value = -24

    this.nodes.push(
      pad,
      lead,
      bass,
      kick,
      noise,
      counter,
      bossHarmony,
      bossKick,
      bossNoise,
      explorationHighpass,
      explorationEq,
    )

    const chordEvents: ChordEvent[] = arrangement.explorationChordSchedule.map(event => ({
      time: sixteenthTime(event.stepSixteenths),
      notes: event.notes,
      velocity: event.velocity,
      duration: sixteenthTime(event.durationSixteenths),
    }))
    const leadEvents: NoteEvent[] = arrangement.explorationLeadSchedule.flatMap(event => (
      event.note === null ? [] : [{
        time: sixteenthTime(event.stepSixteenths),
        note: event.note,
        velocity: event.accent ? 0.42 : 0.24,
        duration: sixteenthTime(event.durationSixteenths),
      }]
    ))
    const bassEvents: NoteEvent[] = arrangement.explorationChordSchedule.map((event, index) => ({
      time: sixteenthTime(event.stepSixteenths),
      note: event.bassNote,
      velocity: index % 4 === 0 ? 0.54 : 0.34,
      duration: sixteenthTime(event.durationSixteenths),
    }))
    const counterEvents: NoteEvent[] = arrangement.counterMidi.flatMap((note, index) => {
      if (note === null) return []
      const leadEvent = arrangement.explorationLeadSchedule[index]
      return [{
        time: sixteenthTime(leadEvent.stepSixteenths),
        note,
        velocity: leadEvent.accent ? 0.42 : 0.28,
        duration: sixteenthTime(leadEvent.durationSixteenths),
      }]
    })
    const combatPercussionEvents: PercussionEvent[] = []
    const bossPercussionEvents: PercussionEvent[] = []
    const measureSixteenths = arrangement.meter.sixteenthsPerMeasure
    const sourceMeasureSixteenths = arrangement.theme.rhythm === 'waltz' ? 12 : 16
    const kickVariation = (arrangement.rhythmPhase % 3) - 1
    const kickSteps = [...new Set(RHYTHM_KICKS[arrangement.theme.rhythm].map(step => {
      const meterStep = Math.floor(step * measureSixteenths / sourceMeasureSixteenths)
      if (meterStep === 0) return 0
      return Math.min(measureSixteenths - 1, Math.max(1, meterStep + kickVariation))
    }))]
    const kickDuration = sixteenthTime(1)
    const noiseDuration = tickTime(MUSIC_TICKS_PER_SIXTEENTH / 2)
    for (let measure = 0; measure < arrangement.loopMeasures; measure++) {
      const measureStart = measure * measureSixteenths
      for (const step of kickSteps) {
        const eventTime = sixteenthTime(measureStart + step)
        combatPercussionEvents.push({
          time: eventTime,
          kind: 'kick',
          note: 42,
          velocity: step === 0 ? 0.49 : 0.42,
          duration: kickDuration,
        })
        bossPercussionEvents.push({
          time: eventTime,
          kind: 'kick',
          note: 38,
          velocity: step === 0 ? 0.6 : 0.52,
          duration: kickDuration,
        })
      }
      for (let beat = 0; beat < arrangement.meter.beatsPerMeasure; beat++) {
        const eventTime = sixteenthTime(measureStart + beat * 4)
        if (beat % 2 === 1) {
          combatPercussionEvents.push({
            time: eventTime,
            kind: 'noise',
            note: 0,
            velocity: 0.22,
            duration: noiseDuration,
          })
        }
        bossPercussionEvents.push({
          time: eventTime,
          kind: 'noise',
          note: 0,
          velocity: beat === 0 ? 0.32 : 0.2,
          duration: noiseDuration,
        })
      }
    }

    this.parts.push(
      createLoopingPart<ChordEvent>((time, event) => pad.triggerAttackRelease(
        [...event.notes],
        event.duration,
        time,
        event.velocity,
      ), chordEvents, arrangement.loopTicks),
      createLoopingPart<NoteEvent>((time, event) => lead.triggerAttackRelease(event.note, event.duration, time, event.velocity), leadEvents, arrangement.loopTicks),
      createLoopingPart<NoteEvent>((time, event) => bass.triggerAttackRelease(event.note, event.duration, time, event.velocity), bassEvents, arrangement.loopTicks),
      createLoopingPart<PercussionEvent>((time, event) => {
        if (event.kind === 'kick') kick.triggerAttackRelease(event.note, event.duration, time, event.velocity)
        else noise.triggerAttackRelease(event.duration, time, event.velocity)
      }, combatPercussionEvents, arrangement.loopTicks),
      createLoopingPart<NoteEvent>((time, event) => counter.triggerAttackRelease(event.note, event.duration, time, event.velocity), counterEvents, arrangement.loopTicks),
      createLoopingPart<ChordEvent>((time, event) => bossHarmony.triggerAttackRelease([...event.notes], event.duration, time, event.velocity), chordEvents, arrangement.loopTicks),
      createLoopingPart<PercussionEvent>((time, event) => {
        if (event.kind === 'kick') bossKick.triggerAttackRelease(event.note, event.duration, time, event.velocity)
        else bossNoise.triggerAttackRelease(event.duration, time, event.velocity)
      }, bossPercussionEvents, arrangement.loopTicks),
    )
  }

  startAtTick(startTick: number): void {
    if (this.disposed || this.started) return
    this.started = true
    for (const part of this.parts) part.start(`${startTick}i`, '0i')
  }

  setCombatState(state: MusicCombatState, time = Tone.now(), immediate = false): void {
    if (this.disposed) return
    const duration = immediate ? 0.02 : LAYER_RAMP_SECONDS
    const explorationLevel = state === MusicCombatState.EXPLORATION ? 0.58
      : state === MusicCombatState.COMBAT ? 0.36 : 0.3
    const combatLevel = state === MusicCombatState.EXPLORATION ? 0
      : state === MusicCombatState.COMBAT ? 0.29 : 0.26
    const bossLevel = state === MusicCombatState.BOSS ? 0.27 : 0
    for (const [gain, target] of [
      [this.explorationGain, explorationLevel],
      [this.combatGain, combatLevel],
      [this.bossGain, bossLevel],
    ] as const) {
      gain.gain.cancelAndHoldAtTime(time)
      gain.gain.linearRampToValueAtTime(target, time + duration)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const part of this.parts) {
      part.stop()
      part.cancel()
      part.dispose()
    }
    for (const node of this.nodes) node.dispose()
    this.explorationGain.dispose()
    this.combatGain.dispose()
    this.bossGain.dispose()
    this.output.dispose()
  }
}

/** Home route 하나가 소유하는 Tone Transport·노드·예약의 전체 수명주기. */
export class AdaptiveMusicEngine {
  private volume = 35
  private audible = true
  private unlocked = false
  private disposed = false
  private unlockPromise: Promise<boolean> | null = null
  private scene: MusicScene | null = null
  private crossFade: Tone.CrossFade | null = null
  private spaceSend: Tone.Gain | null = null
  private freeverb: Tone.Freeverb | null = null
  private compressor: Tone.Compressor | null = null
  private limiter: Tone.Limiter | null = null
  private userGain: Tone.Gain | null = null
  private audibilityGain: Tone.Gain | null = null
  private banks: [MusicVoiceBank | null, MusicVoiceBank | null] = [null, null]
  private activeBank: 0 | 1 = 0
  private transitionEventId: number | null = null
  private transitionCleanupTimer: number | null = null
  private transitionInProgress = false
  private transitionStarted = false
  private queuedScene: MusicScene | null = null
  private inactivityTimer: number | null = null

  setVolume(volume: unknown): void {
    this.volume = normalizeMusicVolume(volume)
    if (!this.userGain) return
    const now = Tone.now()
    this.userGain.gain.cancelAndHoldAtTime(now)
    this.userGain.gain.linearRampToValueAtTime(volumeToGain(this.volume), now + 0.08)
  }

  setAudible(audible: boolean): void {
    this.audible = audible
    if (!this.audibilityGain) return
    if (this.inactivityTimer !== null) {
      window.clearTimeout(this.inactivityTimer)
      this.inactivityTimer = null
    }
    const transport = Tone.getTransport()
    const now = Tone.now()
    this.audibilityGain.gain.cancelAndHoldAtTime(now)
    if (audible) {
      if (transport.state !== 'started') transport.start('+0.03')
      this.audibilityGain.gain.linearRampToValueAtTime(1, now + VISIBILITY_FADE_SECONDS)
      return
    }
    this.audibilityGain.gain.linearRampToValueAtTime(0, now + VISIBILITY_FADE_SECONDS)
    this.inactivityTimer = window.setTimeout(() => {
      this.inactivityTimer = null
      if (!this.audible && !this.disposed && Tone.getTransport().state === 'started') {
        Tone.getTransport().pause()
      }
    }, (VISIBILITY_FADE_SECONDS + 0.08) * 1000)
  }

  setScene(locationId: string, mapColor: string | undefined, combatState: MusicCombatState): void {
    if (this.disposed || !locationId) return
    const next: MusicScene = { locationId, mapColor, combatState }
    const sameLocation = this.scene?.locationId === next.locationId && this.scene.mapColor === next.mapColor
    const sameCombatState = this.scene?.combatState === next.combatState
    this.scene = next
    if (!this.unlocked) return
    if (sameLocation) {
      if (this.queuedScene?.locationId === next.locationId && this.queuedScene.mapColor === next.mapColor) {
        this.queuedScene = next
      }
      if (sameCombatState) return
      this.banks[0]?.setCombatState(combatState)
      this.banks[1]?.setCombatState(combatState)
      return
    }
    this.transitionToScene(next)
  }

  unlock(): Promise<boolean> {
    if (this.disposed || this.volume === 0) return Promise.resolve(false)
    if (this.unlocked) return Promise.resolve(true)
    if (this.unlockPromise) return this.unlockPromise

    // 반드시 실제 pointer/key/touch handler의 동기 구간에서 호출된다.
    this.unlockPromise = Tone.start().then(() => {
      if (this.disposed) return false
      this.initializeGraph()
      this.unlocked = true
      if (this.scene) this.transitionToScene(this.scene, true)
      return true
    }).catch(() => false).finally(() => {
      this.unlockPromise = null
    })
    return this.unlockPromise
  }

  private initializeGraph(): void {
    if (this.crossFade || this.disposed) return
    Tone.getTransport().PPQ = MUSIC_TICKS_PER_QUARTER
    this.crossFade = new Tone.CrossFade(0)
    this.spaceSend = new Tone.Gain(COMMON_SPACE_SEND)
    this.freeverb = new Tone.Freeverb({ roomSize: 0.62, dampening: 3_200, wet: 1 })
    this.compressor = new Tone.Compressor({ threshold: -20, ratio: 2.4, attack: 0.03, release: 0.22, knee: 12 })
    this.limiter = new Tone.Limiter(-4)
    this.userGain = new Tone.Gain(volumeToGain(this.volume))
    this.audibilityGain = new Tone.Gain(this.audible ? 1 : 0)
    this.crossFade.connect(this.compressor)
    this.crossFade.connect(this.spaceSend)
    this.spaceSend.connect(this.freeverb)
    this.freeverb.connect(this.compressor)
    this.compressor.connect(this.limiter)
    this.limiter.connect(this.userGain)
    this.userGain.connect(this.audibilityGain)
    this.audibilityGain.toDestination()
  }

  private transitionToScene(scene: MusicScene, firstScene = false): void {
    if (!this.crossFade || this.disposed) return
    const transport = Tone.getTransport()
    if (this.transitionInProgress) {
      if (!this.transitionStarted && this.transitionEventId !== null) {
        transport.clear(this.transitionEventId)
        this.transitionEventId = null
        const preparedBank: 0 | 1 = this.activeBank === 0 ? 1 : 0
        this.banks[preparedBank]?.dispose()
        this.banks[preparedBank] = null
        this.transitionInProgress = false
      } else {
        this.queuedScene = scene
        this.banks[0]?.setCombatState(scene.combatState)
        this.banks[1]?.setCombatState(scene.combatState)
        return
      }
    }

    const arrangement = composeLocationScore(scene.locationId, scene.mapColor)
    const nextBank: 0 | 1 = this.activeBank === 0 ? 1 : 0
    if (this.transitionEventId !== null) {
      transport.clear(this.transitionEventId)
      this.transitionEventId = null
    }
    if (this.transitionCleanupTimer !== null) {
      window.clearTimeout(this.transitionCleanupTimer)
      this.transitionCleanupTimer = null
    }
    this.banks[nextBank]?.dispose()
    this.banks[nextBank] = new MusicVoiceBank(
      arrangement,
      nextBank === 0 ? this.crossFade.a : this.crossFade.b,
    )
    this.banks[nextBank]?.setCombatState(scene.combatState, Tone.now(), true)
    const startTick = nextQuarterTick()
    this.banks[nextBank]?.startAtTick(startTick)

    if (firstScene || !this.banks[this.activeBank]) {
      this.crossFade.fade.value = nextBank
      this.activeBank = nextBank
      transport.bpm.value = arrangement.bpm
      if (this.audible && transport.state !== 'started') transport.start('+0.03')
      return
    }

    this.transitionInProgress = true
    this.transitionStarted = false
    this.transitionEventId = transport.scheduleOnce(time => {
      this.transitionEventId = null
      if (!this.crossFade || this.disposed) return
      this.transitionStarted = true
      transport.bpm.cancelAndHoldAtTime(time)
      transport.bpm.linearRampToValueAtTime(arrangement.bpm, time + CROSSFADE_SECONDS)
      this.crossFade.fade.cancelAndHoldAtTime(time)
      this.crossFade.fade.linearRampToValueAtTime(nextBank, time + CROSSFADE_SECONDS)
      const previousBank = this.activeBank
      this.activeBank = nextBank
      this.transitionCleanupTimer = window.setTimeout(() => {
        this.transitionCleanupTimer = null
        this.banks[previousBank]?.dispose()
        this.banks[previousBank] = null
        this.transitionInProgress = false
        this.transitionStarted = false
        const queuedScene = this.queuedScene
        this.queuedScene = null
        if (queuedScene && !this.disposed) this.transitionToScene(queuedScene)
      }, (CROSSFADE_SECONDS + 0.08) * 1000)
    }, tickTime(startTick))
    if (this.audible && transport.state !== 'started') transport.start('+0.03')
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const transport = Tone.getTransport()
    if (this.transitionEventId !== null) transport.clear(this.transitionEventId)
    if (this.transitionCleanupTimer !== null) window.clearTimeout(this.transitionCleanupTimer)
    if (this.inactivityTimer !== null) window.clearTimeout(this.inactivityTimer)
    this.banks[0]?.dispose()
    this.banks[1]?.dispose()
    this.banks = [null, null]
    this.queuedScene = null
    this.transitionInProgress = false
    this.transitionStarted = false
    this.crossFade?.dispose()
    this.spaceSend?.dispose()
    this.freeverb?.dispose()
    this.compressor?.dispose()
    this.limiter?.dispose()
    this.userGain?.dispose()
    this.audibilityGain?.dispose()
    if (transport.state === 'started') transport.pause()
    this.crossFade = null
    this.spaceSend = null
    this.freeverb = null
    this.compressor = null
    this.limiter = null
    this.userGain = null
    this.audibilityGain = null
  }
}
