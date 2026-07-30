import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { SimpleResult } from '@shared/types'
import { useSocket } from '../context/SocketContext'
import { validateEmail, validatePassword } from '../utils/validators'
import styles from './PasswordReset.module.scss'

export default function PasswordReset() {
  const navigate = useNavigate()
  const { socket, isConnected } = useSocket()
  const emailRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  const [codeSent, setCodeSent] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!socket) return
    const onCodeSent = (result: SimpleResult) => {
      if (result.ok) {
        setCodeSent(true)
        setError('')
        setMessage('가입된 계정이라면 입력한 이메일로 인증번호를 보냈습니다.')
      } else {
        setMessage('')
        setError(result.error ?? '인증번호를 보내지 못했습니다.')
      }
    }
    const onReset = (result: SimpleResult) => {
      if (result.ok) {
        setError('')
        setMessage('비밀번호를 변경했습니다. 새 비밀번호로 로그인해주세요.')
        window.setTimeout(() => navigate('/login', { replace: true }), 900)
      } else {
        setMessage('')
        setError(result.error ?? '비밀번호를 변경하지 못했습니다.')
      }
    }
    socket.on('passwordResetCodeSendResult', onCodeSent)
    socket.on('passwordResetResult', onReset)
    return () => {
      socket.off('passwordResetCodeSendResult', onCodeSent)
      socket.off('passwordResetResult', onReset)
    }
  }, [navigate, socket])

  const sendCode = () => {
    const email = emailRef.current?.value ?? ''
    const validationError = validateEmail(email)
    if (validationError) {
      setError(validationError)
      return
    }
    if (!isConnected || !socket) {
      setError('서버가 원활하지 않습니다. 잠시 후 다시 시도해주세요.')
      return
    }
    setError('')
    setMessage('')
    socket.emit('sendPasswordResetCode', email)
  }

  const resetPassword = () => {
    const code = codeRef.current?.value.trim() ?? ''
    const pw = passwordRef.current?.value ?? ''
    const confirmation = confirmRef.current?.value ?? ''
    if (!codeSent) {
      setError('먼저 이메일로 인증번호를 받아주세요.')
      return
    }
    if (!/^\d{6}$/.test(code)) {
      setError('6자리 인증번호를 입력해주세요.')
      return
    }
    const validationError = validatePassword(pw)
    if (validationError) {
      setError(validationError)
      return
    }
    if (pw !== confirmation) {
      setError('비밀번호가 일치하지 않습니다.')
      return
    }
    if (!isConnected || !socket) {
      setError('서버가 원활하지 않습니다. 잠시 후 다시 시도해주세요.')
      return
    }
    setError('')
    setMessage('')
    socket.emit('resetPassword', { code, pw })
  }

  return (
    <div className={styles.container}>
      <div className={styles.label}>비밀번호 찾기</div>
      <input ref={emailRef} type="email" placeholder="가입 이메일" />
      <button onClick={sendCode}>{codeSent ? '인증번호 다시 받기' : '인증번호 받기'}</button>
      <input ref={codeRef} inputMode="numeric" maxLength={6} placeholder="6자리 인증번호" />
      <input ref={passwordRef} type="password" placeholder="새 비밀번호" />
      <input
        ref={confirmRef}
        type="password"
        placeholder="새 비밀번호 확인"
        onKeyDown={event => event.key === 'Enter' && resetPassword()}
      />
      {message && <div className={styles.ok}>{message}</div>}
      {error && <div className={styles.error}>{error}</div>}
      <button className={styles.submit} onClick={resetPassword}>비밀번호 변경</button>
      <div className={styles.nav}>
        <Link to="/login">로그인</Link>
        <Link to="/register">회원가입</Link>
      </div>
    </div>
  )
}
