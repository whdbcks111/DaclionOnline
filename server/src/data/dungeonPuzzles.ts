import { defineProgress, ProgressType } from '../models/Progress.js';
import { getLocation, registerConnectionCondition } from '../models/Location.js';
import { registerResourceInteraction } from '../models/Resource.js';
import {
    activateTeleportArtifact,
    beginQuestionPuzzle,
    defineQuestionPuzzle,
    defineTeleportArtifact,
} from '../models/DungeonPuzzle.js';

export const IronrootPuzzleIds = Object.freeze({
    RIDDLE: 'ironroot:root-riddle',
    RIDDLE_FLAG: 'dungeon:ironroot/root-riddle-solved',
    RELAY_ARTIFACT: 'ironroot:relay-artifact',
    BREAKABLE_GATE_RESOURCE: 'ironroot_breakable_gate',
} as const);

export const TwilightTombPuzzleIds = Object.freeze({
    RIDDLE: 'twilight-tomb:crown-riddle',
    RIDDLE_FLAG: 'dungeon:twilight-tomb/crown-riddle-solved',
} as const);

export const GlassdunePuzzleIds = Object.freeze({
    SUNDIAL: 'glassdune:shadowless-sundial',
    SUNDIAL_FLAG: 'dungeon:glassdune/shadowless-sundial-solved',
} as const);

export const FrostveilPuzzleIds = Object.freeze({
    PRISM: 'frostveil:white-prism',
    PRISM_FLAG: 'dungeon:frostveil/white-prism-solved',
} as const);

export const MisttidePuzzleIds = Object.freeze({
    TIDE_CLOCK: 'misttide:stopped-tide-clock',
    TIDE_CLOCK_FLAG: 'dungeon:misttide/stopped-tide-clock-solved',
} as const);

export const ParadoxPuzzleIds = Object.freeze({
    CAUSALITY_SEQUENCE: 'paradox:causality-sequence',
    CAUSALITY_SEQUENCE_FLAG: 'dungeon:paradox/causality-sequence-solved',
} as const);

export const AshenAbyssPuzzleIds = Object.freeze({
    SEAL_OATH: 'ashen-abyss:seal-oath',
    SEAL_OATH_FLAG: 'dungeon:ashen-abyss/seal-oath-solved',
} as const);

export const VoidcrownPuzzleIds = Object.freeze({
    EMPTY_THRONE_OATH: 'voidcrown:empty-throne-oath',
    EMPTY_THRONE_OATH_FLAG: 'dungeon:voidcrown/empty-throne-oath-solved',
} as const);

export const EclipseTrenchPuzzleIds = Object.freeze({
    TIDE_BALANCE: 'eclipse-trench:tide-balance',
    TIDE_BALANCE_FLAG: 'dungeon:eclipse-trench/tide-balance-solved',
} as const);

export const WorldrootPuzzleIds = Object.freeze({
    FIRST_MEMORY: 'worldroot:first-memory',
    FIRST_MEMORY_FLAG: 'dungeon:worldroot/first-memory-solved',
} as const);

defineProgress({
    id: IronrootPuzzleIds.RIDDLE_FLAG,
    type: ProgressType.FLAG,
    label: '매몰 미로 뿌리문 해독',
    description: '철근황무지 매몰 미로의 질문 석판을 해독했습니다.',
    visible: true,
});

defineQuestionPuzzle({
    id: IronrootPuzzleIds.RIDDLE,
    title: '뿌리문의 질문',
    prompt: '나는 흙 아래로 갈수록 깊어지지만, 한 걸음도 걷지 않는다. 나무를 붙들고 돌을 가르며 물을 찾는 나는 무엇인가?',
    answers: ['뿌리', '나무뿌리', '나무의 뿌리'],
    choices: [
        { label: '뿌리', answer: '뿌리' },
        { label: '그림자', answer: '그림자' },
        { label: '강물', answer: '강물' },
    ],
    successFlag: IronrootPuzzleIds.RIDDLE_FLAG,
    successMessage: '석판의 철제 뿌리가 물러나며 안쪽 회랑으로 향하는 길이 드러납니다.',
    failureMessage: '철제 뿌리가 거칠게 떨리며 답을 거부합니다.',
});

defineProgress({
    id: TwilightTombPuzzleIds.RIDDLE_FLAG,
    type: ProgressType.FLAG,
    label: '황혼왕릉 왕명 해독',
    description: '황혼왕릉의 왕명을 새긴 석문을 해독했습니다.',
    visible: true,
});

defineQuestionPuzzle({
    id: TwilightTombPuzzleIds.RIDDLE,
    title: '마지막 왕명',
    prompt: '주인이 숨을 거두어도 머리 위에 남고, 충성한 자와 배신한 자가 모두 탐한 것은 무엇인가?',
    answers: ['왕관', '관', '왕의 왕관'],
    choices: [
        { label: '왕관', answer: '왕관' },
        { label: '검', answer: '검' },
        { label: '왕좌', answer: '왕좌' },
    ],
    successFlag: TwilightTombPuzzleIds.RIDDLE_FLAG,
    successMessage: '석문의 뼈 장식이 양옆으로 물러나며 숨은 납골당으로 가는 계단이 드러납니다.',
    failureMessage: '왕관 문양의 눈구멍에서 찬바람이 새어 나오며 답을 거부합니다.',
});

defineProgress({
    id: GlassdunePuzzleIds.SUNDIAL_FLAG,
    type: ProgressType.FLAG,
    label: '그림자 없는 해시계 해독',
    description: '유리모래 사막의 해시계가 숨긴 오아시스를 가리키게 했습니다.',
    visible: true,
});

defineQuestionPuzzle({
    id: GlassdunePuzzleIds.SUNDIAL,
    title: '그림자 없는 해시계',
    prompt: '낮에는 내가 길을 가리키지만, 정오에는 사라진다. 해가 지면 내 대신 별이 길을 가리킨다. 나는 무엇인가?',
    answers: ['그림자', '해의 그림자', '그늘'],
    choices: [
        { label: '그림자', answer: '그림자' },
        { label: '모래바람', answer: '모래바람' },
        { label: '신기루', answer: '신기루' },
    ],
    successFlag: GlassdunePuzzleIds.SUNDIAL_FLAG,
    successMessage: '해시계의 바늘이 누워 멀리 숨은 오아시스로 이어지는 빛의 길을 그립니다.',
    failureMessage: '모래 아래의 톱니바퀴만 돌아가고 해시계는 아무 길도 가리키지 않습니다.',
});

defineProgress({
    id: FrostveilPuzzleIds.PRISM_FLAG,
    type: ProgressType.FLAG,
    label: '빙경궁 백광 분광 해독',
    description: '빙경궁의 흩어진 빛을 하나로 모아 숨은 빙하동을 열었습니다.',
    visible: true,
});

defineQuestionPuzzle({
    id: FrostveilPuzzleIds.PRISM,
    title: '백광 분광대',
    prompt: '나는 하나로 비치지만 거울을 통과하면 여러 색으로 갈라진다. 흩어진 색을 모두 모으면 다시 무엇이 되는가?',
    answers: ['빛', '백색광', '흰빛', '하얀빛'],
    choices: [
        { label: '백색광', answer: '백색광' },
        { label: '그림자', answer: '그림자' },
        { label: '얼음', answer: '얼음' },
    ],
    successFlag: FrostveilPuzzleIds.PRISM_FLAG,
    successMessage: '분광대의 색들이 하나의 흰빛으로 합쳐지며 숨은 빙하동의 벽이 투명해집니다.',
    failureMessage: '색이 서로 밀어내며 흩어지고, 얼음벽은 아무 반응도 보이지 않습니다.',
});

defineProgress({
    id: MisttidePuzzleIds.TIDE_CLOCK_FLAG,
    type: ProgressType.FLAG,
    label: '멈춘 조류시계 복원',
    description: '안개파도 해안의 조류시계를 움직여 숨은 조류동으로 가는 물길을 열었습니다.',
    visible: true,
});

defineQuestionPuzzle({
    id: MisttidePuzzleIds.TIDE_CLOCK,
    title: '멈춘 조류시계',
    prompt: '달이 바다를 끌어당길 때 나는 해안을 덮고, 달이 멀어지면 다시 물러난다. 하루에도 되풀이되는 나는 무엇인가?',
    answers: ['밀물과 썰물', '밀물 썰물', '조수', '조석'],
    choices: [
        { label: '밀물과 썰물', answer: '밀물과 썰물' },
        { label: '파도와 바람', answer: '파도와 바람' },
        { label: '안개와 비', answer: '안개와 비' },
    ],
    successFlag: MisttidePuzzleIds.TIDE_CLOCK_FLAG,
    successMessage: '조류시계의 두 바늘이 반대 방향으로 돌며 절벽 아래 숨은 물길을 드러냅니다.',
    failureMessage: '바늘 하나만 잠시 떨리고, 바위틈의 물길은 열리지 않습니다.',
});

defineProgress({
    id: ParadoxPuzzleIds.CAUSALITY_SEQUENCE_FLAG,
    type: ProgressType.FLAG,
    label: '인과율 수열 복원',
    description: '역설기계고의 끊어진 연산 순서를 복원해 폐기 시제품고를 열었습니다.',
    visible: true,
});

defineQuestionPuzzle({
    id: ParadoxPuzzleIds.CAUSALITY_SEQUENCE,
    title: '끊어진 인과 수열',
    prompt: '연산대에 2, 3, 5, 8, 13이 차례로 나타났다. 앞선 두 결과를 합쳐 다음 결과를 만든다면 여섯 번째 수는 무엇인가?',
    answers: ['21', '이십일'],
    choices: [
        { label: '18', answer: '18' },
        { label: '20', answer: '20' },
        { label: '21', answer: '21' },
    ],
    successFlag: ParadoxPuzzleIds.CAUSALITY_SEQUENCE_FLAG,
    successMessage: '연산대의 톱니가 순서대로 맞물리며 폐기 시제품고의 위상문이 열립니다.',
    failureMessage: '서로 맞지 않는 톱니가 역회전하며 연산 결과를 지워 버립니다.',
});

defineProgress({
    id: AshenAbyssPuzzleIds.SEAL_OATH_FLAG,
    type: ProgressType.FLAG,
    label: '재왕 인장 맹세 해독',
    description: '잿왕성의 봉인 맹세를 해독해 왕가 유물고의 길을 열었습니다.',
    visible: true,
});

defineQuestionPuzzle({
    id: AshenAbyssPuzzleIds.SEAL_OATH,
    title: '재왕 인장의 맹세',
    prompt: '살아 있을 때는 주인을 지키고, 죽은 뒤에는 주인의 이름을 지운다. 불에 타도 남아 왕의 명령을 증명하는 것은 무엇인가?',
    answers: ['인장', '왕의 인장', '왕인'],
    choices: [
        { label: '왕관', answer: '왕관' },
        { label: '인장', answer: '인장' },
        { label: '검', answer: '검' },
    ],
    successFlag: AshenAbyssPuzzleIds.SEAL_OATH_FLAG,
    successMessage: '제단의 검은 불꽃이 갈라지고, 봉인된 왕가 유물고로 이어지는 문이 모습을 드러냅니다.',
    failureMessage: '인장의 금속면이 차갑게 굳으며 맹세를 거부합니다.',
});

defineProgress({
    id: VoidcrownPuzzleIds.EMPTY_THRONE_OATH_FLAG,
    type: ProgressType.FLAG,
    label: '빈 왕좌의 서약 해독',
    description: '공허왕관 성채의 서약문에서 왕이 사라진 뒤에도 남는 의무를 찾아냈습니다.',
    visible: true,
});

defineQuestionPuzzle({
    id: VoidcrownPuzzleIds.EMPTY_THRONE_OATH,
    title: '빈 왕좌의 서약',
    prompt: '왕이 사라져도 성을 지키고, 명령이 끊겨도 맹세한 자의 선택 속에 남는 것은 무엇인가?',
    answers: ['의무', '책임', '맹세', '서약'],
    choices: [
        { label: '왕관', answer: '왕관' },
        { label: '의무', answer: '의무' },
        { label: '혈통', answer: '혈통' },
    ],
    successFlag: VoidcrownPuzzleIds.EMPTY_THRONE_OATH_FLAG,
    successMessage: '서약대의 빈 왕관 문양이 갈라지며 무성좌 비밀금고로 향하는 어두운 회랑이 드러납니다.',
    failureMessage: '서약문의 글자가 모두 지워지고, 빈 왕좌는 아무 대답도 돌려주지 않습니다.',
});

defineProgress({
    id: EclipseTrenchPuzzleIds.TIDE_BALANCE_FLAG,
    type: ProgressType.FLAG,
    label: '월식 조류제단 해독',
    description: '빛과 어둠 사이에서 해구의 조류를 움직이는 힘을 찾아냈습니다.',
    visible: true,
});

defineQuestionPuzzle({
    id: EclipseTrenchPuzzleIds.TIDE_BALANCE,
    title: '월식 조류제단',
    prompt: '달이 보이지 않아도 바다를 움직이고, 빛과 어둠 어느 한쪽에도 머물지 않으며 되돌아오는 것은 무엇인가?',
    answers: ['조류', '밀물과 썰물', '밀물 썰물', '파도'],
    choices: [
        { label: '달빛', answer: '달빛' },
        { label: '조류', answer: '조류' },
        { label: '그림자', answer: '그림자' },
    ],
    successFlag: EclipseTrenchPuzzleIds.TIDE_BALANCE_FLAG,
    successMessage: '제단의 밝은 면과 어두운 면이 함께 회전하며 침수된 보물고로 향하는 물길이 열립니다.',
    failureMessage: '두 조류가 서로 밀어내며 제단의 문을 다시 닫습니다.',
});

defineProgress({
    id: WorldrootPuzzleIds.FIRST_MEMORY_FLAG,
    type: ProgressType.FLAG,
    label: '역근수해 첫 기억 복원',
    description: '역근수해가 잊고 있던 첫 기억을 되찾아 숨은 기억호박 유물고를 열었습니다.',
    visible: true,
});

defineQuestionPuzzle({
    id: WorldrootPuzzleIds.FIRST_MEMORY,
    title: '첫 기억의 제단',
    prompt: '태어나기 전에는 없고, 사라진 뒤에도 다른 이에게 남아 다음 길을 알려 주는 것은 무엇인가?',
    answers: ['기억', '추억', '남겨진 기억'],
    choices: [
        { label: '이름', answer: '이름' },
        { label: '기억', answer: '기억' },
        { label: '그림자', answer: '그림자' },
    ],
    successFlag: WorldrootPuzzleIds.FIRST_MEMORY_FLAG,
    successMessage: '제단에 묻힌 호박빛이 이어지며 기억호박 유물고로 향하는 뿌리문이 열립니다.',
    failureMessage: '호박 속 형상이 흐려지고, 뿌리문은 기억을 받아들이지 않습니다.',
});

defineTeleportArtifact({
    id: IronrootPuzzleIds.RELAY_ARTIFACT,
    destinations: {
        ironroot_echo_vault: 'ironroot_gate_gallery',
        ironroot_gate_gallery: 'ironroot_echo_vault',
    },
    activationMessage: '고리 유물이 뒤집히며 위아래의 감각이 잠시 사라집니다.',
});

registerResourceInteraction('ironroot_riddle_door', (_resource, player) =>
    beginQuestionPuzzle(player, IronrootPuzzleIds.RIDDLE));

registerResourceInteraction('ironroot_relay_artifact', (_resource, player) =>
    activateTeleportArtifact(player, IronrootPuzzleIds.RELAY_ARTIFACT));

registerResourceInteraction('twilight_tomb_riddle', (_resource, player) =>
    beginQuestionPuzzle(player, TwilightTombPuzzleIds.RIDDLE));

registerResourceInteraction('glassdune_sundial_riddle', (_resource, player) =>
    beginQuestionPuzzle(player, GlassdunePuzzleIds.SUNDIAL));

registerResourceInteraction('frostveil_prism_riddle', (_resource, player) =>
    beginQuestionPuzzle(player, FrostveilPuzzleIds.PRISM));

registerResourceInteraction('misttide_clock_riddle', (_resource, player) =>
    beginQuestionPuzzle(player, MisttidePuzzleIds.TIDE_CLOCK));

registerResourceInteraction('paradox_causality_riddle', (_resource, player) =>
    beginQuestionPuzzle(player, ParadoxPuzzleIds.CAUSALITY_SEQUENCE));

registerResourceInteraction('ashen_seal_riddle', (_resource, player) =>
    beginQuestionPuzzle(player, AshenAbyssPuzzleIds.SEAL_OATH));

registerResourceInteraction('voidcrown_oath_riddle', (_resource, player) =>
    beginQuestionPuzzle(player, VoidcrownPuzzleIds.EMPTY_THRONE_OATH));

registerResourceInteraction('eclipse_tide_riddle', (_resource, player) =>
    beginQuestionPuzzle(player, EclipseTrenchPuzzleIds.TIDE_BALANCE));

registerResourceInteraction('worldroot_memory_riddle', (_resource, player) =>
    beginQuestionPuzzle(player, WorldrootPuzzleIds.FIRST_MEMORY));

registerConnectionCondition('ironroot_riddle_solved', player =>
    player.progress.getFlag(IronrootPuzzleIds.RIDDLE_FLAG)
        ? 'visible'
        : { status: 'locked', publicReason: '질문 석판의 해답 필요' });

registerConnectionCondition('ironroot_gate_destroyed', () =>
    getLocation('ironroot_gate_gallery')?.isResourceDefeated(IronrootPuzzleIds.BREAKABLE_GATE_RESOURCE)
        ? 'visible'
        : { status: 'locked', publicReason: '녹슨 봉인문 파괴 필요' });

registerConnectionCondition('twilight_tomb_riddle_solved', player =>
    player.progress.getFlag(TwilightTombPuzzleIds.RIDDLE_FLAG)
        ? 'visible'
        : { status: 'locked', publicReason: '왕명을 새긴 석문의 해답 필요' });

registerConnectionCondition('glassdune_sundial_solved', player =>
    player.progress.getFlag(GlassdunePuzzleIds.SUNDIAL_FLAG)
        ? 'visible'
        : { status: 'locked', publicReason: '그림자 없는 해시계의 해답 필요' });

registerConnectionCondition('frostveil_prism_solved', player =>
    player.progress.getFlag(FrostveilPuzzleIds.PRISM_FLAG)
        ? 'visible'
        : { status: 'locked', publicReason: '백광 분광대의 해답 필요' });

registerConnectionCondition('misttide_clock_solved', player =>
    player.progress.getFlag(MisttidePuzzleIds.TIDE_CLOCK_FLAG)
        ? 'visible'
        : { status: 'locked', publicReason: '멈춘 조류시계의 해답 필요' });

registerConnectionCondition('paradox_causality_solved', player =>
    player.progress.getFlag(ParadoxPuzzleIds.CAUSALITY_SEQUENCE_FLAG)
        ? 'visible'
        : { status: 'locked', publicReason: '인과율 연산대의 해답 필요' });

registerConnectionCondition('ashen_seal_solved', player =>
    player.progress.getFlag(AshenAbyssPuzzleIds.SEAL_OATH_FLAG)
        ? 'visible'
        : { status: 'locked', publicReason: '재왕 인장 제단의 해답 필요' });

registerConnectionCondition('voidcrown_oath_solved', player =>
    player.progress.getFlag(VoidcrownPuzzleIds.EMPTY_THRONE_OATH_FLAG)
        ? 'visible'
        : { status: 'locked', publicReason: '빈 왕좌의 서약 해답 필요' });

registerConnectionCondition('eclipse_tide_solved', player =>
    player.progress.getFlag(EclipseTrenchPuzzleIds.TIDE_BALANCE_FLAG)
        ? 'visible'
        : { status: 'locked', publicReason: '월식 조류제단의 해답 필요' });

registerConnectionCondition('worldroot_memory_solved', player =>
    player.progress.getFlag(WorldrootPuzzleIds.FIRST_MEMORY_FLAG)
        ? 'visible'
        : { status: 'locked', publicReason: '첫 기억의 제단 해답 필요' });

// 지도 연결성은 유지하되 일반 이동·지도에는 노출하지 않고 유물 상호작용만 통과시킨다.
registerConnectionCondition('ironroot_artifact_route', () => 'hidden');
