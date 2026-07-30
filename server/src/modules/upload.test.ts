import assert from 'node:assert/strict'
import test from 'node:test'
import { Readable } from 'node:stream'
import multer from 'multer'
import sharp from 'sharp'
import {
    encodeChatImage,
    encodeProfileImage,
    getUploadErrorMessage,
    parseStoredChatImageFilename,
    SINGLE_FILE_MULTIPART_LIMITS,
    selectChatImagesToDelete,
} from './upload.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = 2_000_000_000_000

function filename(userId: number, createdAt: number, index: number): string {
    return `${userId}-${createdAt}-00000000-0000-4000-8000-${String(index).padStart(12, '0')}.webp`
}

async function parseSingleImageMultipart(): Promise<Express.Multer.File | undefined> {
    const boundary = 'daclion-upload-test'
    const body = Buffer.from([
        `--${boundary}`,
        'Content-Disposition: form-data; name="image"; filename="test.png"',
        'Content-Type: image/png',
        '',
        'test-image-body',
        `--${boundary}--`,
        '',
    ].join('\r\n'))
    const request = Readable.from([body]) as Readable & {
        headers: Record<string, string>
        method: string
        url: string
        file?: Express.Multer.File
    }
    request.headers = {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'content-length': String(body.length),
    }
    request.method = 'POST'
    request.url = '/'

    await new Promise<void>((resolve, reject) => {
        multer({
            storage: multer.memoryStorage(),
            limits: SINGLE_FILE_MULTIPART_LIMITS,
        }).single('image')(request as never, {} as never, error => error ? reject(error) : resolve())
    })
    return request.file
}

test('단일 이미지 multipart는 parts 한도에 걸리지 않고 파싱된다', async () => {
    const file = await parseSingleImageMultipart()
    assert.equal(file?.fieldname, 'image')
    assert.equal(file?.buffer.toString(), 'test-image-body')
    assert.equal(
        getUploadErrorMessage(new multer.MulterError('LIMIT_PART_COUNT')),
        '한 요청에는 이미지 파일 하나만 업로드할 수 있습니다.',
    )
})

test('채팅 이미지 파일명은 소유 사용자와 생성 시각을 복원하고 경로 입력을 거부한다', () => {
    const stored = filename(17, NOW, 1)
    assert.deepEqual(parseStoredChatImageFilename(stored), { filename: stored, userId: 17, createdAt: NOW })
    assert.equal(parseStoredChatImageFilename(`../${stored}`), undefined)
    assert.equal(parseStoredChatImageFilename('17-invalid.webp'), undefined)
})

test('채팅 이미지는 전체 최신 100장과 생성 후 7일까지만 유지한다', () => {
    const images = Array.from({ length: 102 }, (_, index) => filename(index % 2 + 1, NOW - index, index))
    const expired = filename(2, NOW - 7 * DAY, 999)
    const deleted = new Set(selectChatImagesToDelete([...images, expired], NOW))

    assert.equal(deleted.has(images[100]), true)
    assert.equal(deleted.has(images[101]), true)
    assert.equal(deleted.has(images[99]), false)
    assert.equal(deleted.has(expired), true)
    assert.equal(deleted.size, 3)
})

test('채팅 이미지는 원본 형식과 무관하게 보통 화질 WebP로 재인코딩한다', async () => {
    const input = await sharp({
        create: { width: 4, height: 3, channels: 4, background: { r: 50, g: 100, b: 150, alpha: 1 } },
    }).png().toBuffer()
    const output = await encodeChatImage(input)
    const metadata = await sharp(output).metadata()

    assert.equal(metadata.format, 'webp')
    assert.equal(metadata.width, 4)
    assert.equal(metadata.height, 3)
    await assert.rejects(() => encodeChatImage(Buffer.from('not an image')))
})

test('프로필 이미지는 서버가 제한된 크기의 WebP로 재인코딩한다', async () => {
    const input = await sharp({
        create: { width: 900, height: 600, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 1 } },
    }).png().toBuffer()
    const output = await encodeProfileImage(input)
    const metadata = await sharp(output).metadata()
    assert.equal(metadata.format, 'webp')
    assert.equal(metadata.width, 512)
    assert.equal(metadata.height, 512)
    await assert.rejects(() => encodeProfileImage(Buffer.from('not an image')))
})
