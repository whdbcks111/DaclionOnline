import assert from 'node:assert/strict';
import test from 'node:test';
import {
    HUD_PRESET_VERSION,
    MAX_HUD_PRESETS,
    normalizeHudPresetData,
    normalizeHudPresetName,
    type HudPresetData,
} from '../../../shared/hudPresets.js';
import HudPresetBook from './HudPreset.js';

function preset(overrides: Partial<HudPresetData> = {}): HudPresetData {
    return {
        version: HUD_PRESET_VERSION,
        configs: {
            minimap: {
                id: 'minimap',
                visible: true,
                x: 10,
                y: 20,
                posUnitX: '%',
                posUnitY: '%',
                posAnchor: 'topRight',
                anchor: 'topRight',
            },
        },
        quickSlots: ['/공격', '/스킬 화염구'],
        skillHudConfigs: {},
        itemHudConfigs: {},
        opacity: 0.8,
        scale: 0.9,
        quickButtonScale: 1.2,
        skillQuickButtonOpacity: 0.7,
        gridSnapEnabled: true,
        gridExponent: 4,
        quickButtonPosAnchor: 'bottomRight',
        quickButtonPosUnitX: '%',
        quickButtonPosUnitY: '%',
        ...overrides,
    };
}

test('HUD 프리셋 이름은 공백을 정리하고 한글 이름을 허용한다', () => {
    assert.equal(normalizeHudPresetName('  보스   사냥  '), '보스 사냥');
    assert.equal(normalizeHudPresetName('전투/사냥'), undefined);
    assert.equal(normalizeHudPresetName(''), undefined);
});

test('HUD 프리셋 데이터는 크기와 범위를 서버 경계에서 정규화한다', () => {
    const normalized = normalizeHudPresetData(preset({
        quickSlots: Array.from({ length: 20 }, (_, index) => `/명령 ${index}`),
        opacity: 9,
        gridExponent: 3.7,
        skillHudConfigs: {
            fireball: { skillId: 'fireball', visible: true, x: 999, y: 999 },
        },
    }));

    assert.ok(normalized);
    assert.equal(normalized.quickSlots.length, 10);
    assert.equal(normalized.opacity, 1);
    assert.equal(normalized.gridExponent, 4);
    assert.equal(normalized.skillHudConfigs.fireball.x, 100);
    assert.equal(normalized.skillHudConfigs.fireball.y, 100);
    assert.equal(normalizeHudPresetData({ ...preset(), version: 999 }), undefined);
});

test('이름 있는 HUD 프리셋은 대소문자와 무관하게 덮어쓰고 다시 불러온다', () => {
    let changeCount = 0;
    const book = new HudPresetBook(undefined, () => { changeCount += 1; });
    assert.deepEqual(book.save('사냥', preset(), new Date('2026-07-31T00:00:00Z')), {
        success: true,
        name: '사냥',
    });
    assert.deepEqual(book.save('PVP', preset({ opacity: 0.5 }), new Date('2026-07-31T01:00:00Z')), {
        success: true,
        name: 'PVP',
    });
    assert.deepEqual(book.save('pvp', preset({ opacity: 0.6 }), new Date('2026-07-31T02:00:00Z')), {
        success: true,
        name: 'pvp',
    });

    assert.equal(changeCount, 3);
    assert.equal(book.getSummaries().length, 2);
    assert.equal(book.get('PvP')?.opacity, 0.6);
    assert.equal(book.getSummaries()[0].name, 'pvp');

    const restored = new HudPresetBook(book.toPersistence());
    assert.equal(restored.get('사냥')?.quickSlots[0], '/공격');
    assert.deepEqual(restored.delete('PVP'), { success: true, name: 'pvp' });
    assert.equal(restored.get('pvp'), undefined);
});

test('계정별 HUD 프리셋은 최대 개수를 넘겨 추가할 수 없다', () => {
    const book = new HudPresetBook();
    for (let index = 0; index < MAX_HUD_PRESETS; index += 1) {
        assert.equal(book.save(`세팅 ${index}`, preset()).success, true);
    }
    const result = book.save('초과 세팅', preset());
    assert.equal(result.success, false);
    assert.match(result.error ?? '', /최대 10개/);
});
