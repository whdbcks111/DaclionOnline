import {
    FORGED_ITEM_BALANCE_VERSION,
    ItemMetadataKeys,
    MAX_ITEM_REINFORCEMENT_LEVEL,
    calculateForgedPhysicalPenetration,
    calculateForgedProjectileAcceleration,
    calculateForgedStaffMentalityRegen,
    calculateForgedWeaponPowerMultiplier,
    type Item,
    type ItemMetadata,
    type ItemSnapshot,
} from './Item.js';
import type Inventory from './Inventory.js';
import type { InventoryItemSelection } from './Inventory.js';
import { AttributeType } from './Attribute.js';
import type { AttributeKey, ModifierOp } from './Attribute.js';
import type { MetadataValue } from './Metadata.js';
import { GameTags, isPropertyTag } from '../../../shared/tags.js';
import type { TagId } from '../../../shared/tags.js';
import { generateItemEnchantment, type ItemAttackEffectSnapshot } from './ItemAttackEffect.js';

interface ForgeModifierSeed { attribute: AttributeKey; op: ModifierOp; value: number }

export const FORGED_ITEM_NAMING_SENSIBILITY = 250;

export interface ForgedItemRenameResult {
    success: boolean;
    name?: string;
    reason?: string;
}

export const ARCANE_ENCHANT_MENTALITY_COST = 80;
export const STAFF_INFUSION_MENTALITY_COST = 120;
export const ENHANCEMENT_STONE_ITEM_ID = 'enhancement_stone';

/**
 * 목표 강화 단계별 결과 확률. 실패 시 유지 확률은 나머지 세 확률을 뺀 값이다.
 * +7 도전부터 하락하고 +9 도전부터 파괴될 수 있다.
 */
export class EquipmentReinforcementStage {
    private static readonly all: EquipmentReinforcementStage[] = [];

    static readonly PLUS_1 = new EquipmentReinforcementStage(1, 100, 0, 0);
    static readonly PLUS_2 = new EquipmentReinforcementStage(2, 95, 0, 0);
    static readonly PLUS_3 = new EquipmentReinforcementStage(3, 90, 0, 0);
    static readonly PLUS_4 = new EquipmentReinforcementStage(4, 85, 0, 0);
    static readonly PLUS_5 = new EquipmentReinforcementStage(5, 80, 0, 0);
    static readonly PLUS_6 = new EquipmentReinforcementStage(6, 70, 0, 0);
    static readonly PLUS_7 = new EquipmentReinforcementStage(7, 60, 10, 0);
    static readonly PLUS_8 = new EquipmentReinforcementStage(8, 50, 20, 0);
    static readonly PLUS_9 = new EquipmentReinforcementStage(9, 45, 20, 5);
    static readonly PLUS_10 = new EquipmentReinforcementStage(10, 40, 24, 8);
    static readonly PLUS_11 = new EquipmentReinforcementStage(11, 35, 28, 12);
    static readonly PLUS_12 = new EquipmentReinforcementStage(12, 30, 32, 16);
    static readonly PLUS_13 = new EquipmentReinforcementStage(13, 25, 35, 20);
    static readonly PLUS_14 = new EquipmentReinforcementStage(14, 20, 37, 25);
    static readonly PLUS_15 = new EquipmentReinforcementStage(15, 15, 40, 30);

    readonly key: string;
    readonly retainRate: number;

    private constructor(
        readonly level: number,
        readonly successRate: number,
        readonly downgradeRate: number,
        readonly destructionRate: number,
    ) {
        this.key = String(level);
        this.retainRate = 100 - successRate - downgradeRate - destructionRate;
        if (this.retainRate < 0) throw new Error(`Invalid reinforcement rates for +${level}`);
        EquipmentReinforcementStage.all.push(this);
    }

    static values(): readonly EquipmentReinforcementStage[] {
        return EquipmentReinforcementStage.all;
    }

    static fromKey(key: string): EquipmentReinforcementStage | undefined {
        return EquipmentReinforcementStage.all.find(stage => stage.key === key);
    }

    static fromInput(input: string): EquipmentReinforcementStage | undefined {
        return EquipmentReinforcementStage.fromKey(input.trim().replace(/^\+/, ''));
    }

    static fromLevel(level: number): EquipmentReinforcementStage | undefined {
        return Number.isInteger(level)
            ? EquipmentReinforcementStage.fromKey(String(level))
            : undefined;
    }

    get chanceDescription(): string {
        const outcomes = [`성공 ${this.successRate}%`, `유지 ${this.retainRate}%`];
        if (this.downgradeRate > 0) outcomes.push(`하락 ${this.downgradeRate}%`);
        if (this.destructionRate > 0) outcomes.push(`파괴 ${this.destructionRate}%`);
        return outcomes.join(' · ');
    }
}

export const MAX_EQUIPMENT_REINFORCEMENT = MAX_ITEM_REINFORCEMENT_LEVEL;

export interface WeaponEnchantResult {
    success: boolean;
    effect?: ItemAttackEffectSnapshot;
    label?: string;
    reason?: string;
}

export interface EquipmentReinforcementResult {
    success: boolean;
    outcome?: 'success' | 'retained' | 'downgraded' | 'destroyed';
    previousLevel?: number;
    level?: number;
    addedModifiers?: readonly ForgeModifierSeed[];
    removedModifiers?: readonly ForgeModifierSeed[];
    reason?: string;
}

export interface ForgedComponentResult {
    success: boolean;
    snapshot?: ItemSnapshot;
    reason?: string;
}

export interface EquipmentRepairPlan {
    readonly damageRatio: number;
    readonly repairAmount: number;
    readonly requiredMaterialCount: number;
    readonly maxDurabilityLossRate: number;
    readonly preferredMaterialItemDataId?: string;
    readonly preferredMaterialLabel?: string;
}

export interface EquipmentRepairMaterialSelection {
    readonly selections: readonly InventoryItemSelection[];
    readonly materialNames: readonly string[];
}

/** 손상률이 25% 이하인 간단 수리는 열화되지 않고, 심각한 손상은 최대 내구도를 12% 잃는다. */
export function calculateRepairMaxDurabilityLossRate(damageRatio: number): number {
    const ratio = Math.max(0, Math.min(1, damageRatio));
    if (ratio <= 0.25) return 0;
    if (ratio <= 0.5) return 0.02;
    if (ratio <= 0.75) return 0.06;
    return 0.12;
}

export function createEquipmentRepairPlan(item: Item, skillLevel: number): EquipmentRepairPlan | null {
    const durability = item.durability;
    const maxDurability = item.baseDurability;
    if (durability === null || maxDurability === null || durability >= maxDurability) return null;
    const damageRatio = Math.max(0, Math.min(1, (maxDurability - durability) / maxDurability));
    const forgeMaterialKey = item.getMetadata<Record<string, unknown>>(ItemMetadataKeys.FORGE)?.material;
    const forgeMaterial = typeof forgeMaterialKey === 'string'
        ? ForgeMaterial.fromKey(forgeMaterialKey)
        : undefined;
    return {
        damageRatio,
        repairAmount: Math.max(1, Math.ceil(maxDurability * (0.2 + Math.max(1, skillLevel) * 0.1))),
        requiredMaterialCount: damageRatio > 0.5 ? 2 : 1,
        maxDurabilityLossRate: calculateRepairMaxDurabilityLossRate(damageRatio),
        preferredMaterialItemDataId: forgeMaterial?.itemDataId,
        preferredMaterialLabel: forgeMaterial?.label,
    };
}

function isCompatibleRepairMaterial(target: Item, candidate: Item): boolean {
    if (!candidate.stackable || candidate.durability !== null || candidate.equipSlot !== null || candidate.data?.onUse) {
        return false;
    }
    const targetTags = target.tags.values();
    const materialTags = targetTags.filter(tag => tag.startsWith('material:'));
    const propertyTags = targetTags.filter(tag => tag.startsWith('property:'));
    if (materialTags.length > 0 && candidate.tags.hasAny(materialTags)) return true;
    if (propertyTags.length > 0 && candidate.tags.hasAny(propertyTags)) return true;
    return materialTags.length === 0
        && propertyTags.length === 0
        && candidate.itemDataId === ForgeMaterial.IRON.itemDataId;
}

/**
 * 원 단조 소재를 우선하고, 없으면 장비와 같은 material/property 태그를 가진 비장비 소재를 선택한다.
 * 호출자는 반환 selection을 Inventory.consumeSelectedItems로 소비한다.
 */
export function selectEquipmentRepairMaterials(
    inventory: Inventory,
    item: Item,
    plan: EquipmentRepairPlan,
): EquipmentRepairMaterialSelection | null {
    const count = plan.requiredMaterialCount;
    const preferred = plan.preferredMaterialItemDataId
        ? inventory.selectItems([{
            count,
            matches: candidate => candidate.itemDataId === plan.preferredMaterialItemDataId,
        }])
        : null;
    const selections = preferred ?? inventory.selectItems([{
        count,
        matches: candidate => isCompatibleRepairMaterial(item, candidate),
    }]);
    if (!selections) return null;
    return {
        selections,
        materialNames: [...new Set(selections.map(selection => selection.item.name))],
    };
}

function reinforcementRoll(random: () => number): number {
    const value = random();
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1 - Number.EPSILON, value)) * 100;
}

/**
 * 전투 대장장이의 장비 강화.
 * 유효한 시도는 성공·유지·하락·파괴 중 하나로 확정되며 호출자가 파괴 결과의 아이템을 소유 계층에서 제거한다.
 */
export function reinforceEquipment(item: Item, options: {
    random?: () => number;
}): EquipmentReinforcementResult {
    if (!isReinforceableEquipment(item)) {
        return { success: false, reason: '긍정 능력치가 있는 무기 또는 방어구만 강화할 수 있습니다.' };
    }
    const current = item.reinforcementLevel;
    if (current >= MAX_EQUIPMENT_REINFORCEMENT) {
        return { success: false, reason: `이미 최대 강화 단계(+${MAX_EQUIPMENT_REINFORCEMENT})입니다.` };
    }

    const level = current + 1;
    const stage = EquipmentReinforcementStage.fromLevel(level);
    if (!stage) return { success: false, reason: '유효한 강화 단계를 찾지 못했습니다.' };
    const roll = reinforcementRoll(options.random ?? Math.random);
    if (roll >= stage.successRate) {
        const retainedThreshold = stage.successRate + stage.retainRate;
        const downgradeThreshold = retainedThreshold + stage.downgradeRate;
        if (roll < retainedThreshold) {
            return { success: false, outcome: 'retained', previousLevel: current, level: current };
        }
        if (roll < downgradeThreshold) {
            const downgradedLevel = Math.max(0, current - 1);
            const removedModifiers = calculateReinforcementDelta(item, downgradedLevel, current);
            item.setMetadata(ItemMetadataKeys.REINFORCEMENT, {
                version: 2,
                level: downgradedLevel,
            });
            return {
                success: false,
                outcome: 'downgraded',
                previousLevel: current,
                level: downgradedLevel,
                removedModifiers,
            };
        }
        return { success: false, outcome: 'destroyed', previousLevel: current, level: current };
    }

    const added = calculateReinforcementDelta(item, current, level);
    item.setMetadata(ItemMetadataKeys.REINFORCEMENT, { version: 2, level });
    return { success: true, outcome: 'success', previousLevel: current, level, addedModifiers: added };
}

export function isReinforceableEquipment(item: Item): boolean {
    return (item.hasTag(GameTags.ITEM_WEAPON) || item.hasTag(GameTags.ITEM_ARMOR))
        && item.getReinforcementModifiersAtLevel(1).length > 0;
}

function calculateReinforcementDelta(item: Item, fromLevel: number, toLevel: number): ForgeModifierSeed[] {
    const previous = new Map(item.getReinforcementModifiersAtLevel(fromLevel)
        .map(modifier => [`${modifier.attribute}:${modifier.op}`, modifier] as const));
    return item.getReinforcementModifiersAtLevel(toLevel).map(modifier => {
        const before = previous.get(`${modifier.attribute}:${modifier.op}`);
        return {
            attribute: modifier.attribute,
            op: modifier.op,
            value: modifier.op === 'add'
                ? round(modifier.value - (before?.value ?? 0), 6)
                : round(modifier.value / (before?.value ?? 1), 6),
        };
    }).filter(modifier => modifier.op === 'add' ? modifier.value > 0 : modifier.value > 1);
}

/** 마도 대장장이의 무기 후가공. 한 인스턴스에는 한 번만 마법 각인을 확정한다. */
export function enchantWeapon(item: Item, options: {
    enchanterUserId: number;
    skillLevel: number;
    sensibility: number;
    random?: () => number;
}): WeaponEnchantResult {
    if (!item.hasTag(GameTags.ITEM_WEAPON)) return { success: false, reason: '무기 아이템에만 마법을 부여할 수 있습니다.' };
    if (item.getMetadata(ItemMetadataKeys.ENCHANTMENT)) return { success: false, reason: '이미 마법이 부여된 무기입니다.' };
    const forge = item.getMetadata<Record<string, unknown>>(ItemMetadataKeys.FORGE);
    const signature = [item.itemDataId, forge?.material ?? '', forge?.trait ?? '', forge?.generatedName ?? item.name].join(':');
    const generated = generateItemEnchantment(
        item,
        signature,
        options.skillLevel,
        options.sensibility,
        options.random,
    );
    item.setMetadata(ItemMetadataKeys.ATTACK_EFFECTS, [...item.attackEffects, generated.effect]);
    item.setMetadata(ItemMetadataKeys.ENCHANTMENT, {
        type: generated.type.id,
        label: generated.type.label,
        enchanterUserId: options.enchanterUserId,
    });
    item.tags.addPersistent(generated.type.propertyTag);
    return { success: true, effect: generated.effect, label: generated.type.label };
}

/** Forge metadata 소유권을 검사해 다른 제작자의 결과물이나 일반 아이템 이름 변경을 막는다. */
export function renameForgedItem(item: Item, creatorUserId: number, requestedName: string): ForgedItemRenameResult {
    const forge = item.getMetadata<Record<string, unknown>>(ItemMetadataKeys.FORGE);
    if (!forge || forge.creatorUserId !== creatorUserId) {
        return { success: false, reason: '직접 단조한 장비에만 이름을 붙일 수 있습니다.' };
    }
    const name = requestedName.replace(/\s+/g, ' ').trim();
    if (name.length < 2 || name.length > 24) {
        return { success: false, reason: '장비 이름은 공백 포함 2~24자로 입력해주세요.' };
    }
    if (/[\u0000-\u001f\u007f\[\]]/.test(name)) {
        return { success: false, reason: '장비 이름에는 제어 문자나 대괄호를 사용할 수 없습니다.' };
    }
    item.setMetadata(ItemMetadataKeys.CUSTOM_NAME, name);
    return { success: true, name };
}

/** 리듬 정확도를 사용자 표시·경험치 보정에 함께 사용하는 단조 품질 등급. */
export class ForgeQuality {
    private static readonly all: ForgeQuality[] = [];

    static readonly ROUGH = new ForgeQuality('rough', '거친', 0, 0.7);
    static readonly GOOD = new ForgeQuality('good', '양호', 0.62, 1);
    static readonly EXCELLENT = new ForgeQuality('excellent', '우수', 0.78, 1.2);
    static readonly MASTERWORK = new ForgeQuality('masterwork', '명품', 0.92, 1.45);

    private constructor(
        readonly key: string,
        readonly label: string,
        readonly minimumAccuracy: number,
        /** 동레벨 일반 몬스터 경험치의 80% 기준에 적용할 품질 보정. */
        readonly experienceMultiplier: number,
    ) {
        ForgeQuality.all.push(this);
    }

    static values(): readonly ForgeQuality[] { return ForgeQuality.all; }
    static fromKey(key: string): ForgeQuality | undefined {
        return ForgeQuality.all.find(value => value.key === key.trim().toLowerCase());
    }
    static fromAccuracy(accuracy: number): ForgeQuality {
        const normalized = Math.max(0, Math.min(1, accuracy));
        return [...ForgeQuality.all]
            .reverse()
            .find(value => normalized >= value.minimumAccuracy)
            ?? ForgeQuality.ROUGH;
    }
}

export class ForgeForm {
    private static readonly all: ForgeForm[] = [];

    static readonly SWORD = new ForgeForm('sword', '장검', ['블레이드', '소드', '세이버'], '아스트라엘', 'forged_sword', 4, 12, 130, GameTags.WEAPON_SWORD);
    static readonly AXE = new ForgeForm('axe', '도끼', ['액스', '클리버', '브레이커'], '익스클리프', 'forged_axe', 5, 15, 150, GameTags.WEAPON_AXE);
    static readonly DAGGER = new ForgeForm('dagger', '단검', ['대거', '팽', '스팅어'], '나이트베인', 'forged_dagger', 3, 9, 105, GameTags.WEAPON_DAGGER);
    static readonly STAFF_FRAME = new ForgeForm(
        'staff_frame', '지팡이 틀', ['로드', '스태프', '완드'], '아르카노스',
        'forged_staff_frame', 4, 13, 145, GameTags.WEAPON_STAFF, 'magicForce',
        'staff_infusing', '마도 대장장이의 [ 지팡이 마력 부여 ] 스킬이 필요합니다.',
    );
    static readonly BOW_LIMB = new ForgeForm(
        'bow_limb', '활대', ['보우', '아크', '런처'], '기어스트링',
        'forged_bow_limb', 4, 11, 135, GameTags.WEAPON_BOW, 'atk',
        'artificer_manufacturing', '기계 장인의 [ 정밀 병기 제작 ] 스킬이 필요합니다.',
    );
    static readonly ARROWHEADS = new ForgeForm(
        'arrowheads', '화살촉 묶음', ['애로우', '볼트', '피어서'], '트루스파이크',
        'forged_arrowheads', 2, 4, 70, null, 'atk',
        'artificer_manufacturing', '기계 장인의 [ 정밀 병기 제작 ] 스킬이 필요합니다.',
    );
    static readonly SHIELD = new ForgeForm('shield', '방패', ['이지스', '실드', '가드'], '아르카디아', 'forged_shield', 5, 9, 180, null, 'def');
    static readonly PICKAXE = new ForgeForm(
        'pickaxe', '곡괭이', ['픽', '딥델버', '브레이커'], '테라크레스트',
        'forged_pickaxe', 4, 18, 160, null, 'miningPower',
    );
    static readonly HELMET = new ForgeForm('helmet', '투구', ['헬름', '바이저', '크라운'], '아이기스혼', 'forged_helmet', 3, 1.5, 120, null, 'def');
    static readonly CHESTPLATE = new ForgeForm('chestplate', '흉갑', ['아머', '큐라스', '플레이트'], '아다만티아', 'forged_chestplate', 7, 3.5, 240, null, 'def');
    static readonly GREAVES = new ForgeForm('greaves', '각반', ['그리브', '레그가드', '타셋'], '바스티온', 'forged_greaves', 5, 2.5, 180, null, 'def');
    static readonly SABATONS = new ForgeForm('sabatons', '철갑화', ['사바톤', '부츠', '트레더'], '스틸워커', 'forged_sabatons', 3, 1.25, 110, null, 'def');

    private constructor(
        readonly key: string,
        readonly label: string,
        readonly nameNouns: readonly string[],
        readonly perfectPrefix: string,
        readonly itemDataId: string,
        readonly materialCount: number,
        readonly basePower: number,
        readonly baseDurability: number,
        readonly weaponTag: TagId | null,
        readonly powerAttribute: AttributeKey = 'atk',
        readonly requiredSkillDataId: string | null = null,
        readonly unlockDescription: string | null = null,
    ) { ForgeForm.all.push(this); }

    static values(): readonly ForgeForm[] { return ForgeForm.all; }
    static fromKey(key: string): ForgeForm | undefined { return ForgeForm.all.find(value => value.key === key); }
    static fromInput(input: string): ForgeForm | undefined {
        const value = input.trim().toLowerCase();
        return ForgeForm.all.find(form => form.key === value || form.label === input.trim());
    }
}

export class ForgeMaterial {
    private static readonly all: ForgeMaterial[] = [];

    static readonly IRON = new ForgeMaterial('iron', '철', 'refined_iron', 1, [GameTags.MATERIAL_IRON, GameTags.PROPERTY_METAL]);
    static readonly GOLD = new ForgeMaterial('gold', '금', 'refined_gold', 0.92, [GameTags.MATERIAL_GOLD, GameTags.PROPERTY_METAL], [{ attribute: 'critRate', op: 'add', value: 0.02 }]);
    static readonly RUBY = new ForgeMaterial('ruby', '루비', 'refined_ruby', 1.12, [GameTags.MATERIAL_RUBY, GameTags.PROPERTY_FIRE], [{ attribute: 'magicForce', op: 'add', value: 4 }]);
    static readonly EMERALD = new ForgeMaterial('emerald', '에메랄드', 'refined_emerald', 1.08, [GameTags.MATERIAL_EMERALD, GameTags.PROPERTY_NATURAL], [{ attribute: 'speed', op: 'multiply', value: 1.03 }]);
    static readonly DIAMOND = new ForgeMaterial('diamond', '다이아몬드', 'refined_diamond', 1.3, [GameTags.MATERIAL_DIAMOND, GameTags.PROPERTY_STONE], [{ attribute: 'armorPen', op: 'add', value: 4 }]);
    static readonly MANA_CRYSTAL = new ForgeMaterial(
        'mana_crystal',
        '마나 수정',
        'refined_mana_crystal',
        1.16,
        [GameTags.MATERIAL_MANA_CRYSTAL],
        [],
        craftsmanship => [
            {
                attribute: 'magicForce',
                op: 'add',
                value: round(8 + craftsmanship.creatorLevel * 0.24 + Math.sqrt(craftsmanship.sensibility) * 0.8, 2),
            },
            {
                attribute: 'maxMentality',
                op: 'add',
                value: round(15 + craftsmanship.creatorLevel * 0.55 + craftsmanship.sensibility * 0.05, 2),
            },
            {
                attribute: 'magicPen',
                op: 'add',
                value: round(2 + craftsmanship.creatorLevel * 0.03, 2),
            },
        ],
    );
    static readonly EMBER_ALLOY = new ForgeMaterial('ember_alloy', '홍염강', 'ember_alloy', 1.5,
        [GameTags.MATERIAL_EMBER, GameTags.PROPERTY_FIRE, GameTags.PROPERTY_METAL], [
            { attribute: 'magicForce', op: 'add', value: 16 },
            { attribute: 'critDmg', op: 'add', value: 0.12 },
        ]);
    static readonly ASTRAL_STEEL = new ForgeMaterial(
        'astral_steel', '성철강', 'astral_steel', 1.55,
        ['material:astral_steel', GameTags.PROPERTY_METAL, GameTags.PROPERTY_LIGHT],
        [{ attribute: 'critRate', op: 'add', value: 0.03 }],
        craftsmanship => [{ attribute: 'armorPen', op: 'add', value: round(8 + craftsmanship.creatorLevel * 0.15, 2) }],
    );
    static readonly ABYSSAL_SILVER = new ForgeMaterial(
        'abyssal_silver', '심연은', 'abyssal_silver', 1.52,
        ['material:abyssal_silver', GameTags.PROPERTY_METAL, GameTags.PROPERTY_WATER, GameTags.PROPERTY_DARK],
        [],
        craftsmanship => [
            { attribute: 'magicDef', op: 'add', value: round(20 + craftsmanship.creatorLevel * 0.22, 2) },
            { attribute: 'maxMentality', op: 'add', value: round(50 + craftsmanship.creatorLevel * 0.6, 2) },
        ],
    );
    static readonly STORM_QUARTZ = new ForgeMaterial(
        'storm_quartz', '폭풍석영', 'storm_quartz', 1.58,
        ['material:storm_quartz', GameTags.MATERIAL_STONE, GameTags.PROPERTY_ELECTRIC],
        [],
        craftsmanship => [
            { attribute: 'attackSpeed', op: 'multiply', value: round(1.06 + Math.min(0.16, craftsmanship.creatorLevel * 0.00015), 4) },
            { attribute: 'projectileAcceleration', op: 'multiply', value: round(1.1 + Math.min(0.35, craftsmanship.creatorLevel * 0.0003), 4) },
        ],
    );
    static readonly LIFE_BLOOD_ALLOY = new ForgeMaterial(
        'life_blood_alloy', '생혈합금', 'life_blood_alloy', 1.6,
        ['material:life_blood_alloy', GameTags.PROPERTY_METAL, GameTags.PROPERTY_NATURAL],
        [],
        craftsmanship => [
            { attribute: 'maxLife', op: 'add', value: round(250 + craftsmanship.creatorLevel * 5, 2) },
            { attribute: 'lifeRegen', op: 'add', value: round(2 + craftsmanship.creatorLevel * 0.035, 2) },
        ],
    );
    static readonly VOID_OPAL = new ForgeMaterial(
        'void_opal', '공허오팔', 'void_opal', 1.66,
        ['material:void_opal', GameTags.MATERIAL_STONE, GameTags.PROPERTY_DARK],
        [
            { attribute: 'critRate', op: 'add', value: 0.05 },
            { attribute: 'critDmg', op: 'add', value: 0.18 },
        ],
        craftsmanship => [{ attribute: 'magicPen', op: 'add', value: round(8 + craftsmanship.creatorLevel * 0.12, 2) }],
    );
    static readonly SACRED_PRAYERSTONE = new ForgeMaterial(
        'sacred_prayerstone', '성원석', 'sacred_prayerstone', 1.64,
        ['material:sacred_prayerstone', GameTags.MATERIAL_STONE, GameTags.PROPERTY_HOLY],
        [],
        craftsmanship => [
            { attribute: 'mentalityRegen', op: 'add', value: round(3 + craftsmanship.creatorLevel * 0.04, 2) },
            { attribute: 'magicDef', op: 'add', value: round(15 + craftsmanship.creatorLevel * 0.18, 2) },
        ],
    );
    static readonly ORIGIN_PRISM = new ForgeMaterial(
        'origin_prism', '기원프리즘', 'origin_prism', 1.72,
        ['material:origin_prism', GameTags.MATERIAL_STONE, GameTags.PROPERTY_HOLY, GameTags.PROPERTY_DARK],
        [],
        craftsmanship => [
            { attribute: 'magicForce', op: 'add', value: round(20 + craftsmanship.creatorLevel * 0.35, 2) },
            { attribute: 'armorPen', op: 'add', value: round(10 + craftsmanship.creatorLevel * 0.12, 2) },
            { attribute: 'magicPen', op: 'add', value: round(10 + craftsmanship.creatorLevel * 0.12, 2) },
        ],
    );
    static readonly TIMEGLASS_CRYSTAL = new ForgeMaterial(
        'timeglass_crystal', '시류결정', 'timeglass_crystal', 1.68,
        ['material:timeglass_crystal', GameTags.MATERIAL_STONE, GameTags.PROPERTY_LIGHT, GameTags.PROPERTY_DARK],
        [],
        craftsmanship => [
            { attribute: 'speed', op: 'add', value: round(0.08 + craftsmanship.creatorLevel * 0.00025, 4) },
            { attribute: 'attackSpeed', op: 'multiply', value: round(1.05 + Math.min(0.15, craftsmanship.creatorLevel * 0.00014), 4) },
            { attribute: 'projectileAcceleration', op: 'multiply', value: round(1.12 + Math.min(0.32, craftsmanship.creatorLevel * 0.00028), 4) },
        ],
    );

    private constructor(
        readonly key: string,
        readonly label: string,
        readonly itemDataId: string,
        readonly power: number,
        readonly tags: readonly TagId[],
        readonly bonusModifiers: readonly ForgeModifierSeed[] = [],
        readonly createCraftsmanshipModifiers?: ForgeCraftsmanshipModifierFactory,
    ) { ForgeMaterial.all.push(this); }

    static values(): readonly ForgeMaterial[] { return ForgeMaterial.all; }
    static fromKey(key: string): ForgeMaterial | undefined { return ForgeMaterial.all.find(value => value.key === key); }
    static fromInput(input: string): ForgeMaterial | undefined {
        const value = normalizeForgeInput(input);
        return ForgeMaterial.all.find(material => material.getInputValues()
            .some(candidate => normalizeForgeInput(candidate) === value));
    }

    getInputValues(): readonly string[] {
        return [
            this.key,
            this.label,
            this.itemDataId,
            ...(this === ForgeMaterial.MANA_CRYSTAL ? ['마나수정', '정제 마나 수정', '정제마나수정'] : []),
        ];
    }

    get rawItemDataId(): string | undefined {
        return {
            iron: 'iron_ore',
            gold: 'gold_ore',
            ruby: 'ruby',
            emerald: 'emerald',
            diamond: 'diamond',
            mana_crystal: 'mana_crystal',
            ember_alloy: 'ember_ore',
            astral_steel: 'astral_iron_ore',
            abyssal_silver: 'abyss_pearl_ore',
            storm_quartz: 'thunder_quartz_ore',
            life_blood_alloy: 'life_blood_ore',
            void_opal: 'void_opal_ore',
            sacred_prayerstone: 'prayerstone_ore',
            origin_prism: 'origin_prism_ore',
            timeglass_crystal: 'timeglass_ore',
        }[this.key];
    }

    getBonusModifiers(craftsmanship: ForgeCraftsmanship): readonly ForgeModifierSeed[] {
        return [
            ...this.bonusModifiers,
            ...(this.createCraftsmanshipModifiers?.(craftsmanship) ?? []),
        ];
    }
}

function normalizeForgeInput(input: string): string {
    return input.trim().toLowerCase().replace(/\s+/g, '');
}

const forgeTraits = [
    { key: 'balanced', label: '균형 잡힌', power: 1, durability: 1, modifiers: [] },
    { key: 'keen', label: '예리한', power: 0.9, durability: 0.84, weaponOnly: true, modifiers: [
        { attribute: 'critRate', op: 'add', value: 0.07 },
        { attribute: 'critDmg', op: 'add', value: 0.18 },
    ] },
    { key: 'heavy', label: '묵직한', power: 1.2, durability: 1.28, modifiers: [
        { attribute: 'attackSpeed', op: 'multiply', value: 0.86 },
        { attribute: 'speed', op: 'multiply', value: 0.96 },
    ] },
    { key: 'precise', label: '정밀한', power: 0.88, durability: 0.94, modifiers: [
        { attribute: 'armorPen', op: 'add', value: 14 },
        { attribute: 'attackSpeed', op: 'multiply', value: 1.06 },
    ] },
    { key: 'resilient', label: '질긴', power: 0.8, durability: 1.7, modifiers: [
        { attribute: 'def', op: 'add', value: 12 },
    ] },
    { key: 'arcane', label: '마도적인', power: 0.84, durability: 0.9, modifiers: [
        { attribute: 'magicForce', op: 'add', value: 18 },
        { attribute: 'magicPen', op: 'add', value: 8 },
    ] },
    { key: 'volatile', label: '불안정한', power: 1.32, durability: 0.62, weaponOnly: true, modifiers: [
        { attribute: 'critDmg', op: 'add', value: 0.32 },
    ] },
] as const;

type ForgeTrait = typeof forgeTraits[number];
type ForgeCraftsmanshipModifierFactory = (craftsmanship: ForgeCraftsmanship) => readonly ForgeModifierSeed[];

interface ForgeQuirk {
    readonly key: string;
    readonly label: string;
    readonly nameWord: string;
    readonly power: number;
    readonly durability: number;
    readonly createModifiers: ForgeCraftsmanshipModifierFactory;
}

const forgeQuirks: readonly ForgeQuirk[] = [
    {
        key: 'overdrive', label: '과부하', nameWord: '오버드라이브', power: 1.28, durability: 0.9,
        createModifiers: () => [{ attribute: 'speed', op: 'multiply', value: 0.86 }],
    },
    {
        key: 'armor_rend', label: '파갑', nameWord: '아머렌드', power: 0.8, durability: 1,
        createModifiers: craftsmanship => [{
            attribute: 'armorPen', op: 'add', value: round(12 + craftsmanship.creatorLevel * 0.08, 2),
        }],
    },
    {
        key: 'fatal_oath', label: '필살', nameWord: '데스오스', power: 0.94, durability: 0.92,
        createModifiers: () => [
            { attribute: 'critRate', op: 'add', value: -0.08 },
            { attribute: 'critDmg', op: 'add', value: 0.55 },
        ],
    },
    {
        key: 'life_bound', label: '생명 결속', nameWord: '라이프본', power: 0.86, durability: 1.08,
        createModifiers: craftsmanship => [
            { attribute: 'maxLife', op: 'add', value: round(100 + craftsmanship.creatorLevel * 4, 2) },
            { attribute: 'def', op: 'add', value: round(4 + craftsmanship.creatorLevel * 0.04, 2) },
        ],
    },
    {
        key: 'spell_bound', label: '마도 결속', nameWord: '아케인', power: 0.78, durability: 0.88,
        createModifiers: craftsmanship => [
            {
                attribute: 'magicForce',
                op: 'add',
                value: round(Math.min(
                    160,
                    8 + craftsmanship.creatorLevel * 0.22 + Math.sqrt(Math.max(0, craftsmanship.sensibility)) * 0.9,
                ), 2),
            },
            { attribute: 'magicPen', op: 'add', value: round(6 + craftsmanship.creatorLevel * 0.04, 2) },
        ],
    },
];

const forgeNamePrefixes = Object.freeze({
    masterwork: ['아스트레온', '발크리온', '에버폴', '룬크레스트'],
    balanced: ['에퀼리온', '하모니아', '밸런트', '스테디아'],
    keen: ['레이저윈드', '실버엣지', '킨베일', '샤프리스'],
    heavy: ['그라비톤', '아이언폴', '브레이크혼', '타이탄록'],
    precise: ['아큐리스', '트루사이트', '핀포인트', '클리어런스'],
    resilient: ['듀라하임', '포트리스', '스톤가드', '언브로큰'],
    arcane: ['아르카눔', '룬베일', '마나크레스트', '에테리온'],
    volatile: ['카오스브링어', '와일드코어', '리프트엣지', '브레이크제로'],
    rough: ['애시본', '러스트혼', '그릿폴', '스톤바이트'],
} satisfies Record<string, readonly string[]>);

function selectNamePart(values: readonly string[], random: () => number): string {
    const value = Math.max(0, Math.min(0.999999, random()));
    return values[Math.min(values.length - 1, Math.floor(value * values.length))];
}

/** 대부분은 읽기 쉬운 일반명을 쓰고, 높은 품질이나 희귀 난수에서만 조합형 고유명을 만든다. */
export function createForgedItemName(
    form: ForgeForm,
    material: ForgeMaterial,
    accuracy: number,
    trait: ForgeTrait,
    random: () => number,
): string {
    if (accuracy >= 0.98) return `${form.perfectPrefix} ${material.label} ${form.nameNouns[0]}`;
    const ordinaryChance = trait.key === 'balanced' ? 0.78 : 0.65;
    if (random() < ordinaryChance) {
        return trait.key === 'balanced'
            ? `${material.label} ${form.label}`
            : `${trait.label} ${material.label} ${form.label}`;
    }
    const prefixPool = accuracy >= 0.92
        ? forgeNamePrefixes.masterwork
        : accuracy < 0.62
            ? forgeNamePrefixes.rough
            : forgeNamePrefixes[trait.key];
    return `${selectNamePart(prefixPool, random)} ${material.label} ${selectNamePart(form.nameNouns, random)}`;
}

export interface ForgeResultOptions {
    accuracy: number;
    random?: () => number;
    creatorUserId?: number;
    creatorLevel?: number;
    sensibility?: number;
    forgingPrecision?: number;
    /** 최종 장비 성능 레벨 상한. 제작 성장치와 착용 레벨도 함께 제한한다. */
    performanceLevelCap?: number;
}

export interface ForgeCraftsmanship {
    creatorLevel: number;
    sensibility: number;
    forgingPrecision: number;
    /** 형태별 기준 화력으로 환산하기 전 제작자의 성장 기여값. */
    primaryPower: number;
    multiplier: number;
}

/** 재료의 격과 리듬 품질로 완성품의 장비 레벨을 계산한다. */
export function calculateForgedItemLevel(material: ForgeMaterial, options: ForgeResultOptions): number {
    const requestedCreatorLevel = Math.max(1, Math.floor(options.creatorLevel ?? 1));
    const cap = Number.isFinite(options.performanceLevelCap)
        ? Math.max(1, Math.floor(options.performanceLevelCap!))
        : Number.POSITIVE_INFINITY;
    const creatorLevel = Math.min(requestedCreatorLevel, cap);
    const accuracy = Math.max(0, Math.min(1, options.accuracy));
    const levelFactor = Math.max(0.65, Math.min(
        1.1,
        0.65 + accuracy * 0.3 + Math.max(0, material.power - 0.9) * 0.15,
    ));
    return Math.max(1, Math.min(cap, Math.round(creatorLevel * levelFactor)));
}

/** 단조 장비는 최종 성능 레벨의 약 80%부터 장착할 수 있다. */
export function calculateForgedRequiredLevel(itemLevel: number): number {
    return Math.max(1, Math.ceil(Math.max(1, Math.floor(itemLevel)) * 0.8));
}

/** 레거시의 감각 100 초과분 기반 효율을 현재 장비 수치 규모에 맞춰 완만한 배율로 환산한다. */
export function calculateForgeCraftsmanship(options: ForgeResultOptions): ForgeCraftsmanship {
    const requestedCreatorLevel = Math.max(1, Math.floor(options.creatorLevel ?? 1));
    const creatorLevel = Number.isFinite(options.performanceLevelCap)
        ? Math.min(requestedCreatorLevel, Math.max(1, Math.floor(options.performanceLevelCap!)))
        : requestedCreatorLevel;
    const growthScale = Math.min(1, creatorLevel / requestedCreatorLevel);
    const sensibility = Math.max(0, options.sensibility ?? 0) * growthScale;
    const forgingPrecision = Math.max(0, options.forgingPrecision ?? 0) * growthScale;
    const levelGrowth = Math.min(1.5, creatorLevel / 150);
    const senseGrowth = Math.min(2.25, Math.max(0, sensibility - 100) * 0.0015);
    const precisionScale = Math.log1p(forgingPrecision) / Math.log(3);
    const precisionGrowth = precisionScale * 0.4;
    const primaryPower = Math.max(0, creatorLevel - 10) * 0.45
        + Math.max(0, sensibility - 50) * 0.22
        + precisionScale * 30;
    return {
        creatorLevel,
        sensibility,
        forgingPrecision,
        primaryPower: round(primaryPower, 4),
        multiplier: round(1 + levelGrowth + senseGrowth + precisionGrowth, 4),
    };
}

/** 단검과 신발은 재료 특성과 별개로 민첩한 형태 자체의 이동속도 보정을 가진다. */
function createFormUtilityModifiers(
    form: ForgeForm,
    craftsmanship: ForgeCraftsmanship,
    itemLevel: number,
    accuracy: number,
): readonly ForgeModifierSeed[] {
    const modifiers: ForgeModifierSeed[] = [];
    if (form === ForgeForm.SWORD || form === ForgeForm.AXE || form === ForgeForm.DAGGER) {
        modifiers.push({
            attribute: 'armorPen',
            op: 'add',
            value: calculateForgedPhysicalPenetration(itemLevel, form === ForgeForm.DAGGER),
        });
    }
    if (form === ForgeForm.DAGGER) {
        modifiers.push({
            attribute: 'speed',
            op: 'add',
            value: round(Math.min(
                0.7,
                0.025 + itemLevel * 0.0007 + craftsmanship.forgingPrecision * 0.025 + accuracy * 0.045,
            ), 4),
        });
    }
    if (form === ForgeForm.BOW_LIMB) {
        modifiers.push({
            attribute: 'critRate',
            op: 'add',
            value: round(0.04 + itemLevel * 0.0002, 4),
        });
    }
    if (form === ForgeForm.SABATONS) {
        modifiers.push({
            attribute: 'speed',
            op: 'add',
            value: round(Math.min(
                0.45,
                0.045 + itemLevel * 0.001 + craftsmanship.forgingPrecision * 0.035 + accuracy * 0.06,
            ), 4),
        });
    }
    return modifiers;
}

/** 형태·재료는 결과를 결정하고, 단조 trait만 주입 가능한 random에 따라 달라진다. */
export function createForgedItemSnapshot(
    form: ForgeForm,
    material: ForgeMaterial,
    options: ForgeResultOptions,
): ItemSnapshot {
    const accuracy = Math.max(0, Math.min(1, options.accuracy));
    const efficiency = 0.7 + accuracy * 0.9;
    const random = options.random ?? Math.random;
    const availableTraits = forgeTraits.filter(trait => !('weaponOnly' in trait) || form.powerAttribute === 'atk');
    const trait = availableTraits[Math.min(availableTraits.length - 1, Math.floor(
        Math.max(0, Math.min(0.999999, random())) * availableTraits.length,
    ))];
    const quirkRoll = Math.max(0, Math.min(0.999999, random()));
    const quirk = quirkRoll > 0.84
        ? forgeQuirks[Math.min(forgeQuirks.length - 1, Math.floor(random() * forgeQuirks.length))]
        : undefined;
    const craftsmanship = calculateForgeCraftsmanship(options);
    const itemLevel = calculateForgedItemLevel(material, options);
    const requiredLevel = calculateForgedRequiredLevel(itemLevel);
    const formPowerScale = form.basePower / ForgeForm.SWORD.basePower;
    const power = round(
        (form.basePower + craftsmanship.primaryPower * formPowerScale)
            * material.power * efficiency * trait.power * (quirk?.power ?? 1)
            * calculateForgedWeaponPowerMultiplier(form.key, itemLevel),
        2,
    );
    const durabilityCraftsmanship = 1 + (craftsmanship.multiplier - 1) * 0.4;
    const maxDurability = Math.max(1, Math.round(
        form.baseDurability * material.power * efficiency * trait.durability * durabilityCraftsmanship * (quirk?.durability ?? 1),
    ));
    const instanceModifiers: ForgeModifierSeed[] = [
        { attribute: form.powerAttribute, op: 'add', value: power },
        ...material.getBonusModifiers(craftsmanship),
        ...createFormUtilityModifiers(form, craftsmanship, itemLevel, accuracy),
        ...trait.modifiers,
        ...(quirk?.createModifiers(craftsmanship) ?? []),
    ];
    const quality = ForgeQuality.fromAccuracy(accuracy);
    const baseName = createForgedItemName(form, material, accuracy, trait, random);
    const customName = quirk ? `${quirk.nameWord} ${baseName}` : baseName;
    const storedModifiers: MetadataValue[] = instanceModifiers.map(modifier => ({
        attribute: modifier.attribute,
        op: modifier.op,
        value: modifier.value,
    }));
    const metadata: ItemMetadata = {
        [ItemMetadataKeys.CUSTOM_NAME]: customName,
        [ItemMetadataKeys.CUSTOM_DESCRIPTION]: `성능 Lv.${itemLevel} · 착용 Lv.${requiredLevel} ${quality.label} 단조품. ${material.label}의 성질과 ${form.label}의 형태가 결합되었다. 단조 정확도 ${Math.round(accuracy * 100)}%, 제작 숙련 배율 ${craftsmanship.multiplier.toFixed(2)}배.${quirk ? ` 특이 각인 [ ${quirk.label} ].` : ''}`,
        [ItemMetadataKeys.REQUIREMENTS]: { level: requiredLevel, stats: {}, source: 'forge' },
        [ItemMetadataKeys.MAX_DURABILITY]: maxDurability,
        [ItemMetadataKeys.INSTANCE_MODIFIERS]: storedModifiers,
        [ItemMetadataKeys.FORGE]: {
            form: form.key,
            material: material.key,
            trait: trait.key,
            quirk: quirk?.key ?? '',
            quality: quality.key,
            itemLevel,
            generatedName: customName,
            accuracy: round(accuracy, 4),
            efficiency: round(efficiency, 4),
            creatorLevel: craftsmanship.creatorLevel,
            sensibility: round(craftsmanship.sensibility, 2),
            forgingPrecision: round(craftsmanship.forgingPrecision, 4),
            craftsmanshipMultiplier: craftsmanship.multiplier,
            craftsmanshipPower: craftsmanship.primaryPower,
            balanceVersion: FORGED_ITEM_BALANCE_VERSION,
            creatorUserId: options.creatorUserId ?? 0,
            performanceLevelCap: Number.isFinite(options.performanceLevelCap)
                ? Math.max(1, Math.floor(options.performanceLevelCap!))
                : 0,
        },
    };
    return {
        itemDataId: form.itemDataId,
        count: 1,
        durability: maxDurability,
        metadataDelta: metadata,
        tags: [...material.tags],
    };
}

function additiveModifierValue(item: Item, attribute: AttributeKey): number {
    return (item.modifiers ?? [])
        .filter(modifier => modifier.attribute === attribute && modifier.op === 'add')
        .reduce((sum, modifier) => sum + modifier.value, 0);
}

function forgeMetadataOf(item: Item): Record<string, MetadataValue> | undefined {
    return item.getMetadata<Record<string, MetadataValue>>(ItemMetadataKeys.FORGE);
}

function completedComponentName(item: Item, sourceLabel: string, completedLabel: string): string {
    return item.name.includes(sourceLabel)
        ? item.name.replace(sourceLabel, completedLabel)
        : item.name;
}

function storedItemModifiers(item: Item): MetadataValue[] {
    return (item.modifiers ?? []).map(modifier => ({
        attribute: modifier.attribute,
        op: modifier.op,
        value: modifier.value,
    }));
}

/** 마도 대장장이의 전용 스킬로 단조 지팡이 틀을 실제 마법 무기로 완성한다. */
export function createInfusedStaffSnapshot(frame: Item): ForgedComponentResult {
    if (frame.itemDataId !== ForgeForm.STAFF_FRAME.itemDataId) {
        return { success: false, reason: '단조한 지팡이 틀만 마력을 부여해 완성할 수 있습니다.' };
    }
    const forge = forgeMetadataOf(frame);
    if (!forge) return { success: false, reason: '단조 정보가 없는 지팡이 틀입니다.' };

    const name = completedComponentName(frame, ForgeForm.STAFF_FRAME.label, '지팡이');
    const itemLevel = typeof forge.itemLevel === 'number' ? Math.max(1, forge.itemLevel) : 1;
    const magicForce = additiveModifierValue(frame, 'magicForce');
    const metadata = frame.getMetadataDeltaSnapshot() ?? {};
    metadata[ItemMetadataKeys.CUSTOM_NAME] = name;
    metadata[ItemMetadataKeys.CUSTOM_DESCRIPTION] = `${frame.description} 마도 대장장이가 마력 회로를 열어 실제 주문과 마력탄을 다룰 수 있게 완성했다.`;
    metadata[ItemMetadataKeys.INSTANCE_MODIFIERS] = [
        ...storedItemModifiers(frame),
        {
            attribute: 'magicPen',
            op: 'add',
            value: round(6 + itemLevel * 0.17 + magicForce * 0.04 + Math.max(0, itemLevel - 500) * 0.8, 2),
        },
        { attribute: 'mentalityRegen', op: 'add', value: calculateForgedStaffMentalityRegen(itemLevel) },
        {
            attribute: 'projectileAcceleration',
            op: 'multiply',
            value: calculateForgedProjectileAcceleration(itemLevel),
        },
    ];
    metadata[ItemMetadataKeys.FORGE] = {
        ...forge,
        form: 'staff',
        generatedName: name,
        balanceVersion: FORGED_ITEM_BALANCE_VERSION,
    };

    return {
        success: true,
        snapshot: {
            itemDataId: 'forged_staff',
            count: 1,
            durability: frame.durability,
            metadataDelta: metadata,
            tags: [...frame.snapshot(1).tags],
        },
    };
}

/** 기계 장인이 단조 활대와 제작 시위를 조립해 실제 투사체 무기로 완성한다. */
export function createAssembledBowSnapshot(limb: Item): ForgedComponentResult {
    if (limb.itemDataId !== ForgeForm.BOW_LIMB.itemDataId) {
        return { success: false, reason: '단조한 활대만 시위와 조립할 수 있습니다.' };
    }
    const forge = forgeMetadataOf(limb);
    if (!forge) return { success: false, reason: '단조 정보가 없는 활대입니다.' };

    const name = completedComponentName(limb, ForgeForm.BOW_LIMB.label, '활');
    const itemLevel = typeof forge.itemLevel === 'number' ? Math.max(1, forge.itemLevel) : 1;
    const metadata = limb.getMetadataDeltaSnapshot() ?? {};
    metadata[ItemMetadataKeys.CUSTOM_NAME] = name;
    metadata[ItemMetadataKeys.CUSTOM_DESCRIPTION] = `${limb.description} 기계 장인이 장력에 맞는 시위를 연결해 화살을 발사할 수 있게 조립했다.`;
    metadata[ItemMetadataKeys.INSTANCE_MODIFIERS] = [
        ...storedItemModifiers(limb),
        {
            attribute: 'projectileAcceleration',
            op: 'multiply',
            value: calculateForgedProjectileAcceleration(itemLevel),
        },
    ];
    metadata[ItemMetadataKeys.FORGE] = {
        ...forge,
        form: 'bow',
        generatedName: name,
        balanceVersion: FORGED_ITEM_BALANCE_VERSION,
    };

    return {
        success: true,
        snapshot: {
            itemDataId: 'forged_bow',
            count: 1,
            durability: limb.durability,
            metadataDelta: metadata,
            tags: [...limb.snapshot(1).tags],
        },
    };
}

/** 단조 화살촉 한 묶음을 호환 화살대 열 개와 결합해 기존 활이 소비할 수 있는 화살을 만든다. */
export function createForgedArrowSnapshot(arrowheads: Item): ForgedComponentResult {
    if (arrowheads.itemDataId !== ForgeForm.ARROWHEADS.itemDataId) {
        return { success: false, reason: '단조한 화살촉 묶음만 화살대로 조립할 수 있습니다.' };
    }
    const forge = forgeMetadataOf(arrowheads);
    if (!forge) return { success: false, reason: '단조 정보가 없는 화살촉 묶음입니다.' };

    const name = completedComponentName(arrowheads, ForgeForm.ARROWHEADS.label, '화살');
    const damageBonus = round(2 + additiveModifierValue(arrowheads, 'atk') * 0.18, 2);
    const armorPen = round(1 + additiveModifierValue(arrowheads, 'armorPen'), 2);
    const persistentTags = arrowheads.snapshot(1).tags;
    const projectileTags = persistentTags.filter(tag => !isPropertyTag(tag));
    const metadata = arrowheads.getMetadataDeltaSnapshot() ?? {};
    delete metadata[ItemMetadataKeys.INSTANCE_MODIFIERS];
    delete metadata[ItemMetadataKeys.MAX_DURABILITY];
    metadata[ItemMetadataKeys.CUSTOM_NAME] = name;
    metadata[ItemMetadataKeys.CUSTOM_DESCRIPTION] = `${arrowheads.description} 기계 장인이 균형을 맞춘 화살대 열 개에 촉을 고정해 완성했다.`;
    metadata[ItemMetadataKeys.PROJECTILE] = {
        dataId: 'basic_arrow',
        overrides: {
            name,
            damageBonus,
            attributeOverrides: { armorPen },
            tags: projectileTags,
        },
    };
    metadata[ItemMetadataKeys.FORGE] = { ...forge, form: 'arrow', generatedName: name };

    return {
        success: true,
        snapshot: {
            itemDataId: 'wooden_arrow',
            count: 10,
            durability: null,
            metadataDelta: metadata,
            tags: [...persistentTags],
        },
    };
}

function round(value: number, digits: number): number {
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
}
