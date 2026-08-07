import { isDeepStrictEqual } from 'node:util';

export type MetadataValue = string | number | boolean | null
    | MetadataValue[]
    | { [key: string]: MetadataValue };

export interface MetadataRecord {
    [key: string]: MetadataValue;
}

export interface EncodedMetadataDelta extends MetadataRecord {
    values: MetadataRecord;
}

export function cloneMetadataValue(value: unknown): MetadataValue {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('Metadata value must be JSON serializable');
    return JSON.parse(serialized) as MetadataValue;
}

export function cloneMetadata(metadata: MetadataRecord): MetadataRecord {
    return cloneMetadataValue(metadata) as MetadataRecord;
}

export function isMetadataRecord(value: unknown): value is MetadataRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createMetadataDelta(
    baseMetadata: Readonly<MetadataRecord> | null | undefined,
    metadata: unknown,
): MetadataRecord {
    if (!isMetadataRecord(metadata)) return {};
    const base = baseMetadata ?? {};
    const delta: MetadataRecord = {};
    for (const [key, value] of Object.entries(metadata)) {
        if (!isDeepStrictEqual(value, base[key])) {
            delta[key] = cloneMetadataValue(value);
        }
    }
    return delta;
}

export function encodeMetadataDelta(
    storageKey: string,
    version: number,
    delta: MetadataRecord,
): EncodedMetadataDelta {
    return {
        [storageKey]: version,
        values: cloneMetadata(delta),
    } as EncodedMetadataDelta;
}

export function isEncodedMetadataDelta(
    value: unknown,
    storageKey: string,
    version: number,
): value is EncodedMetadataDelta {
    return isMetadataRecord(value)
        && value[storageKey] === version
        && isMetadataRecord(value.values);
}

/** 새 delta envelope와 구형 전체 metadata를 모두 현재 delta로 해석한다. */
export function decodeMetadataDelta(
    storageKey: string,
    version: number,
    baseMetadata: Readonly<MetadataRecord> | null | undefined,
    persistedMetadata: unknown,
): MetadataRecord {
    if (isEncodedMetadataDelta(persistedMetadata, storageKey, version)) {
        return cloneMetadata(persistedMetadata.values);
    }
    return createMetadataDelta(baseMetadata, persistedMetadata);
}
