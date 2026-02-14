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

// 소켓 이벤트 맵
export interface ServerToClientEvents {
    sessionRestore: (data: SessionRestoreData) => void
    sessionInvalid: () => void
    loginResult: (result: LoginResult) => void
    registerResult: (result: RegisterResult) => void
    logoutResult: (result: LogoutResult) => void
    verifyCodeSendResult: (result: SimpleResult) => void
    verifyCodeResult: (result: SimpleResult) => void
}

export interface ClientToServerEvents {
    login: (data: LoginRequest) => void
    register: (data: RegisterRequest) => void
    logout: (token: string) => void
    sendVerifyCode: (email: string) => void
    verifyCode: (code: string) => void
}
