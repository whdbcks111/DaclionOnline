import {
    MAX_HUD_PRESETS,
    normalizeHudPresetData,
    normalizeHudPresetName,
    type HudPresetData,
    type HudPresetSummary,
} from '../../../shared/hudPresets.js';

interface StoredHudPreset {
    readonly updatedAt: string;
    readonly preset: HudPresetData;
}

export interface HudPresetMutationResult {
    readonly success: boolean;
    readonly name?: string;
    readonly error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizedLookup(value: string): string {
    return value.toLocaleLowerCase();
}

/** 플레이어별 이름 있는 HUD 프리셋을 검증된 불변 snapshot으로 소유한다. */
export default class HudPresetBook {
    private readonly presets = new Map<string, StoredHudPreset>();

    constructor(value?: unknown, private readonly onChange: () => void = () => undefined) {
        if (!isRecord(value)) return;
        for (const [rawName, rawEntry] of Object.entries(value).slice(0, MAX_HUD_PRESETS)) {
            const name = normalizeHudPresetName(rawName);
            if (!name || !isRecord(rawEntry) || typeof rawEntry.updatedAt !== 'string') continue;
            const preset = normalizeHudPresetData(rawEntry.preset);
            const updatedAt = new Date(rawEntry.updatedAt);
            if (!preset || Number.isNaN(updatedAt.getTime())) continue;
            this.presets.set(name, { updatedAt: updatedAt.toISOString(), preset });
        }
    }

    getSummaries(): readonly HudPresetSummary[] {
        return [...this.presets.entries()]
            .map(([name, entry]) => ({ name, updatedAt: entry.updatedAt }))
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.name.localeCompare(right.name));
    }

    get(nameInput: unknown): HudPresetData | undefined {
        const name = normalizeHudPresetName(nameInput);
        if (!name) return undefined;
        const storedName = this.findStoredName(name);
        const preset = storedName ? this.presets.get(storedName)?.preset : undefined;
        return preset ? normalizeHudPresetData(preset) : undefined;
    }

    save(nameInput: unknown, value: unknown, now = new Date()): HudPresetMutationResult {
        const name = normalizeHudPresetName(nameInput);
        if (!name) return { success: false, error: '프리셋 이름은 한글·영문·숫자·공백·_-로 1~24자까지 입력할 수 있습니다.' };
        const preset = normalizeHudPresetData(value);
        if (!preset) return { success: false, error: 'HUD 프리셋 데이터가 올바르지 않습니다.' };
        const existingName = this.findStoredName(name);
        if (!existingName && this.presets.size >= MAX_HUD_PRESETS) {
            return { success: false, error: `HUD 프리셋은 계정당 최대 ${MAX_HUD_PRESETS}개까지 저장할 수 있습니다.` };
        }
        if (existingName && existingName !== name) this.presets.delete(existingName);
        this.presets.set(name, { updatedAt: now.toISOString(), preset });
        this.onChange();
        return { success: true, name };
    }

    delete(nameInput: unknown): HudPresetMutationResult {
        const name = normalizeHudPresetName(nameInput);
        const storedName = name ? this.findStoredName(name) : undefined;
        if (!storedName) return { success: false, error: '저장된 HUD 프리셋을 찾을 수 없습니다.' };
        this.presets.delete(storedName);
        this.onChange();
        return { success: true, name: storedName };
    }

    toPersistence(): Record<string, StoredHudPreset> {
        return Object.fromEntries([...this.presets.entries()].map(([name, entry]) => [
            name,
            {
                updatedAt: entry.updatedAt,
                preset: normalizeHudPresetData(entry.preset)!,
            },
        ]));
    }

    private findStoredName(name: string): string | undefined {
        const lookup = normalizedLookup(name);
        return [...this.presets.keys()].find(candidate => normalizedLookup(candidate) === lookup);
    }
}
