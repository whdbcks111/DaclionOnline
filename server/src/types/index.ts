// 서버 전용 타입 정의

export interface Session {
    userId: number
    username: string
    nickname: string
    profileImage?: string
}

export interface MailOptions {
    to: string
    subject: string
    html: string
}

export interface VerifyEntry {
    code: string
    expirationDate: Date
    verified?: true
}
