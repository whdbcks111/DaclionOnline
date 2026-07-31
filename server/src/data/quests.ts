import { GameTags } from '../../../shared/tags.js';
import {
    defineQuest,
    QuestObjective,
    QuestReward,
    QuestStatus,
    QuestStage,
} from '../models/Quest.js';
import { JobSlotType } from '../models/Job.js';
import './jobs.js';
import { canAcquireBlacksmithProfession, grantBlacksmithProfession } from '../modules/forging.js';
import {
    getTutorialSnapshot,
    hasReachedTutorialGrowth,
    isTutorialTerminal,
    TUTORIAL_PRACTICE_QUEST_ID,
    TUTORIAL_QUEST_ID,
    TutorialProgressIds,
} from '../modules/tutorial.js';
import type Entity from '../models/Entity.js';
import type Player from '../models/Player.js';
import { GameEventIds } from '../models/GameEvent.js';

export const FIRST_SLIME_HUNT_QUEST_ID = 'luminair:first_slime_hunt';
export const DAILY_COMMISSION_NPC_ID = 'daily_commissioner';
export const DAILY_COMMISSION_LAST_CLAIM_DAY = 'daily:commission-last-claim-day';
export const DAILY_COMMISSION_QUESTS = Object.freeze([
    { id: 'daily:commission-1-49', minLevel: 1, maxLevel: 49, required: 8 },
    { id: 'daily:commission-50-149', minLevel: 50, maxLevel: 149, required: 12 },
    { id: 'daily:commission-150-299', minLevel: 150, maxLevel: 299, required: 16 },
    { id: 'daily:commission-300-499', minLevel: 300, maxLevel: 499, required: 20 },
    { id: 'daily:commission-500-plus', minLevel: 500, maxLevel: Number.POSITIVE_INFINITY, required: 24 },
] as const);
export const TWILIGHT_TOMB_QUEST_IDS = Object.freeze({
    RESTLESS_DEAD: 'twilight-tomb:restless-dead',
    BROKEN_OATH: 'twilight-tomb:broken-oath',
} as const);
export const GLASSDUNE_QUEST_IDS = Object.freeze({
    CARAPACE_ROUTE: 'glassdune:carapace-route',
    SILENCE_SUN_VAULT: 'glassdune:silence-sun-vault',
} as const);
export const FROSTVEIL_QUEST_IDS = Object.freeze({
    WINTER_SUPPLY: 'frostveil:winter-supply',
    BREAK_FROZEN_THRONE: 'frostveil:break-frozen-throne',
} as const);
export const MISTTIDE_QUEST_IDS = Object.freeze({
    REPAIR_SALT_BEACON: 'misttide:repair-salt-beacon',
    END_DROWNED_COMMAND: 'misttide:end-drowned-command',
} as const);
export const PARADOX_QUEST_IDS = Object.freeze({
    RESTORE_ARCHIVE: 'paradox:restore-archive',
    CLOSE_CAUSALITY_ENGINE: 'paradox:close-causality-engine',
} as const);
export const ASHEN_ABYSS_QUEST_IDS = Object.freeze({
    RELIGHT_WAYSTATION: 'ashen-abyss:relight-waystation',
    END_ASHEN_COURT: 'ashen-abyss:end-ashen-court',
} as const);
export const VOIDCROWN_QUEST_IDS = Object.freeze({
    RESTORE_WARD: 'voidcrown:restore-ward',
    END_REGENCY: 'voidcrown:end-regency',
} as const);
export const ECLIPSE_TRENCH_QUEST_IDS = Object.freeze({
    RESTORE_DOCK: 'eclipse-trench:restore-dock',
    END_WHITE_NIGHT: 'eclipse-trench:end-white-night',
} as const);
export const WORLDROOT_QUEST_IDS = Object.freeze({
    RESTORE_MEMORY: 'worldroot:restore-memory',
    AWAKEN_HEART: 'worldroot:awaken-heart',
} as const);
export const NEBULA_QUEST_IDS = Object.freeze({
    RESTORE_BEACON: 'nebula-corridor:restore-beacon',
    END_SOVEREIGN: 'nebula-corridor:end-sovereign',
} as const);
export const CHRONOFROST_QUEST_IDS = Object.freeze({
    RESTART_CLOCK: 'chronofrost:restart-clock',
    END_ZERO_HOUR: 'chronofrost:end-zero-hour',
} as const);
export const ENDSTAR_QUEST_IDS = Object.freeze({
    RELIGHT_CONSTELLATION: 'endstar:relight-constellation',
    END_LAST_CONSTELLATION: 'endstar:end-last-constellation',
} as const);

/** 한국 표준시 자정에 초기화되는 일일 의뢰 날짜 key. */
export function getDailyCommissionDayKey(now = new Date()): string {
    return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function getDailyCommissionDefinition(level: number) {
    const normalized = Math.max(1, Math.floor(level));
    return DAILY_COMMISSION_QUESTS.find(quest =>
        normalized >= quest.minLevel && normalized <= quest.maxLevel)!;
}

export function getPlayerDailyCommission(player: Player) {
    return DAILY_COMMISSION_QUESTS
        .map(definition => player.quests.get(definition.id))
        .find(quest => quest?.status === QuestStatus.ACTIVE || quest?.status === QuestStatus.READY);
}

/** 전날 미완료 의뢰는 NPC를 다시 만날 때 정리해 오늘 기회를 막지 않게 한다. */
export function expireStaleDailyCommission(player: Player, now = new Date()): void {
    const quest = getPlayerDailyCommission(player);
    if (!quest || getDailyCommissionDayKey(quest.acceptedAt) === getDailyCommissionDayKey(now)) return;
    player.quests.abandon(quest.questDataId);
}

function isAppropriateDailyTarget(player: Player, target: Entity | undefined): boolean {
    if (!target?.hasTag(GameTags.ENTITY_MONSTER) || target.hasTag(GameTags.ENTITY_BOSS)) return false;
    const quest = getPlayerDailyCommission(player);
    const acceptedLevel = Number(quest?.getMetadata('acceptedLevel') ?? player.level);
    const minLevel = Math.max(1, Math.floor(acceptedLevel * 0.8));
    const maxLevel = Math.max(minLevel, Math.ceil(acceptedLevel * 1.2));
    return target.level >= minLevel && target.level <= maxLevel;
}

for (const definition of DAILY_COMMISSION_QUESTS) {
    defineQuest({
        id: definition.id,
        name: `오늘의 성장 의뢰 · ${definition.required}체`,
        aliases: ['일일 의뢰', '오늘의 의뢰'],
        description: '수락 당시 레벨의 80~120% 구간 일반 몬스터를 처치하는 하루 한 번의 성장 의뢰입니다.',
        tags: ['quest:daily', 'quest:side'],
        giverNpcIds: [DAILY_COMMISSION_NPC_ID],
        turnInNpcIds: [DAILY_COMMISSION_NPC_ID],
        visible: player => getDailyCommissionDefinition(player.level).id === definition.id
            || player.quests.get(definition.id) !== undefined,
        canAccept: player => getDailyCommissionDefinition(player.level).id === definition.id
            && !getPlayerDailyCommission(player)
            && player.progress.getState(DAILY_COMMISSION_LAST_CLAIM_DAY) !== getDailyCommissionDayKey(),
        stages: [new QuestStage({
            id: 'hunt',
            description: '수락 당시 레벨을 기준으로 비슷한 수준의 일반 몬스터를 처치하세요.',
            objectives: [QuestObjective.event({
                id: 'appropriate-monsters',
                label: '적정 레벨 일반 몬스터 처치',
                required: definition.required,
                eventId: GameEventIds.ENTITY_DEFEATED,
                matches: (event, player) => isAppropriateDailyTarget(player, event.subject),
            })],
        })],
        rewards: [QuestReward.custom({
            label: '현재 레벨 필요 경험치의 50%',
            canGrant: player =>
                player.progress.getState(DAILY_COMMISSION_LAST_CLAIM_DAY) !== getDailyCommissionDayKey(),
            grant: player => {
                const amount = Math.max(1, Math.floor(player.maxExp * 0.5));
                player.progress.setState(DAILY_COMMISSION_LAST_CLAIM_DAY, getDailyCommissionDayKey());
                player.gainExp(amount);
            },
        })],
        repeat: { cooldownSeconds: 0 },
        onAccept: player => {
            player.quests.get(definition.id)?.setMetadata('acceptedLevel', player.level);
        },
    });
}

defineQuest({
    id: TUTORIAL_QUEST_ID,
    name: '첫 모험 안내',
    aliases: ['튜토리얼', '초보 안내'],
    description: '버튼과 명령어를 직접 사용하며 DaclionOnline의 기본 조작과 주요 콘텐츠를 익힙니다.',
    tags: ['quest:tutorial'],
    giverNpcIds: ['town_guide'],
    turnInNpcIds: ['town_guide'],
    visible: player => Boolean(getTutorialSnapshot(player).status),
    canAccept: player => getTutorialSnapshot(player).status === 'active',
    stages: [new QuestStage({
        id: 'first-steps',
        description: '화면에 계속 표시되는 첫 모험 안내를 따라 기본 기능과 콘텐츠를 확인하세요.',
        objectives: [QuestObjective.custom(
            'complete-guide',
            '첫 모험 안내 완료 또는 건너뛰기',
            1,
            player => isTutorialTerminal(player) ? 1 : 0,
        )],
    })],
    rewards: [],
    repeat: { cooldownSeconds: 0 },
    abandonable: false,
    completionMode: 'automatic',
});

defineQuest({
    id: TUTORIAL_PRACTICE_QUEST_ID,
    name: '기본 조작 실습',
    aliases: ['튜토리얼 실습'],
    description: '상태창부터 스킬 사용까지 기본 조작을 직접 확인하는 첫 모험 안내의 서브 퀘스트입니다.',
    tags: ['quest:tutorial', 'quest:sub'],
    giverNpcIds: ['town_guide'],
    turnInNpcIds: ['town_guide'],
    visible: player => getTutorialSnapshot(player).status === 'active'
        && !player.progress.getFlag(TutorialProgressIds.GROWTH_REWARD_GRANTED),
    canAccept: player => getTutorialSnapshot(player).status === 'active'
        && !player.progress.getFlag(TutorialProgressIds.GROWTH_REWARD_GRANTED),
    stages: [new QuestStage({
        id: 'practice',
        description: '안내 카드의 버튼과 명령어를 따라 기본 조작과 첫 스킬 사용을 익히세요.',
        objectives: [QuestObjective.custom(
            'reach-growth',
            '기본 조작과 스킬 사용 익히기',
            1,
            player => hasReachedTutorialGrowth(player) ? 1 : 0,
        )],
    })],
    rewards: [QuestReward.custom({
        label: '다음 레벨까지 필요한 경험치',
        grant: player => {
            const required = Math.max(1, player.maxExp - player.exp);
            player.gainExp(required);
            player.progress.setFlag(TutorialProgressIds.GROWTH_REWARD_GRANTED, true);
        },
    })],
    abandonable: true,
    completionMode: 'automatic',
});

defineQuest({
    id: FIRST_SLIME_HUNT_QUEST_ID,
    name: '초원의 첫 의뢰',
    aliases: ['첫 의뢰', '슬라임 의뢰'],
    description: '바람결 초원의 슬라임을 3마리 처치하고 안내인 리아에게 보고하세요.',
    tags: ['quest:side', 'region:luminair'],
    giverNpcIds: ['town_guide'],
    turnInNpcIds: ['town_guide'],
    stages: [
        new QuestStage({
            id: 'hunt',
            description: '바람결 초원에서 슬라임 계열 몬스터를 처치하세요.',
            objectives: [
                QuestObjective.kill(
                    'slimes',
                    '슬라임 처치',
                    3,
                    target => target.hasTag(GameTags.ENTITY_SLIME),
                ),
            ],
        }),
    ],
    rewards: [
        QuestReward.exp(80),
        QuestReward.gold(100),
        QuestReward.item('health_potion', 2, '체력 포션'),
    ],
});

defineQuest({
    id: TWILIGHT_TOMB_QUEST_IDS.RESTLESS_DEAD,
    name: '꺼지지 않는 장송행렬',
    aliases: ['장송행렬', '왕릉 의뢰'],
    description: '황혼왕릉의 언데드 8기를 쓰러뜨리고 마지막 등불의 묘지기에게 보고하세요.',
    tags: ['quest:side', 'region:twilight-tombs'],
    giverNpcIds: ['twilight_keeper'],
    turnInNpcIds: ['twilight_keeper'],
    visible: player => player.level >= 28,
    canAccept: player => player.level >= 28,
    stages: [new QuestStage({
        id: 'quiet-procession',
        description: '황혼왕릉을 떠도는 언데드를 쓰러뜨려 장송행렬을 멈추세요.',
        objectives: [QuestObjective.kill(
            'undead',
            '언데드 처치',
            8,
            target => target.hasTag(GameTags.PROPERTY_UNDEAD),
        )],
    })],
    rewards: [
        QuestReward.exp(1_800),
        QuestReward.gold(320),
        QuestReward.item('graveward_tonic', 3, '묘지기 향약'),
    ],
});

defineQuest({
    id: TWILIGHT_TOMB_QUEST_IDS.BROKEN_OATH,
    name: '왕좌를 훔친 맹세',
    aliases: ['파계 기사왕', '왕좌의 맹세'],
    description: '황혼왕릉 깊은 곳에서 왕좌를 차지한 언데드 기사왕을 쓰러뜨리세요.',
    tags: ['quest:side', 'quest:boss', 'region:twilight-tombs'],
    giverNpcIds: ['twilight_keeper'],
    turnInNpcIds: ['twilight_keeper'],
    prerequisiteQuestIds: [TWILIGHT_TOMB_QUEST_IDS.RESTLESS_DEAD],
    visible: player => player.level >= 45,
    canAccept: player => player.level >= 45,
    stages: [new QuestStage({
        id: 'end-usurper',
        description: '파계의 왕좌에서 타락한 기사왕을 쓰러뜨리세요.',
        objectives: [QuestObjective.kill(
            'knight-king',
            '언데드 기사왕 처치',
            1,
            target => target.hasTag(GameTags.ENTITY_BOSS)
                && target.hasTag(GameTags.PROPERTY_UNDEAD)
                && target.hasTag(GameTags.PROPERTY_METAL),
        )],
    })],
    rewards: [
        QuestReward.exp(5_200),
        QuestReward.gold(780),
        QuestReward.item('gravekeeper_shield', 1, '묘문 수호방패'),
    ],
});

defineQuest({
    id: GLASSDUNE_QUEST_IDS.CARAPACE_ROUTE,
    name: '황금갑으로 이은 길',
    aliases: ['사막 성충갑', '대상단 의뢰'],
    description: '유리모래 사막의 황금갑 성충을 사냥해 성충갑 6개를 모아 대상단 기록관에게 가져가세요.',
    tags: ['quest:side', 'region:glassdune'],
    giverNpcIds: ['glassdune_chronicler'],
    turnInNpcIds: ['glassdune_chronicler'],
    visible: player => player.level >= 70,
    canAccept: player => player.level >= 70,
    stages: [new QuestStage({
        id: 'collect-carapace',
        description: '유리모래 사해와 열기 능선에서 황금갑 태양충을 찾으세요.',
        objectives: [QuestObjective.item('sunscarab-shell', '황금갑 성충갑 수집', 6, 'sunscarab_shell', true)],
    })],
    rewards: [
        QuestReward.exp(8_000),
        QuestReward.gold(1_250),
        QuestReward.item('shade_canteen', 3, '그늘 수통'),
        QuestReward.item('oasis_date', 4, '오아시스 대추야자'),
    ],
});

defineQuest({
    id: GLASSDUNE_QUEST_IDS.SILENCE_SUN_VAULT,
    name: '빛을 먹는 유리거상',
    aliases: ['태양고 거상', '유리거상'],
    description: '태양거울 기둥을 먼저 파괴한 뒤 태양고의 유리거상을 멈추세요.',
    tags: ['quest:side', 'quest:boss', 'region:glassdune'],
    giverNpcIds: ['glassdune_chronicler'],
    turnInNpcIds: ['glassdune_chronicler'],
    prerequisiteQuestIds: [GLASSDUNE_QUEST_IDS.CARAPACE_ROUTE],
    visible: player => player.level >= 100,
    canAccept: player => player.level >= 100,
    stages: [new QuestStage({
        id: 'break-glass-colossus',
        description: '태양고 내부의 거울 기둥을 정리하고 유리거상을 제압하세요.',
        objectives: [QuestObjective.kill(
            'sun-vault-colossus',
            '태양고의 유리거상 처치',
            1,
            target => target.hasTag(GameTags.ENTITY_BOSS)
                && target.hasTag(GameTags.PROPERTY_LIGHT)
                && target.hasTag(GameTags.PROPERTY_STONE),
        )],
    })],
    rewards: [
        QuestReward.exp(18_000),
        QuestReward.gold(3_200),
        QuestReward.item('sunmirror_shield', 1, '태양거울 방패'),
    ],
});

defineQuest({
    id: FROSTVEIL_QUEST_IDS.WINTER_SUPPLY,
    name: '눈보라를 버티는 실',
    aliases: ['빙실 의뢰', '설원 보급'],
    description: '빙실 발톱거미에게서 빙실 거미줄 7개를 모아 설원 파수대장에게 가져가세요.',
    tags: ['quest:side', 'region:frostveil'],
    giverNpcIds: ['frostveil_warden'],
    turnInNpcIds: ['frostveil_warden'],
    visible: player => player.level >= 120,
    canAccept: player => player.level >= 120,
    stages: [new QuestStage({
        id: 'collect-ice-silk',
        description: '상고송 숲과 얼어붙은 호수에서 빙실 발톱거미를 찾으세요.',
        objectives: [QuestObjective.item('ice-silk', '빙실 거미줄 수집', 7, 'ice_silk', true)],
    })],
    rewards: [
        QuestReward.exp(24_000),
        QuestReward.gold(4_200),
        QuestReward.item('winter_trail_ration', 5, '설원 행군식'),
        QuestReward.item('frostward_tonic', 3, '상고막이 영약'),
    ],
});

defineQuest({
    id: FROSTVEIL_QUEST_IDS.BREAK_FROZEN_THRONE,
    name: '얼어붙은 왕좌를 깨는 빛',
    aliases: ['빙경 여왕', '빙경궁 왕좌'],
    description: '빙경궁 깊은 곳에서 침묵과 냉기를 퍼뜨리는 빙경 여왕 에르시나를 쓰러뜨리세요.',
    tags: ['quest:side', 'quest:boss', 'region:frostveil'],
    giverNpcIds: ['frostveil_warden'],
    turnInNpcIds: ['frostveil_warden'],
    prerequisiteQuestIds: [FROSTVEIL_QUEST_IDS.WINTER_SUPPLY],
    visible: player => player.level >= 138,
    canAccept: player => player.level >= 138,
    stages: [new QuestStage({
        id: 'break-frostglass-queen',
        description: '빙경궁의 왕좌에서 에르시나를 제압하세요.',
        objectives: [QuestObjective.kill(
            'frostglass-queen',
            '빙경 여왕 에르시나 처치',
            1,
            target => target.hasTag(GameTags.ENTITY_BOSS)
                && target.hasTag(GameTags.PROPERTY_ICE)
                && target.hasTag(GameTags.PROPERTY_LIGHT),
        )],
    })],
    rewards: [
        QuestReward.exp(42_000),
        QuestReward.gold(6_800),
        QuestReward.item('auroraprism_staff', 1, '극광분광 지팡이'),
        QuestReward.item('aurora_recovery_draught', 3, '극광 회복약'),
    ],
});

defineQuest({
    id: MISTTIDE_QUEST_IDS.REPAIR_SALT_BEACON,
    name: '안개를 가르는 염등',
    aliases: ['염등 수리', '해안 보급'],
    description: '안개파도 해안의 흑산호 8개를 모아 염등 항구의 항로지기에게 가져가세요.',
    tags: ['quest:side', 'region:misttide'],
    giverNpcIds: ['misttide_navigator'],
    turnInNpcIds: ['misttide_navigator'],
    visible: player => player.level >= 150,
    canAccept: player => player.level >= 150,
    stages: [new QuestStage({
        id: 'gather-black-coral',
        description: '난파 해변과 흑산호 암초에서 흑산호를 모으세요.',
        objectives: [QuestObjective.item('black-coral', '흑산호 수집', 8, 'black_coral', true)],
    })],
    rewards: [
        QuestReward.exp(38_000),
        QuestReward.gold(6_200),
        QuestReward.item('brine_trail_ration', 5, '염풍 행군식'),
        QuestReward.item('seafoam_tonic', 3, '해포말 영약'),
    ],
});

defineQuest({
    id: MISTTIDE_QUEST_IDS.END_DROWNED_COMMAND,
    name: '가라앉지 않은 마지막 명령',
    aliases: ['침몰제독', '세이렌과 제독'],
    description: '해안의 해무 세이렌 군주와 침몰왕도의 제독 아르켄을 쓰러뜨려 끊어진 항로를 되찾으세요.',
    tags: ['quest:side', 'quest:boss', 'region:misttide'],
    giverNpcIds: ['misttide_navigator'],
    turnInNpcIds: ['misttide_navigator'],
    prerequisiteQuestIds: [MISTTIDE_QUEST_IDS.REPAIR_SALT_BEACON],
    visible: player => player.level >= 170,
    canAccept: player => player.level >= 170,
    stages: [new QuestStage({
        id: 'silence-siren-and-admiral',
        description: '세이렌 원형암초와 가라앉은 함대왕좌의 두 지휘자를 제압하세요.',
        objectives: [
            QuestObjective.kill(
                'siren-matriarch',
                '해무 세이렌 군주 처치',
                1,
                target => target.hasTag('monster:mist-siren-matriarch'),
            ),
            QuestObjective.kill(
                'drowned-admiral',
                '침몰제독 아르켄 처치',
                1,
                target => target.hasTag('monster:drowned-admiral'),
            ),
        ],
    })],
    rewards: [
        QuestReward.exp(68_000),
        QuestReward.gold(10_500),
        QuestReward.item('drowned_admiral_shield', 1, '침몰제독 방패'),
        QuestReward.item('tideheart_draught', 4, '조류심장 회복약'),
    ],
});

defineQuest({
    id: PARADOX_QUEST_IDS.RESTORE_ARCHIVE,
    name: '기억 톱니의 순서',
    aliases: ['기계고 기록 복원', '기억 톱니'],
    description: '카이로스 공방도시에 흩어진 기억 톱니와 논리핵을 모아 중계소의 항로 기록을 복원하세요.',
    tags: ['quest:side', 'region:paradox-clockwork'],
    giverNpcIds: ['paradox_curator'],
    turnInNpcIds: ['paradox_curator'],
    visible: player => player.level >= 200,
    canAccept: player => player.level >= 200,
    stages: [new QuestStage({
        id: 'gather-archive-components',
        description: '기계고 외곽과 논리 기록고에서 기록 복원 부품을 모으세요.',
        objectives: [
            QuestObjective.item('memory-gears', '기억 톱니 수집', 12, 'memory_gear', true),
            QuestObjective.item('logic-cores', '논리핵 수집', 5, 'logic_core', true),
        ],
    })],
    rewards: [
        QuestReward.exp(92_000),
        QuestReward.gold(14_500),
        QuestReward.item('logic_elixir', 4, '논리회로 영약'),
        QuestReward.item('photon_lance_skillbook', 1, '광자창 전승서'),
    ],
});

defineQuest({
    id: PARADOX_QUEST_IDS.CLOSE_CAUSALITY_ENGINE,
    name: '설계자의 마지막 모순',
    aliases: ['역설설계자', '시간강 거신'],
    description: '시간강 거신을 멈추고 역설 고정자를 파괴한 뒤, 역설설계자 오르도의 인과 연산을 끝내세요.',
    tags: ['quest:side', 'quest:boss', 'region:paradox-clockwork'],
    giverNpcIds: ['paradox_curator'],
    turnInNpcIds: ['paradox_curator'],
    prerequisiteQuestIds: [PARADOX_QUEST_IDS.RESTORE_ARCHIVE],
    visible: player => player.level >= 218,
    canAccept: player => player.level >= 218,
    stages: [new QuestStage({
        id: 'break-clockwork-command',
        description: '시간강 주조로의 거신과 중앙 인과기관의 설계자를 차례로 제압하세요.',
        objectives: [
            QuestObjective.kill(
                'chronosteel-colossus',
                '시간강 거신 처치',
                1,
                target => target.hasTag('monster:chronosteel-colossus'),
            ),
            QuestObjective.kill(
                'paradox-architect',
                '역설설계자 오르도 처치',
                1,
                target => target.hasTag('monster:paradox-architect'),
            ),
        ],
    })],
    rewards: [
        QuestReward.exp(165_000),
        QuestReward.gold(24_000),
        QuestReward.item('causality_aegis', 1, '인과율 방패'),
        QuestReward.item('paradox_reversal_skillbook', 1, '역설반전 전승서'),
    ],
});

defineQuest({
    id: ASHEN_ABYSS_QUEST_IDS.RELIGHT_WAYSTATION,
    name: '회색불길을 다시 밝히는 법',
    aliases: ['회색불길', '심연 중계소'],
    description: '심연의 흑염 잔재와 밤쇠를 모아 회색불길 중계소의 길잡이 화로를 복구하세요.',
    tags: ['quest:side', 'region:ashen-abyss'],
    giverNpcIds: ['ashen_wayfinder'],
    turnInNpcIds: ['ashen_wayfinder'],
    visible: player => player.level >= 235,
    canAccept: player => player.level >= 235,
    stages: [new QuestStage({
        id: 'recover-waystation-fire',
        description: '흑염 회랑과 밤쇠 회랑에서 길잡이 화로를 복구할 재료를 모으세요.',
        objectives: [
            QuestObjective.item('blackflame-residue', '흑염 잔재 수집', 12, 'blackflame_residue', true),
            QuestObjective.item('night-iron', '밤쇠 수집', 8, 'night_iron', true),
        ],
    })],
    rewards: [
        QuestReward.exp(118_000),
        QuestReward.gold(18_500),
        QuestReward.item('blackflame_ward', 5, '흑염막이 영약'),
        QuestReward.item('hellhound_charge_skillbook', 1, '지옥견 돌진 전승서'),
    ],
});

defineQuest({
    id: ASHEN_ABYSS_QUEST_IDS.END_ASHEN_COURT,
    name: '재가 된 왕조의 끝',
    aliases: ['잿왕 토벌', '재왕 벨카르'],
    description: '세 아귀 문지기와 흑염대장을 넘어 카르모르 성의 벨카르를 쓰러뜨리세요.',
    tags: ['quest:side', 'quest:boss', 'region:ashen-abyss'],
    giverNpcIds: ['ashen_wayfinder'],
    turnInNpcIds: ['ashen_wayfinder'],
    prerequisiteQuestIds: [ASHEN_ABYSS_QUEST_IDS.RELIGHT_WAYSTATION],
    visible: player => player.level >= 248,
    canAccept: player => player.level >= 248,
    stages: [new QuestStage({
        id: 'break-ashen-court',
        description: '심연의 세 관문을 지키는 지휘자들을 차례로 제압하세요.',
        objectives: [
            QuestObjective.kill(
                'three-maw-gatekeeper',
                '세 아귀 문지기 처치',
                1,
                target => target.hasTag('monster:three-maw-gatekeeper'),
            ),
            QuestObjective.kill(
                'blackflame-general',
                '흑염대장 모르칸 처치',
                1,
                target => target.hasTag('monster:blackflame-general'),
            ),
            QuestObjective.kill(
                'ashen-sovereign',
                '재왕 벨카르 처치',
                1,
                target => target.hasTag('monster:ashen-sovereign'),
            ),
        ],
    })],
    rewards: [
        QuestReward.exp(245_000),
        QuestReward.gold(38_000),
        QuestReward.item('ashguard_bulwark', 1, '재성벽 방패'),
        QuestReward.item('sovereign_decree_skillbook', 1, '재왕의 칙령 전승서'),
    ],
});

defineQuest({
    id: VOIDCROWN_QUEST_IDS.RESTORE_WARD,
    name: '빛이 닿지 않는 귀환표식',
    aliases: ['벨카인 귀환표식', '무광 중계소'],
    description: '무광은과 별먹을 모아 벨카인 요새의 귀환표식을 다시 새기세요.',
    tags: ['quest:side', 'region:voidcrown'],
    giverNpcIds: ['voidcrown_warden'],
    turnInNpcIds: ['voidcrown_warden'],
    visible: player => player.level >= 275,
    canAccept: player => player.level >= 275,
    stages: [new QuestStage({
        id: 'restore-return-mark',
        description: '외성과 왕실 서고에서 귀환표식에 필요한 무광은과 별먹을 모으세요.',
        objectives: [
            QuestObjective.item('nullsilver', '무광은 수집', 14, 'nullsilver', true),
            QuestObjective.item('astral-ink', '별먹 수집', 10, 'astral_ink', true),
        ],
    })],
    rewards: [
        QuestReward.exp(275_000),
        QuestReward.gold(45_000),
        QuestReward.item('voidcrown_draught', 5, '공허맥 회복약'),
        QuestReward.item('voidstep_skillbook', 1, '공허걸음 전승서'),
    ],
});

defineQuest({
    id: VOIDCROWN_QUEST_IDS.END_REGENCY,
    name: '왕 없는 왕관의 판결',
    aliases: ['공허섭정 토벌', '라시엘'],
    description: '무관성주 테오른을 넘어 벨카인 기둥을 부수고 섭정 라시엘의 무효 선고를 끝내세요.',
    tags: ['quest:side', 'quest:boss', 'region:voidcrown'],
    giverNpcIds: ['voidcrown_warden'],
    turnInNpcIds: ['voidcrown_warden'],
    prerequisiteQuestIds: [VOIDCROWN_QUEST_IDS.RESTORE_WARD],
    visible: player => player.level >= 290,
    canAccept: player => player.level >= 290,
    stages: [new QuestStage({
        id: 'break-empty-regency',
        description: '외성주와 공허섭정을 차례로 제압해 왕 없는 성채의 강제 명령을 끝내세요.',
        objectives: [
            QuestObjective.kill(
                'crownless-castellan',
                '무관성주 테오른 처치',
                1,
                target => target.hasTag('monster:crownless-castellan'),
            ),
            QuestObjective.destroy(
                'voidcrown-pillars',
                '벨카인 기둥 파괴',
                3,
                target => target.hasTag('resource:voidcrown-pillar'),
            ),
            QuestObjective.kill(
                'voidcrown-regent',
                '공허섭정 라시엘 처치',
                1,
                target => target.hasTag('monster:voidcrown-regent'),
            ),
        ],
    })],
    rewards: [
        QuestReward.exp(420_000),
        QuestReward.gold(68_000),
        QuestReward.item('regent_aegis', 1, '섭정의 무광방패'),
        QuestReward.item('crown_nullification_skillbook', 1, '왕관무효 전승서'),
    ],
});

defineQuest({
    id: ECLIPSE_TRENCH_QUEST_IDS.RESTORE_DOCK,
    name: '달빛 아래 잠긴 정박지',
    aliases: ['루나리스 해구 정박지', '조류 관측선'],
    description: '월염수와 침은을 모아 루나리스 해구 관측선의 조류기관을 복구하세요.',
    tags: ['quest:side', 'region:eclipse-trench'],
    giverNpcIds: ['eclipse_navigator'],
    turnInNpcIds: ['eclipse_navigator'],
    visible: player => player.level >= 310,
    canAccept: player => player.level >= 310,
    stages: [new QuestStage({
        id: 'restore-tide-engine',
        description: '해구 입구와 침몰광맥에서 조류기관에 필요한 월염수와 침은을 모으세요.',
        objectives: [
            QuestObjective.item('moon-brine', '월염수 수집', 16, 'moon_brine', true),
            QuestObjective.item('drowned-silver', '침은 수집', 12, 'drowned_silver', true),
        ],
    })],
    rewards: [
        QuestReward.exp(330_000),
        QuestReward.gold(58_000),
        QuestReward.item('tideheart_tonic', 5, '조류심장 영약'),
        QuestReward.item('undertow_step_skillbook', 1, '역조보법 전승서'),
    ],
});

defineQuest({
    id: ECLIPSE_TRENCH_QUEST_IDS.END_WHITE_NIGHT,
    name: '끝나지 않는 백야',
    aliases: ['백야대사제 토벌', '세르미아'],
    description: '월조 리바이어던을 넘어 조류거울을 부수고 백야대사제 세르미아가 고정한 월식을 끝내세요.',
    tags: ['quest:side', 'quest:boss', 'region:eclipse-trench'],
    giverNpcIds: ['eclipse_navigator'],
    turnInNpcIds: ['eclipse_navigator'],
    prerequisiteQuestIds: [ECLIPSE_TRENCH_QUEST_IDS.RESTORE_DOCK],
    visible: player => player.level >= 325,
    canAccept: player => player.level >= 325,
    stages: [new QuestStage({
        id: 'break-white-night',
        description: '해구의 포식자와 성소의 조류거울을 제거한 뒤 대사제의 백야 의식을 끝내세요.',
        objectives: [
            QuestObjective.kill(
                'moon-tide-leviathan',
                '월조 리바이어던 처치',
                1,
                target => target.hasTag('monster:moon-tide-leviathan'),
            ),
            QuestObjective.destroy(
                'white-night-mirrors',
                '백야 조류거울 파괴',
                3,
                target => target.hasTag('resource:white-night-tide-mirror'),
            ),
            QuestObjective.kill(
                'white-night-hierophant',
                '백야대사제 세르미아 처치',
                1,
                target => target.hasTag('monster:white-night-hierophant'),
            ),
        ],
    })],
    rewards: [
        QuestReward.exp(510_000),
        QuestReward.gold(86_000),
        QuestReward.item('white_night_bulwark', 1, '백야 조류방패'),
        QuestReward.item('eclipse_verdict_skillbook', 1, '월식선고 전승서'),
    ],
});

defineQuest({
    id: WORLDROOT_QUEST_IDS.RESTORE_MEMORY,
    name: '수해가 잊은 이름',
    aliases: ['카미하라 숲 기억', '기억호박 복구'],
    description: '기억호박과 태초수액을 모아 카미하라 숲의 길잡이 기억을 복원하세요.',
    tags: ['quest:side', 'region:worldroot'],
    giverNpcIds: ['worldroot_keeper'],
    turnInNpcIds: ['worldroot_keeper'],
    visible: player => player.level >= 345,
    canAccept: player => player.level >= 345,
    stages: [new QuestStage({
        id: 'restore-root-memory',
        description: '수피 회랑과 호박 수로에서 길잡이 기억에 필요한 기억호박과 태초수액을 모으세요.',
        objectives: [
            QuestObjective.item('memory-amber', '기억호박 수집', 16, 'memory_amber', true),
            QuestObjective.item('primal-sap', '태초수액 수집', 12, 'primal_sap', true),
        ],
    })],
    rewards: [
        QuestReward.exp(390_000),
        QuestReward.gold(72_000),
        QuestReward.item('primordial_draught', 5, '태초맥 영약'),
        QuestReward.item('rootbreaker_descent_skillbook', 1, '역근강하 전승서'),
    ],
});

defineQuest({
    id: WORLDROOT_QUEST_IDS.AWAKEN_HEART,
    name: '첫 박동과 마지막 망각',
    aliases: ['에오나의 심장 토벌', '아르보르'],
    description: '역근 포식수를 넘어 심장씨앗을 부수고 에오나의 심장 아르보르의 뒤틀린 박동을 멈추세요.',
    tags: ['quest:side', 'quest:boss', 'region:worldroot'],
    giverNpcIds: ['worldroot_keeper'],
    turnInNpcIds: ['worldroot_keeper'],
    prerequisiteQuestIds: [WORLDROOT_QUEST_IDS.RESTORE_MEMORY],
    visible: player => player.level >= 360,
    canAccept: player => player.level >= 360,
    stages: [new QuestStage({
        id: 'awaken-primordial-heart',
        description: '역근의 포식자와 심장씨앗을 제거한 뒤 에오나의 심장의 뒤틀린 의지를 잠재우세요.',
        objectives: [
            QuestObjective.kill(
                'inverse-root-devourer',
                '역근 포식수 처치',
                1,
                target => target.hasTag('monster:inverse-root-devourer'),
            ),
            QuestObjective.destroy(
                'primordial-heart-seeds',
                '에오나의 심장 씨앗 파괴',
                3,
                target => target.hasTag('resource:primordial-heart-seed'),
            ),
            QuestObjective.kill(
                'primordial-heart-arbor',
                '에오나의 심장 아르보르 제압',
                1,
                target => target.hasTag('monster:primordial-heart-arbor'),
            ),
        ],
    })],
    rewards: [
        QuestReward.exp(620_000),
        QuestReward.gold(110_000),
        QuestReward.item('canopy_heartshield', 1, '천개심 방패'),
        QuestReward.item('primordial_sanctuary_skillbook', 1, '태초성역 전승서'),
    ],
});

defineQuest({
    id: NEBULA_QUEST_IDS.RESTORE_BEACON,
    name: '별길을 잃은 정거장',
    aliases: ['아스트라 회랑 보급', '유성등 복구'],
    description: '성운유리와 궤도편을 모아 유성등 정거장의 끊어진 귀환 신호를 복구하세요.',
    tags: ['quest:side', 'region:nebula-corridor'],
    giverNpcIds: ['nebula_navigator'],
    turnInNpcIds: ['nebula_navigator'],
    visible: player => player.level >= 380,
    canAccept: player => player.level >= 380,
    stages: [new QuestStage({
        id: 'restore-meteor-beacon',
        description: '아스트라 회랑의 빛나는 생명체와 궤도 사냥꾼에게서 신호 재료를 모으세요.',
        objectives: [
            QuestObjective.item('nebula-glass', '성운유리 수집', 18, 'nebula_glass', true),
            QuestObjective.item('orbit-fragment', '궤도편 수집', 14, 'orbit_fragment', true),
        ],
    })],
    rewards: [
        QuestReward.exp(850_000),
        QuestReward.gold(125_000),
        QuestReward.item('nebula_tonic', 6, '성운맥 영약'),
        QuestReward.item('nebula_edge', 1, '성운궤도검'),
    ],
});

defineQuest({
    id: NEBULA_QUEST_IDS.END_SOVEREIGN,
    name: '사건지평 너머의 왕관',
    aliases: ['성운제 토벌', '아스테리온'],
    description: '낙성감시자를 넘어 성운제 아스테리온의 사건지평 봉쇄를 끝내세요.',
    tags: ['quest:side', 'quest:boss', 'region:nebula-corridor'],
    giverNpcIds: ['nebula_navigator'],
    turnInNpcIds: ['nebula_navigator'],
    prerequisiteQuestIds: [NEBULA_QUEST_IDS.RESTORE_BEACON],
    visible: player => player.level >= 400,
    canAccept: player => player.level >= 400,
    stages: [new QuestStage({
        id: 'break-nebula-crown',
        description: '낙성감시자 모르가와 성운제 아스테리온을 차례로 제압하세요.',
        objectives: [
            QuestObjective.kill('meteor-warden', '낙성감시자 모르가 처치', 1, target => target.hasTag('monster:meteor-warden')),
            QuestObjective.kill('nebula-sovereign', '성운제 아스테리온 처치', 1, target => target.hasTag('monster:nebula-sovereign')),
        ],
    })],
    rewards: [
        QuestReward.exp(1_350_000),
        QuestReward.gold(190_000),
        QuestReward.item('meteor_bulwark', 1, '낙성 방벽'),
        QuestReward.item('starwell_staff', 1, '성정우물 지팡이'),
    ],
});

defineQuest({
    id: CHRONOFROST_QUEST_IDS.RESTART_CLOCK,
    name: '멈춘 분침을 움직이는 법',
    aliases: ['에버프로스트 정원 보급', '영시계 복구'],
    description: '시빙정과 역행사를 모아 멈춘 시계원의 하층 진자를 다시 움직이세요.',
    tags: ['quest:side', 'region:chronofrost'],
    giverNpcIds: ['chronofrost_keeper'],
    turnInNpcIds: ['chronofrost_keeper'],
    visible: player => player.level >= 420,
    canAccept: player => player.level >= 420,
    stages: [new QuestStage({
        id: 'restart-lower-pendulum',
        description: '동결된 길과 역설원에서 시빙정과 역행사를 회수하세요.',
        objectives: [
            QuestObjective.item('chronofrost-ice', '시빙정 수집', 20, 'chronofrost_ice', true),
            QuestObjective.item('reverse-sand', '역행사 수집', 16, 'reverse_sand', true),
        ],
    })],
    rewards: [
        QuestReward.exp(1_250_000),
        QuestReward.gold(175_000),
        QuestReward.item('chronofrost_tonic', 6, '영시 회복약'),
        QuestReward.item('chronoblade', 1, '영시 절단검'),
    ],
});

defineQuest({
    id: CHRONOFROST_QUEST_IDS.END_ZERO_HOUR,
    name: '내일을 돌려놓는 시계',
    aliases: ['영시여왕 토벌', '크로니아'],
    description: '빙시계 파수장을 넘어 영시여왕 크로니아가 얼린 내일을 되돌리세요.',
    tags: ['quest:side', 'quest:boss', 'region:chronofrost'],
    giverNpcIds: ['chronofrost_keeper'],
    turnInNpcIds: ['chronofrost_keeper'],
    prerequisiteQuestIds: [CHRONOFROST_QUEST_IDS.RESTART_CLOCK],
    visible: player => player.level >= 440,
    canAccept: player => player.level >= 440,
    stages: [new QuestStage({
        id: 'restore-tomorrow',
        description: '빙시계 파수장과 영시여왕을 제압해 멈춘 시계원을 다시 흐르게 하세요.',
        objectives: [
            QuestObjective.kill('frostclock-sentinel', '빙시계 파수장 처치', 1, target => target.hasTag('monster:frostclock-sentinel')),
            QuestObjective.kill('zero-hour-queen', '영시여왕 크로니아 처치', 1, target => target.hasTag('monster:zero-hour-queen')),
        ],
    })],
    rewards: [
        QuestReward.exp(1_950_000),
        QuestReward.gold(260_000),
        QuestReward.item('aeon_bulwark', 1, '영겁 진자방패'),
        QuestReward.item('zero_hour_staff', 1, '영시각 지팡이'),
    ],
});

defineQuest({
    id: ENDSTAR_QUEST_IDS.RELIGHT_CONSTELLATION,
    name: '꺼진 별을 잇는 선',
    aliases: ['라그나벨 성단 보급', '성좌 복구'],
    description: '잔광편과 창세정을 모아 라그나벨 성단에서 끊어진 피난 성좌를 다시 연결하세요.',
    tags: ['quest:side', 'region:endstar'],
    giverNpcIds: ['endstar_observer'],
    turnInNpcIds: ['endstar_observer'],
    visible: player => player.level >= 460,
    canAccept: player => player.level >= 460,
    stages: [new QuestStage({
        id: 'relight-refuge-constellation',
        description: '꺼진 별무리와 창세 항로에서 잔광편과 창세정을 모으세요.',
        objectives: [
            QuestObjective.item('last-light', '잔광편 수집', 22, 'last_light', true),
            QuestObjective.item('genesis-crystal', '창세정 수집', 14, 'genesis_crystal', true),
        ],
    })],
    rewards: [
        QuestReward.exp(1_750_000),
        QuestReward.gold(240_000),
        QuestReward.item('endstar_tonic', 7, '창세맥 영약'),
        QuestReward.item('endstar_edge', 1, '종성단절검'),
    ],
});

defineQuest({
    id: ENDSTAR_QUEST_IDS.END_LAST_CONSTELLATION,
    name: '마지막 별자리의 이름',
    aliases: ['최후성좌 토벌', '라스트라'],
    description: '종성의 전령을 넘어 최후성좌 라스트라가 정한 단 하나의 종말을 거부하세요.',
    tags: ['quest:side', 'quest:boss', 'region:endstar'],
    giverNpcIds: ['endstar_observer'],
    turnInNpcIds: ['endstar_observer'],
    prerequisiteQuestIds: [ENDSTAR_QUEST_IDS.RELIGHT_CONSTELLATION],
    visible: player => player.level >= 480,
    canAccept: player => player.level >= 480,
    stages: [new QuestStage({
        id: 'deny-final-ending',
        description: '종성의 전령 에녹과 최후성좌 라스트라를 제압해 성단의 미래를 되찾으세요.',
        objectives: [
            QuestObjective.kill('endstar-herald', '종성의 전령 에녹 처치', 1, target => target.hasTag('monster:endstar-herald')),
            QuestObjective.kill('last-constellation', '최후성좌 라스트라 처치', 1, target => target.hasTag('monster:last-constellation')),
        ],
    })],
    rewards: [
        QuestReward.exp(2_750_000),
        QuestReward.gold(360_000),
        QuestReward.item('horizon_bulwark', 1, '최후지평 방패'),
        QuestReward.item('genesis_staff', 1, '창세성 지팡이'),
    ],
});

export const CAREER_QUEST_IDS: Record<string, string> = {};
export const BLACKSMITH_APPRENTICESHIP_QUEST_ID = 'profession:blacksmith_apprenticeship';

function hasStandardBlacksmithTrial(player: Player): boolean {
    return JobSlotType.values().some(slot => {
        const id = CAREER_QUEST_IDS[`${slot.key}:career:blacksmith`];
        return Boolean(id && (player.quests.isActive(id) || player.quests.canTurnIn(id)));
    });
}

function hasLegacyBlacksmithTrial(player: Player): boolean {
    return player.quests.isActive(BLACKSMITH_APPRENTICESHIP_QUEST_ID)
        || player.quests.canTurnIn(BLACKSMITH_APPRENTICESHIP_QUEST_ID);
}

defineQuest({
    id: BLACKSMITH_APPRENTICESHIP_QUEST_ID,
    name: '불꽃 없는 제련법',
    description: '피버릭 갱도의 광맥을 직접 파괴해 소재의 결을 익히고 대장장이 로안에게 보고하세요.',
    tags: ['quest:profession', 'profession:blacksmith'],
    giverNpcIds: ['blacksmith_master'],
    turnInNpcIds: ['blacksmith_master'],
    visible: player => player.level >= 20 && canAcquireBlacksmithProfession(player) && !hasStandardBlacksmithTrial(player),
    canAccept: player => player.level >= 20 && canAcquireBlacksmithProfession(player) && !hasStandardBlacksmithTrial(player),
    stages: [new QuestStage({
        id: 'read_ore_grain',
        description: '채굴 도구로 광맥을 파괴해 서로 다른 광물의 결을 관찰하세요.',
        objectives: [QuestObjective.destroy('ore', '광맥 파괴', 8, target => target.hasTag(GameTags.RESOURCE_ORE))],
    })],
    rewards: [
        QuestReward.exp(600),
        QuestReward.item('iron_ore', 5, '철'),
        QuestReward.custom({
            label: '비어 있는 직업 슬롯 [ 대장장이 ] 전직',
            canGrant: canAcquireBlacksmithProfession,
            grant: player => {
                if (!grantBlacksmithProfession(player)) throw new Error('대장장이 직업 슬롯 배정에 실패했습니다.');
            },
        }),
    ],
});

interface CareerQuestDefinition {
    readonly id: string;
    readonly name: string;
    readonly weapon: string;
    readonly stageDescription: string;
    readonly createObjective: (slot: JobSlotType) => QuestObjective;
}

function killTrial(
    label: string,
    matches: (target: Entity) => boolean,
): (slot: JobSlotType) => QuestObjective {
    return slot => QuestObjective.kill('defeat', label, slot === JobSlotType.MAIN ? 5 : 10, matches);
}

const careerQuestDefinitions: readonly CareerQuestDefinition[] = [
    { id: 'warrior', name: '전사', weapon: 'training_axe', stageDescription: '전사의 방식에 맞는 전투 경험을 쌓으세요.', createObjective: killTrial('무생물 속성 적 처치', target => target.hasTag(GameTags.TRAIT_INANIMATE)) },
    { id: 'archer', name: '궁수', weapon: 'light_bow', stageDescription: '궁수의 방식에 맞는 전투 경험을 쌓으세요.', createObjective: killTrial('자연 속성 적 처치', target => target.hasTag(GameTags.PROPERTY_NATURAL)) },
    { id: 'assassin', name: '암살자', weapon: 'venom_dagger', stageDescription: '암살자의 방식에 맞는 전투 경험을 쌓으세요.', createObjective: killTrial('생명체 속성 적 처치', target => target.hasTag(GameTags.TRAIT_LIVING)) },
    { id: 'mage', name: '마법사', weapon: 'apprentice_staff', stageDescription: '마법사의 방식에 맞는 전투 경험을 쌓으세요.', createObjective: killTrial('불·얼음·독·자연 속성 적 처치', target => [GameTags.PROPERTY_FIRE, GameTags.PROPERTY_ICE, GameTags.PROPERTY_POISON, GameTags.PROPERTY_NATURAL].some(tag => target.hasTag(tag))) },
    {
        id: 'blacksmith',
        name: '대장장이',
        weapon: 'iron_pickaxe',
        stageDescription: '광맥을 직접 파괴하며 소재의 결을 읽는 감각과 단단한 체력을 증명하세요.',
        createObjective: slot => QuestObjective.destroy(
            'ore',
            '광맥 파괴',
            slot === JobSlotType.MAIN ? 5 : 10,
            target => target.hasTag(GameTags.RESOURCE_ORE),
        ),
    },
];

for (const slot of JobSlotType.values()) for (const job of careerQuestDefinitions) {
    const questId = `career:${slot.key}_${job.id}_promotion`;
    const jobId = `career:${job.id}`;
    CAREER_QUEST_IDS[`${slot.key}:${jobId}`] = questId;
    defineQuest({
        id: questId,
        name: `${slot.label} ${job.name} 전직 시험`,
        description: `${job.name}의 기본 소양을 증명하고 ${slot.label}(으)로 전직하세요.`,
        tags: ['quest:career', `career:${slot.key}`],
        giverNpcIds: ['job_master'],
        turnInNpcIds: ['job_master'],
        visible: player => player.level >= slot.requiredLevel
            && player.career.canAssign(slot, jobId).success
            && (job.id !== 'blacksmith' || !hasLegacyBlacksmithTrial(player)),
        canAccept: player => player.career.canAssign(slot, jobId).success
            && (job.id !== 'blacksmith' || !hasLegacyBlacksmithTrial(player)),
        stages: [new QuestStage({
            id: 'trial',
            description: job.stageDescription,
            objectives: [job.createObjective(slot)],
        })],
        rewards: [
            ...(slot === JobSlotType.MAIN ? [QuestReward.item(job.weapon, 1)] : []),
            QuestReward.custom({
                label: `${slot.label} [ ${job.name} ] 전직`,
                canGrant: player => player.career.canAssign(slot, jobId).success,
                grant: player => { player.career.assign(slot, jobId); },
            }),
        ],
    });
}
