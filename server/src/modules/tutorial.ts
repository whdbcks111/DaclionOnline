import type Player from '../models/Player.js';
import { defineProgress, ProgressType } from '../models/Progress.js';
import { QuestStatus } from '../models/Quest.js';
import { sendBotMessageToUser, sendNotificationToUser } from './message.js';
import { getOnlinePlayer } from './playerRegistry.js';
import { subscribeCommandExecutions } from './bot.js';
import { chat } from '../utils/chatBuilder.js';

export const TUTORIAL_QUEST_ID = 'tutorial:first-steps';
export const TUTORIAL_PRACTICE_QUEST_ID = 'tutorial:basic-practice';

export const TutorialProgressIds = Object.freeze({
    STATUS: 'tutorial:status',
    STEP: 'tutorial:step',
    CONTENT_DONE: 'tutorial:content_done',
    STARTER_KIT_GRANTED: 'tutorial:starter_kit_granted',
    GROWTH_REWARD_GRANTED: 'tutorial:growth_reward_granted',
} as const);

export type TutorialStatusKey = 'active' | 'completed' | 'skipped';

export class TutorialContent {
    private static readonly all: TutorialContent[] = [];

    static readonly FISHING = new TutorialContent('fishing', '낚시', '낚싯대와 미끼로 물고기를 낚는 생활 콘텐츠');
    static readonly MINING = new TutorialContent('mining', '광질', '곡괭이로 광석 자원을 파괴해 재료를 얻는 콘텐츠');
    static readonly HUNTING = new TutorialContent('hunting', '사냥', '대상 지정·공격·스킬로 몬스터와 싸우는 콘텐츠');

    private constructor(
        readonly key: string,
        readonly label: string,
        readonly description: string,
    ) {
        TutorialContent.all.push(this);
    }

    static values(): readonly TutorialContent[] { return TutorialContent.all; }
    static fromKey(key: string): TutorialContent | undefined {
        return TutorialContent.all.find(content => content.key === key);
    }
    static fromInput(input: string): TutorialContent | undefined {
        const normalized = input.trim().toLowerCase().replace(/\s+/g, '');
        return TutorialContent.all.find(content =>
            content.key === normalized || content.label.replace(/\s+/g, '') === normalized);
    }
}

export class TutorialStep {
    private static readonly all: TutorialStep[] = [];

    static readonly WELCOME = new TutorialStep('welcome', '첫걸음', []);
    static readonly STATUS = new TutorialStep('status', '상태창 확인', ['상태창']);
    static readonly LOCATION = new TutorialStep('location', '위치 확인', ['위치']);
    static readonly MOVE = new TutorialStep('move', '장소 이동', ['이동', '자동이동']);
    static readonly INTERACT = new TutorialStep('interact', '오브젝트 상호작용', ['상호작용']);
    static readonly NPC = new TutorialStep('npc', 'NPC 대화', ['대화']);
    static readonly INVENTORY = new TutorialStep('inventory', '인벤토리 확인', ['인벤토리']);
    static readonly EQUIP = new TutorialStep('equip', '아이템 장착', ['장착']);
    static readonly USE = new TutorialStep('use', '아이템 사용', ['사용']);
    static readonly SHOP = new TutorialStep('shop', '상점 이용', ['상점', '구매']);
    static readonly TARGET = new TutorialStep('target', '대상 지정', ['대상지정']);
    static readonly ATTACK = new TutorialStep('attack', '기본 공격', ['공격']);
    static readonly SKILL_LIST = new TutorialStep('skill-list', '스킬 목록', ['스킬목록']);
    static readonly SKILL_USE = new TutorialStep('skill-use', '스킬 사용', ['스킬']);
    static readonly GROWTH = new TutorialStep('growth', '레벨과 스탯', ['스탯분배']);
    static readonly HUD = new TutorialStep('hud', 'HUD 설정', []);
    static readonly SHORTCUTS = new TutorialStep('shortcuts', '단축키 확인', ['단축키목록']);
    static readonly CONTENT_CHOICE = new TutorialStep('content-choice', '콘텐츠 선택', []);
    static readonly CONTENT_FISHING = new TutorialStep('content-fishing', '낚시 안내', []);
    static readonly CONTENT_MINING = new TutorialStep('content-mining', '광질 안내', []);
    static readonly CONTENT_HUNTING = new TutorialStep('content-hunting', '사냥 안내', []);
    static readonly COMPLETE = new TutorialStep('complete', '튜토리얼 완료', []);

    private constructor(
        readonly key: string,
        readonly label: string,
        readonly commandNames: readonly string[],
    ) {
        TutorialStep.all.push(this);
    }

    static values(): readonly TutorialStep[] { return TutorialStep.all; }
    static fromKey(key: string): TutorialStep | undefined {
        return TutorialStep.all.find(step => step.key === key);
    }
    static fromInput(input: string): TutorialStep | undefined {
        const normalized = input.trim().toLowerCase();
        return TutorialStep.all.find(step => step.key === normalized || step.label.toLowerCase() === normalized);
    }

    acceptsCommand(commandName: string): boolean {
        return this.commandNames.includes(commandName);
    }
}

const MAIN_STEP_ORDER = Object.freeze([
    TutorialStep.WELCOME,
    TutorialStep.STATUS,
    TutorialStep.LOCATION,
    TutorialStep.MOVE,
    TutorialStep.INTERACT,
    TutorialStep.NPC,
    TutorialStep.INVENTORY,
    TutorialStep.EQUIP,
    TutorialStep.USE,
    TutorialStep.SHOP,
    TutorialStep.TARGET,
    TutorialStep.ATTACK,
    TutorialStep.SKILL_LIST,
    TutorialStep.SKILL_USE,
    TutorialStep.GROWTH,
    TutorialStep.HUD,
    TutorialStep.SHORTCUTS,
    TutorialStep.CONTENT_CHOICE,
]);

const CONTENT_STEPS = new Map<string, TutorialStep>([
    [TutorialContent.FISHING.key, TutorialStep.CONTENT_FISHING],
    [TutorialContent.MINING.key, TutorialStep.CONTENT_MINING],
    [TutorialContent.HUNTING.key, TutorialStep.CONTENT_HUNTING],
]);

const TUTORIAL_NOTIFICATION_KEY = 'tutorial:current-step';
let initialized = false;

for (const definition of [
    {
        id: TutorialProgressIds.STATUS,
        type: ProgressType.STATE,
        label: '튜토리얼 상태',
        description: '첫 모험 안내의 진행 상태입니다.',
    },
    {
        id: TutorialProgressIds.STEP,
        type: ProgressType.STATE,
        label: '튜토리얼 단계',
        description: '현재 안내 중인 튜토리얼 단계입니다.',
    },
    {
        id: TutorialProgressIds.CONTENT_DONE,
        type: ProgressType.STATE,
        label: '튜토리얼 콘텐츠 확인',
        description: '낚시·광질·사냥 중 확인을 마친 콘텐츠입니다.',
    },
    {
        id: TutorialProgressIds.STARTER_KIT_GRANTED,
        type: ProgressType.FLAG,
        label: '튜토리얼 지원품 수령',
        description: '튜토리얼 지원품의 중복 지급을 막는 플래그입니다.',
    },
    {
        id: TutorialProgressIds.GROWTH_REWARD_GRANTED,
        type: ProgressType.FLAG,
        label: '튜토리얼 성장 보상 수령',
        description: '기본 조작 실습의 레벨업 경험치 중복 지급을 막는 플래그입니다.',
    },
] as const) {
    defineProgress({ ...definition, visible: false, tags: ['tutorial:progress'] });
}

export interface TutorialSnapshot {
    readonly status: TutorialStatusKey | '';
    readonly step: TutorialStep;
    readonly completedContents: readonly TutorialContent[];
}

export function getTutorialSnapshot(player: Player): TutorialSnapshot {
    const status = parseTutorialStatus(player.progress.getState(TutorialProgressIds.STATUS));
    const step = TutorialStep.fromKey(player.progress.getState(TutorialProgressIds.STEP)) ?? TutorialStep.WELCOME;
    return {
        status,
        step,
        completedContents: parseCompletedContents(player.progress.getState(TutorialProgressIds.CONTENT_DONE)),
    };
}

export function isTutorialTerminal(player: Player): boolean {
    const status = getTutorialSnapshot(player).status;
    return status === 'completed' || status === 'skipped';
}

export function hasReachedTutorialGrowth(player: Player): boolean {
    const step = getTutorialSnapshot(player).step;
    const growthIndex = MAIN_STEP_ORDER.indexOf(TutorialStep.GROWTH);
    const stepIndex = MAIN_STEP_ORDER.indexOf(step);
    return stepIndex >= growthIndex || step === TutorialStep.COMPLETE
        || step === TutorialStep.CONTENT_FISHING
        || step === TutorialStep.CONTENT_MINING
        || step === TutorialStep.CONTENT_HUNTING;
}

/** 신규 Player는 자동 시작하고, 재접속 중인 Player는 저장된 현재 단계 알림을 복원한다. */
export function initializeTutorialSession(player: Player, options: {
    newPlayer: boolean;
    showCard?: boolean;
}): void {
    const snapshot = getTutorialSnapshot(player);
    if (options.newPlayer && !snapshot.status) {
        startTutorial(player);
        return;
    }
    if (snapshot.status !== 'active') return;
    ensureTutorialQuest(player);
    showTutorialStep(player, options.showCard === true);
}

export function startTutorial(player: Player): void {
    player.progress.setState(TutorialProgressIds.STATUS, 'active');
    player.progress.setState(TutorialProgressIds.STEP, TutorialStep.WELCOME.key);
    player.progress.setState(TutorialProgressIds.CONTENT_DONE, '');
    grantStarterKit(player);
    ensureTutorialQuest(player);
    showTutorialStep(player, true);
}

export function skipTutorial(player: Player): void {
    if (player.quests.isActive(TUTORIAL_PRACTICE_QUEST_ID)) {
        player.quests.abandon(TUTORIAL_PRACTICE_QUEST_ID);
    }
    player.progress.setState(TutorialProgressIds.STEP, TutorialStep.COMPLETE.key);
    player.progress.setState(TutorialProgressIds.STATUS, 'skipped');
    clearTutorialNotification(player);
    sendBotMessageToUser(player.userId, chat()
        .color('$text-tertiary', b => b.text('첫 모험 안내를 건너뛰었습니다. '))
        .text('언제든 ')
        .color('$info', b => b.text('/튜토리얼시작'))
        .text('으로 다시 시작할 수 있습니다.')
        .build());
}

export function acknowledgeTutorialStep(player: Player): boolean {
    const { status, step } = getTutorialSnapshot(player);
    if (status !== 'active') return false;
    if (step === TutorialStep.WELCOME || step === TutorialStep.HUD) {
        advanceMainStep(player, step);
        return true;
    }
    const content = contentForStep(step);
    if (content) {
        completeContentIntroduction(player, content);
        return true;
    }
    return false;
}

export function chooseTutorialContent(player: Player, input: string): { success: boolean; reason?: string } {
    const snapshot = getTutorialSnapshot(player);
    if (snapshot.status !== 'active' || snapshot.step !== TutorialStep.CONTENT_CHOICE) {
        return { success: false, reason: '지금은 콘텐츠 소개를 선택하는 단계가 아닙니다.' };
    }
    const content = TutorialContent.fromInput(input);
    if (!content) return { success: false, reason: '낚시, 광질, 사냥 중 하나를 선택해주세요.' };
    if (snapshot.completedContents.includes(content)) {
        return { success: false, reason: '이미 확인한 콘텐츠입니다.' };
    }
    const step = CONTENT_STEPS.get(content.key);
    if (!step) return { success: false, reason: '콘텐츠 안내를 찾지 못했습니다.' };
    setStep(player, step);
    return { success: true };
}

/** 다음 순차 단계 계산을 테스트와 운영 코드가 공유한다. */
export function getNextMainTutorialStep(step: TutorialStep): TutorialStep | undefined {
    const index = MAIN_STEP_ORDER.indexOf(step);
    return index >= 0 ? MAIN_STEP_ORDER[index + 1] : undefined;
}

export function initTutorial(): void {
    if (initialized) return;
    initialized = true;
    subscribeCommandExecutions(event => {
        if (event.commandName.startsWith('튜토리얼')) return;
        const player = getOnlinePlayer(event.userId);
        if (!player) return;
        const snapshot = getTutorialSnapshot(player);
        if (snapshot.status !== 'active' || !snapshot.step.acceptsCommand(event.commandName)) return;
        advanceMainStep(player, snapshot.step);
    });
}

function advanceMainStep(player: Player, current: TutorialStep): void {
    const next = getNextMainTutorialStep(current);
    if (!next) return;
    setStep(player, next);
}

function setStep(player: Player, step: TutorialStep): void {
    player.progress.setState(TutorialProgressIds.STEP, step.key);
    if (step === TutorialStep.SKILL_LIST) player.skills.grant('power_strike', 'tutorial');
    showTutorialStep(player, true);
}

function completeContentIntroduction(player: Player, content: TutorialContent): void {
    const completed = new Set(getTutorialSnapshot(player).completedContents.map(entry => entry.key));
    completed.add(content.key);
    player.progress.setState(TutorialProgressIds.CONTENT_DONE, [...completed].join(','));
    if (completed.size >= TutorialContent.values().length) {
        completeTutorial(player);
        return;
    }
    setStep(player, TutorialStep.CONTENT_CHOICE);
}

function completeTutorial(player: Player): void {
    player.progress.setState(TutorialProgressIds.STEP, TutorialStep.COMPLETE.key);
    player.progress.setState(TutorialProgressIds.STATUS, 'completed');
    clearTutorialNotification(player);
    sendBotMessageToUser(player.userId, chat()
        .color('gold', b => b.weight('bold', x => x.text('[ 첫 모험 안내 완료 ]\n')))
        .text('이제 루미나르에서 원하는 길을 골라 모험할 수 있습니다. 막히는 부분은 햄버거 메뉴의 ')
        .color('$info', b => b.text('게임 안내'))
        .text('와 ')
        .color('$info', b => b.text('/도움말'))
        .text('을 확인해보세요.')
        .build());
    sendNotificationToUser(player.userId, {
        key: 'tutorial:completed',
        message: '첫 모험 안내를 모두 마쳤습니다!',
        length: 5000,
    });
}

function ensureTutorialQuest(player: Player): void {
    const status = player.quests.getStatus(TUTORIAL_QUEST_ID);
    if (status !== QuestStatus.ACTIVE && status !== QuestStatus.READY) {
        player.quests.accept(TUTORIAL_QUEST_ID);
    }
    if (!player.progress.getFlag(TutorialProgressIds.GROWTH_REWARD_GRANTED)) {
        const practiceStatus = player.quests.getStatus(TUTORIAL_PRACTICE_QUEST_ID);
        if (practiceStatus !== QuestStatus.ACTIVE && practiceStatus !== QuestStatus.READY) {
            player.quests.accept(TUTORIAL_PRACTICE_QUEST_ID);
        }
    }
}

function grantStarterKit(player: Player): void {
    if (player.progress.getFlag(TutorialProgressIds.STARTER_KIT_GRANTED)) return;
    player.progress.setFlag(TutorialProgressIds.STARTER_KIT_GRANTED, true);
    const grants = [
        ['old_sword', 1],
        ['health_potion', 3],
        ['basic_pickaxe', 1],
        ['beginner_fishing_rod', 1],
        ['earthworm_bait', 10],
    ] as const;
    const received: string[] = [];
    for (const [itemDataId, count] of grants) {
        if (player.inventory.addItem(itemDataId, count)) received.push(`${itemDataId} x${count}`);
    }
    if (received.length > 0) {
        sendBotMessageToUser(player.userId, chat()
            .color('gold', b => b.weight('bold', x => x.text('[ 초보 모험가 지원품 ]\n')))
            .text('낡은 검, 체력 포션, 곡괭이, 초보자 낚싯대와 미끼를 인벤토리에 넣어두었습니다.')
            .build());
    }
}

function showTutorialStep(player: Player, includeCard: boolean): void {
    const snapshot = getTutorialSnapshot(player);
    if (snapshot.status !== 'active') return;
    sendNotificationToUser(player.userId, {
        key: TUTORIAL_NOTIFICATION_KEY,
        message: `🌱 첫 모험 안내 · ${snapshot.step.label}`,
        length: 0,
        showProgress: false,
        editExists: true,
    });
    if (includeCard) sendBotMessageToUser(player.userId, buildTutorialCard(snapshot));
}

function clearTutorialNotification(player: Player): void {
    sendNotificationToUser(player.userId, {
        key: TUTORIAL_NOTIFICATION_KEY,
        message: '',
        length: 1,
        showProgress: false,
        editExists: true,
    });
}

function buildTutorialCard(snapshot: TutorialSnapshot) {
    const b = chat()
        .color('$text-tertiary', x => x.text('[ 첫 모험 안내 ]  '))
        .color('gold', x => x.weight('bold', y => y.text(snapshot.step.label)))
        .text('\n');

    switch (snapshot.step) {
        case TutorialStep.WELCOME:
            b.text('DaclionOnline은 채팅 메시지와 버튼, 명령어로 진행하는 텍스트 MUD RPG입니다. ')
                .text('먼저 버튼을 사용해보고, 같은 기능을 명령어와 짧은 별칭으로도 쓸 수 있다는 순서로 안내합니다.\n')
                .color('$text-tertiary', x => x.text('언제든 /튜토리얼스킵으로 건너뛰고 /튜토리얼시작으로 다시 시작할 수 있습니다.\n\n'))
                .button('/튜토리얼다음', x => x.text('[안내 시작]'))
                .text('  ')
                .button('/튜토리얼스킵', x => x.color('gray', y => y.text('[건너뛰기]')));
            break;
        case TutorialStep.STATUS:
            b.text('상태창은 레벨, 경험치, 생명력·정신력, 장비, 능력치와 상태이상을 보여줍니다. ')
                .text('메시지의 상세 보기로 세부 탭을 펼칠 수 있습니다.\n')
                .color('$text-tertiary', x => x.text('명령어 /상태창 · 별칭 s\n\n'))
                .button('/상태창', x => x.text('[상태창 열기]'));
            break;
        case TutorialStep.LOCATION:
            b.text('위치 정보에는 이동할 길, 번호가 붙은 몬스터·자원·NPC, 바닥 아이템이 표시됩니다. ')
                .text('가능한 행동은 각 항목 옆 버튼으로 먼저 실행해보세요.\n')
                .color('$text-tertiary', x => x.text('명령어 /위치 · 별칭 l, m\n\n'))
                .button('/위치', x => x.text('[현재 위치 보기]'));
            break;
        case TutorialStep.MOVE:
            b.text('위치 메시지의 [이동] 버튼으로 인접 장소를 오갈 수 있습니다. ')
                .text('/이동을 입력하면 갈 수 있는 장소를 보고, 방문한 목적지는 /자동이동으로 경로를 찾아갈 수 있습니다.\n')
                .color('$text-tertiary', x => x.text('명령어 /이동 [장소] · 별칭 v, go, mv\n\n'))
                .button('/이동', x => x.text('[이동 가능 장소]'));
            break;
        case TutorialStep.INTERACT:
            b.text('보물상자처럼 상호작용 가능한 자원은 위치 메시지에 [상호작용] 버튼이 나타납니다. ')
                .text('버튼이 없다면 공격하거나 관찰하는 오브젝트일 수 있습니다.\n')
                .color('$text-tertiary', x => x.text('명령어 /상호작용 <번호> · 별칭 it\n\n'))
                .button('/상호작용 1', x => x.text('[1번과 상호작용]'));
            break;
        case TutorialStep.NPC:
            b.text('NPC 옆 [대화] 버튼을 누르면 선택지형 대화와 퀘스트가 시작됩니다. ')
                .text('장소를 떠나거나 /대화종료를 입력하면 대화가 끝납니다.\n')
                .color('$text-tertiary', x => x.text('명령어 /대화 <번호> · 별칭 tk\n\n'))
                .button('/대화 1', x => x.text('[1번 NPC와 대화]'));
            break;
        case TutorialStep.INVENTORY:
            b.text('인벤토리에서는 아이템 이름, 수량, 중량과 내구도를 확인하고 [사용]·[장착] 버튼을 누를 수 있습니다.\n')
                .color('$text-tertiary', x => x.text('명령어 /인벤토리 · 별칭 i\n\n'))
                .button('/인벤토리', x => x.text('[인벤토리 열기]'));
            break;
        case TutorialStep.EQUIP:
            b.text('인벤토리의 장비 옆 [장착] 버튼을 먼저 사용해보세요. 장착한 무기와 도구에 따라 평타와 가능한 행동이 달라집니다.\n')
                .color('$text-tertiary', x => x.text('명령어 /장착 <인벤토리 번호> · 별칭 eq\n\n'))
                .button('/인벤토리', x => x.text('[장착할 아이템 찾기]'));
            break;
        case TutorialStep.USE:
            b.text('소모품은 인벤토리의 [사용] 버튼으로 사용합니다. 지원품으로 받은 체력 포션도 같은 방식입니다.\n')
                .color('$text-tertiary', x => x.text('명령어 /사용 <인벤토리 번호> · 별칭 u\n\n'))
                .button('/인벤토리', x => x.text('[사용할 아이템 찾기]'));
            break;
        case TutorialStep.SHOP:
            b.text('상점이 있는 장소에서 상품의 [구매] 버튼을 누르고, 인벤토리의 아이템을 판매할 수 있습니다. ')
                .text('현재 장소가 상점이 아니라면 위치 정보에서 잡화점이나 낚시 상점으로 이동하세요.\n')
                .color('$text-tertiary', x => x.text('명령어 /상점 · 별칭 sh, 구매는 bu\n\n'))
                .button('/상점', x => x.text('[상점 열기]'));
            break;
        case TutorialStep.TARGET:
            b.text('위치 메시지에서 몬스터나 자원의 [대상 지정] 버튼을 누르면 평타와 스킬이 그 대상을 바라봅니다.\n')
                .color('$text-tertiary', x => x.text('명령어 /대상지정 <번호> · 별칭 t\n\n'))
                .button('/대상지정 1', x => x.text('[1번 대상 지정]'));
            break;
        case TutorialStep.ATTACK:
            b.text('대상을 지정한 뒤 공격하면 장착 무기, 공격 속도, 회피, 방어력과 속성 상성이 반영됩니다. ')
                .text('광석은 곡괭이처럼 요구 태그가 맞는 도구가 필요합니다.\n')
                .color('$text-tertiary', x => x.text('명령어 /공격 [번호] · 별칭 a\n\n'))
                .button('/공격', x => x.text('[현재 대상 공격]'));
            break;
        case TutorialStep.SKILL_LIST:
            b.text('튜토리얼 보상으로 스킬 [강타]를 지급했습니다. 스킬 목록에서 아이콘, 레벨, 재사용 대기시간과 사용 버튼을 확인하세요.\n')
                .color('$text-tertiary', x => x.text('명령어 /스킬목록 · 별칭 sl\n\n'))
                .button('/스킬목록', x => x.text('[스킬 목록 열기]'));
            break;
        case TutorialStep.SKILL_USE:
            b.text('대상을 지정하고 스킬의 [사용] 버튼을 누르세요. ')
                .text('스킬 이름에 느낌표를 붙인 시전어도 같은 스킬을 발동하며, 성공한 사용은 스킬 경험치를 올립니다.\n')
                .color('$text-tertiary', x => x.text('명령어 /스킬 강타 · 별칭 k 강타 · 시전어 강타!\n\n'))
                .button('/스킬 강타', x => x.text('[강타 사용]'));
            break;
        case TutorialStep.GROWTH:
            b.text('기본 조작 실습 서브 퀘스트를 마쳐 방금 다음 레벨까지 필요한 경험치를 받았습니다. ')
                .text('레벨이 오르면 모든 기본 스탯이 1씩 오르고 스탯 포인트 3을 받습니다. ')
                .text('근력·체력·민첩·지능·감각은 공격, 생존, 속도, 마법, 치명타와 생활 능력치에 서로 다르게 관여합니다.\n')
                .color('$text-tertiary', x => x.text('명령어 /스탯분배 · 별칭 r, st\n\n'))
                .button('/스탯분배', x => x.text('[스탯 분배 보기]'));
            break;
        case TutorialStep.HUD:
            b.text('햄버거 메뉴의 HUD 설정에서 상태창, 미니맵, 위치 정보, 파티, 퀵 버튼과 스킬 버튼을 켜고 크기·위치를 조절할 수 있습니다. ')
                .text('모바일에서는 위치 이동 모드로 버튼을 원하는 곳에 배치해보세요.\n\n')
                .button('/튜토리얼다음', x => x.text('[확인했습니다]'));
            break;
        case TutorialStep.SHORTCUTS:
            b.text('명령어 별칭은 슬래시 없이 첫 단어로 입력할 수 있습니다. ')
                .text('예를 들어 s는 상태창, i는 인벤토리, m은 위치, v는 이동, a는 공격입니다.\n')
                .color('$text-tertiary', x => x.text('명령어 /단축키목록\n\n'))
                .button('/단축키목록', x => x.text('[단축키 목록 보기]'));
            break;
        case TutorialStep.CONTENT_CHOICE: {
            const done = new Set(snapshot.completedContents.map(content => content.key));
            b.text('낚시, 광질, 사냥 중 먼저 알고 싶은 콘텐츠를 고르세요. 하나를 확인하면 남은 콘텐츠를 다시 선택할 수 있습니다.\n\n');
            for (const content of TutorialContent.values()) {
                if (done.has(content.key)) continue;
                b.button(`/튜토리얼선택 ${content.label}`, x => x.text(`[${content.label}]`)).text('  ');
            }
            break;
        }
        case TutorialStep.CONTENT_FISHING:
            b.text('낚시 가능 장소에서 낚싯대를 주 손에, 미끼 묶음을 보조 손에 장착하고 /낚시를 사용합니다. ')
                .text('입질 뒤 미니게임에서 물고기를 채집 영역 안에 유지하면 등급별 물고기와 경험치를 얻습니다.\n')
                .color('$text-tertiary', x => x.text('루미나르 연못에는 낚시 상점이 있으며, 미끼가 미장착이면 보유 묶음을 자동 장착합니다.\n\n'))
                .button('/자동이동 루미나르 연못', x => x.text('[연못으로 자동이동]'))
                .text('  ')
                .button('/튜토리얼다음', x => x.text('[설명 완료]'));
            break;
        case TutorialStep.CONTENT_MINING:
            b.text('곡괭이를 장착하고 피버릭 갱도의 광석을 대상 지정한 뒤 공격하면 채굴할 수 있습니다. ')
                .text('광석은 경험치와 단조·제작에 쓰는 재료를 확률에 따라 떨어뜨립니다.\n')
                .color('$text-tertiary', x => x.text('자원도 몬스터와 같은 오브젝트 번호를 사용하지만 먼저 공격하지 않습니다.\n\n'))
                .button('/자동이동 피버릭 갱도 입구', x => x.text('[광산으로 자동이동]'))
                .text('  ')
                .button('/튜토리얼다음', x => x.text('[설명 완료]'));
            break;
        case TutorialStep.CONTENT_HUNTING:
            b.text('바람결 초원부터 몬스터 레벨을 확인하고 대상 지정 → 공격 → 스킬 순서로 싸워보세요. ')
                .text('속성표, 몬스터 정보, 상태이상과 장비를 활용하면 강한 적을 상대하기 쉬워집니다.\n')
                .color('$text-tertiary', x => x.text('명령어 /속성표, 감각 100 이상이면 /몬스터정보 <번호>\n\n'))
                .button('/자동이동 바람결 초원 1', x => x.text('[초원으로 자동이동]'))
                .text('  ')
                .button('/튜토리얼다음', x => x.text('[설명 완료]'));
            break;
        default:
            b.text('현재 안내 정보를 불러올 수 없습니다.');
    }
    return b.build();
}

function parseTutorialStatus(value: string): TutorialStatusKey | '' {
    return value === 'active' || value === 'completed' || value === 'skipped' ? value : '';
}

function parseCompletedContents(value: string): TutorialContent[] {
    const result: TutorialContent[] = [];
    for (const key of value.split(',').map(entry => entry.trim()).filter(Boolean)) {
        const content = TutorialContent.fromKey(key);
        if (content && !result.includes(content)) result.push(content);
    }
    return result;
}

function contentForStep(step: TutorialStep): TutorialContent | undefined {
    return TutorialContent.values().find(content => CONTENT_STEPS.get(content.key) === step);
}
