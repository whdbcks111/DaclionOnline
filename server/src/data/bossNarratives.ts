import { GameTags } from '../../../shared/tags.js';
import type { TagId } from '../../../shared/tags.js';
import type { BossNarrative } from '../models/Monster.js';

interface BossDialogueTheme {
    readonly openings: readonly string[];
    readonly pressureLines: readonly string[];
    readonly crisisLines: readonly string[];
}

const DEFAULT_THEME: BossDialogueTheme = {
    openings: [
        '여기까지 온 용기는 인정하지. 하지만 이 경계는 넘겨줄 수 없다.',
        '내 앞에 선 순간, 돌아갈 길은 이미 닫혔다.',
        '이 땅이 나를 왕이라 부른 이유를 직접 새겨 주마.',
    ],
    pressureLines: [
        '좋다. 이제야 네 힘을 시험할 가치가 생겼군.',
        '그 한 수는 기억해 두겠다. 다음은 내가 답할 차례다.',
        '아직 끝나지 않았다. 진짜 싸움은 지금부터다.',
    ],
    crisisLines: [
        '왕좌가 무너져도 나는 마지막까지 이곳을 지킨다!',
        '내 모든 힘을 태워 네 발걸음을 여기서 멈추겠다!',
        '이 결말만큼은 누구에게도 넘겨주지 않겠다!',
    ],
};

const THEMES: readonly { tag: TagId; theme: BossDialogueTheme }[] = [
    {
        tag: GameTags.PROPERTY_FIRE,
        theme: {
            openings: ['재와 불꽃이 네 이름까지 삼킬 것이다.', '꺼지지 않는 불길 앞에 무릎 꿇어라.', '내 심장의 화염으로 이 길을 봉인하겠다.'],
            pressureLines: ['불길이 흔들릴수록 더 거세게 타오르는 법이다.', '좋다, 재가 될 자격은 증명했군.', '열기가 부족했나? 화로를 더 열어 주지.'],
            crisisLines: ['마지막 불씨까지 네게 쏟아붓겠다!', '재가 되어도 이 왕관은 꺼지지 않는다!', '이 몸과 함께 모든 것을 태우리라!'],
        },
    },
    {
        tag: GameTags.PROPERTY_WATER,
        theme: {
            openings: ['깊이를 모르는 자여, 물 아래의 침묵을 배워라.', '이 물결은 침입자를 기억하고 끝내 되돌려 보낸다.', '숨을 고를 틈조차 바다에 바쳐라.'],
            pressureLines: ['제법 오래 버티는군. 이제 수압을 높이겠다.', '물결을 가른 대가는 심연이 직접 받는다.', '잔물결은 끝났다. 다음 파도는 피할 수 없다.'],
            crisisLines: ['심연의 바닥까지 함께 가라앉자!', '마지막 조류가 네 운명을 뒤집을 것이다!', '바다가 마르는 한이 있어도 너를 놓치지 않겠다!'],
        },
    },
    {
        tag: GameTags.PROPERTY_ICE,
        theme: {
            openings: ['멈춘 시간 속에서 네 패배는 이미 얼어붙었다.', '한 걸음 더 다가오면 숨결마저 얼음에 새겨진다.', '이 정적을 깨운 대가를 치러라.'],
            pressureLines: ['금이 갔다고 얼음이 무너진 것은 아니다.', '움직임이 보인다. 다음 순간은 얼려 두었다.', '추위에 익숙해졌나? 그렇다면 시간을 얼리겠다.'],
            crisisLines: ['모든 순간을 이 자리에서 끝내겠다!', '깨진 얼음 조각 하나까지 칼날이 되리라!', '영원의 겨울이 너를 기억할 것이다!'],
        },
    },
    {
        tag: GameTags.PROPERTY_ELECTRIC,
        theme: {
            openings: ['천둥이 네 심장보다 먼저 판결을 내릴 것이다.', '하늘의 전류가 침입자의 이름을 찾았다.', '번개의 길에는 오직 한 명만 남는다.'],
            pressureLines: ['반응은 빠르군. 하지만 번개보다 빠를 수는 없다.', '전류가 바뀐다. 같은 수는 두 번 통하지 않는다.', '하늘이 더 큰 낙뢰를 준비하고 있다.'],
            crisisLines: ['내 마지막 맥동으로 하늘을 찢겠다!', '모든 낙뢰여, 지금 이곳에 모여라!', '천둥이 멎기 전에 네 숨부터 끊겠다!'],
        },
    },
    {
        tag: GameTags.PROPERTY_NATURAL,
        theme: {
            openings: ['뿌리가 네 발자국을 들었다. 숲은 침입자를 잊지 않는다.', '이곳의 숨결 하나까지 내 의지다.', '베어 낸 생명만큼 네 피로 돌려받겠다.'],
            pressureLines: ['상처 아래에서 새 뿌리가 자란다.', '숲이 네 움직임을 배웠다. 이제 숨을 곳은 없다.', '계절이 바뀌어도 수호자의 맹세는 시들지 않는다.'],
            crisisLines: ['마지막 뿌리까지 너를 붙잡겠다!', '내 생명이 숲 전체의 분노가 되리라!', '쓰러져도 씨앗은 네 패배를 기억한다!'],
        },
    },
    {
        tag: GameTags.PROPERTY_DARK,
        theme: {
            openings: ['빛이 닿지 않는 곳에서 네 끝은 오래전 정해졌다.', '그림자는 이미 네 뒤에 서 있다.', '감추고 싶은 두려움까지 이 어둠에 비치리라.'],
            pressureLines: ['그림자를 벤다고 밤이 끝나지는 않는다.', '네 두려움이 짙어질수록 나는 선명해진다.', '빛을 붙들어라. 곧 그것마저 사라질 테니.'],
            crisisLines: ['마지막 빛까지 삼키고 함께 사라지겠다!', '어둠의 끝에서 네 이름을 지워 주마!', '내 그림자가 무너진 자리엔 아무것도 남지 않는다!'],
        },
    },
    {
        tag: GameTags.PROPERTY_HOLY,
        theme: {
            openings: ['이 문턱을 넘을 자격이 있는지 빛 앞에서 증명하라.', '성역의 판결은 자비보다 먼저 내린다.', '거짓된 결의는 이 빛을 견디지 못한다.'],
            pressureLines: ['흔들리지 않는군. 그렇다면 더 엄중히 심판하겠다.', '상처는 신념을 흐리지 않는다.', '빛이 너를 인정하기 전까지 시험은 끝나지 않는다.'],
            crisisLines: ['나의 마지막 기도를 심판으로 바치겠다!', '성역이 무너져도 맹세는 남는다!', '이 빛에 나와 함께 모든 죄를 태워라!'],
        },
    },
];

function stableIndex(id: string, length: number, salt: number): number {
    let hash = salt;
    for (const char of id) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
    return hash % length;
}

/** 고유 설명과 속성 콘셉트가 있는 모든 보스에 동일한 연출 규약의 대사를 생성한다. */
export function createBossNarrative(id: string, tags: readonly TagId[]): BossNarrative {
    const theme = THEMES.find(candidate => tags.includes(candidate.tag))?.theme ?? DEFAULT_THEME;
    return {
        introDuration: 3,
        introLine: theme.openings[stableIndex(id, theme.openings.length, 17)]!,
        phases: [
            { lifeRatio: 0.7, line: theme.pressureLines[stableIndex(id, theme.pressureLines.length, 31)]! },
            { lifeRatio: 0.35, line: theme.crisisLines[stableIndex(id, theme.crisisLines.length, 47)]! },
        ],
    };
}
