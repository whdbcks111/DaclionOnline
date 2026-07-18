export type ActionKey = 'skill' | 'itemUse' | 'chat' | 'command' | 'attack' | 'movement' | 'evasion' | 'locationTravel';

/** Entity가 수행할 수 있는 행동 종류와 표시명을 소유하는 클래스형 enum. */
export class ActionType {
    private static readonly all: ActionType[] = [];

    static readonly SKILL = new ActionType('skill', '스킬 사용', ['스킬']);
    static readonly ITEM_USE = new ActionType('itemUse', '아이템 사용', ['아이템']);
    static readonly CHAT = new ActionType('chat', '채팅', ['대화']);
    static readonly COMMAND = new ActionType('command', '명령어 사용', ['명령']);
    static readonly ATTACK = new ActionType('attack', '공격', ['공격']);
    static readonly MOVEMENT = new ActionType('movement', '이동', ['이동']);
    static readonly EVASION = new ActionType('evasion', '회피', ['회피']);
    static readonly LOCATION_TRAVEL = new ActionType('locationTravel', '장소 이동', ['장소이동', '지역이동']);

    private constructor(
        readonly key: ActionKey,
        readonly label: string,
        readonly aliases: readonly string[],
    ) {
        ActionType.all.push(this);
    }

    static values(): readonly ActionType[] { return ActionType.all; }

    static fromKey(key: string): ActionType | undefined {
        return ActionType.all.find(action => action.key === key);
    }

    static fromInput(input: string): ActionType | undefined {
        const normalized = input.trim().toLowerCase();
        return ActionType.all.find(action => action.key.toLowerCase() === normalized
            || action.label.toLowerCase() === normalized
            || action.aliases.some(alias => alias.toLowerCase() === normalized));
    }
}
