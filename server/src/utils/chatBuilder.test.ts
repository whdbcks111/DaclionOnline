import assert from 'node:assert/strict'
import test from 'node:test'
import { chat } from './chatBuilder.js'

test('이미지와 제목 선택형 구분선은 재사용 가능한 ChatNode를 만든다', () => {
    assert.deepEqual(
        chat()
            .divider()
            .divider('능력치')
            .image({ src: '/uploads/chat/example.webp', alt: '예시' })
            .build(),
        [
            { type: 'divider', title: undefined },
            { type: 'divider', title: '능력치' },
            { type: 'image', src: '/uploads/chat/example.webp', alt: '예시', maxHeight: 'min(52vh, 32rem)' },
        ],
    )
})
