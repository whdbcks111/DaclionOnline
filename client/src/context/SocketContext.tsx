import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'

// 서버 주소
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

// Context 타입 정의
interface SocketContextType {
  socket: Socket | null
  isConnected: boolean
}

// Context 생성
const SocketContext = createContext<SocketContextType | undefined>(undefined)

// Provider 컴포넌트
export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    // Socket.io 연결
    const socketInstance = io(SERVER_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      withCredentials: true,
    })

    // 연결 이벤트
    socketInstance.on('connect', () => {
      console.log('✅ 서버 연결됨:', socketInstance.id)
      setIsConnected(true)
    })

    // 연결 해제 이벤트
    socketInstance.on('disconnect', (reason) => {
      console.log('❌ 서버 연결 해제됨:', reason)
      setIsConnected(false)
    })

    // 연결 에러
    socketInstance.on('connect_error', (error) => {
      console.error('❌ 연결 에러:', error.message)
      setIsConnected(false)
    })

    setSocket(socketInstance)

    // 클린업: 컴포넌트 언마운트 시 연결 해제
    return () => {
      console.log('🔌 Socket 연결 해제 중...')
      socketInstance.disconnect()
    }
  }, [])

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  )
}

// Custom Hook: 어디서든 socket 사용 가능
export function useSocket() {
  const context = useContext(SocketContext)

  if (context === undefined) {
    throw new Error('useSocket은 SocketProvider 내부에서만 사용할 수 있습니다')
  }

  return context
}
