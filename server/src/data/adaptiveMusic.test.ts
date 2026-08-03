import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    BRIGHT_EXPLORATION_MIX,
    DEFAULT_MUSIC_VOLUME,
    EXPLORATION_HARMONY_MAX_MIDI,
    EXPLORATION_HARMONY_MIN_MIDI,
    EXPLORATION_MELODY_MAX_MIDI,
    EXPLORATION_MELODY_MIN_MIDI,
    LocationMusicTheme,
    MUSIC_VOLUME_STORAGE_KEY,
    MusicCombatState,
    MusicScale,
    STANDARD_EXPLORATION_MIX,
    composeLocationScore,
    getLocationMusicThemeByColor,
    getExplorationMixProfile,
    normalizeMusicVolume,
    readMusicVolume,
    resolveMusicCombatState,
    resolveLocationMusicArrangement,
    scaleDegreeToMidi,
    writeMusicVolume,
    type LocationMusicArrangement,
    type MusicStorageLike,
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

const TIMBRE_KEYS = new Set(['warm', 'water', 'wood', 'dark', 'metal', 'air', 'holy', 'cosmic']);
const RHYTHM_KEYS = new Set(['steady', 'waltz', 'syncopated', 'march', 'pulse', 'broken', 'swing']);
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

function assertArrangementIsDeepFrozen(arrangement: LocationMusicArrangement): void {
    assert.equal(Object.isFrozen(arrangement), true, arrangement.locationId);
    assert.equal(Object.isFrozen(arrangement.theme), true, `${arrangement.locationId}/theme`);
    assert.equal(Object.isFrozen(arrangement.theme.scale), true, `${arrangement.locationId}/scale`);
    assert.equal(Object.isFrozen(arrangement.theme.scale.intervals), true, `${arrangement.locationId}/intervals`);
    assert.equal(Object.isFrozen(arrangement.theme.motif), true, `${arrangement.locationId}/authored motif`);
    assert.equal(Object.isFrozen(arrangement.theme.chords), true, `${arrangement.locationId}/authored chords`);
    assert.ok(arrangement.theme.chords.every(Object.isFrozen), `${arrangement.locationId}/authored chord`);
    assert.equal(Object.isFrozen(arrangement.theme.register), true, `${arrangement.locationId}/register`);
    assert.equal(Object.isFrozen(arrangement.motifMidi), true, `${arrangement.locationId}/motif`);
    assert.equal(Object.isFrozen(arrangement.motifAccents), true, `${arrangement.locationId}/accents`);
    assert.equal(Object.isFrozen(arrangement.counterMidi), true, `${arrangement.locationId}/counter`);
    assert.equal(Object.isFrozen(arrangement.chordMidi), true, `${arrangement.locationId}/chords`);
    assert.ok(arrangement.chordMidi.every(Object.isFrozen), `${arrangement.locationId}/chord`);
    assert.equal(Object.isFrozen(arrangement.bassMidi), true, `${arrangement.locationId}/bass`);
}

test('35개 권역 악보는 고유 색·유효 음계·8~16 step 선율과 움직이는 화성 저음을 제공한다', () => {
    const themes = LocationMusicTheme.values();
    const scales = MusicScale.values();

    assert.equal(themes.length, 35);
    assert.equal(new Set(themes.map(theme => theme.key)).size, themes.length);
    assert.equal(new Set(themes.map(theme => theme.mapColor)).size, themes.length);
    assert.equal(scales.length, 13);
    assert.equal(new Set(scales.map(scale => scale.key)).size, scales.length);

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
        assert.ok(Number.isInteger(theme.rootMidi) && theme.rootMidi >= 24 && theme.rootMidi <= 103, theme.key);
        assert.equal(rootLabelToMidi(theme.root), theme.rootMidi, theme.key);
        assert.ok(Number.isInteger(theme.bpm) && theme.bpm >= 40 && theme.bpm <= 180, theme.key);
        assert.ok(theme.motif.length >= 8 && theme.motif.length <= 16, theme.key);
        assert.equal(theme.motif.length % 4, 0, `${theme.key}/four-step phrases`);
        assert.ok(theme.motif.some(degree => degree !== null), theme.key);
        assert.ok(theme.motif.every(degree => degree === null
            || (Number.isInteger(degree) && Math.abs(degree) <= theme.scale.intervals.length * 2)), theme.key);
        assert.equal(theme.chords.length, 4, theme.key);
        assert.ok(theme.chords.every(chord => chord.length === 3
            && chord.every(degree => Number.isInteger(degree)
                && Math.abs(degree) <= theme.scale.intervals.length * 2)), theme.key);
        assert.ok(new Set(theme.chords.map(chord => chord[0])).size >= 2, `${theme.key}/authored roots`);
        assert.ok(Number.isInteger(theme.register.bassOctave), theme.key);
        assert.ok(Number.isInteger(theme.register.padOctave), theme.key);
        assert.ok(Number.isInteger(theme.register.leadOctave), theme.key);
        assert.ok(theme.register.bassOctave <= theme.register.padOctave, theme.key);
        assert.ok(theme.register.padOctave <= theme.register.leadOctave, theme.key);
        assert.ok(TIMBRE_KEYS.has(theme.timbre), theme.key);
        assert.ok(RHYTHM_KEYS.has(theme.rhythm), theme.key);
        assert.equal(LocationMusicTheme.fromKey(theme.key), theme);
        assert.equal(LocationMusicTheme.fromInput(theme.name), theme);
        assert.equal(LocationMusicTheme.fromMapColor(theme.mapColor.toUpperCase()), theme);
        assert.equal(getLocationMusicThemeByColor(theme.mapColor), theme);

        for (const degree of theme.motif) {
            if (degree === null) continue;
            const midi = scaleDegreeToMidi(theme.rootMidi, theme.scale, degree);
            assert.ok(theme.scale.intervals.includes(pitchClassFromRoot(midi, theme.rootMidi)), theme.key);
        }
        const arrangement = composeLocationScore(`catalog:${theme.key}`, theme.mapColor);
        assert.ok(new Set(arrangement.bassMidi).size >= 2, `${theme.key}/arranged bass roots`);
    }
});

test('merged 623개 장소의 35색은 누락·고아 테마 없이 정확히 하나의 권역 악보를 갖는다', () => {
    assert.equal(baseLocations.length, 292);
    assert.equal(generatedLocations.length, 331);
    assert.equal(locations.length, 623);
    assert.equal(new Set(locations.map(location => location.id)).size, locations.length);
    assert.ok(locations.every(location => location.mapColor));

    const worldColors = [...new Set(locations.map(location => location.mapColor!.toLowerCase()))].sort();
    const themeColors = LocationMusicTheme.values().map(theme => theme.mapColor).sort();
    assert.equal(worldColors.length, 35);
    assert.deepEqual(themeColors, worldColors);

    const locationsByColor = new Map<string, LocationData[]>();
    for (const location of locations) {
        const color = location.mapColor!.toLowerCase();
        const grouped = locationsByColor.get(color) ?? [];
        grouped.push(location);
        locationsByColor.set(color, grouped);

        const arrangement = composeLocationScore(location.id, color);
        assert.equal(arrangement.theme.mapColor, color, location.id);
        assert.equal(arrangement.theme, getLocationMusicThemeByColor(color), location.id);
    }

    for (const [color, regionLocations] of locationsByColor) {
        const arrangements = regionLocations.map(location => composeLocationScore(location.id, color));
        assert.equal(new Set(arrangements.map(arrangement => arrangement.theme.key)).size, 1, color);
        assert.equal(
            new Set(arrangements.map(arrangement => arrangement.melodySignature)).size,
            regionLocations.length,
            `${color}: location melody signatures`,
        );
    }
});

test('초반 밝은 권역은 seed가 장조 화성과 높은 선율을 어둡게 바꾸지 않는다', () => {
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
    const meadowOne = composeLocationScore('field', '#6fa85d');
    const meadowTwo = composeLocationScore('meadow_2', '#6fa85d');
    const meadowThree = composeLocationScore('meadow_3', '#6fa85d');

    assert.deepEqual(luminar.chordMidi, [
        [67, 71, 74],
        [72, 76, 79],
        [74, 78, 81],
        [67, 71, 76],
    ], '광장 seed가 I-IV-V-vi6 화성을 회전·감화음화하지 않아야 한다.');
    assert.deepEqual(jobHall.chordMidi, luminar.chordMidi);
    assert.deepEqual(midiRange(luminar.motifMidi), [79, 91]);
    assert.deepEqual(midiRange(jobHall.motifMidi), [79, 91]);
    assert.deepEqual(midiRange(pond.motifMidi), [74, 83]);
    assert.deepEqual(midiRange(meadowOne.motifMidi), [72, 81]);
    assert.deepEqual(midiRange(meadowTwo.motifMidi), [72, 81]);
    assert.deepEqual(midiRange(meadowThree.motifMidi), [72, 81]);

    for (const arrangement of [luminar, jobHall, pond, meadowOne, meadowTwo, meadowThree]) {
        assert.ok(
            midiRange(arrangement.motifMidi)[0] - midiRange(arrangement.chordMidi.flat())[0] >= 12,
            `${arrangement.locationId}/bright lead-pad separation`,
        );
    }

    meadowOne.motifMidi.forEach((note, index) => assertScaleNote(meadowOne, note, `mobile/motif/${index}`));
    meadowTwo.motifMidi.forEach((note, index) => assertScaleNote(meadowTwo, note, `mobile/motif/${index}`));
    meadowThree.motifMidi.forEach((note, index) => assertScaleNote(meadowThree, note, `mobile/motif/${index}`));
    luminar.chordMidi.flat().forEach((note, index) => assertScaleNote(luminar, note, `mobile/chord/${index}`));
});

test('탐험 mix는 저음 드론과 pad 겹침을 줄이고 밝은 권역에서 선율을 앞세운다', () => {
    assert.equal(getExplorationMixProfile(LocationMusicTheme.LUMINAR), BRIGHT_EXPLORATION_MIX);
    assert.equal(getExplorationMixProfile(LocationMusicTheme.NECROPOLIS), STANDARD_EXPLORATION_MIX);
    for (const profile of [STANDARD_EXPLORATION_MIX, BRIGHT_EXPLORATION_MIX]) {
        assert.equal(profile.padNoteLength, '4n');
        assert.ok(profile.padMaxPolyphony >= 6);
        assert.ok(profile.padReleaseSeconds <= 0.25);
        assert.ok(profile.highpassHz >= 180);
        assert.ok(profile.leadVolumeDb - profile.padVolumeDb >= 6);
        assert.ok(profile.lowEqDb <= -4.5);
    }
    assert.ok(BRIGHT_EXPLORATION_MIX.highpassHz > STANDARD_EXPLORATION_MIX.highpassHz);
    assert.ok(BRIGHT_EXPLORATION_MIX.highEqDb > STANDARD_EXPLORATION_MIX.highEqDb);
});

test('장소 편곡은 결정론적·불변이며 모든 변주 음과 저음이 원 권역 음계를 지킨다', () => {
    const harmonyByTheme = new Map(LocationMusicTheme.values().map(theme => {
        const reference = resolveLocationMusicArrangement(theme.key, `harmony-contract:${theme.key}`);
        return [theme.key, { chordMidi: reference.chordMidi, bassMidi: reference.bassMidi }] as const;
    }));

    for (const location of locations) {
        const first = composeLocationScore(location.id, location.mapColor);
        const second = composeLocationScore(location.id, location.mapColor);
        assert.deepEqual(second, first, location.id);
        assert.notEqual(second, first, location.id);
        assertArrangementIsDeepFrozen(first);

        assert.ok(first.seed >= 0 && first.seed <= 0xffff_ffff, location.id);
        assert.ok(first.bpm >= 40 && first.bpm <= 180, location.id);
        assert.ok(Math.abs(first.bpm - first.theme.bpm) <= 2, location.id);
        assert.ok(first.rhythmPhase >= 0 && first.rhythmPhase < 8, location.id);
        assert.equal(first.motifMidi.length, first.theme.motif.length, location.id);
        assert.equal(first.motifAccents.length, first.motifMidi.length, location.id);
        assert.equal(first.counterMidi.length, first.motifMidi.length, location.id);
        assert.equal(first.chordMidi.length, first.theme.chords.length, location.id);
        assert.equal(first.bassMidi.length, first.theme.chords.length, location.id);
        assert.ok(first.melodySignature.length > 0, location.id);
        assert.ok(first.motifAccents.some(Boolean), `${location.id}/accent variation`);
        assert.ok(first.counterMidi.some(note => note !== null), `${location.id}/counter variation`);
        assert.ok(first.motifAccents.every((accent, index) => typeof accent === 'boolean'
            && (first.motifMidi[index] !== null || !accent)), location.id);

        const phraseRotation = (first.seed % Math.max(1, Math.floor(first.theme.motif.length / 4))) * 4;
        assert.equal(phraseRotation % 4, 0, `${location.id}/phrase rotation boundary`);
        first.motifMidi.forEach((note, index) => {
            const authoredDegree = first.theme.motif[(index + phraseRotation) % first.theme.motif.length];
            if (authoredDegree === null) {
                assert.equal(note, null, `${location.id}/authored rest/${index}`);
                return;
            }
            if (note === null) return;
            const authoredMidi = scaleDegreeToMidi(first.theme.rootMidi, first.theme.scale, authoredDegree);
            assert.equal(
                pitchClassFromRoot(note, first.theme.rootMidi),
                pitchClassFromRoot(authoredMidi, first.theme.rootMidi),
                `${location.id}/authored melody degree/${index}`,
            );
        });

        const fixedHarmony = harmonyByTheme.get(first.theme.key);
        assert.ok(fixedHarmony, `${location.id}/fixed harmony`);
        assert.deepEqual(first.chordMidi, fixedHarmony.chordMidi, `${location.id}/authored chord order`);
        assert.deepEqual(first.bassMidi, fixedHarmony.bassMidi, `${location.id}/authored bass order`);

        first.motifMidi.forEach((note, index) => assertScaleNote(first, note, `motif/${index}`));
        first.counterMidi.forEach((note, index) => assertScaleNote(first, note, `counter/${index}`));
        first.chordMidi.forEach((chord, chordIndex) => {
            assert.equal(chord.length, 3, `${location.id}/chord/${chordIndex}`);
            chord.forEach((note, noteIndex) => assertScaleNote(first, note, `chord/${chordIndex}/${noteIndex}`));
        });
        assert.ok(midiRange(first.motifMidi)[0] >= EXPLORATION_MELODY_MIN_MIDI,
            `${location.id}/exploration motif floor`);
        assert.ok(midiRange(first.motifMidi)[1] <= EXPLORATION_MELODY_MAX_MIDI,
            `${location.id}/exploration motif ceiling`);
        assert.ok(midiRange(first.chordMidi.flat())[0] >= EXPLORATION_HARMONY_MIN_MIDI,
            `${location.id}/exploration harmony floor`);
        assert.ok(midiRange(first.chordMidi.flat())[1] <= EXPLORATION_HARMONY_MAX_MIDI,
            `${location.id}/exploration harmony ceiling`);
        assert.ok(midiRange(first.counterMidi)[0] >= EXPLORATION_MELODY_MIN_MIDI,
            `${location.id}/boss counter floor`);
        assert.ok(midiRange(first.counterMidi)[1] <= EXPLORATION_MELODY_MAX_MIDI,
            `${location.id}/boss counter ceiling`);
        if (first.theme.brightExploration) {
            assert.ok(
                midiRange(first.motifMidi)[0] - midiRange(first.chordMidi.flat())[0] >= 12,
                `${location.id}/bright lead-pad separation`,
            );
        }
        first.bassMidi.forEach((note, index) => {
            assert.ok(note >= 24 && note <= 55, `${location.id}/bass/${index}: ${note}`);
            assertScaleNote(first, note, `bass/${index}`);
        });
        assert.ok(new Set(first.bassMidi).size >= 2, `${location.id}/moving bass`);
    }
});

test('같은 권역은 테마를 공유하되 장소 seed로 다른 실제 선율을 만들고 알 수 없는 색은 안전하게 폴백한다', () => {
    const field = composeLocationScore('field', '#6fa85d');
    const meadow = composeLocationScore('meadow_2', '#6fa85d');
    assert.equal(field.theme, LocationMusicTheme.MEADOW);
    assert.equal(meadow.theme, LocationMusicTheme.MEADOW);
    assert.notEqual(field.seed, meadow.seed);
    assert.notEqual(field.melodySignature, meadow.melodySignature);
    assert.deepEqual(composeLocationScore('field', '  #6FA85D  '), field);

    const fallback = composeLocationScore('unmapped-place', '#ffffff');
    assert.equal(fallback.theme, LocationMusicTheme.LUMINAR);
    assert.equal(fallback.locationId, 'unmapped-place');
    assert.deepEqual(fallback, resolveLocationMusicArrangement('luminar', 'unmapped-place'));
    assert.equal(composeLocationScore('   ', null).locationId, 'unknown-location');
});

test('명시적 전투 상태를 우선하고 구버전 target snapshot은 탐험·일반전투·보스전투로 안전하게 폴백한다', () => {
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

test('음악 음량은 fake storage에서 0~100 정규화·저장·복원하고 storage 오류를 안전하게 무시한다', () => {
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
