import { useState, useEffect, useCallback } from 'react'
import { useSocket } from '../context/SocketContext'
import { parseChatMessage } from '@shared/chatParser'
import { renderNode } from './chat/ChatMessage'
import type { NotificationData } from '@shared/types'
import styles from './Notification.module.scss'

interface NotificationItem extends NotificationData {
  id: number
}

let nextId = 0

function Notification() {
  const { socket } = useSocket()
  const [items, setItems] = useState<NotificationItem[]>([])

  const addNotification = useCallback((data: NotificationData) => {
    const id = nextId++
    const newItem: NotificationItem = { ...data, id }
    const duration = data.length ?? 5000

    setItems(prev => {
      // 같은 key가 이미 있으면 제거 후 새로 추가
      const filtered = prev.filter(item => item.key !== data.key)
      return [...filtered, newItem]
    })

    // 자동 제거
    if (duration > 0) {
      setTimeout(() => {
        setItems(prev => prev.filter(item => item.id !== id))
      }, duration)
    }
  }, [])

  useEffect(() => {
    if (!socket) return

    socket.on('notification', addNotification)
    return () => { socket.off('notification', addNotification) }
  }, [socket, addNotification])

  if (items.length === 0) return null

  return (
    <div className={styles.container}>
      {items.map(item => (
        <div key={item.id} className={styles.item}>
          {parseChatMessage(item.message).map((node, i) => renderNode(node, i))}
        </div>
      ))}
    </div>
  )
}

export default Notification
