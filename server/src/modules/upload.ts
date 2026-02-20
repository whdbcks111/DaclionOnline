import multer from 'multer'
import fs from 'fs'
import { Router } from 'express'
import prisma from '../config/prisma.js'
import { getSession } from './login.js'

function parseCookie(cookie: string, name: string): string | undefined {
    const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
    return match?.[1]
}

// 허용된 MIME 타입만 화이트리스트로 관리
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

// MIME 타입 → 확장자 매핑 (originalname 확장자는 절대 사용하지 않음)
const MIME_TO_EXT: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
}

// 각 이미지 포맷의 Magic bytes (파일 실제 내용 검증)
const MAGIC_SIGNATURES = [
    Buffer.from([0xff, 0xd8, 0xff]),              // JPEG
    Buffer.from([0x89, 0x50, 0x4e, 0x47]),        // PNG
    Buffer.from([0x47, 0x49, 0x46, 0x38]),        // GIF
    Buffer.from([0x52, 0x49, 0x46, 0x46]),        // WEBP (RIFF 헤더)
]

function hasValidMagicBytes(buf: Buffer): boolean {
    return MAGIC_SIGNATURES.some((sig) => buf.subarray(0, sig.length).equals(sig))
}

// 메모리에 올린 뒤 검증 → 통과하면 직접 디스크에 저장
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME_TYPES.has(file.mimetype)) cb(null, true)
        else cb(new Error('이미지 파일만 업로드 가능합니다.'))
    },
})

export const uploadRouter = Router()

uploadRouter.post('/profile-image', upload.single('image'), async (req, res) => {
    const cookieHeader = req.headers.cookie
    const token = cookieHeader ? parseCookie(cookieHeader, 'sessionToken') : undefined
    const session = token ? getSession(token) : undefined

    if (!session || !req.file) {
        res.status(400).json({ error: '인증 실패 또는 파일 없음' })
        return
    }

    // Magic bytes로 실제 파일 내용 검증 (디스크 저장 전, 메모리에서 검증)
    if (!hasValidMagicBytes(req.file.buffer)) {
        res.status(400).json({ error: '유효하지 않은 이미지 파일입니다.' })
        return
    }

    // 검증 통과 후 디스크에 저장
    const ext = MIME_TO_EXT[req.file.mimetype] ?? '.jpg'
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`
    fs.writeFileSync(`uploads/profiles/${filename}`, req.file.buffer)

    await prisma.user.update({
        where: { id: session.userId },
        data: { profileImage: filename },
    })
    session.profileImage = filename
    res.json({ ok: true, profileImage: filename })
})
