// 서버-클라이언트 공통 타입 정의

// 소켓 이벤트 데이터 타입
export interface SessionRestoreData {
    username: string
    nickname: string
}

export interface LoginRequest {
    id: string
    pw: string
}

export interface LoginResult {
    ok?: boolean
    sessionToken?: string
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
    | { type: 'size'; size: string; children: ChatNode[] }
    | { type: 'hide'; title: string; children: ChatNode[] }
    | { type: 'icon'; name: string }
    | { type: 'button'; action: string; children: ChatNode[] }

// 채팅 플래그 (닉네임 옆 배지)
export interface ChatFlag {
    text: string
    color: string
}

// 채팅 메시지
export interface ChatMessage {
    userId: number
    nickname: string
    profileImage?: string
    flags?: ChatFlag[]
    content: string | ChatNode[]
    timestamp: number
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

// 알림
export interface NotificationData {
    key: string
    message: string | ChatNode[]
    length?: number
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
}

export interface ClientToServerEvents {
    login: (data: LoginRequest) => void
    register: (data: RegisterRequest) => void
    logout: (token: string) => void
    sendVerifyCode: (email: string) => void
    verifyCode: (code: string) => void
    sendMessage: (content: string) => void
    requestChatHistory: () => void
    requestCommandList: () => void
}
