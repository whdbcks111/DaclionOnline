import type { ChatNode } from '../../../shared/types.js';
import { TagCollection, normalizeTags } from '../../../shared/tags.js';
import type { TagId, TagReadable } from '../../../shared/tags.js';
import type Player from './Player.js';

const NPC_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

export interface DialogueContext {
    readonly player: Player;
    readonly npc: NPC;
}

export interface DialogueChoice {
    readonly label: string;
    readonly target: string;
}

export type DialogueContent = string | ChatNode[];

export type DialogueAction =
    | { readonly type: 'say'; readonly content: DialogueContent }
    | { readonly type: 'event'; readonly run: (context: DialogueContext) => void }
    | { readonly type: 'setFlag'; readonly id: string; readonly value: boolean }
    | { readonly type: 'goto'; readonly target: string }
    | { readonly type: 'choice'; readonly choices: readonly DialogueChoice[] }
    | { readonly type: 'acceptQuest'; readonly questId: string }
    | { readonly type: 'turnInQuest'; readonly questId: string }
    | { readonly type: 'end' };

export type DialogueScript = (context: DialogueContext) => Generator<DialogueAction, void, void>;

/** 대화 스크립트가 yield할 액션을 짧게 생성하는 정적 API. */
export class Dialogue {
    static say(content: DialogueContent): DialogueAction {
        return { type: 'say', content };
    }

    static event(run: (context: DialogueContext) => void): DialogueAction {
        return { type: 'event', run };
    }

    static setFlag(id: string, value = true): DialogueAction {
        return { type: 'setFlag', id, value };
    }

    static goto(target: string): DialogueAction {
        return { type: 'goto', target: normalizeScenarioKey(target) };
    }

    static choice(choices: readonly DialogueChoice[]): DialogueAction {
        if (choices.length === 0) throw new Error('대화 선택지는 하나 이상이어야 합니다.');
        if (choices.some(choice => !choice.label.trim())) throw new Error('대화 선택지 문구는 비어 있을 수 없습니다.');
        return {
            type: 'choice',
            choices: choices.map(choice => ({
                label: choice.label.trim(),
                target: normalizeScenarioKey(choice.target),
            })),
        };
    }

    static acceptQuest(questId: string): DialogueAction {
        return { type: 'acceptQuest', questId: questId.trim().toLowerCase() };
    }

    static turnInQuest(questId: string): DialogueAction {
        return { type: 'turnInQuest', questId: questId.trim().toLowerCase() };
    }

    static end(): DialogueAction {
        return { type: 'end' };
    }
}

/** 조건문을 포함한 generator 스크립트 하나를 소유하는 대화 장면. */
export class DialogueScenario {
    readonly key: string;

    constructor(key: string, private readonly script: DialogueScript) {
        this.key = normalizeScenarioKey(key);
    }

    run(context: DialogueContext): Generator<DialogueAction, void, void> {
        return this.script(context);
    }
}

export interface NPCData {
    id: string;
    name: string;
    description?: string;
    tags?: readonly TagId[];
    entryScenario: (context: DialogueContext) => string;
    scenarios: readonly DialogueScenario[];
}

/** 장소에는 ID만 저장하고 정의는 이 정적 레지스트리에서 조회한다. */
export default class NPC implements TagReadable {
    private static readonly registry = new Map<string, NPC>();

    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly tags: TagCollection;
    private readonly scenarios = new Map<string, DialogueScenario>();
    private readonly entryScenario: NPCData['entryScenario'];

    private constructor(data: NPCData) {
        this.id = normalizeNpcId(data.id);
        this.name = data.name.trim();
        this.description = data.description?.trim() ?? '';
        this.tags = new TagCollection({ definition: normalizeTags(data.tags ?? []) });
        this.entryScenario = data.entryScenario;
        if (!this.name) throw new Error(`NPC 이름은 비어 있을 수 없습니다: ${this.id}`);
        for (const scenario of data.scenarios) {
            if (this.scenarios.has(scenario.key)) {
                throw new Error(`중복 NPC 대화 시나리오: ${this.id}/${scenario.key}`);
            }
            this.scenarios.set(scenario.key, scenario);
        }
        if (this.scenarios.size === 0) throw new Error(`NPC 대화 시나리오가 없습니다: ${this.id}`);
    }

    static define(data: NPCData): NPC {
        const npc = new NPC(data);
        NPC.registry.set(npc.id, npc);
        return npc;
    }

    static getNpc(id: string): NPC | undefined {
        return NPC.registry.get(normalizeNpcId(id));
    }

    static getAll(): readonly NPC[] {
        return [...NPC.registry.values()];
    }

    getEntryScenario(context: DialogueContext): DialogueScenario | undefined {
        return this.getScenario(this.entryScenario(context));
    }

    getScenario(key: string): DialogueScenario | undefined {
        return this.scenarios.get(normalizeScenarioKey(key));
    }

    hasTag(tag: TagId): boolean {
        return this.tags.hasTag(tag);
    }
}

export function normalizeNpcId(id: string): string {
    const normalized = id.trim().toLowerCase();
    if (!NPC_ID_PATTERN.test(normalized)) throw new Error(`잘못된 NPC ID입니다: ${id}`);
    return normalized;
}

function normalizeScenarioKey(key: string): string {
    const normalized = key.trim().toLowerCase();
    if (!NPC_ID_PATTERN.test(normalized)) throw new Error(`잘못된 대화 시나리오 키입니다: ${key}`);
    return normalized;
}
