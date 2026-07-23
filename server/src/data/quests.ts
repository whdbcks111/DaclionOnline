import { GameTags } from '../../../shared/tags.js';
import {
    defineQuest,
    QuestObjective,
    QuestReward,
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

export const FIRST_SLIME_HUNT_QUEST_ID = 'luminair:first_slime_hunt';
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
    description: '역설기계고에 흩어진 기억 톱니와 논리핵을 모아 중계소의 항로 기록을 복원하세요.',
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
    description: '세 아귀 문지기와 흑염대장을 넘어 잿왕성의 벨카르를 쓰러뜨리세요.',
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
