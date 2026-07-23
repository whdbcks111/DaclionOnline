/** Minecraft 스타일의 namespace:path 태그 식별자 */
export type TagId = string

export interface TagQuery {
    all?: readonly TagId[]
    any?: readonly TagId[]
    none?: readonly TagId[]
}

/** 태그 원본 Set을 노출하지 않는 공통 조회 계약 */
export interface TagReadable {
    hasTag(tag: TagId): boolean
}

export const GameTags = Object.freeze({
    ENTITY_PLAYER: 'entity:player',
    ENTITY_MONSTER: 'entity:monster',
    ENTITY_PROJECTILE: 'entity:projectile',
    ENTITY_RESOURCE: 'entity:resource',
    ENTITY_SLIME: 'entity:slime',
    ENTITY_HUMANOID: 'entity:humanoid',
    ENTITY_ELEMENTAL: 'entity:elemental',
    ENTITY_BEAST: 'entity:beast',
    ENTITY_BOSS: 'entity:boss',

    ITEM_CONSUMABLE: 'item:consumable',
    ITEM_WEAPON: 'item:weapon',
    ITEM_ARMOR: 'item:armor',
    ITEM_AMMUNITION: 'item:ammunition',
    ITEM_TOOL: 'item:tool',
    ITEM_BAIT: 'item:bait',
    ITEM_FISH: 'item:fish',
    ITEM_SKILL_BOOK: 'item:skill_book',
    ITEM_FORGED: 'item:forged',

    FISH_RARITY_COMMON: 'fish_rarity:common',
    FISH_RARITY_UNCOMMON: 'fish_rarity:uncommon',
    FISH_RARITY_RARE: 'fish_rarity:rare',
    FISH_RARITY_EPIC: 'fish_rarity:epic',
    FISH_RARITY_LEGENDARY: 'fish_rarity:legendary',
    FISH_RARITY_MYTHIC: 'fish_rarity:mythic',

    WEAPON_SWORD: 'weapon:sword',
    WEAPON_AXE: 'weapon:axe',
    WEAPON_BOW: 'weapon:bow',
    WEAPON_DAGGER: 'weapon:dagger',
    WEAPON_STAFF: 'weapon:staff',

    PROPERTY_FIRE: 'property:fire',
    PROPERTY_WATER: 'property:water',
    PROPERTY_ICE: 'property:ice',
    PROPERTY_NATURAL: 'property:natural',
    PROPERTY_POISON: 'property:poison',
    PROPERTY_ELECTRIC: 'property:electric',
    PROPERTY_STONE: 'property:stone',
    PROPERTY_DARK: 'property:dark',
    PROPERTY_LIGHT: 'property:light',
    PROPERTY_UNDEAD: 'property:undead',
    PROPERTY_HOLY: 'property:holy',
    PROPERTY_INSECT: 'property:insect',
    PROPERTY_METAL: 'property:metal',
    PROPERTY_EARTH: 'property:earth',

    MATERIAL_WOOD: 'material:wood',
    MATERIAL_STONE: 'material:stone',
    MATERIAL_COAL: 'material:coal',
    MATERIAL_IRON: 'material:iron',
    MATERIAL_GOLD: 'material:gold',
    MATERIAL_RUBY: 'material:ruby',
    MATERIAL_EMERALD: 'material:emerald',
    MATERIAL_DIAMOND: 'material:diamond',
    MATERIAL_EMBER: 'material:ember',
    MATERIAL_GLASS: 'material:glass',
    MATERIAL_RIME: 'material:rime',
    MATERIAL_CORAL: 'material:coral',
    MATERIAL_CLOCKWORK: 'material:clockwork',
    MATERIAL_ASHEN_ABYSS: 'material:ashen_abyss',
    MATERIAL_ENHANCEMENT_STONE: 'material:enhancement_stone',
    MATERIAL_REFINED: 'material:refined',

    TOOL_MINING: 'tool:mining',
    TOOL_FISHING: 'tool:fishing',

    RESOURCE_ORE: 'resource:ore',
    RESOURCE_TREASURE: 'resource:treasure',

    SKILL_ACTIVE: 'skill:active',
    SKILL_PASSIVE: 'skill:passive',
    SKILL_COMBAT: 'skill:combat',

    /** 태그 기반 공유 재사용 대기시간과 스킬 정보 표시가 함께 사용하는 기술 계열. */
    SKILL_GROUP_WARRIOR: 'skill_group:warrior',
    SKILL_GROUP_ARCHER: 'skill_group:archer',
    SKILL_GROUP_ASSASSIN: 'skill_group:assassin',
    SKILL_GROUP_MAGIC: 'skill_group:magic',
    SKILL_GROUP_BLACKSMITH: 'skill_group:blacksmith',
    SKILL_GROUP_FIRE: 'skill_group:fire',
    SKILL_GROUP_ICE: 'skill_group:ice',
    SKILL_GROUP_ELECTRIC: 'skill_group:electric',

    TRAIT_INANIMATE: 'trait:inanimate',
    TRAIT_LIVING: 'trait:living',
    TRAIT_STEALTH: 'trait:stealth',

    LOCATION_SAFE: 'location:safe',
    LOCATION_NEUTRAL: 'location:neutral',
    LOCATION_HOSTILE: 'location:hostile',
    LOCATION_WILDERNESS: 'location:wilderness',
    LOCATION_SHOP: 'location:shop',
    LOCATION_MINE: 'location:mine',
    LOCATION_FOREST: 'location:forest',
    LOCATION_SWAMP: 'location:swamp',
    LOCATION_VOLCANIC: 'location:volcanic',
    LOCATION_DESERT: 'location:desert',
    LOCATION_FROZEN: 'location:frozen',
    LOCATION_COAST: 'location:coast',
    LOCATION_SUBMERGED: 'location:submerged',
    LOCATION_CLOCKWORK: 'location:clockwork',
    LOCATION_ASHEN_ABYSS: 'location:ashen_abyss',
    LOCATION_HIDDEN: 'location:hidden',
    LOCATION_FISHING: 'location:fishing',
    SHOP_GENERAL: 'shop:general',
    SHOP_MINING: 'shop:mining',
    SHOP_FISHING: 'shop:fishing',
    SHOP_HUNTER: 'shop:hunter',
    SHOP_CARAVAN: 'shop:caravan',
    SHOP_FROST: 'shop:frost',
    SHOP_TIDAL: 'shop:tidal',
    SHOP_CLOCKWORK: 'shop:clockwork',
    SHOP_ASHEN_ABYSS: 'shop:ashen_abyss',
} satisfies Record<string, TagId>)

const TAG_PATTERN = /^[a-z0-9][a-z0-9._-]*:[a-z0-9][a-z0-9/._-]*$/

export function normalizeTag(tag: TagId): TagId {
    const normalized = tag.trim().toLowerCase()
    if (!TAG_PATTERN.test(normalized)) {
        throw new Error(`잘못된 태그 형식입니다: ${tag} (namespace:path 형식 필요)`)
    }
    return normalized
}

export function normalizeTags(tags: readonly TagId[] = []): TagId[] {
    return [...new Set(tags.map(normalizeTag))].sort()
}

export function matchesTagQuery(tags: TagReadable, query: TagQuery): boolean {
    return (query.all?.every(tag => tags.hasTag(tag)) ?? true)
        && (query.any?.some(tag => tags.hasTag(tag)) ?? true)
        && (query.none?.every(tag => !tags.hasTag(tag)) ?? true)
}

interface TagCollectionOptions {
    definition?: readonly TagId[]
    persistent?: readonly TagId[]
    onPersistentChange?: () => void
}

/** 정의/영속/런타임 태그를 한 조회 API로 합성한다. */
export class TagCollection implements TagReadable {
    private readonly definition = new Set<TagId>()
    private readonly persistent = new Set<TagId>()
    private readonly runtime = new Map<string, Set<TagId>>()
    private onPersistentChange?: () => void

    constructor(options: TagCollectionOptions = {}) {
        for (const tag of normalizeTags(options.definition)) this.definition.add(tag)
        for (const tag of normalizeTags(options.persistent)) this.persistent.add(tag)
        this.onPersistentChange = options.onPersistentChange
    }

    hasTag(tag: TagId): boolean {
        const normalized = normalizeTag(tag)
        if (this.definition.has(normalized) || this.persistent.has(normalized)) return true
        for (const tags of this.runtime.values()) {
            if (tags.has(normalized)) return true
        }
        return false
    }

    hasAny(tags: readonly TagId[]): boolean {
        return tags.some(tag => this.hasTag(tag))
    }

    hasAll(tags: readonly TagId[]): boolean {
        return tags.every(tag => this.hasTag(tag))
    }

    matches(query: TagQuery): boolean {
        return matchesTagQuery(this, query)
    }

    /** 호출자가 내부 Set을 변경할 수 없는 정렬된 스냅샷 */
    values(): TagId[] {
        const result = new Set<TagId>([...this.definition, ...this.persistent])
        for (const tags of this.runtime.values()) {
            for (const tag of tags) result.add(tag)
        }
        return [...result].sort()
    }

    persistentValues(): TagId[] {
        return [...this.persistent].sort()
    }

    addPersistent(tag: TagId): boolean {
        const normalized = normalizeTag(tag)
        if (this.persistent.has(normalized)) return false
        this.persistent.add(normalized)
        this.onPersistentChange?.()
        return true
    }

    removePersistent(tag: TagId): boolean {
        const changed = this.persistent.delete(normalizeTag(tag))
        if (changed) this.onPersistentChange?.()
        return changed
    }

    replacePersistent(tags: readonly TagId[]): void {
        const next = normalizeTags(tags)
        if (next.length === this.persistent.size && next.every(tag => this.persistent.has(tag))) return
        this.persistent.clear()
        for (const tag of next) this.persistent.add(tag)
        this.onPersistentChange?.()
    }

    setRuntime(source: string, tags: readonly TagId[]): void {
        if (!source.trim()) throw new Error('런타임 태그 source는 비어 있을 수 없습니다.')
        const normalized = normalizeTags(tags)
        if (normalized.length === 0) this.runtime.delete(source)
        else this.runtime.set(source, new Set(normalized))
    }

    removeRuntime(source: string): boolean {
        return this.runtime.delete(source)
    }

    setPersistentChangeHandler(handler?: () => void): void {
        this.onPersistentChange = handler
    }
}
