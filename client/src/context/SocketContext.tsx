import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { io } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import type { LoginResult, SessionRestoreData } from '@shared/types'

// 서버 주소
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

export interface SessionInfo {
  userId: number
  nickname: string
  profileImage?: string
}

// Context 타입 정의
interface SocketContextType {
  socket: Socket | null
  isConnected: boolean
  sessionInfo: SessionInfo | null
  updateProfileImage: (filename: string) => void
  updateNickname: (nickname: string) => void
}

// Context 생성
const SocketContext = createContext<SocketContextType | undefined>(undefined)

// Provider 컴포넌트
export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)
  const sessionInfoRef = useRef<SessionInfo | null>(null)

  const updateProfileImage = (filename: string) => {
    setSessionInfo(prev => prev ? { ...prev, profileImage: filename } : prev)
  }

  const updateNickname = (nickname: string) => {
    setSessionInfo(prev => prev ? { ...prev, nickname } : prev)
  }

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

    // 세션 복원 시 세션 정보 저장
    socketInstance.on('sessionRestore', (data: SessionRestoreData) => {
      const info: SessionInfo = { userId: data.userId, nickname: data.nickname, profileImage: data.profileImage }
      sessionInfoRef.current = info
      setSessionInfo(info)
    })

    // 로그인 성공 시 세션 정보 저장
    socketInstance.on('loginResult', (result: LoginResult) => {
      if (result.ok && result.userId && result.nickname) {
        const info: SessionInfo = { userId: result.userId, nickname: result.nickname, profileImage: result.profileImage }
        sessionInfoRef.current = info
        setSessionInfo(info)
      }
    })

    // 닉네임 변경 성공 시 세션 정보 업데이트
    socketInstance.on('nicknameResult', (result) => {
      if (result.ok && result.nickname) {
        setSessionInfo(prev => prev ? { ...prev, nickname: result.nickname! } : prev)
      }
    })

    setSocket(socketInstance)

    // 클린업: 컴포넌트 언마운트 시 연결 해제
    return () => {
      console.log('🔌 Socket 연결 해제 중...')
      socketInstance.disconnect()
    }
  }, [])

  return (
    <SocketContext.Provider value={{ socket, isConnected, sessionInfo, updateProfileImage, updateNickname }}>
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
