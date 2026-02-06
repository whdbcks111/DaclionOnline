import { useState, useEffect } from 'react'
import { io } from 'socket.io-client'
import './App.css'

// 환경 변수에서 서버 주소 가져오기
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

// Socket.io 서버 연결
const socket = io(SERVER_URL)

function App() {
  const [isConnected, setIsConnected] = useState(false)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<any[]>([])

  useEffect(() => {
    // 연결 이벤트
    socket.on('connect', () => {
      console.log('서버 연결됨:', socket.id)
      setIsConnected(true)
    })

    // 메시지 수신
    socket.on('message', (data) => {
      console.log('메시지 받음:', data)
      setMessages((prev) => [...prev, data])
    })

    // 연결 해제
    socket.on('disconnect', () => {
      console.log('서버 연결 해제됨')
      setIsConnected(false)
    })

    // 클린업
    return () => {
      socket.off('connect')
      socket.off('message')
      socket.off('disconnect')
    }
  }, [])

  // 메시지 전송
  const sendMessage = () => {
    if (message.trim()) {
      socket.emit('message', message)
      setMessage('')
    }
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>Socket.io 테스트</h1>

      <div>
        <div>서버 주소: {SERVER_URL}</div>
        <div>연결 상태: {isConnected ? '✅ 연결됨' : '❌ 연결 안됨'}</div>
      </div>

      <div style={{ marginTop: '20px' }}>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="메시지 입력..."
          style={{ padding: '10px', width: '300px' }}
        />
        <button onClick={sendMessage} style={{ padding: '10px 20px', marginLeft: '10px' }}>
          전송
        </button>
      </div>

      <div style={{ marginTop: '30px' }}>
        <h3>받은 메시지:</h3>
        <div style={{ border: '1px solid #ccc', padding: '10px', minHeight: '200px' }}>
          {messages.map((msg, index) => (
            <div key={index} style={{ marginBottom: '10px', padding: '5px', background: '#f0f0f0' }}>
              <strong>{msg.id}:</strong> {msg.data}
              <br />
              <small>{msg.timestamp}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default App
