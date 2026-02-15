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
    | { type: 'icon'; name: string }
    | { type: 'button'; action: string; children: ChatNode[] }

// 채팅 메시지
export interface ChatMessage {
    userId: number
    nickname: string
    content: string
    timestamp: number
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
}

export interface ClientToServerEvents {
    login: (data: LoginRequest) => void
    register: (data: RegisterRequest) => void
    logout: (token: string) => void
    sendVerifyCode: (email: string) => void
    verifyCode: (code: string) => void
    sendMessage: (content: string) => void
    requestChatHistory: () => void
}
