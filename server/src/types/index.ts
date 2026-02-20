// 서버 전용 타입 정의

export interface Session {
    userId: number
    username: string
    nickname: string
    profileImage?: string
    permission: number
}

export interface MailOptions {
    to: string
    subject: string
    html: string
}

export interface VerifyEntry {
    code: string
    expirationDate: Date
    sentAt: Date
    verified?: true
}
