import { useState, useEffect, useCallback, useRef } from 'react'
import { useSocket } from '../context/SocketContext'
import { renderNode } from './chat/ChatMessage'
import type { ChatNode, NotificationData } from '@shared/types'
import styles from './Notification.module.scss'

interface NotificationItem extends NotificationData {
  id: number
  duration: number
  animKey: number
}

let nextId = 0

function Notification() {
  const { socket } = useSocket()
  const [items, setItems] = useState<NotificationItem[]>([])
  const timeoutMap = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const addNotification = useCallback((data: NotificationData) => {
    const duration = data.length ?? 5000
    const key = data.key

    // 기존 타이머 취소
    const existingTimeout = timeoutMap.current.get(key)
    if (existingTimeout !== undefined) clearTimeout(existingTimeout)
    timeoutMap.current.delete(key)

    setItems(prev => {
      const existingIdx = data.editExists ? prev.findIndex(item => item.key === key) : -1

      if (existingIdx !== -1) {
        // 제자리 업데이트 (animKey 증가 → 타이머 애니메이션 재시작)
        const existing = prev[existingIdx]
        const updated: NotificationItem = {
          ...existing,
          message: data.message,
          duration,
          showProgress: data.showProgress,
          animKey: existing.animKey + 1,
        }
        const next = [...prev]
        next[existingIdx] = updated
        return next
      }

      // 새로 추가 (같은 key 제거 후 끝에 삽입)
      const id = nextId++
      const newItem: NotificationItem = { ...data, id, duration, animKey: 0 }
      const filtered = prev.filter(item => item.key !== key)
      return [...filtered, newItem]
    })

    if (duration > 0) {
      const t = setTimeout(() => {
        setItems(p => p.filter(item => item.key !== key))
        timeoutMap.current.delete(key)
      }, duration)
      timeoutMap.current.set(key, t)
    }
  }, [])

  useEffect(() => {
    if (!socket) return

    socket.on('notification', addNotification)

    const onDisconnect = (reason: string) => {
      if (reason === 'io client disconnect') return
      addNotification({
        key: 'server-disconnect',
        message: '서버와의 연결이 끊어졌습니다. 잠시 후 새로고침 해주세요.',
        length: 0,
      })
    }

    const onReconnect = () => {
      setItems(prev => prev.filter(item => item.key !== 'server-disconnect'))
    }

    socket.on('disconnect', onDisconnect)
    socket.on('connect', onReconnect)

    return () => {
      socket.off('notification', addNotification)
      socket.off('disconnect', onDisconnect)
      socket.off('connect', onReconnect)
    }
  }, [socket, addNotification])

  if (items.length === 0) return null

  return (
    <div className={styles.container}>
      {items.map(item => {
        const showProgress = item.showProgress !== false && item.duration > 0
        return (
          <div key={item.id} className={styles.item}>
            <div className={styles.content}>
              {(typeof item.message === 'string'
                ? [{ type: 'text', text: item.message } as ChatNode]
                : item.message
              ).map((node: ChatNode, i) => renderNode(node, i))}
            </div>
            {showProgress && (
              <div
                key={item.animKey}
                className={styles.timer}
                style={{ animationDuration: `${item.duration}ms` }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default Notification
