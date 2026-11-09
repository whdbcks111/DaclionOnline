import prisma from '../../config/prisma.js';
import { validateNickname } from '../../utils/validators.js';

export const DACLION_GAME_ID = 'daclion';

export interface DaclionProfile {
    readonly userId: number;
    readonly nickname: string;
    readonly nicknameChangedAt: Date | null;
}
const profileFields = { userId: true, nickname: true, nicknameChangedAt: true } as const;

/** 게임은 계정 테이블 대신 이 목적형 API로 연결 프로필을 조회한다. */
export async function getDaclionProfile(userId: number): Promise<DaclionProfile | null> {
    return prisma.gameProfile.findUnique({ where: { userId_gameId: { userId, gameId: DACLION_GAME_ID } }, select: profileFields });
}

/** 캐릭터 이름의 소유권은 게임별로 분리한다. 생성은 unique 제약으로 다중 탭에서도 한 번만 확정한다. */
export async function createDaclionProfile(userId: number, input: unknown): Promise<DaclionProfile> {
    const nickname = typeof input === 'string' ? input.trim() : '';
    const error = validateNickname(nickname);
    if (error) throw new Error(error);
    return prisma.gameProfile.create({ data: { userId, gameId: DACLION_GAME_ID, nickname }, select: profileFields });
}

export async function changeDaclionNickname(userId: number, nickname: string, changedAt: Date, cooldownMs: number) {
    return prisma.gameProfile.updateMany({
        where: {
            userId, gameId: DACLION_GAME_ID,
            ...(cooldownMs > 0 ? { OR: [
                { nicknameChangedAt: null },
                { nicknameChangedAt: { lte: new Date(changedAt.getTime() - cooldownMs) } },
            ] } : {}),
        },
        data: { nickname, nicknameChangedAt: changedAt },
    });
}

/** 순위·운영 목록에 필요한 이름을 한 번에 읽되 프로필 row/Map을 외부에 노출하지 않는다. */
export async function loadDaclionNames(userIds: readonly number[]) {
    const profiles = await prisma.gameProfile.findMany({
        where: { gameId: DACLION_GAME_ID, userId: { in: [...userIds] } },
        select: { userId: true, nickname: true },
    });
    const names = new Map(profiles.map(profile => [profile.userId, profile.nickname]));
    return { getNickname: (userId: number): string | undefined => names.get(userId) };
}
