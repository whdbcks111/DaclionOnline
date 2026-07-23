import { pathToFileURL } from 'node:url';
import path from 'node:path';
import prisma from '../config/prisma.js';

export const GAME_DATA_RESET_CONFIRMATION = 'RESET-DACLION-GAME-DATA';

export interface GameDataResetArguments {
    readonly execute: boolean;
}

export interface GameDataCounts {
    readonly users: number;
    readonly players: number;
    readonly items: number;
    readonly equipments: number;
    readonly progress: number;
    readonly skills: number;
    readonly quests: number;
}

interface CountDelegate {
    count(): Promise<number>;
}

interface GameDataCountClient {
    readonly user: CountDelegate;
    readonly player: CountDelegate;
    readonly item: CountDelegate;
    readonly equipment: CountDelegate;
    readonly playerProgress: CountDelegate;
    readonly playerSkill: CountDelegate;
    readonly playerQuest: CountDelegate;
}

export function parseGameDataResetArguments(args: readonly string[]): GameDataResetArguments {
    let confirmation = '';
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === '--dry-run') continue;
        if (arg === '--confirm') {
            confirmation = args[++index] ?? '';
            continue;
        }
        if (arg.startsWith('--confirm=')) {
            confirmation = arg.slice('--confirm='.length);
            continue;
        }
        throw new Error(`알 수 없는 인자입니다: ${arg}`);
    }
    if (confirmation && confirmation !== GAME_DATA_RESET_CONFIRMATION) {
        throw new Error('운영 데이터 초기화 확인 문자열이 일치하지 않습니다.');
    }
    return { execute: confirmation === GAME_DATA_RESET_CONFIRMATION };
}

export async function countGameData(client: GameDataCountClient): Promise<GameDataCounts> {
    const [users, players, items, equipments, progress, skills, quests] = await Promise.all([
        client.user.count(),
        client.player.count(),
        client.item.count(),
        client.equipment.count(),
        client.playerProgress.count(),
        client.playerSkill.count(),
        client.playerQuest.count(),
    ]);
    return { users, players, items, equipments, progress, skills, quests };
}

async function resetGameData(): Promise<void> {
    const options = parseGameDataResetArguments(process.argv.slice(2));
    const before = await countGameData(prisma);

    console.log('[ 운영 게임 데이터 초기화 대상 ]');
    console.table(before);
    console.log('보존: users 전체 행(계정 ID, 로그인 정보, 닉네임, 프로필, 권한, 생성 시각)');

    if (!options.execute) {
        console.log('');
        console.log('DRY RUN: 데이터는 변경되지 않았습니다.');
        console.log('서버를 중지한 뒤 실제 실행:');
        console.log(`npm run db:reset:game -- --confirm ${GAME_DATA_RESET_CONFIRMATION}`);
        return;
    }

    console.log('');
    console.log('확인 문자열 검증 완료. 트랜잭션으로 Player와 모든 하위 게임 데이터를 삭제합니다.');
    const deletedPlayers = await prisma.$transaction(async transaction => {
        const usersBefore = await transaction.user.count();
        const deleted = await transaction.player.deleteMany();
        const after = await countGameData(transaction);
        if (after.users !== usersBefore) throw new Error('계정 행 개수가 변경되어 초기화를 취소합니다.');
        if (after.players !== 0 || after.items !== 0 || after.equipments !== 0
            || after.progress !== 0 || after.skills !== 0 || after.quests !== 0) {
            throw new Error('일부 게임 데이터가 남아 있어 초기화를 취소합니다.');
        }
        return deleted.count;
    });

    const after = await countGameData(prisma);
    console.log(`초기화 완료: Player ${deletedPlayers}명과 cascade 하위 데이터를 삭제했습니다.`);
    console.table(after);
    console.log('다음 로그인 시 각 계정에 새 Player, 첫 모험 튜토리얼과 🌱 표시가 생성됩니다.');
}

function isMainModule(): boolean {
    const entry = process.argv[1];
    return Boolean(entry && import.meta.url === pathToFileURL(path.resolve(entry)).href);
}

if (isMainModule()) {
    resetGameData()
        .catch(error => {
            console.error('[ 운영 게임 데이터 초기화 실패 ]', error);
            process.exitCode = 1;
        })
        .finally(() => prisma.$disconnect());
}
