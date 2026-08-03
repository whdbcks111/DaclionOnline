import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    BRIGHT_EXPLORATION_MIX,
    DEFAULT_MUSIC_VOLUME,
    EXPLORATION_HARMONY_MAX_MIDI,
    EXPLORATION_HARMONY_MIN_MIDI,
    EXPLORATION_LOOP_MEASURES,
    EXPLORATION_MELODY_MAX_MIDI,
    EXPLORATION_MELODY_MIN_MIDI,
    MUSIC_SCENE_TRANSITION,
    MUSIC_TICKS_PER_QUARTER,
    MUSIC_TICKS_PER_SIXTEENTH,
    MUSIC_VOLUME_STORAGE_KEY,
    LocationMusicTheme,
    MusicCombatState,
    MusicMeter,
    MusicScale,
    STANDARD_EXPLORATION_MIX,
    composeLocationScore,
    getExplorationMixProfile,
    getExplorationRhythmProfile,
    getExplorationTimbreProfile,
    getLocationMusicThemeByColor,
    normalizeMusicVolume,
    readMusicVolume,
    resolveLocationMusicArrangement,
    resolveMusicCombatState,
    scaleDegreeToMidi,
    writeMusicVolume,
    type ExplorationChordScheduleEvent,
    type LocationMusicArrangement,
    type MusicFormSectionKey,
    type MusicPhraseCell,
    type MusicPhraseKey,
    type MusicRhythmKey,
    type MusicStorageLike,
    type MusicTimbreKey,
} from '../../../shared/adaptiveMusic.js';
import type { LocationData } from '../../../shared/types.js';
import {
    buildAscendantLocations,
    mergeAscendantLocations,
} from './ascendantRegions.js';

const baseLocations = JSON.parse(
    readFileSync(new URL('./locations.json', import.meta.url), 'utf8'),
) as LocationData[];
const generatedLocations = buildAscendantLocations();
const locations = mergeAscendantLocations(baseLocations);

const TIMBRE_KEY_VALUES: readonly MusicTimbreKey[] = [
    'warm', 'water', 'wood', 'dark', 'metal', 'air', 'holy', 'cosmic',
];
const RHYTHM_KEY_VALUES: readonly MusicRhythmKey[] = [
    'steady', 'waltz', 'syncopated', 'march', 'pulse', 'broken', 'swing',
];
const PHRASE_KEYS: readonly MusicPhraseKey[] = ['motifA', 'responseA', 'motifB', 'cadence'];
const SECTION_KEYS: readonly MusicFormSectionKey[] = ['A', 'A-prime', 'B', 'A-return'];
const ANGULAR_LEAP_THEME_EXCEPTIONS = new Set([
    'nightwood', 'necropolis', 'ironroot', 'astral-rift', 'twilight-tomb', 'voidcrown',
    'lunaris-trench', 'endstar', 'rustworld', 'crimsongravity', 'silentdivine',
]);
const TIMBRE_KEYS = new Set(TIMBRE_KEY_VALUES);
const RHYTHM_KEYS = new Set(RHYTHM_KEY_VALUES);
const NOTE_PITCH_CLASS: Readonly<Record<string, number>> = Object.freeze({
    C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4,
    F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9,
    'A#': 10, Bb: 10, B: 11,
});

function pitchClassFromRoot(midi: number, rootMidi: number): number {
    return ((midi - rootMidi) % 12 + 12) % 12;
}

function rootLabelToMidi(root: string): number | undefined {
    const match = /^([A-G](?:#|b)?)([0-8])$/.exec(root);
    if (!match) return undefined;
    const pitchClass = NOTE_PITCH_CLASS[match[1]];
    return pitchClass === undefined ? undefined : (Number(match[2]) + 1) * 12 + pitchClass;
}

function midiRange(notes: readonly (number | null)[]): readonly [number, number] {
    const soundingNotes = notes.filter((note): note is number => note !== null);
    assert.ok(soundingNotes.length > 0, 'MIDI range requires at least one sounding note');
    return [Math.min(...soundingNotes), Math.max(...soundingNotes)];
}

function assertScaleNote(
    arrangement: LocationMusicArrangement,
    note: number | null,
    source: string,
): void {
    if (note === null) return;
    assert.equal(Number.isInteger(note), true, `${arrangement.locationId}/${source}: integer MIDI`);
    assert.ok(note >= 24 && note <= 103, `${arrangement.locationId}/${source}: MIDI ${note}`);
    assert.ok(
        arrangement.theme.scale.intervals.includes(pitchClassFromRoot(note, arrangement.theme.rootMidi)),
        `${arrangement.locationId}/${source}: ${note} is outside ${arrangement.theme.scale.key}`,
    );
}

function assertPhraseIsExactTwoBars(theme: LocationMusicTheme, cell: MusicPhraseCell): void {
    const expectedLength = theme.meter.sixteenthsPerMeasure * 2;
    assert.equal(cell.lengthSixteenths, expectedLength, `${theme.key}/${cell.key}/two bars`);
    assert.ok(cell.tokens.length >= 4, `${theme.key}/${cell.key}/audible phrase detail`);
    assert.equal(cell.tokens[0]?.onsetSixteenths, 0, `${theme.key}/${cell.key}/start`);
    for (let index = 0; index < cell.tokens.length; index++) {
        const token = cell.tokens[index];
        assert.equal(Object.isFrozen(token), true, `${theme.key}/${cell.key}/token ${index}`);
        assert.ok(Number.isInteger(token.onsetSixteenths) && token.onsetSixteenths >= 0,
            `${theme.key}/${cell.key}/onset ${index}`);
        assert.ok(Number.isInteger(token.durationSixteenths) && token.durationSixteenths > 0,
            `${theme.key}/${cell.key}/duration ${index}`);
        if (index > 0) {
            const previous = cell.tokens[index - 1];
            assert.equal(token.onsetSixteenths,
                previous.onsetSixteenths + previous.durationSixteenths,
                `${theme.key}/${cell.key}/contiguous token ${index}`);
        }
        assert.ok(token.degree === null || Number.isInteger(token.degree),
            `${theme.key}/${cell.key}/degree ${index}`);
    }
    const last = cell.tokens.at(-1);
    assert.ok(last, `${theme.key}/${cell.key}/last token`);
    assert.equal(last.onsetSixteenths + last.durationSixteenths, expectedLength,
        `${theme.key}/${cell.key}/exact ending`);
    assert.ok(cell.tokens.filter(token => token.degree !== null).length >= 4,
        `${theme.key}/${cell.key}/sounding notes`);
}

/** 조옮김을 없앤 뒤 음정 진행·onset 간격·음 길이가 모두 같은 훅만 같은 것으로 본다. */
function normalizedHookSignature(theme: LocationMusicTheme): string {
    const cell = theme.phrases.motifA;
    let previousPitch: number | undefined;
    return cell.tokens.map((token, index) => {
        const pitch = token.degree === null
            ? null
            : scaleDegreeToMidi(60, theme.scale, token.degree);
        const interval = pitch === null
            ? 'r'
            : previousPitch === undefined ? '0' : String(pitch - previousPitch);
        if (pitch !== null) previousPitch = pitch;
        const nextOnset = cell.tokens[index + 1]?.onsetSixteenths ?? cell.lengthSixteenths;
        return `${interval}:${nextOnset - token.onsetSixteenths}:${token.durationSixteenths}`;
    }).join('|');
}

function firstHookSignature(arrangement: LocationMusicArrangement): string {
    const phraseLength = arrangement.meter.sixteenthsPerMeasure * 2;
    return arrangement.explorationLeadSchedule
        .filter(event => event.section === 'A' && event.hook && event.stepSixteenths < phraseLength)
        .map(event => `${event.stepSixteenths}:${event.note ?? 'r'}:${event.durationSixteenths}`)
        .join('|');
}

function normalizedScheduledHookSignature(arrangement: LocationMusicArrangement): string {
    const phraseLength = arrangement.meter.sixteenthsPerMeasure * 2;
    const events = arrangement.explorationLeadSchedule
        .filter(event => event.section === 'A' && event.hook && event.stepSixteenths < phraseLength);
    let previousPitch: number | undefined;
    return events.map((event, index) => {
        const interval = event.note === null
            ? 'r'
            : previousPitch === undefined ? '0' : String(event.note - previousPitch);
        if (event.note !== null) previousPitch = event.note;
        const nextOnset = events[index + 1]?.stepSixteenths ?? phraseLength;
        return `${interval}:${nextOnset - event.stepSixteenths}:${event.durationSixteenths}`;
    }).join('|');
}

function assertArrangementIsDeepFrozen(arrangement: LocationMusicArrangement): void {
    assert.equal(Object.isFrozen(arrangement), true, arrangement.locationId);
    assert.equal(Object.isFrozen(arrangement.theme), true, `${arrangement.locationId}/theme`);
    assert.equal(Object.isFrozen(arrangement.theme.scale), true, `${arrangement.locationId}/scale`);
    assert.equal(Object.isFrozen(arrangement.theme.scale.intervals), true,
        `${arrangement.locationId}/intervals`);
    assert.equal(Object.isFrozen(arrangement.theme.phrases), true,
        `${arrangement.locationId}/phrase book`);
    for (const key of PHRASE_KEYS) {
        assert.equal(Object.isFrozen(arrangement.theme.phrases[key]), true,
            `${arrangement.locationId}/${key}`);
        assert.equal(Object.isFrozen(arrangement.theme.phrases[key].tokens), true,
            `${arrangement.locationId}/${key}/tokens`);
        assert.ok(arrangement.theme.phrases[key].tokens.every(Object.isFrozen),
            `${arrangement.locationId}/${key}/token`);
    }
    assert.equal(Object.isFrozen(arrangement.theme.chords), true,
        `${arrangement.locationId}/authored chords`);
    assert.ok(arrangement.theme.chords.every(Object.isFrozen),
        `${arrangement.locationId}/authored chord`);
    assert.equal(Object.isFrozen(arrangement.theme.register), true, `${arrangement.locationId}/register`);
    assert.equal(Object.isFrozen(arrangement.motifMidi), true, `${arrangement.locationId}/motif`);
    assert.equal(Object.isFrozen(arrangement.motifAccents), true, `${arrangement.locationId}/accents`);
    assert.equal(Object.isFrozen(arrangement.counterMidi), true, `${arrangement.locationId}/counter`);
    assert.equal(Object.isFrozen(arrangement.chordMidi), true, `${arrangement.locationId}/chords`);
    assert.ok(arrangement.chordMidi.every(Object.isFrozen), `${arrangement.locationId}/chord`);
    assert.equal(Object.isFrozen(arrangement.bassMidi), true, `${arrangement.locationId}/bass`);
    assert.equal(Object.isFrozen(arrangement.explorationLeadSchedule), true,
        `${arrangement.locationId}/lead schedule`);
    assert.ok(arrangement.explorationLeadSchedule.every(Object.isFrozen),
        `${arrangement.locationId}/lead event`);
    assert.equal(Object.isFrozen(arrangement.explorationChordSchedule), true,
        `${arrangement.locationId}/chord schedule`);
    assert.ok(arrangement.explorationChordSchedule.every(event => Object.isFrozen(event)
        && Object.isFrozen(event.notes)), `${arrangement.locationId}/chord event`);
}

function findActiveChord(
    arrangement: LocationMusicArrangement,
    stepSixteenths: number,
): ExplorationChordScheduleEvent | undefined {
    return arrangement.explorationChordSchedule.find(event => (
        event.stepSixteenths <= stepSixteenths
        && stepSixteenths < event.stepSixteenths + event.durationSixteenths
    ));
}

function chordContainsPitch(chord: ExplorationChordScheduleEvent, pitch: number): boolean {
    const pitchClass = ((pitch % 12) + 12) % 12;
    return chord.notes.some(note => ((note % 12) + 12) % 12 === pitchClass);
}

function sectionRetention(arrangement: LocationMusicArrangement): number {
    const sectionLength = arrangement.meter.sixteenthsPerMeasure * 8;
    const signature = (section: MusicFormSectionKey, start: number): Set<string> => new Set(
        arrangement.explorationLeadSchedule
            .filter(event => event.section === section)
            .map(event => `${event.stepSixteenths - start}:${event.note ?? 'r'}:${event.durationSixteenths}`),
    );
    const a = signature('A', 0);
    const aReturn = signature('A-return', sectionLength * 3);
    const retained = [...a].filter(token => aReturn.has(token)).length;
    return retained / Math.max(a.size, aReturn.size);
}

test('35개 권역은 고정된 2마디 A·응답·B·종지 악구와 조옮김에도 고유한 훅을 갖는다', () => {
    const themes = LocationMusicTheme.values();
    const scales = MusicScale.values();

    assert.equal(themes.length, 35);
    assert.equal(new Set(themes.map(theme => theme.key)).size, themes.length);
    assert.equal(new Set(themes.map(theme => theme.mapColor)).size, themes.length);
    assert.equal(scales.length, 13);
    assert.equal(new Set(scales.map(scale => scale.key)).size, scales.length);
    assert.deepEqual(MusicMeter.values(), [MusicMeter.COMMON, MusicMeter.WALTZ]);
    assert.equal(MusicMeter.fromKey('4/4'), MusicMeter.COMMON);
    assert.equal(MusicMeter.fromKey('3/4'), MusicMeter.WALTZ);

    for (const scale of scales) {
        assert.equal(Object.isFrozen(scale), true, scale.key);
        assert.equal(Object.isFrozen(scale.intervals), true, scale.key);
        assert.ok(scale.intervals.length >= 5 && scale.intervals.length <= 7, scale.key);
        assert.deepEqual([...scale.intervals].sort((left, right) => left - right), scale.intervals, scale.key);
        assert.equal(new Set(scale.intervals).size, scale.intervals.length, scale.key);
        assert.equal(scale.intervals[0], 0, scale.key);
        assert.ok(scale.intervals.every(interval => Number.isInteger(interval)
            && interval >= 0 && interval < 12), scale.key);
        assert.equal(MusicScale.fromKey(scale.key), scale);
        assert.equal(MusicScale.fromInput(scale.label), scale);
    }

    for (const theme of themes) {
        assert.equal(Object.isFrozen(theme), true, theme.key);
        assert.match(theme.key, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
        assert.match(theme.mapColor, /^#[0-9a-f]{6}$/);
        assert.match(theme.root, /^[A-G](?:#|b)?[0-8]$/);
        assert.equal(rootLabelToMidi(theme.root), theme.rootMidi, theme.key);
        assert.ok(Number.isInteger(theme.bpm) && theme.bpm >= 40 && theme.bpm <= 180, theme.key);
        assert.equal(theme.rhythm === 'waltz', theme.meter === MusicMeter.WALTZ,
            `${theme.key}/real meter`);
        assert.equal(Object.isFrozen(theme.phrases), true, `${theme.key}/phrase book`);
        for (const key of PHRASE_KEYS) {
            const phrase = theme.phrases[key];
            assert.equal(phrase.key, key, `${theme.key}/${key}`);
            assert.equal(Object.isFrozen(phrase), true, `${theme.key}/${key}`);
            assert.equal(Object.isFrozen(phrase.tokens), true, `${theme.key}/${key}/tokens`);
            assertPhraseIsExactTwoBars(theme, phrase);
        }
        assert.equal(theme.chords.length, 4, theme.key);
        assert.ok(theme.chords.every(chord => chord.length === 3
            && chord.every(Number.isInteger)), theme.key);
        assert.ok(new Set(theme.chords.map(chord => chord[0])).size >= 2, `${theme.key}/authored roots`);
        assert.ok(theme.register.bassOctave <= theme.register.padOctave, theme.key);
        assert.ok(theme.register.padOctave <= theme.register.leadOctave, theme.key);
        assert.ok(TIMBRE_KEYS.has(theme.timbre), theme.key);
        assert.ok(RHYTHM_KEYS.has(theme.rhythm), theme.key);
        assert.equal(LocationMusicTheme.fromKey(theme.key), theme);
        assert.equal(LocationMusicTheme.fromInput(theme.name), theme);
        assert.equal(LocationMusicTheme.fromMapColor(theme.mapColor.toUpperCase()), theme);
        assert.equal(getLocationMusicThemeByColor(theme.mapColor), theme);
    }

    const hooks = new Map<string, string[]>();
    for (const theme of themes) {
        const signature = normalizedHookSignature(theme);
        hooks.set(signature, [...(hooks.get(signature) ?? []), theme.key]);
    }
    const collisions = [...hooks.values()].filter(keys => keys.length > 1);
    assert.equal(hooks.size, themes.length,
        `조옮김 정규화 훅 충돌: ${JSON.stringify(collisions)}`);
});

test('32마디 권역 선율은 계단 진행 중심이고 큰 도약을 절제한다', () => {
    const perTheme = LocationMusicTheme.values().map(theme => {
        const arrangement = resolveLocationMusicArrangement(theme.key, `motion-contract:${theme.key}`);
        const notes = arrangement.explorationLeadSchedule
            .flatMap(event => event.note === null ? [] : [event.note]);
        let stepwise = 0;
        let largeLeaps = 0;
        for (let index = 1; index < notes.length; index++) {
            const distance = Math.abs(notes[index] - notes[index - 1]);
            if (distance <= 3) stepwise++;
            if (distance >= 7) largeLeaps++;
        }
        return { theme: theme.key, motions: notes.length - 1, stepwise, largeLeaps };
    });
    const totalMotions = perTheme.reduce((sum, metric) => sum + metric.motions, 0);
    const totalStepwise = perTheme.reduce((sum, metric) => sum + metric.stepwise, 0);
    const totalLargeLeaps = perTheme.reduce((sum, metric) => sum + metric.largeLeaps, 0);
    const stepwiseRate = totalStepwise / totalMotions;
    const largeLeapRate = totalLargeLeaps / totalMotions;

    assert.ok(stepwiseRate >= 0.65 && stepwiseRate <= 0.82,
        `전체 훅 계단 진행 비율 ${(stepwiseRate * 100).toFixed(1)}% (목표 65~82%)`);
    assert.ok(largeLeapRate <= 0.05,
        `전체 훅 7반음 이상 도약 비율 ${(largeLeapRate * 100).toFixed(1)}% (최대 5%)`);
    for (const metric of perTheme) {
        const stepwise = metric.stepwise / metric.motions;
        const largeLeaps = metric.largeLeaps / metric.motions;
        const leapCeiling = ANGULAR_LEAP_THEME_EXCEPTIONS.has(metric.theme) ? 0.12 : 0.05;
        assert.ok(stepwise >= 0.55,
            `${metric.theme}/계단 진행 ${(stepwise * 100).toFixed(1)}% (최소 55%)`);
        assert.ok(largeLeaps <= leapCeiling,
            `${metric.theme}/7반음 이상 도약 ${(largeLeaps * 100).toFixed(1)}% (최대 ${leapCeiling * 100}%)`);
    }
});

test('623개 장소의 35색은 누락·고아 테마 없이 대응하고 같은 권역은 훅을 보존한 채 편곡만 달라진다', () => {
    assert.equal(baseLocations.length, 292);
    assert.equal(generatedLocations.length, 331);
    assert.equal(locations.length, 623);
    assert.equal(new Set(locations.map(location => location.id)).size, locations.length);
    assert.ok(locations.every(location => location.mapColor));

    const worldColors = [...new Set(locations.map(location => location.mapColor!.toLowerCase()))].sort();
    const themeColors = LocationMusicTheme.values().map(theme => theme.mapColor).sort();
    assert.equal(worldColors.length, 35);
    assert.deepEqual(themeColors, worldColors);

    const arrangementsByColor = new Map<string, LocationMusicArrangement[]>();
    for (const location of locations) {
        const color = location.mapColor!.toLowerCase();
        const arrangement = composeLocationScore(location.id, color);
        assert.equal(arrangement.theme.mapColor, color, location.id);
        assert.equal(arrangement.theme, getLocationMusicThemeByColor(color), location.id);
        arrangementsByColor.set(color, [...(arrangementsByColor.get(color) ?? []), arrangement]);
    }

    for (const [color, arrangements] of arrangementsByColor) {
        assert.equal(new Set(arrangements.map(arrangement => arrangement.theme.key)).size, 1, color);
        const hook = firstHookSignature(arrangements[0]);
        assert.ok(hook.length > 0, `${color}/hook`);
        assert.ok(arrangements.every(arrangement => firstHookSignature(arrangement) === hook),
            `${color}/seed must not rewrite hook`);
        assert.equal(
            new Set(arrangements.map(arrangement => arrangement.arrangementSignature)).size,
            arrangements.length,
            `${color}/location arrangement signatures`,
        );
    }
});

test('장소 악보는 32마디 A8–A′8–B8–A″8 형식과 반복 가능한 으뜸음 종지를 지킨다', () => {
    for (const theme of LocationMusicTheme.values()) {
        const arrangement = resolveLocationMusicArrangement(theme.key, `form-contract:${theme.key}`);
        const measureLength = theme.meter.sixteenthsPerMeasure;
        const sectionLength = measureLength * 8;

        assert.equal(arrangement.meter, theme.meter, theme.key);
        assert.equal(arrangement.loopMeasures, 32, theme.key);
        assert.equal(arrangement.loopMeasures, EXPLORATION_LOOP_MEASURES, theme.key);
        assert.equal(arrangement.loopSixteenths, measureLength * 32, theme.key);
        assert.equal(arrangement.loopTicks,
            arrangement.loopSixteenths * MUSIC_TICKS_PER_SIXTEENTH, theme.key);
        assert.equal(MUSIC_TICKS_PER_QUARTER, 192);
        assert.equal(MUSIC_TICKS_PER_SIXTEENTH, 48);
        assert.equal(normalizedScheduledHookSignature(arrangement), normalizedHookSignature(theme),
            `${theme.key}/authored hook must survive composition exactly`);

        SECTION_KEYS.forEach((section, index) => {
            const events = arrangement.explorationLeadSchedule.filter(event => event.section === section);
            assert.ok(events.length > 0, `${theme.key}/${section}`);
            assert.equal(events[0].stepSixteenths, index * sectionLength,
                `${theme.key}/${section}/start measure ${index * 8}`);
            assert.ok(events.every(event => event.stepSixteenths >= index * sectionLength
                && event.stepSixteenths < (index + 1) * sectionLength),
            `${theme.key}/${section}/eight bars`);
        });

        const hookNotes = theme.phrases.motifA.tokens.filter(token => token.degree !== null).length;
        const hookStarts = arrangement.explorationLeadSchedule.filter(event => event.hook
            && event.stepSixteenths % (measureLength * 2) === 0).length;
        assert.ok(hookNotes >= 4, `${theme.key}/hook sounding notes`);
        assert.ok(hookStarts >= 4, `${theme.key}/hook occurrences: ${hookStarts}`);

        const retention = sectionRetention(arrangement);
        assert.ok(retention >= 0.75,
            `${theme.key}/A-return pitch+rhythm retention ${(retention * 100).toFixed(1)}%`);

        const finalEvent = arrangement.explorationLeadSchedule.at(-1);
        assert.ok(finalEvent, `${theme.key}/final event`);
        assert.notEqual(finalEvent.note, null, `${theme.key}/final sounding tonic`);
        assert.equal(pitchClassFromRoot(finalEvent.note!, theme.rootMidi), 0, `${theme.key}/final tonic`);
        assert.ok(finalEvent.durationSixteenths >= 8 && finalEvent.durationSixteenths <= 16,
            `${theme.key}/final duration 2~4 beats`);
        assert.equal(finalEvent.stepSixteenths + finalEvent.durationSixteenths,
            arrangement.loopSixteenths, `${theme.key}/final event closes loop`);
    }
});

test('강박 선율은 현재 화음에 70% 이상 정착하고 화음은 활성 선율 시간의 80% 이상을 덮는다', () => {
    for (const theme of LocationMusicTheme.values()) {
        const arrangement = resolveLocationMusicArrangement(theme.key, `harmony-contract:${theme.key}`);
        const sounding = arrangement.explorationLeadSchedule.filter(
            (event): event is typeof event & { note: number } => event.note !== null,
        );
        const strongBeat = sounding.filter(event => (
            event.stepSixteenths % arrangement.meter.sixteenthsPerMeasure === 0
        ));
        const strongChordTones = strongBeat.filter(event => {
            const chord = findActiveChord(arrangement, event.stepSixteenths);
            return chord !== undefined && chordContainsPitch(chord, event.note);
        });
        const allChordTones = sounding.filter(event => {
            const chord = findActiveChord(arrangement, event.stepSixteenths);
            return chord !== undefined && chordContainsPitch(chord, event.note);
        });
        const totalLeadDuration = sounding.reduce((sum, event) => sum + event.durationSixteenths, 0);
        const harmonyCoveredDuration = sounding.reduce((sum, event) => {
            const start = event.stepSixteenths;
            const end = start + event.durationSixteenths;
            const covered = arrangement.explorationChordSchedule.reduce((duration, chord) => {
                const overlapStart = Math.max(start, chord.stepSixteenths);
                const overlapEnd = Math.min(end, chord.stepSixteenths + chord.durationSixteenths);
                return duration + Math.max(0, overlapEnd - overlapStart);
            }, 0);
            return sum + Math.min(event.durationSixteenths, covered);
        }, 0);

        assert.ok(strongBeat.length >= 8, `${theme.key}/strong beat sample`);
        assert.ok(strongChordTones.length / strongBeat.length >= 0.7,
            `${theme.key}/strong chord-tone ${(strongChordTones.length / strongBeat.length * 100).toFixed(1)}%`);
        assert.ok(allChordTones.length / sounding.length >= 0.5,
            `${theme.key}/all-onset chord-tone ${(allChordTones.length / sounding.length * 100).toFixed(1)}%`);
        assert.ok(harmonyCoveredDuration / totalLeadDuration >= 0.8,
            `${theme.key}/active harmony coverage ${(harmonyCoveredDuration / totalLeadDuration * 100).toFixed(1)}%`);
    }
});

test('초반 밝은 권역은 장조 화성·높은 선율·가벼운 mix를 유지한다', () => {
    assert.deepEqual(LocationMusicTheme.LUMINAR.register, {
        bassOctave: -2,
        padOctave: 1,
        leadOctave: 2,
    });
    assert.deepEqual(LocationMusicTheme.MEADOW.register, {
        bassOctave: -1,
        padOctave: 1,
        leadOctave: 2,
    });
    assert.deepEqual(
        LocationMusicTheme.values().filter(theme => theme.brightExploration).map(theme => theme.key),
        ['luminar', 'luminous-pond', 'meadow', 'silverweb', 'dawn-sanctum'],
    );
    assert.equal(LocationMusicTheme.SILVERWEB.scale, MusicScale.MIXOLYDIAN);

    const luminar = composeLocationScore('town_square', '#d6a85f');
    const jobHall = composeLocationScore('job_hall', '#d6a85f');
    const pond = composeLocationScore('luminous_pond', '#63a9bf');
    const meadow = composeLocationScore('field', '#6fa85d');
    const silverweb = composeLocationScore('silverweb_contract', '#4f7857');
    const dawn = composeLocationScore('dawn_contract', '#ddd19a');

    assert.deepEqual(luminar.chordMidi, [[67, 71, 74], [72, 76, 79], [74, 78, 81], [67, 71, 74]]);
    assert.deepEqual(pond.chordMidi, [[62, 66, 69], [71, 74, 78], [64, 69, 74], [69, 74, 78]]);
    assert.deepEqual(meadow.chordMidi, [[60, 64, 67], [69, 72, 76], [65, 69, 72], [67, 71, 74]]);
    assert.deepEqual(silverweb.chordMidi, [[64, 68, 71], [74, 78, 81], [69, 73, 76], [64, 68, 71]]);
    assert.deepEqual(dawn.chordMidi, [[62, 66, 69], [64, 68, 71], [69, 73, 76], [62, 66, 69]]);
    assert.deepEqual(jobHall.chordMidi, luminar.chordMidi);

    for (const arrangement of [luminar, jobHall, pond, meadow, silverweb, dawn]) {
        const hookNotes = arrangement.explorationLeadSchedule
            .flatMap(event => event.hook && event.note !== null ? [event.note] : []);
        assert.ok(midiRange(hookNotes)[0]
            - midiRange(arrangement.chordMidi.flat())[0] >= 12,
        `${arrangement.locationId}/bright lead-pad separation`);
        for (const chord of arrangement.chordMidi) {
            const intervals = chord.slice(1).map((note, index) => note - chord[index]);
            assert.ok(Math.min(...intervals) >= 3, `${arrangement.locationId}/consonant chord`);
        }
    }

    assert.equal(getExplorationMixProfile(LocationMusicTheme.LUMINAR), BRIGHT_EXPLORATION_MIX);
    assert.equal(getExplorationMixProfile(LocationMusicTheme.NECROPOLIS), STANDARD_EXPLORATION_MIX);
    for (const profile of [STANDARD_EXPLORATION_MIX, BRIGHT_EXPLORATION_MIX]) {
        assert.ok(profile.padMaxPolyphony >= 6);
        assert.ok(profile.highpassHz >= 180);
        assert.ok(profile.leadVolumeDb - profile.padVolumeDb >= 6);
        assert.ok(profile.lowEqDb <= -4.5);
    }
});

test('장소 편곡은 결정론적·불변이고 전 음역과 음계 및 chord-linked bass 계약을 지킨다', () => {
    for (const location of locations) {
        const first = composeLocationScore(location.id, location.mapColor);
        const second = composeLocationScore(location.id, location.mapColor);
        assert.deepEqual(second, first, location.id);
        assert.notEqual(second, first, location.id);
        assertArrangementIsDeepFrozen(first);

        assert.ok(first.seed >= 0 && first.seed <= 0xffff_ffff, location.id);
        assert.ok(Math.abs(first.bpm - first.theme.bpm) <= 1, location.id);
        assert.ok(first.rhythmPhase >= 0 && first.rhythmPhase < 8, location.id);
        assert.equal(first.motifMidi.length, first.explorationLeadSchedule.length, location.id);
        assert.equal(first.motifAccents.length, first.motifMidi.length, location.id);
        assert.equal(first.counterMidi.length, first.motifMidi.length, location.id);
        assert.equal(first.chordMidi.length, first.theme.chords.length, location.id);
        assert.equal(first.bassMidi.length, first.theme.chords.length, location.id);
        assert.equal(first.explorationChordSchedule.length, first.loopMeasures, location.id);
        assert.ok(first.explorationLeadSchedule.every((event, index) => (
            event.stepSixteenths >= 0
            && event.stepSixteenths < first.loopSixteenths
            && event.durationSixteenths > 0
            && event.stepSixteenths + event.durationSixteenths <= first.loopSixteenths
            && (index === 0
                || event.stepSixteenths > first.explorationLeadSchedule[index - 1].stepSixteenths)
            && event.note === first.motifMidi[index]
            && event.accent === first.motifAccents[index]
        )), `${location.id}/lead schedule`);
        assert.ok(first.explorationChordSchedule.every((event, index) => (
            event.stepSixteenths >= 0
            && event.stepSixteenths < first.loopSixteenths
            && event.durationSixteenths > 0
            && event.stepSixteenths === index * first.meter.sixteenthsPerMeasure
            && event.durationSixteenths === first.meter.sixteenthsPerMeasure
            && event.notes.length >= 3
            && event.notes.length <= 4
            && first.bassMidi.includes(event.bassNote)
        )), `${location.id}/chord schedule`);
        assert.ok(first.melodySignature.length > 0, location.id);
        assert.ok(first.arrangementSignature.includes(first.melodySignature), location.id);
        assert.ok(first.motifAccents.some(Boolean), `${location.id}/accent`);
        assert.ok(first.counterMidi.some(note => note !== null), `${location.id}/boss counter`);

        first.motifMidi.forEach((note, index) => assertScaleNote(first, note, `motif/${index}`));
        first.counterMidi.forEach((note, index) => assertScaleNote(first, note, `counter/${index}`));
        first.chordMidi.flat().forEach((note, index) => assertScaleNote(first, note, `chord/${index}`));
        first.explorationChordSchedule.flatMap(event => [...event.notes, event.bassNote])
            .forEach((note, index) => assertScaleNote(first, note, `scheduled harmony/${index}`));
        assert.ok(midiRange(first.motifMidi)[0] >= EXPLORATION_MELODY_MIN_MIDI,
            `${location.id}/melody floor`);
        assert.ok(midiRange(first.motifMidi)[1] <= EXPLORATION_MELODY_MAX_MIDI,
            `${location.id}/melody ceiling`);
        assert.ok(midiRange(first.chordMidi.flat())[0] >= EXPLORATION_HARMONY_MIN_MIDI,
            `${location.id}/harmony floor`);
        assert.ok(midiRange(first.chordMidi.flat())[1] <= EXPLORATION_HARMONY_MAX_MIDI,
            `${location.id}/harmony ceiling`);
        assert.ok(midiRange(first.counterMidi)[0] >= EXPLORATION_MELODY_MIN_MIDI,
            `${location.id}/counter floor`);
        assert.ok(midiRange(first.counterMidi)[1] <= EXPLORATION_MELODY_MAX_MIDI,
            `${location.id}/counter ceiling`);
        first.bassMidi.forEach((note, index) => {
            assert.ok(note >= 24 && note <= 55, `${location.id}/bass/${index}: ${note}`);
            assertScaleNote(first, note, `bass/${index}`);
        });
        assert.ok(new Set(first.bassMidi).size >= 2, `${location.id}/moving bass`);
    }
});

test('rhythm·timbre profile과 엔진은 PPQ 192 tick 악보·동적 loop·공통 Freeverb를 사용한다', () => {
    const rhythmSignatures = new Set<string>();
    for (const key of RHYTHM_KEY_VALUES) {
        const profile = getExplorationRhythmProfile(key);
        assert.equal(Object.isFrozen(profile), true, key);
        assert.equal(Object.isFrozen(profile.chordVelocities), true, key);
        assert.equal(profile.chordVelocities.length, 4, key);
        assert.ok(profile.chordVelocities.every(velocity => velocity > 0 && velocity <= 1), key);
        rhythmSignatures.add(JSON.stringify(profile));
    }
    assert.equal(rhythmSignatures.size, RHYTHM_KEY_VALUES.length);

    const timbreSignatures = new Set<string>();
    for (const key of TIMBRE_KEY_VALUES) {
        const profile = getExplorationTimbreProfile(key);
        assert.equal(Object.isFrozen(profile), true, key);
        assert.equal(Object.isFrozen(profile.leadEnvelope), true, key);
        assert.equal(Object.isFrozen(profile.padEnvelope), true, key);
        assert.ok(profile.leadEnvelope.attack >= 0 && profile.leadEnvelope.release > 0, key);
        assert.ok(profile.padEnvelope.attack >= 0 && profile.padEnvelope.release > 0, key);
        timbreSignatures.add(JSON.stringify(profile));
    }
    assert.equal(timbreSignatures.size, TIMBRE_KEY_VALUES.length);

    assert.equal(EXPLORATION_LOOP_MEASURES, 32);
    assert.equal(MUSIC_SCENE_TRANSITION.crossFadeSeconds, 1.9);
    const engineSource = readFileSync(
        new URL('../../../client/src/audio/AdaptiveMusicEngine.ts', import.meta.url),
        'utf8',
    );
    assert.match(engineSource, /arrangement\.explorationLeadSchedule/);
    assert.match(engineSource, /arrangement\.explorationChordSchedule/);
    assert.match(engineSource, /arrangement\.loopTicks/);
    assert.match(engineSource, /loopEnd\s*=\s*tickTime\(loopTicks\)/);
    assert.match(engineSource,
        /Tone\.getTransport\(\)\.PPQ\s*=\s*MUSIC_TICKS_PER_QUARTER/);
    assert.match(engineSource, /getTicksAtTime\(Tone\.now\(\)\)/);
    assert.match(engineSource, /part\.start\((?:tickTime\(startTick\)|`\$\{startTick\}i`),\s*(?:tickTime\(0\)|'0i')\)/);
    assert.match(engineSource, /}, tickTime\(startTick\)\)/);
    assert.ok(engineSource.indexOf('startAtTick(startTick)')
        < engineSource.indexOf('transport.scheduleOnce'),
        'Parts must be armed at the explicit start tick before the transition callback');
    assert.match(engineSource, /new Tone\.Freeverb/);
    assert.doesNotMatch(engineSource, /new Tone\.Reverb/);
    assert.match(engineSource,
        /const bossHarmony = new Tone\.PolySynth\(\{\s*maxPolyphony: 4,/);
    assert.doesNotMatch(engineSource, /@4n|MUSIC_SCENE_TRANSITION\.quantize/);
    assert.doesNotMatch(engineSource, /\.start\(0\)/);
    assert.doesNotMatch(engineSource, /['"`]\d+(?:n|m|t)\.?['"`]/,
        'Tone Transport event times and durations must be PPQ tick strings');
    assert.doesNotMatch(engineSource, /['"`]\d+:\d+:\d+['"`]/,
        'global Transport meter makes bars:beats:sixteenths unsafe');
});

test('같은 권역의 두 장소는 훅을 그대로 공유하고 seed 기반 편곡만 달라지며 알 수 없는 색은 폴백한다', () => {
    const field = composeLocationScore('field', '#6fa85d');
    const meadow = composeLocationScore('meadow_2', '#6fa85d');
    assert.equal(field.theme, LocationMusicTheme.MEADOW);
    assert.equal(meadow.theme, LocationMusicTheme.MEADOW);
    assert.notEqual(field.seed, meadow.seed);
    assert.equal(firstHookSignature(field), firstHookSignature(meadow));
    assert.notEqual(field.arrangementSignature, meadow.arrangementSignature);
    assert.deepEqual(composeLocationScore('field', '  #6FA85D  '), field);

    const fallback = composeLocationScore('unmapped-place', '#ffffff');
    assert.equal(fallback.theme, LocationMusicTheme.LUMINAR);
    assert.equal(fallback.locationId, 'unmapped-place');
    assert.deepEqual(fallback, resolveLocationMusicArrangement('luminar', 'unmapped-place'));
    assert.equal(composeLocationScore('   ', null).locationId, 'unknown-location');
});

test('명시적 전투 상태를 우선하고 구버전 target snapshot은 탐험·일반전투·보스전투로 폴백한다', () => {
    const bossTarget = { kind: 'monster', isBoss: true, life: 100, defeated: false } as const;
    const monsterTarget = { kind: 'monster', life: 100, defeated: false } as const;
    const playerTarget = { kind: 'player', life: 100, defeated: false } as const;
    const objectTarget = { kind: 'object', life: 100, defeated: false } as const;

    assert.equal(resolveMusicCombatState('exploration', bossTarget), MusicCombatState.EXPLORATION);
    assert.equal(resolveMusicCombatState('combat', bossTarget), MusicCombatState.COMBAT);
    assert.equal(resolveMusicCombatState('boss', null), MusicCombatState.BOSS);
    assert.equal(resolveMusicCombatState('invalid', bossTarget), MusicCombatState.BOSS);
    assert.equal(resolveMusicCombatState(undefined, monsterTarget), MusicCombatState.COMBAT);
    assert.equal(resolveMusicCombatState(undefined, playerTarget), MusicCombatState.COMBAT);
    assert.equal(resolveMusicCombatState(undefined, objectTarget), MusicCombatState.EXPLORATION);
    assert.equal(resolveMusicCombatState(undefined, null), MusicCombatState.EXPLORATION);
    assert.equal(resolveMusicCombatState(undefined, { ...bossTarget, life: 0 }), MusicCombatState.EXPLORATION);
    assert.equal(resolveMusicCombatState(undefined, { ...bossTarget, defeated: true }), MusicCombatState.EXPLORATION);
    assert.equal(MusicCombatState.fromInput('보스 전투'), MusicCombatState.BOSS);
});

test('음악 음량은 fake storage에서 0~100 정규화·저장·복원하고 storage 오류를 무시한다', () => {
    const values = new Map<string, string>();
    const storage: MusicStorageLike = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => { values.set(key, value); },
    };

    assert.equal(DEFAULT_MUSIC_VOLUME, 35);
    assert.equal(normalizeMusicVolume(undefined), DEFAULT_MUSIC_VOLUME);
    assert.equal(normalizeMusicVolume('invalid'), DEFAULT_MUSIC_VOLUME);
    assert.equal(normalizeMusicVolume(-10), 0);
    assert.equal(normalizeMusicVolume(54.6), 55);
    assert.equal(normalizeMusicVolume('73'), 73);
    assert.equal(normalizeMusicVolume(150), 100);
    assert.equal(readMusicVolume(null), DEFAULT_MUSIC_VOLUME);
    assert.equal(readMusicVolume(storage), DEFAULT_MUSIC_VOLUME);
    assert.equal(writeMusicVolume(storage, 64.4), 64);
    assert.equal(values.get(MUSIC_VOLUME_STORAGE_KEY), '64');
    assert.equal(readMusicVolume(storage), 64);

    const throwingStorage: MusicStorageLike = {
        getItem: () => { throw new Error('blocked'); },
        setItem: () => { throw new Error('blocked'); },
    };
    assert.equal(readMusicVolume(throwingStorage), DEFAULT_MUSIC_VOLUME);
    assert.equal(writeMusicVolume(throwingStorage, 87), 87);
    assert.equal(writeMusicVolume(undefined, 101), 100);
});
