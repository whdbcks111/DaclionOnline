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

registerConnectionCondition('ironroot_riddle_solved', player =>
    player.progress.getFlag(IronrootPuzzleIds.RIDDLE_FLAG)
        ? 'visible'
        : { status: 'locked', publicReason: '질문 석판의 해답 필요' });

registerConnectionCondition('ironroot_gate_destroyed', () =>
    getLocation('ironroot_gate_gallery')?.isResourceDefeated(IronrootPuzzleIds.BREAKABLE_GATE_RESOURCE)
        ? 'visible'
        : { status: 'locked', publicReason: '녹슨 봉인문 파괴 필요' });

// 지도 연결성은 유지하되 일반 이동·지도에는 노출하지 않고 유물 상호작용만 통과시킨다.
registerConnectionCondition('ironroot_artifact_route', () => 'hidden');
