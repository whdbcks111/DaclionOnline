import 'dotenv/config';
import prisma from '../config/prisma.js';

/** 스키마 적용 후 누락된 기존 캐릭터 연결만 복구한다. 기존 프로필은 덮어쓰지 않는다. */
try {
    const missing = await prisma.user.count({ where: {
        player: { isNot: null }, gameProfiles: { none: { gameId: 'daclion' } },
    } });
    if (process.argv.includes('--dry-run')) {
        console.log(`포털 연결이 필요한 기존 캐릭터: ${missing}`);
    } else {
        const inserted = await prisma.$executeRaw`
            INSERT INTO game_profiles (user_id, game_id, nickname, nickname_changed_at, created_at, updated_at)
            SELECT u.id, 'daclion', u.nickname, u.nickname_changed_at, p.created_at, CURRENT_TIMESTAMP(3)
            FROM users u INNER JOIN players p ON p.user_id = u.id
            WHERE NOT EXISTS (SELECT 1 FROM game_profiles gp WHERE gp.user_id = u.id AND gp.game_id = 'daclion')
        `;
        console.log(`기존 캐릭터 포털 연결 완료: ${inserted}`);
    }
} finally {
    await prisma.$disconnect();
}
