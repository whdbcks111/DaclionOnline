import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type {
  HumanVerificationResultData,
  HumanVerificationStartData,
} from '@shared/types'
import { useSocket } from '../../context/SocketContext'
import Dialog from '../dialog/Dialog'
import styles from './HumanVerificationOverlay.module.scss'

function secondsRemaining(expiresAt: number): number {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1_000))
}

export default function HumanVerificationOverlay() {
  const { socket, sessionInfo } = useSocket()
  const [required, setRequired] = useState(false)
  const [challenge, setChallenge] = useState<HumanVerificationStartData | null>(null)
  const [answer, setAnswer] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [remaining, setRemaining] = useState(0)
  const ignoreClose = useCallback(() => undefined, [])

  const requestChallenge = useCallback(() => {
    if (!socket) return
    setMessage('')
    setSubmitting(false)
    socket.emit('requestHumanVerification')
  }, [socket])

  useEffect(() => {
    if (!socket || !sessionInfo) return
    const onStart = (data: HumanVerificationStartData) => {
      setRequired(true)
      setChallenge(data)
      setAnswer('')
      setMessage('')
      setSubmitting(false)
      setRemaining(secondsRemaining(data.expiresAt))
    }
    const onResult = (data: HumanVerificationResultData) => {
      setSubmitting(false)
      setMessage(data.message)
      if (data.passed) {
        setRequired(false)
        setChallenge(null)
        setAnswer('')
        return
      }
      if (data.retryAllowed) {
        setRequired(true)
        setChallenge(null)
        setAnswer('')
      }
    }
    socket.on('humanVerificationStart', onStart)
    socket.on('humanVerificationResult', onResult)
    requestChallenge()
    const retry = window.setTimeout(requestChallenge, 750)
    socket.on('connect', requestChallenge)
    return () => {
      window.clearTimeout(retry)
      socket.off('connect', requestChallenge)
      socket.off('humanVerificationStart', onStart)
      socket.off('humanVerificationResult', onResult)
    }
  }, [requestChallenge, sessionInfo, socket])

  useEffect(() => {
    if (!challenge) return
    const update = () => setRemaining(secondsRemaining(challenge.expiresAt))
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [challenge])

  const canSubmit = useMemo(() =>
    Boolean(challenge && remaining > 0 && answer.trim().length > 0 && !submitting),
  [answer, challenge, remaining, submitting])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!socket || !challenge || !canSubmit) return
    setSubmitting(true)
    setMessage('')
    socket.emit('submitHumanVerification', {
      sessionId: challenge.sessionId,
      answer,
    })
  }

  return (
    <Dialog
      open={required}
      title="사람 확인"
      onClose={ignoreClose}
      closable={false}
      closeOnBackdrop={false}
      className={styles.dialog}
      backdropClassName={styles.backdrop}
    >
      <section className={styles.content}>
        <p className={styles.description}>
          장시간 반복 행동이 감지되어 잠시 확인이 필요합니다.
          확인하는 동안 캐릭터는 피해를 받지 않으며 게임 행동이 제한됩니다.
        </p>
        {challenge ? (
          <form className={styles.form} onSubmit={submit}>
            <p className={styles.prompt}>{challenge.prompt}</p>
            <img
              className={styles.challenge}
              src={challenge.imageDataUrl}
              alt="사람 확인 문자 이미지"
              draggable={false}
            />
            <div className={styles.meta}>
              <span>남은 시간</span>
              <strong>{remaining}초</strong>
            </div>
            <label className={styles.field}>
              <span>보이는 문자</span>
              <input
                value={answer}
                maxLength={8}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                inputMode="text"
                disabled={submitting || remaining <= 0}
                onChange={event => setAnswer(event.target.value.toUpperCase())}
              />
            </label>
            {message && <p className={styles.error} role="alert">{message}</p>}
            <button className={styles.primaryButton} type="submit" disabled={!canSubmit}>
              {submitting ? '확인 중…' : '확인'}
            </button>
          </form>
        ) : (
          <div className={styles.retry}>
            <p role="alert">{message || '문제를 불러오는 중입니다.'}</p>
            <button className={styles.primaryButton} type="button" onClick={requestChallenge}>
              새 문제 받기
            </button>
          </div>
        )}
        <small className={styles.notice}>
          페이지를 닫아도 확인 상태는 유지됩니다. 문제를 완료하면 즉시 게임으로 돌아갈 수 있습니다.
        </small>
      </section>
    </Dialog>
  )
}
