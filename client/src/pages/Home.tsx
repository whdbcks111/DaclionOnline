import { useState, useRef, useEffect } from 'react'
import styles from './Home.module.scss'
import { useSocket } from '../context/SocketContext'
import ChatMessage from '../components/chat/ChatMessage'
import type { ChatMessage as ChatMessageType } from '@shared/types'

function Home() {
  const { socket } = useSocket()
  const [messages, setMessages] = useState<ChatMessageType[]>([])
  const inputRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!socket) return

    const onChatHistory = (history: ChatMessageType[]) => {
      setMessages(history)
    }

    const onChatMessage = (msg: ChatMessageType) => {
      setMessages(prev => [...prev, msg])
    }

    socket.on('chatHistory', onChatHistory)
    socket.on('chatMessage', onChatMessage)
    socket.emit('requestChatHistory')
    return () => {
      socket.off('chatHistory', onChatHistory)
      socket.off('chatMessage', onChatMessage)
    }
  }, [socket])

  // 새 메시지가 오면 스크롤 하단으로
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = () => {
    const content = inputRef.current?.textContent?.trim()
    if (!content || !socket) return

    socket.emit('sendMessage', content)
    inputRef.current!.textContent = ''
    inputRef.current!.focus()
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
                || messages[i - 1].userId !== msg.userId
                || Math.floor(messages[i - 1].timestamp / 60000) !== Math.floor(msg.timestamp / 60000)
              }
            />
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div className={styles.chatInput}>
          <div
            ref={inputRef}
            className={styles.chatInputField}
            contentEditable
            role="textbox"
            data-placeholder="메시지를 입력하세요"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
          />
          <button onClick={sendMessage}>전송</button>
        </div>
      </div>
    </div>
  )
}

export default Home
