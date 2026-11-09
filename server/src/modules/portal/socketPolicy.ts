/** 포털 연결로 게임 명령이나 관리자 이벤트를 실행하지 못하게 하는 공통 입장 경계. */
const PORTAL_EVENTS = new Set([
    'login', 'logout', 'register', 'sendVerifyCode', 'verifyCode',
    'sendPasswordResetCode', 'resetPassword', 'clientPresence',
    'seedWalkJoin', 'seedWalkInput', 'seedWalkLeave', 'seedWalkChat',
    'enterGame', 'leaveGame', 'requestUserCount',
]);

export function canUseSocketEvent(event: string, gameActive: boolean): boolean {
    return gameActive || PORTAL_EVENTS.has(event);
}
