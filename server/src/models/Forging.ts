import { ItemMetadataKeys, type ItemMetadata, type ItemSnapshot } from './Item.js';
import type { AttributeKey, ModifierOp } from './Attribute.js';
import type { MetadataValue } from './Metadata.js';
import { GameTags } from '../../../shared/tags.js';
import type { TagId } from '../../../shared/tags.js';

interface ForgeModifierSeed { attribute: AttributeKey; op: ModifierOp; value: number }

export class ForgeForm {
    private static readonly all: ForgeForm[] = [];

    static readonly SWORD = new ForgeForm('sword', '장검', 'forged_sword', 4, 12, 130, GameTags.WEAPON_SWORD);
    static readonly AXE = new ForgeForm('axe', '도끼', 'forged_axe', 5, 15, 150, GameTags.WEAPON_AXE);
    static readonly DAGGER = new ForgeForm('dagger', '단검', 'forged_dagger', 3, 9, 105, GameTags.WEAPON_DAGGER);
    static readonly SHIELD = new ForgeForm('shield', '방패', 'forged_shield', 5, 9, 180, null, 'def');
    static readonly PICKAXE = new ForgeForm('pickaxe', '곡괭이', 'forged_pickaxe', 4, 7, 160, null);

    private constructor(
        readonly key: string,
        readonly label: string,
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
    static readonly GOLD = new ForgeMaterial('gold', '황금', 'refined_gold', 0.92, [GameTags.MATERIAL_GOLD, GameTags.PROPERTY_METAL], [{ attribute: 'critRate', op: 'add', value: 0.02 }]);
    static readonly RUBY = new ForgeMaterial('ruby', '홍염', 'refined_ruby', 1.12, [GameTags.MATERIAL_RUBY, GameTags.PROPERTY_FIRE], [{ attribute: 'magicForce', op: 'add', value: 4 }]);
    static readonly EMERALD = new ForgeMaterial('emerald', '녹영', 'refined_emerald', 1.08, [GameTags.MATERIAL_EMERALD, GameTags.PROPERTY_NATURAL], [{ attribute: 'speed', op: 'multiply', value: 1.03 }]);
    static readonly DIAMOND = new ForgeMaterial('diamond', '금강', 'refined_diamond', 1.3, [GameTags.MATERIAL_DIAMOND, GameTags.PROPERTY_STONE], [{ attribute: 'armorPen', op: 'add', value: 4 }]);

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
    { key: 'keen', label: '날 선', power: 1.02, durability: 0.95, modifiers: [{ attribute: 'critRate', op: 'add', value: 0.015 }] },
    { key: 'heavy', label: '묵직한', power: 1.08, durability: 1.15, modifiers: [{ attribute: 'attackSpeed', op: 'multiply', value: 0.97 }] },
    { key: 'precise', label: '정밀한', power: 0.98, durability: 1.03, modifiers: [{ attribute: 'armorPen', op: 'add', value: 3 }] },
] as const;

export interface ForgeResultOptions {
    accuracy: number;
    random?: () => number;
    creatorUserId?: number;
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
    const trait = forgeTraits[Math.min(forgeTraits.length - 1, Math.floor(Math.max(0, Math.min(0.999999, random())) * forgeTraits.length))];
    const power = round(form.basePower * material.power * efficiency * trait.power, 2);
    const maxDurability = Math.max(1, Math.round(form.baseDurability * material.power * efficiency * trait.durability));
    const instanceModifiers: ForgeModifierSeed[] = [
        { attribute: form.powerAttribute, op: 'add', value: power },
        ...material.bonusModifiers,
        ...trait.modifiers,
    ];
    const quality = accuracy >= 0.92 ? '명품' : accuracy >= 0.78 ? '우수' : accuracy >= 0.62 ? '양호' : '거친';
    const customName = `${trait.label} ${material.label} ${form.label}`;
    const storedModifiers: MetadataValue[] = instanceModifiers.map(modifier => ({
        attribute: modifier.attribute,
        op: modifier.op,
        value: modifier.value,
    }));
    const metadata: ItemMetadata = {
        [ItemMetadataKeys.CUSTOM_NAME]: customName,
        [ItemMetadataKeys.CUSTOM_DESCRIPTION]: `${quality} 단조품. ${material.label}의 성질과 ${form.label}의 형태가 결합되었다. 단조 정확도 ${Math.round(accuracy * 100)}%.`,
        [ItemMetadataKeys.MAX_DURABILITY]: maxDurability,
        [ItemMetadataKeys.INSTANCE_MODIFIERS]: storedModifiers,
        [ItemMetadataKeys.FORGE]: {
            form: form.key,
            material: material.key,
            trait: trait.key,
            accuracy: round(accuracy, 4),
            efficiency: round(efficiency, 4),
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
