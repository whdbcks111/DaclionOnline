import multer from 'multer'
import path from 'path'
import { Router } from 'express'
import prisma from '../config/prisma.js'
import { getSession } from './login.js'

function parseCookie(cookie: string, name: string): string | undefined {
    const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
    return match?.[1]
}

const storage = multer.diskStorage({
    destination: 'uploads/profiles/',
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname)
        cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`)
    },
})

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true)
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

    const filename = req.file.filename
    await prisma.user.update({
        where: { id: session.userId },
        data: { profileImage: filename },
    })
    session.profileImage = filename
    res.json({ ok: true, profileImage: filename })
})
