import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import { encodeChatImage, parseStoredChatImageFilename, selectChatImagesToDelete } from './upload.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = 2_000_000_000_000

function filename(userId: number, createdAt: number, index: number): string {
    return `${userId}-${createdAt}-00000000-0000-4000-8000-${String(index).padStart(12, '0')}.webp`
}

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
