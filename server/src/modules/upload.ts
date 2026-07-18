import fs from 'node:fs'
import { promises as fsPromises } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { Router } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import prisma from '../config/prisma.js'
import logger from '../utils/logger.js'
import { getSession } from './login.js'

const PROFILE_IMAGE_DIR = path.join(process.cwd(), 'uploads', 'profiles')
const CHAT_IMAGE_DIR = path.join(process.cwd(), 'uploads', 'chat')
const CHAT_IMAGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const CHAT_IMAGE_MAX_FILES = 100
const CHAT_IMAGE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000

fs.mkdirSync(PROFILE_IMAGE_DIR, { recursive: true })
fs.mkdirSync(CHAT_IMAGE_DIR, { recursive: true })

function parseCookie(cookie: string, name: string): string | undefined {
    const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
    return match?.[1]
}

function getRequestSession(req: Request) {
    const token = req.headers.cookie ? parseCookie(req.headers.cookie, 'sessionToken') : undefined
    return token ? getSession(token) : undefined
}

const PROFILE_MIME_TO_EXT: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
}

const PROFILE_MAGIC_SIGNATURES = [
    Buffer.from([0xff, 0xd8, 0xff]),
    Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    Buffer.from([0x47, 0x49, 0x46, 0x38]),
    Buffer.from([0x52, 0x49, 0x46, 0x46]),
]

function hasValidProfileMagicBytes(buffer: Buffer): boolean {
    return PROFILE_MAGIC_SIGNATURES.some(signature => buffer.subarray(0, signature.length).equals(signature))
}

const profileUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
        if (file.mimetype in PROFILE_MIME_TO_EXT) callback(null, true)
        else callback(new Error('JPEG, PNG, GIF, WebP 이미지만 업로드할 수 있습니다.'))
    },
})

const chatImageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
        if (file.mimetype.startsWith('image/')) callback(null, true)
        else callback(new Error('이미지 파일만 업로드할 수 있습니다.'))
    },
})

export interface StoredChatImageInfo {
    filename: string
    userId: number
    createdAt: number
}

export function parseStoredChatImageFilename(filename: string): StoredChatImageInfo | undefined {
    const match = /^(\d+)-(\d+)-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.webp$/.exec(filename)
    if (!match) return undefined
    const userId = Number(match[1])
    const createdAt = Number(match[2])
    if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(createdAt)) return undefined
    return { filename, userId, createdAt }
}

/** 7일이 지났거나 전체 최신 100장을 벗어난 파일을 선택한다. */
export function selectChatImagesToDelete(filenames: readonly string[], now = Date.now()): string[] {
    const expired = new Set<string>()
    const active: StoredChatImageInfo[] = []
    for (const filename of filenames) {
        const info = parseStoredChatImageFilename(filename)
        if (!info) continue
        if (now - info.createdAt >= CHAT_IMAGE_MAX_AGE_MS) {
            expired.add(filename)
            continue
        }
        active.push(info)
    }
    active.sort((left, right) => right.createdAt - left.createdAt || right.filename.localeCompare(left.filename))
    for (const image of active.slice(CHAT_IMAGE_MAX_FILES)) expired.add(image.filename)
    return [...expired]
}

export async function cleanupChatImages(now = Date.now()): Promise<number> {
    const entries = await fsPromises.readdir(CHAT_IMAGE_DIR, { withFileTypes: true }).catch(() => [])
    const filenames = entries.filter(entry => entry.isFile()).map(entry => entry.name)
    const targets = selectChatImagesToDelete(filenames, now)
    await Promise.all(targets.map(filename => fsPromises.unlink(path.join(CHAT_IMAGE_DIR, filename)).catch(() => undefined)))
    return targets.length
}

export function initUploadMaintenance(): void {
    void cleanupChatImages().catch(error => logger.error('채팅 이미지 초기 정리 실패', error))
    const timer = setInterval(() => {
        void cleanupChatImages().catch(error => logger.error('채팅 이미지 주기 정리 실패', error))
    }, CHAT_IMAGE_CLEANUP_INTERVAL_MS)
    timer.unref()
}

export interface OwnedChatImageSnapshot {
    url: string
    width: number
    height: number
}

/** 소켓이 업로드 소유권·보관 기간과 표시 치수를 검증한 뒤 메시지 snapshot으로 사용한다. */
export async function getOwnedChatImage(userId: number, filename: string): Promise<OwnedChatImageSnapshot | undefined> {
    if (path.basename(filename) !== filename) return undefined
    const info = parseStoredChatImageFilename(filename)
    if (!info || info.userId !== userId || Date.now() - info.createdAt >= CHAT_IMAGE_MAX_AGE_MS) return undefined
    const filePath = path.join(CHAT_IMAGE_DIR, filename)
    const stat = await fsPromises.stat(filePath).catch(() => undefined)
    if (!stat?.isFile()) return undefined
    const metadata = await sharp(filePath, { animated: true }).metadata().catch(() => undefined)
    const width = metadata?.width
    const height = metadata?.pageHeight ?? metadata?.height
    if (!width || !height) return undefined
    return { url: `/uploads/chat/${filename}`, width, height }
}

export async function encodeChatImage(buffer: Buffer): Promise<Buffer> {
    const image = sharp(buffer, {
        animated: true,
        failOn: 'error',
        limitInputPixels: 40_000_000,
    })
    const metadata = await image.metadata()
    if (!metadata.width || !metadata.height || !metadata.format) throw new Error('이미지 정보를 읽을 수 없습니다.')
    return image
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78, effort: 4 })
        .toBuffer()
}

export const uploadRouter = Router()

uploadRouter.post('/profile-image', profileUpload.single('image'), async (req, res) => {
    const session = getRequestSession(req)
    if (!session || !req.file) {
        res.status(400).json({ error: '인증 실패 또는 파일 없음' })
        return
    }
    if (!hasValidProfileMagicBytes(req.file.buffer)) {
        res.status(400).json({ error: '유효하지 않은 이미지 파일입니다.' })
        return
    }
    const ext = PROFILE_MIME_TO_EXT[req.file.mimetype] ?? '.jpg'
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`
    fs.writeFileSync(path.join(PROFILE_IMAGE_DIR, filename), req.file.buffer)
    await prisma.user.update({
        where: { id: session.userId },
        data: { profileImage: filename },
    })
    session.profileImage = filename
    res.json({ ok: true, profileImage: filename })
})

uploadRouter.post('/chat-image', chatImageUpload.single('image'), async (req, res) => {
    const session = getRequestSession(req)
    if (!session || !req.file) {
        res.status(400).json({ error: '인증 실패 또는 파일 없음' })
        return
    }
    try {
        const encoded = await encodeChatImage(req.file.buffer)
        const filename = `${session.userId}-${Date.now()}-${randomUUID()}.webp`
        await fsPromises.writeFile(path.join(CHAT_IMAGE_DIR, filename), encoded, { flag: 'wx' })
        await cleanupChatImages()
        res.json({ ok: true, filename, url: `/uploads/chat/${filename}` })
    } catch (error) {
        logger.warn('채팅 이미지 변환 실패', error)
        res.status(400).json({ error: '지원하지 않거나 손상된 이미지입니다.' })
    }
})

uploadRouter.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
        ? '이미지 파일 크기 제한을 초과했습니다.'
        : error instanceof Error ? error.message : '이미지 업로드에 실패했습니다.'
    res.status(400).json({ error: message })
})
