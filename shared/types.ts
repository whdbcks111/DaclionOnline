// 서버-클라이언트 공통 타입 정의

// 소켓 이벤트 데이터 타입
export interface SessionRestoreData {
    userId: number
    username: string
    nickname: string
    profileImage?: string
}

export interface LoginRequest {
    id: string
    pw: string
}

export interface LoginResult {
    ok?: boolean
    userId?: number
    sessionToken?: string
    nickname?: string
    profileImage?: string
    error?: string
}

export interface RegisterRequest {
    id: string
    pw: string
    email: string
    nickname: string
}

export interface RegisterResult {
    ok?: boolean
    sessionToken?: string
    error?: string
    needVerify?: boolean
}

export interface LogoutResult {
    ok: boolean
}

export interface SimpleResult {
    ok?: boolean
    error?: string
}

// 채팅 노드 타입 (커스텀 문법 파싱 결과)
export type ChatNode =
    | { type: 'text'; text: string }
    | { type: 'color'; color: string; children: ChatNode[] }
    | { type: 'bg'; color: string; children: ChatNode[] }
    | { type: 'deco'; decoration: string; children: ChatNode[] }
    | { type: 'weight'; weight: string; children: ChatNode[] }
    | { type: 'size'; size: string; children: ChatNode[] }
    | { type: 'hide'; title: string; children: ChatNode[] }
    | { type: 'icon'; name: string }
    | { type: 'button'; action: string; children: ChatNode[]; closeOnClick?: boolean; showCommand?: boolean }
    | { type: 'progress'; value: number; length: number; color: string; thickness: number; shape: 'rounded' | 'square' }
    | { type: 'tab'; width: number; children: ChatNode[] }

// 채팅 플래그 (닉네임 옆 배지)
export interface ChatFlag {
    text: string
    color: string
}

// 채팅 메시지
export interface ChatMessage {
    id?: string
    userId: number
    nickname: string
    profileImage?: string
    flags?: ChatFlag[]
    content: string | ChatNode[]
    timestamp: number
    private?: boolean
}

// 명령어 정보 (자동완성용)
export interface CommandArgInfo {
    name: string
    description: string
    required?: boolean
}

export interface CommandInfo {
    name: string
    aliases?: string[]
    description: string
    args?: CommandArgInfo[]
}

// 채널 정보
export interface ChannelInfo {
    id: string | null
    name: string
    description?: string
}

// 온라인 유저 수 데이터
export interface UserCountData {
    total: number
    channelCounts: Record<string, number>  // room key (e.g. 'channel:main') → 인원수
}

// 엔티티 HP 바 정보 (위치 HUD용)
export interface EntityBarInfo {
    name: string
    level: number
    life: number
    maxLife: number
    userId?: number  // 플레이어만 존재
}

// 위치 정보 HUD 데이터
export interface LocationInfoData {
    locationId: string
    name: string
    x: number
    y: number
    z: number
    monsters: EntityBarInfo[]
    players: EntityBarInfo[]
}

// 플레이어 HUD 데이터
export interface PlayerStatsData {
    userId: number
    nickname: string
    life: number
    maxLife: number
    mentality: number
    maxMentality: number
    thirsty: number
    maxThirsty: number
    hungry: number
    maxHungry: number
    attackCooldown: number
    maxAttackCooldown: number
}

// 알림
export interface NotificationData {
    key: string
    message: string | ChatNode[]
    length?: number
    showProgress?: boolean
    editExists?: boolean
}

// 소켓 이벤트 맵
export interface ServerToClientEvents {
    sessionRestore: (data: SessionRestoreData) => void
    sessionInvalid: () => void
    loginResult: (result: LoginResult) => void
    registerResult: (result: RegisterResult) => void
    logoutResult: (result: LogoutResult) => void
    verifyCodeSendResult: (result: SimpleResult) => void
    verifyCodeResult: (result: SimpleResult) => void
    chatHistory: (messages: ChatMessage[]) => void
    chatMessage: (msg: ChatMessage) => void
    notification: (data: NotificationData) => void
    commandList: (commands: CommandInfo[]) => void
    playerStats: (data: PlayerStatsData) => void
    locationInfo: (data: LocationInfoData) => void
    userCount: (data: UserCountData) => void
    channelChanged: (channel: string | null, history: ChatMessage[]) => void
    channelList: (channels: ChannelInfo[]) => void
    nicknameResult: (result: SimpleResult & { nickname?: string }) => void
    editMessage: (id: string, content: ChatMessage['content']) => void
    deleteMessage: (id: string) => void
}

export interface ClientToServerEvents {
    login: (data: LoginRequest) => void
    register: (data: RegisterRequest) => void
    logout: (token: string) => void
    sendVerifyCode: (email: string) => void
    verifyCode: (code: string) => void
    sendMessage: (content: string) => void
    chatButtonClick: (payload: { action: string; showCommand?: boolean }) => void
    requestChatHistory: () => void
    requestCommandList: () => void
    requestUserCount: () => void
    joinChannel: (channel: string | null) => void
    requestChannelList: () => void
    changeNickname: (nickname: string) => void
    requestLocationInfo: () => void
}
