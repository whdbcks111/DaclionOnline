import { ItemMetadataKeys, type ItemMetadata, type ItemSnapshot } from './Item.js';
import type { AttributeKey, ModifierOp } from './Attribute.js';
import type { MetadataValue } from './Metadata.js';
import { GameTags } from '../../../shared/tags.js';
import type { TagId } from '../../../shared/tags.js';

interface ForgeModifierSeed { attribute: AttributeKey; op: ModifierOp; value: number }

export class ForgeForm {
    private static readonly all: ForgeForm[] = [];

    static readonly SWORD = new ForgeForm('sword', '장검', ['블레이드', '소드', '세이버'], '아스트라엘', 'forged_sword', 4, 12, 130, GameTags.WEAPON_SWORD);
    static readonly AXE = new ForgeForm('axe', '도끼', ['액스', '클리버', '브레이커'], '익스클리프', 'forged_axe', 5, 15, 150, GameTags.WEAPON_AXE);
    static readonly DAGGER = new ForgeForm('dagger', '단검', ['대거', '팽', '스팅어'], '나이트베인', 'forged_dagger', 3, 9, 105, GameTags.WEAPON_DAGGER);
    static readonly SHIELD = new ForgeForm('shield', '방패', ['이지스', '실드', '가드'], '아르카디아', 'forged_shield', 5, 9, 180, null, 'def');
    static readonly PICKAXE = new ForgeForm('pickaxe', '곡괭이', ['픽', '딥델버', '브레이커'], '테라크레스트', 'forged_pickaxe', 4, 7, 160, null);

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

    private constructor(
        readonly key: string,
        readonly label: string,
        readonly itemDataId: string,
        readonly power: number,
        readonly tags: readonly TagId[],
        readonly bonusModifiers: readonly ForgeModifierSeed[] = [],
    ) { ForgeMaterial.all.push(this); }

    static values(): readonly ForgeMaterial[] { return ForgeMaterial.all; }
    static fromKey(key: string): ForgeMaterial | undefined { return ForgeMaterial.all.find(value => value.key === key); }
    static fromInput(input: string): ForgeMaterial | undefined {
        const value = input.trim().toLowerCase();
        return ForgeMaterial.all.find(material => material.key === value
            || material.label === input.trim()
            || material.itemDataId === value);
    }
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

/** 형태·소재·품질은 사용할 어휘군을 결정하고, 같은 어휘군 안의 변형만 난수로 고른다. */
export function createForgedItemName(
    form: ForgeForm,
    material: ForgeMaterial,
    accuracy: number,
    trait: ForgeTrait,
    random: () => number,
): string {
    if (accuracy >= 0.98) return `${form.perfectPrefix} ${material.label} ${form.nameNouns[0]}`;
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
}

export interface ForgeCraftsmanship {
    creatorLevel: number;
    sensibility: number;
    forgingPrecision: number;
    multiplier: number;
}

/** 레거시의 감각 100 초과분 기반 효율을 현재 장비 수치 규모에 맞춰 완만한 배율로 환산한다. */
export function calculateForgeCraftsmanship(options: ForgeResultOptions): ForgeCraftsmanship {
    const creatorLevel = Math.max(1, Math.floor(options.creatorLevel ?? 1));
    const sensibility = Math.max(0, options.sensibility ?? 0);
    const forgingPrecision = Math.max(0, options.forgingPrecision ?? 0);
    const levelGrowth = Math.min(1.5, creatorLevel / 150);
    const senseGrowth = Math.min(2.25, Math.max(0, sensibility - 100) * 0.0015);
    const precisionGrowth = Math.min(0.4, forgingPrecision * 0.2);
    return {
        creatorLevel,
        sensibility,
        forgingPrecision,
        multiplier: round(1 + levelGrowth + senseGrowth + precisionGrowth, 4),
    };
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
    const craftsmanship = calculateForgeCraftsmanship(options);
    const power = round(form.basePower * material.power * efficiency * trait.power * craftsmanship.multiplier, 2);
    const durabilityCraftsmanship = 1 + (craftsmanship.multiplier - 1) * 0.4;
    const maxDurability = Math.max(1, Math.round(
        form.baseDurability * material.power * efficiency * trait.durability * durabilityCraftsmanship,
    ));
    const instanceModifiers: ForgeModifierSeed[] = [
        { attribute: form.powerAttribute, op: 'add', value: power },
        ...material.bonusModifiers,
        ...trait.modifiers,
    ];
    const quality = accuracy >= 0.92 ? '명품' : accuracy >= 0.78 ? '우수' : accuracy >= 0.62 ? '양호' : '거친';
    const customName = createForgedItemName(form, material, accuracy, trait, random);
    const storedModifiers: MetadataValue[] = instanceModifiers.map(modifier => ({
        attribute: modifier.attribute,
        op: modifier.op,
        value: modifier.value,
    }));
    const metadata: ItemMetadata = {
        [ItemMetadataKeys.CUSTOM_NAME]: customName,
        [ItemMetadataKeys.CUSTOM_DESCRIPTION]: `${quality} 단조품. ${material.label}의 성질과 ${form.label}의 형태가 결합되었다. 단조 정확도 ${Math.round(accuracy * 100)}%, 제작 숙련 배율 ${craftsmanship.multiplier.toFixed(2)}배.`,
        [ItemMetadataKeys.MAX_DURABILITY]: maxDurability,
        [ItemMetadataKeys.INSTANCE_MODIFIERS]: storedModifiers,
        [ItemMetadataKeys.FORGE]: {
            form: form.key,
            material: material.key,
            trait: trait.key,
            generatedName: customName,
            accuracy: round(accuracy, 4),
            efficiency: round(efficiency, 4),
            creatorLevel: craftsmanship.creatorLevel,
            sensibility: round(craftsmanship.sensibility, 2),
            forgingPrecision: round(craftsmanship.forgingPrecision, 4),
            craftsmanshipMultiplier: craftsmanship.multiplier,
            creatorUserId: options.creatorUserId ?? 0,
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

function round(value: number, digits: number): number {
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
}
