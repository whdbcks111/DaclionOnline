import type { AttributeKey, ModifierOp } from './Attribute.js';
import { normalizeTag, normalizeTags } from '../../../shared/tags.js';
import type { TagId } from '../../../shared/tags.js';

export class JobTier {
    private static readonly all: JobTier[] = [];
    static readonly FIRST = new JobTier('first', '1차 직업');
    static readonly ELITE = new JobTier('elite', '엘리트 직업');
    private constructor(readonly key: string, readonly label: string) { JobTier.all.push(this); }
    static values(): readonly JobTier[] { return JobTier.all; }
    static fromKey(key: string): JobTier | undefined { return JobTier.all.find(value => value.key === key); }
}

export class JobSlotType {
    private static readonly all: JobSlotType[] = [];
    static readonly MAIN = new JobSlotType('main', '메인 직업', 20);
    static readonly SUB = new JobSlotType('sub', '서브 직업', 50);
    private constructor(readonly key: string, readonly label: string, readonly requiredLevel: number) {
        JobSlotType.all.push(this);
    }
    static values(): readonly JobSlotType[] { return JobSlotType.all; }
    static fromKey(key: string): JobSlotType | undefined { return JobSlotType.all.find(value => value.key === key); }
    static fromInput(input: string): JobSlotType | undefined {
        const value = input.trim().toLowerCase();
        return JobSlotType.all.find(slot => slot.key === value || slot.label === input);
    }
}

export interface JobAttributeModifier {
    attribute: AttributeKey;
    op: ModifierOp;
    value: number;
}

export interface JobSkillGrant { skillDataId: string; level?: number }

export interface JobDataDefinition {
    id: string;
    name: string;
    icon: string;
    tier: JobTier;
    description: string;
    parentJobIds?: readonly string[];
    grantedSkills?: readonly JobSkillGrant[];
    mainModifiers?: readonly JobAttributeModifier[];
    subModifiers?: readonly JobAttributeModifier[];
    tags?: readonly TagId[];
}

export interface JobData extends Omit<JobDataDefinition, 'parentJobIds' | 'grantedSkills' | 'mainModifiers' | 'subModifiers' | 'tags'> {
    readonly parentJobIds: readonly string[];
    readonly grantedSkills: readonly JobSkillGrant[];
    readonly mainModifiers: readonly JobAttributeModifier[];
    readonly subModifiers: readonly JobAttributeModifier[];
    readonly tags: readonly TagId[];
}

const jobs = new Map<string, Readonly<JobData>>();
const eliteRecipes = new Map<string, string>();

export function defineJob(definition: JobDataDefinition): void {
    const id = normalizeTag(definition.id);
    if (!definition.name.trim()) throw new Error(`직업 이름이 비어 있습니다: ${id}`);
    const parentJobIds = (definition.parentJobIds ?? []).map(normalizeTag);
    if (definition.tier === JobTier.FIRST && parentJobIds.length > 0) {
        throw new Error(`1차 직업에는 상위 계보를 지정할 수 없습니다: ${id}`);
    }
    jobs.set(id, Object.freeze({
        ...definition,
        id,
        name: definition.name.trim(),
        icon: definition.icon.trim(),
        parentJobIds: Object.freeze(parentJobIds),
        grantedSkills: Object.freeze([...(definition.grantedSkills ?? [])]),
        mainModifiers: Object.freeze([...(definition.mainModifiers ?? [])]),
        subModifiers: Object.freeze([...(definition.subModifiers ?? [])]),
        tags: Object.freeze(normalizeTags(definition.tags ?? [])),
    }));
}

export function getJob(id: string): Readonly<JobData> | undefined {
    const value = id.trim();
    return value ? jobs.get(normalizeTag(value)) : undefined;
}
export function getAllJobs(): ReadonlyArray<Readonly<JobData>> { return [...jobs.values()]; }

export function defineEliteJobRecipe(mainJobId: string, subJobId: string, eliteJobId: string): void {
    const main = normalizeTag(mainJobId);
    const sub = normalizeTag(subJobId);
    const elite = normalizeTag(eliteJobId);
    if (main === sub) throw new Error(`동일 직업 이중 조합은 등록할 수 없습니다: ${main}`);
    eliteRecipes.set(`${main}>${sub}`, elite);
}

export function resolveEliteJob(mainJobId: string, subJobId: string): Readonly<JobData> | undefined {
    if (!mainJobId.trim() || !subJobId.trim()) return undefined;
    const id = eliteRecipes.get(`${normalizeTag(mainJobId)}>${normalizeTag(subJobId)}`);
    return id ? getJob(id) : undefined;
}

export function isJobDescendant(jobId: string, ancestorJobId: string, visited = new Set<string>()): boolean {
    if (!jobId.trim() || !ancestorJobId.trim()) return false;
    const id = normalizeTag(jobId);
    const ancestor = normalizeTag(ancestorJobId);
    if (id === ancestor) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    return getJob(id)?.parentJobIds.some(parent => isJobDescendant(parent, ancestor, visited)) ?? false;
}
