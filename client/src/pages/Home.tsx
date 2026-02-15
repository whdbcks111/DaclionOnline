import { useState, useRef, useEffect } from 'react'
import styles from './Home.module.scss'
import { useSocket } from '../context/SocketContext'
import ChatMessage from '../components/chat/ChatMessage'
import type { ChatMessage as ChatMessageType } from '@shared/types'

function Home() {
  const { socket } = useSocket()
  const [messages, setMessages] = useState<ChatMessageType[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!socket) return

    const onChatMessage = (msg: ChatMessageType) => {
      setMessages(prev => [...prev, msg])
    }

    socket.on('chatMessage', onChatMessage)
    return () => { socket.off('chatMessage', onChatMessage) }
  }, [socket])

  // 새 메시지가 오면 스크롤 하단으로
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = () => {
    const content = inputRef.current?.value.trim()
    if (!content || !socket) return

    socket.emit('sendMessage', content)
    inputRef.current!.value = ''
  }

  return (
    <div className={styles.homeContainer}>
      <div className={styles.chatArea}>
        <div className={styles.chatMessages}>
          {messages.map((msg, i) => (
            <ChatMessage
              key={i}
              message={msg}
              showHeader={i === 0
                || messages[i - 1].nickname !== msg.nickname
                || Math.floor(messages[i - 1].timestamp / 60000) !== Math.floor(msg.timestamp / 60000)
              }
            />
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div className={styles.chatInput}>
          <input
            ref={inputRef}
            type="text"
            placeholder="메시지를 입력하세요"
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
          />
          <button onClick={sendMessage}>전송</button>
        </div>
      </div>
    </div>
  )
}

export default Home
