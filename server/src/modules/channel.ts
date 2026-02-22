import type { ChatMessage, ChannelInfo } from "../../../shared/types.js";

const MAX_CHANNEL_HISTORY = 100;

/** 미리 정의된 채널 목록 */
const CHANNELS: ChannelInfo[] = [
    { id: null, name: '메인', description: '기본 채팅 채널' },
    { id: '공지', name: '공지', description: '공지사항 채널' },
    { id: '잡담', name: '잡담', description: '자유로운 잡담' },
    { id: '거래', name: '거래', description: '아이템 거래' },
    { id: '파티', name: '파티', description: '파티원 모집' },
];

/** 채널별 공개 메시지 히스토리 (null = 메인 채널) */
const channelHistories = new Map<string | null, ChatMessage[]>();

/** 채널별 필터 히스토리 (특정 유저에게만 보이는 메시지) */
interface FilteredHistoryEntry {
    filter: (userId: number) => boolean;
    msg: ChatMessage;
}
const MAX_FILTERED_HISTORY = 200;
const filteredChannelHistories = new Map<string | null, FilteredHistoryEntry[]>();

/** 유저별 현재 채널 (userId → channel, 기본값 null = 메인 채널) */
const userChannels = new Map<number, string | null>();

/** 사용 가능한 채널 목록 반환 */
export function getAvailableChannels(): ChannelInfo[] {
    return CHANNELS;
}

/** Socket.io room 이름 변환 */
export function getChannelRoomKey(channel: string | null): string {
    return channel === null ? 'channel:main' : `channel:${channel}`;
}

/** 유저의 현재 채널 반환 (미설정 시 null = 메인 채널) */
export function getUserChannel(userId: number): string | null {
    return userChannels.get(userId) ?? null;
}

/** 유저의 채널 설정 */
export function setUserChannel(userId: number, channel: string | null): void {
    userChannels.set(userId, channel);
}

/** 채널의 메시지 히스토리 반환 */
export function getChannelHistory(channel: string | null): ChatMessage[] {
    return channelHistories.get(channel) ?? [];
}

/** 채널 히스토리에 메시지 추가 */
export function addToChannelHistory(channel: string | null, msg: ChatMessage): void {
    if (!channelHistories.has(channel)) {
        channelHistories.set(channel, []);
    }
    const history = channelHistories.get(channel)!;
    history.push(msg);
    if (history.length > MAX_CHANNEL_HISTORY) {
        history.shift();
    }
}

/** 모든 채널 히스토리에 메시지 추가 (브로드캐스트용)
 *  CHANNELS 사전 정의 목록 + 런타임에 생성된 채널 모두 포함 */
export function addToAllChannelHistories(msg: ChatMessage): void {
    const ids = new Set<string | null>(CHANNELS.map(ch => ch.id));
    for (const key of channelHistories.keys()) ids.add(key);
    for (const id of ids) addToChannelHistory(id, msg);
}

/** 채널 필터 히스토리에 메시지 추가 */
export function addToFilteredChannelHistory(channel: string | null, filter: (userId: number) => boolean, msg: ChatMessage): void {
    if (!filteredChannelHistories.has(channel)) {
        filteredChannelHistories.set(channel, []);
    }
    const history = filteredChannelHistories.get(channel)!;
    history.push({ filter, msg });
    if (history.length > MAX_FILTERED_HISTORY) {
        history.shift();
    }
}

/** 해당 채널에서 특정 유저가 받아야 할 필터 히스토리 반환 */
export function getFilteredHistoryForUser(userId: number, channel: string | null): ChatMessage[] {
    return (filteredChannelHistories.get(channel) ?? [])
        .filter(entry => entry.filter(userId))
        .map(entry => entry.msg);
}

/** ID로 메시지 내용 수정 (공개/필터 히스토리 모두 탐색) */
export function editMessageInHistory(id: string, newContent: ChatMessage['content']): void {
    for (const history of channelHistories.values()) {
        const msg = history.find(m => m.id === id);
        if (msg) { msg.content = newContent; return; }
    }
    for (const history of filteredChannelHistories.values()) {
        const entry = history.find(e => e.msg.id === id);
        if (entry) { entry.msg.content = newContent; return; }
    }
}

/** ID로 메시지 삭제 (공개/필터 히스토리 모두 탐색) */
export function deleteMessageFromHistory(id: string): void {
    for (const history of channelHistories.values()) {
        const idx = history.findIndex(m => m.id === id);
        if (idx !== -1) { history.splice(idx, 1); return; }
    }
    for (const history of filteredChannelHistories.values()) {
        const idx = history.findIndex(e => e.msg.id === id);
        if (idx !== -1) { history.splice(idx, 1); return; }
    }
}
