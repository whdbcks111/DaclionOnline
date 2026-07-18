import type Player from './Player.js';
import { getLocation } from './Location.js';
import { chat } from '../utils/chatBuilder.js';
import { sendBotMessageToUser, sendNotificationToUser } from '../modules/message.js';

export interface PuzzleAnswerChoice {
    label: string;
    answer: string;
}

export interface QuestionPuzzleData {
    id: string;
    title: string;
    prompt: string;
    answers: readonly string[];
    choices?: readonly PuzzleAnswerChoice[];
    successFlag: string;
    successMessage: string;
    failureMessage?: string;
    sessionDuration?: number;
}

export interface TeleportArtifactData {
    id: string;
    destinations: Readonly<Record<string, string>>;
    activationMessage: string;
}

interface QuestionPuzzleSession {
    puzzleId: string;
    locationId: string;
    expiresAt: number;
}

export type PuzzleAnswerResult = 'correct' | 'incorrect' | 'expired' | 'none';

const questionPuzzles = new Map<string, Readonly<QuestionPuzzleData>>();
const teleportArtifacts = new Map<string, Readonly<TeleportArtifactData>>();
const sessions = new Map<number, QuestionPuzzleSession>();

/** 질문형 문·석판을 등록한다. 정답 비교는 공백과 문장부호 차이를 무시한다. */
export function defineQuestionPuzzle(data: QuestionPuzzleData): void {
    const id = normalizeId(data.id);
    if (!data.title.trim() || !data.prompt.trim()) throw new Error(`Puzzle text must not be empty: ${id}`);
    if (data.answers.length === 0 || data.answers.some(answer => !normalizeAnswer(answer))) {
        throw new Error(`Puzzle answers must not be empty: ${id}`);
    }
    if (!data.successFlag.trim()) throw new Error(`Puzzle success flag must not be empty: ${id}`);
    const sessionDuration = data.sessionDuration ?? 120;
    if (!Number.isFinite(sessionDuration) || sessionDuration <= 0) {
        throw new Error(`Invalid puzzle session duration: ${id}`);
    }
    questionPuzzles.set(id, Object.freeze({
        ...data,
        id,
        title: data.title.trim(),
        prompt: data.prompt.trim(),
        answers: Object.freeze([...data.answers]),
        choices: data.choices ? Object.freeze(data.choices.map(choice => Object.freeze({ ...choice }))) : undefined,
        sessionDuration,
    }));
}

/** 현재 장소별 목적지를 가진 순간이동 유물을 등록한다. */
export function defineTeleportArtifact(data: TeleportArtifactData): void {
    const id = normalizeId(data.id);
    const destinations = Object.fromEntries(Object.entries(data.destinations).map(([from, to]) => [from.trim(), to.trim()]));
    if (Object.keys(destinations).length === 0 || Object.entries(destinations).some(([from, to]) => !from || !to)) {
        throw new Error(`Teleport artifact destinations must not be empty: ${id}`);
    }
    teleportArtifacts.set(id, Object.freeze({
        ...data,
        id,
        destinations: Object.freeze(destinations),
        activationMessage: data.activationMessage.trim(),
    }));
}

export function beginQuestionPuzzle(player: Player, puzzleId: string): boolean {
    const puzzle = questionPuzzles.get(normalizeId(puzzleId));
    if (!puzzle) return false;
    if (player.progress.getFlag(puzzle.successFlag)) {
        sendNotificationToUser(player.userId, {
            key: `puzzle-complete:${puzzle.id}`,
            message: '이미 해답을 밝혀낸 장치입니다.',
        });
        return true;
    }

    sessions.set(player.userId, {
        puzzleId: puzzle.id,
        locationId: player.locationId,
        expiresAt: Date.now() + (puzzle.sessionDuration ?? 120) * 1_000,
    });
    const message = chat()
        .color('gold', builder => builder.weight('bold', nested => nested.text(`[ ${puzzle.title} ]`)))
        .text(`\n${puzzle.prompt}\n`);
    if (puzzle.choices?.length) {
        for (const choice of puzzle.choices) {
            message.button(`/퍼즐답 ${choice.answer}`, builder => builder.text(choice.label), true).text(' ');
        }
    } else {
        message.color('gray', builder => builder.text('/퍼즐답 <정답>'));
    }
    sendBotMessageToUser(player.userId, message.build());
    return true;
}

export function submitQuestionPuzzle(player: Player, answer: string, now = Date.now()): PuzzleAnswerResult {
    const session = sessions.get(player.userId);
    if (!session) return 'none';
    if (session.locationId !== player.locationId || session.expiresAt < now) {
        sessions.delete(player.userId);
        return 'expired';
    }
    const puzzle = questionPuzzles.get(session.puzzleId);
    if (!puzzle) {
        sessions.delete(player.userId);
        return 'none';
    }
    if (!isCorrectPuzzleAnswer(puzzle, answer)) {
        sendNotificationToUser(player.userId, {
            key: `puzzle-wrong:${puzzle.id}`,
            message: puzzle.failureMessage ?? '아무 반응도 일어나지 않습니다.',
        });
        return 'incorrect';
    }

    sessions.delete(player.userId);
    player.progress.setFlag(puzzle.successFlag);
    sendBotMessageToUser(player.userId, chat()
        .color('aqua', builder => builder.weight('bold', nested => nested.text('해답을 밝혀냈습니다.')))
        .text(`\n${puzzle.successMessage}`)
        .build());
    sendNotificationToUser(player.userId, {
        key: `puzzle-solved:${puzzle.id}`,
        message: '잠겨 있던 길이 열렸습니다.',
    });
    return 'correct';
}

export function activateTeleportArtifact(player: Player, artifactId: string): boolean {
    const artifact = teleportArtifacts.get(normalizeId(artifactId));
    if (!artifact) return false;
    const targetId = artifact.destinations[player.locationId];
    const target = targetId ? getLocation(targetId) : undefined;
    if (!target) {
        sendNotificationToUser(player.userId, {
            key: `artifact-dormant:${artifact.id}`,
            message: '유물은 희미하게 떨릴 뿐 반응하지 않습니다.',
        });
        return true;
    }
    player.moving = false;
    player.locationId = target.id;
    sendBotMessageToUser(player.userId, chat()
        .color('purple', builder => builder.weight('bold', nested => nested.text('[ 공간 전이 ]')))
        .text(`\n${artifact.activationMessage}\n${target.data.name}에 도착했습니다.`)
        .build());
    return true;
}

export function clearDungeonPuzzleSession(userId: number): void {
    sessions.delete(userId);
}

export function isCorrectPuzzleAnswer(puzzle: Pick<QuestionPuzzleData, 'answers'>, answer: string): boolean {
    const normalized = normalizeAnswer(answer);
    return normalized.length > 0 && puzzle.answers.some(candidate => normalizeAnswer(candidate) === normalized);
}

function normalizeAnswer(value: string): string {
    return value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[\s\p{P}\p{S}]+/gu, '');
}

function normalizeId(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9:_/-]*$/.test(normalized)) throw new Error(`Invalid puzzle id: ${value}`);
    return normalized;
}
