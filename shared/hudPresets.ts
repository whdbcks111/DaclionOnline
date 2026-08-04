export const HUD_PRESET_VERSION = 1 as const
export const MAX_HUD_PRESETS = 10
export const MAX_HUD_PRESET_NAME_LENGTH = 24
export const MAX_HUD_PRESET_QUICK_SLOTS = 10
export const MAX_CONSUMABLE_BUNDLES = 8
export const MAX_CONSUMABLE_BUNDLE_ITEMS = 8

export type HudPresetAnchorPoint =
    | 'topLeft' | 'topMiddle' | 'topRight'
    | 'middleLeft' | 'center' | 'middleRight'
    | 'bottomLeft' | 'bottomMiddle' | 'bottomRight'
export type HudPresetPosAnchor = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'
export type HudPresetPosUnit = '%' | 'px'

export interface HudPresetConfig {
    id: string
    visible: boolean
    x: number
    y: number
    posUnitX: HudPresetPosUnit
    posUnitY: HudPresetPosUnit
    posAnchor: HudPresetPosAnchor
    anchor: HudPresetAnchorPoint
    opacity?: number
    scale?: number
    showObjectActions?: boolean
    showTravelActions?: boolean
}

export interface HudPresetSkillConfig {
    skillId: string
    visible: boolean
    x: number
    y: number
}

export interface HudPresetItemConfig {
    itemDataId: string
    name: string
    icon: string
    visible: boolean
    x: number
    y: number
}

export interface HudPresetConsumableBundleItem {
    itemDataId: string
    name: string
    icon: string
}

export interface HudPresetConsumableBundleConfig {
    id: string
    name: string
    items: HudPresetConsumableBundleItem[]
    visible: boolean
    x: number
    y: number
}

export interface HudPresetData {
    version: typeof HUD_PRESET_VERSION
    configs: Record<string, HudPresetConfig>
    quickSlots: string[]
    skillHudConfigs: Record<string, HudPresetSkillConfig>
    itemHudConfigs: Record<string, HudPresetItemConfig>
    consumableBundleHudConfigs: Record<string, HudPresetConsumableBundleConfig>
    opacity: number
    scale: number
    quickButtonScale: number
    skillQuickButtonOpacity: number
    gridSnapEnabled: boolean
    gridExponent: number
    quickButtonPosAnchor: HudPresetPosAnchor
    quickButtonPosUnitX: HudPresetPosUnit
    quickButtonPosUnitY: HudPresetPosUnit
}

export interface HudPresetSummary {
    name: string
    updatedAt: string
}

export interface HudPresetSaveRequest {
    name: string
    preset: HudPresetData
}

export interface HudPresetOperationResult {
    ok: boolean
    action: 'save' | 'load' | 'delete'
    name?: string
    error?: string
}

const ANCHOR_POINTS = new Set<HudPresetAnchorPoint>([
    'topLeft', 'topMiddle', 'topRight',
    'middleLeft', 'center', 'middleRight',
    'bottomLeft', 'bottomMiddle', 'bottomRight',
])
const POS_ANCHORS = new Set<HudPresetPosAnchor>(['topLeft', 'topRight', 'bottomLeft', 'bottomRight'])
const POS_UNITS = new Set<HudPresetPosUnit>(['%', 'px'])
const RECORD_KEY_PATTERN = /^[a-z0-9:_-]{1,100}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finite(value: unknown, minimum: number, maximum: number): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
    return Math.max(minimum, Math.min(maximum, value))
}

function text(value: unknown, maximumLength: number): string | undefined {
    if (typeof value !== 'string') return undefined
    const normalized = value.trim()
    return normalized && Array.from(normalized).length <= maximumLength ? normalized : undefined
}

function entries(value: unknown, maximum: number): [string, Record<string, unknown>][] {
    if (!isRecord(value)) return []
    return Object.entries(value)
        .filter(([key, item]) => RECORD_KEY_PATTERN.test(key) && isRecord(item))
        .slice(0, maximum) as [string, Record<string, unknown>][]
}

export function normalizeHudPresetName(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined
    const normalized = value.trim().replace(/\s+/g, ' ')
    if (!normalized || Array.from(normalized).length > MAX_HUD_PRESET_NAME_LENGTH) return undefined
    return /^[\p{L}\p{N} _-]+$/u.test(normalized) ? normalized : undefined
}

/** 서버 저장과 클라이언트 적용이 공유하는 크기 제한·타입 정규화 경계. */
export function normalizeHudPresetData(value: unknown): HudPresetData | undefined {
    if (!isRecord(value) || value.version !== HUD_PRESET_VERSION) return undefined
    const quickButtonPosAnchor = POS_ANCHORS.has(value.quickButtonPosAnchor as HudPresetPosAnchor)
        ? value.quickButtonPosAnchor as HudPresetPosAnchor
        : undefined
    const quickButtonPosUnitX = POS_UNITS.has(value.quickButtonPosUnitX as HudPresetPosUnit)
        ? value.quickButtonPosUnitX as HudPresetPosUnit
        : undefined
    const quickButtonPosUnitY = POS_UNITS.has(value.quickButtonPosUnitY as HudPresetPosUnit)
        ? value.quickButtonPosUnitY as HudPresetPosUnit
        : undefined
    const opacity = finite(value.opacity, 0.1, 1)
    const scale = finite(value.scale, 0.1, 1)
    const quickButtonScale = finite(value.quickButtonScale, 0.5, 2)
    const skillQuickButtonOpacity = finite(value.skillQuickButtonOpacity, 0.1, 1)
    const gridExponent = finite(value.gridExponent, 2, 6)
    if (!quickButtonPosAnchor || !quickButtonPosUnitX || !quickButtonPosUnitY
        || opacity === undefined || scale === undefined || quickButtonScale === undefined
        || skillQuickButtonOpacity === undefined || gridExponent === undefined
        || typeof value.gridSnapEnabled !== 'boolean') return undefined

    const configs: Record<string, HudPresetConfig> = {}
    for (const [id, config] of entries(value.configs, 32)) {
        const posUnitX = POS_UNITS.has(config.posUnitX as HudPresetPosUnit)
            ? config.posUnitX as HudPresetPosUnit : undefined
        const posUnitY = POS_UNITS.has(config.posUnitY as HudPresetPosUnit)
            ? config.posUnitY as HudPresetPosUnit : undefined
        const x = finite(config.x, 0, posUnitX === '%' ? 100 : 10_000)
        const y = finite(config.y, 0, posUnitY === '%' ? 100 : 10_000)
        const posAnchor = POS_ANCHORS.has(config.posAnchor as HudPresetPosAnchor)
            ? config.posAnchor as HudPresetPosAnchor : undefined
        const anchor = ANCHOR_POINTS.has(config.anchor as HudPresetAnchorPoint)
            ? config.anchor as HudPresetAnchorPoint : undefined
        if (x === undefined || y === undefined || !posUnitX || !posUnitY || !posAnchor || !anchor) continue
        const normalized: HudPresetConfig = {
            id,
            visible: config.visible === true,
            x,
            y,
            posUnitX,
            posUnitY,
            posAnchor,
            anchor,
        }
        const configOpacity = finite(config.opacity, 0.1, 1)
        const configScale = finite(config.scale, 0.1, 2)
        if (configOpacity !== undefined) normalized.opacity = configOpacity
        if (configScale !== undefined) normalized.scale = configScale
        if (typeof config.showObjectActions === 'boolean') normalized.showObjectActions = config.showObjectActions
        if (typeof config.showTravelActions === 'boolean') normalized.showTravelActions = config.showTravelActions
        configs[id] = normalized
    }

    const quickSlots = Array.isArray(value.quickSlots)
        ? value.quickSlots
            .slice(0, MAX_HUD_PRESET_QUICK_SLOTS)
            .flatMap(item => {
                const normalized = text(item, 500)
                return normalized ? [normalized] : []
            })
        : []
    const skillHudConfigs: Record<string, HudPresetSkillConfig> = {}
    for (const [skillId, config] of entries(value.skillHudConfigs, 256)) {
        const x = finite(config.x, 0, quickButtonPosUnitX === '%' ? 100 : 10_000)
        const y = finite(config.y, 0, quickButtonPosUnitY === '%' ? 100 : 10_000)
        if (x === undefined || y === undefined) continue
        skillHudConfigs[skillId] = { skillId, visible: config.visible === true, x, y }
    }
    const itemHudConfigs: Record<string, HudPresetItemConfig> = {}
    for (const [itemDataId, config] of entries(value.itemHudConfigs, 256)) {
        const name = text(config.name, 100)
        const icon = text(config.icon, 200)
        const x = finite(config.x, 0, quickButtonPosUnitX === '%' ? 100 : 10_000)
        const y = finite(config.y, 0, quickButtonPosUnitY === '%' ? 100 : 10_000)
        if (!name || !icon || x === undefined || y === undefined) continue
        itemHudConfigs[itemDataId] = {
            itemDataId,
            name,
            icon,
            visible: config.visible === true,
            x,
            y,
        }
    }
    const consumableBundleHudConfigs: Record<string, HudPresetConsumableBundleConfig> = {}
    for (const [id, config] of entries(value.consumableBundleHudConfigs, MAX_CONSUMABLE_BUNDLES)) {
        const name = text(config.name, MAX_HUD_PRESET_NAME_LENGTH)
        const x = finite(config.x, 0, quickButtonPosUnitX === '%' ? 100 : 10_000)
        const y = finite(config.y, 0, quickButtonPosUnitY === '%' ? 100 : 10_000)
        if (!name || x === undefined || y === undefined || !Array.isArray(config.items)) continue
        const items: HudPresetConsumableBundleItem[] = []
        const seen = new Set<string>()
        for (const candidate of config.items.slice(0, MAX_CONSUMABLE_BUNDLE_ITEMS)) {
            if (!isRecord(candidate)) continue
            const itemDataId = text(candidate.itemDataId, 100)
            const itemName = text(candidate.name, 100)
            const icon = text(candidate.icon, 200)
            if (!itemDataId || !RECORD_KEY_PATTERN.test(itemDataId) || !itemName || !icon || seen.has(itemDataId)) continue
            seen.add(itemDataId)
            items.push({ itemDataId, name: itemName, icon })
        }
        if (items.length === 0) continue
        consumableBundleHudConfigs[id] = {
            id,
            name,
            items,
            visible: config.visible === true,
            x,
            y,
        }
    }

    return {
        version: HUD_PRESET_VERSION,
        configs,
        quickSlots,
        skillHudConfigs,
        itemHudConfigs,
        consumableBundleHudConfigs,
        opacity,
        scale,
        quickButtonScale,
        skillQuickButtonOpacity,
        gridSnapEnabled: value.gridSnapEnabled,
        gridExponent: Math.round(gridExponent),
        quickButtonPosAnchor,
        quickButtonPosUnitX,
        quickButtonPosUnitY,
    }
}
