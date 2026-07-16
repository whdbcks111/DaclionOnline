import { AsyncLocalStorage } from 'node:async_hooks';

interface InformationCommandContext { userId: number; isPublic: boolean }

const publicModeUsers = new Set<number>();
const informationCommandContext = new AsyncLocalStorage<InformationCommandContext>();

/** 정보 열람 결과의 기본 공개 여부를 설정한다. 기본값은 비공개다. */
export function setInformationPublicMode(userId: number, isPublic: boolean): void {
    if (isPublic) publicModeUsers.add(userId);
    else publicModeUsers.delete(userId);
}

export function isInformationPublicMode(userId: number): boolean {
    return publicModeUsers.has(userId);
}

export function clearInformationMode(userId: number): void {
    publicModeUsers.delete(userId);
}

/** async handler의 await 이후까지 정보 명령 출력 문맥을 유지한다. */
export function runInformationCommand<T>(userId: number, callback: () => T, isPublic = isInformationPublicMode(userId)): T {
    return informationCommandContext.run({ userId, isPublic }, callback);
}

/** sendBotMessageToUser가 현재 정보 명령의 공개 결과인지 판단할 때 사용한다. */
export function shouldPublishInformationOutput(userId: number): boolean {
    const context = informationCommandContext.getStore();
    return context?.userId === userId && context.isPublic;
}
