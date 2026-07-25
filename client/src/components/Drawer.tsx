import { useEffect, useState, useRef } from 'react'
import styles from './Drawer.module.scss'
import type { ChannelInfo } from '@shared/types'
import DisplaySettingsDialog from './DisplaySettingsDialog'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

interface Props {
    open: boolean
    onClose: () => void
    nickname?: string
    profileImage?: string
    onProfileUpdate: (filename: string) => void
    onChangeNickname: (nickname: string) => Promise<{ ok?: boolean; error?: string }>
    userId?: number
    currentChannel: string | null
    channelList: ChannelInfo[]
    channelCounts: Record<string, number>
    onJoinChannel: (channel: string | null) => void
    onOpenHudSettings: () => void
    onOpenGuide: () => void
    onOpenPatchNotes: () => void
    onClearServerChat: () => void
    onClearClientChat: () => void
    permission?: number
    onOpenAdmin: () => void
}

function channelRoomKey(channel: string | null): string {
    return channel === null ? 'channel:main' : `channel:${channel}`
}

export default function Drawer({
    open,
    onClose,
    nickname,
    profileImage,
    onProfileUpdate,
    onChangeNickname,
    userId,
    currentChannel,
    channelList,
    channelCounts,
    onJoinChannel,
    onOpenHudSettings,
    onOpenGuide,
    onOpenPatchNotes,
    onClearServerChat,
    onClearClientChat,
    permission = 0,
    onOpenAdmin,
}: Props) {
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [showChannels, setShowChannels] = useState(false)
    const [editingNickname, setEditingNickname] = useState(false)
    const [nicknameInput, setNicknameInput] = useState('')
    const [nicknameChanging, setNicknameChanging] = useState(false)
    const [nicknameError, setNicknameError] = useState<string | null>(null)
    const [displaySettingsOpen, setDisplaySettingsOpen] = useState(false)
    const [fullscreen, setFullscreen] = useState(false)
    const [displayError, setDisplayError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        const update = () => {
            const legacyDocument = document as Document & { webkitFullscreenElement?: Element }
            setFullscreen(Boolean(document.fullscreenElement ?? legacyDocument.webkitFullscreenElement))
        }
        document.addEventListener('fullscreenchange', update)
        document.addEventListener('webkitfullscreenchange', update)
        update()
        return () => {
            document.removeEventListener('fullscreenchange', update)
            document.removeEventListener('webkitfullscreenchange', update)
        }
    }, [])

    const toggleFullscreen = async () => {
        const legacyDocument = document as Document & {
            webkitFullscreenElement?: Element
            webkitExitFullscreen?: () => Promise<void> | void
        }
        const root = document.documentElement as HTMLElement & {
            webkitRequestFullscreen?: () => Promise<void> | void
        }
        try {
            setDisplayError(null)
            if (document.fullscreenElement ?? legacyDocument.webkitFullscreenElement) {
                if (document.exitFullscreen) await document.exitFullscreen()
                else if (legacyDocument.webkitExitFullscreen) await legacyDocument.webkitExitFullscreen()
            } else if (root.requestFullscreen) {
                await root.requestFullscreen()
            } else if (root.webkitRequestFullscreen) {
                await root.webkitRequestFullscreen()
            } else {
                setDisplayError('이 브라우저에서는 웹 전체화면을 지원하지 않습니다.')
                return
            }
            onClose()
        } catch {
            setDisplayError('전체화면으로 전환하지 못했습니다. 브라우저 권한을 확인해주세요.')
        }
    }

    const handleNicknameEdit = () => {
        setNicknameInput(nickname ?? '')
        setNicknameError(null)
        setEditingNickname(true)
    }

    const handleNicknameConfirm = async () => {
        setNicknameChanging(true)
        setNicknameError(null)
        const result = await onChangeNickname(nicknameInput)
        setNicknameChanging(false)
        if (result.ok) {
            setEditingNickname(false)
        } else {
            setNicknameError(result.error ?? '변경 실패')
        }
    }

    const handleNicknameCancel = () => {
        setEditingNickname(false)
        setNicknameError(null)
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploading(true)
        setError(null)

        try {
            const formData = new FormData()
            formData.append('image', file)
            const res = await fetch(`${SERVER_URL}/api/profile-image`, {
                method: 'POST',
                credentials: 'include',
                body: formData,
            })
            const data = await res.json()
            if (data.ok) {
                onProfileUpdate(data.profileImage)
            } else {
                setError(data.error || '업로드 실패')
            }
        } catch {
            setError('업로드 중 오류가 발생했습니다.')
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const privateChannelId = userId != null ? `private_${userId}` : null

    const getChannelName = (ch: string | null) => {
        if (userId != null && ch === `private_${userId}`) return '개인 채널'
        return channelList.find(c => c.id === ch)?.name ?? '메인'
    }

    const avatarUrl = profileImage
        ? `${SERVER_URL}/uploads/profiles/${profileImage}`
        : '/icons/profile_image_basic.png'

    return (
        <>
            <div
                className={`${styles.backdrop} ${open ? styles.backdropVisible : ''}`}
                onClick={onClose}
            />
            <div className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`}>
                <div className={styles.profileSection}>
                    <div
                        className={styles.avatar}
                        style={{ backgroundImage: `url('${avatarUrl}')` }}
                    />
                    <div className={styles.nickname}>{nickname ?? ''}</div>
                </div>
                <div className={styles.actions}>
                    <button
                        className={styles.uploadButton}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                    >
                        {uploading ? '업로드 중...' : '프로필 사진 변경'}
                    </button>
                    {error && <div className={styles.error}>{error}</div>}
                    {editingNickname ? (
                        <div className={styles.nicknameEditRow}>
                            <input
                                className={styles.nicknameInput}
                                value={nicknameInput}
                                onChange={e => setNicknameInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleNicknameConfirm(); if (e.key === 'Escape') handleNicknameCancel() }}
                                maxLength={12}
                                autoFocus
                                disabled={nicknameChanging}
                            />
                            <div className={styles.nicknameEditButtons}>
                                <button className={styles.uploadButton} onClick={handleNicknameConfirm} disabled={nicknameChanging}>
                                    {nicknameChanging ? '변경 중...' : '확인'}
                                </button>
                                <button className={styles.uploadButton} onClick={handleNicknameCancel} disabled={nicknameChanging}>
                                    취소
                                </button>
                            </div>
                            {nicknameError && <div className={styles.error}>{nicknameError}</div>}
                        </div>
                    ) : (
                        <button className={styles.uploadButton} onClick={handleNicknameEdit}>
                            닉네임 변경
                        </button>
                    )}
                    <button className={styles.uploadButton} onClick={onOpenHudSettings}>
                        HUD 설정
                    </button>
                    <button className={styles.uploadButton} onClick={onOpenGuide}>
                        게임 안내
                    </button>
                    <button className={styles.uploadButton} onClick={onOpenPatchNotes}>
                        패치노트
                    </button>
                    <button className={styles.uploadButton} onClick={onClearClientChat}>
                        현재 화면 채팅 비우기
                    </button>
                    {(currentChannel === privateChannelId || permission >= 10) && (
                        <button className={styles.uploadButton} onClick={onClearServerChat}>
                            서버 채팅 기록 청소
                        </button>
                    )}
                    <div className={styles.displayActionRow}>
                        <button className={styles.uploadButton} onClick={toggleFullscreen}>
                            {fullscreen ? '전체화면 종료' : '전체화면'}
                        </button>
                        <button className={styles.uploadButton} onClick={() => {
                            onClose()
                            setDisplaySettingsOpen(true)
                        }}>
                            화면 확대
                        </button>
                    </div>
                    {displayError && <div className={styles.error}>{displayError}</div>}
                    {permission >= 10 && (
                        <button className={styles.uploadButton} onClick={onOpenAdmin}>
                            관리자 페이지
                        </button>
                    )}
                </div>
                <div className={styles.channelSection}>
                    <button
                        className={styles.channelToggleButton}
                        onClick={() => setShowChannels(prev => !prev)}
                    >
                        <span className={styles.channelToggleLabel}>채널 전환</span>
                        <span className={styles.channelToggleCurrent}>
                            {getChannelName(currentChannel)}
                            <span className={`${styles.chevron} ${showChannels ? styles.chevronUp : ''}`}>▾</span>
                        </span>
                    </button>
                    {showChannels && (
                        <div className={styles.channelList}>
                            {channelList.map(ch => (
                                <button
                                    key={String(ch.id)}
                                    className={`${styles.channelItem} ${currentChannel === ch.id ? styles.channelItemActive : ''}`}
                                    onClick={() => {
                                        onJoinChannel(ch.id)
                                        setShowChannels(false)
                                    }}
                                >
                                    <span className={styles.channelName}>{ch.name}</span>
                                    <span className={styles.channelCount}>{channelCounts[channelRoomKey(ch.id)] ?? 0}명</span>
                                </button>
                            ))}
                            {privateChannelId && (
                                <button
                                    className={`${styles.channelItem} ${currentChannel === privateChannelId ? styles.channelItemActive : ''}`}
                                    onClick={() => {
                                        onJoinChannel(privateChannelId)
                                        setShowChannels(false)
                                    }}
                                >
                                    <span className={styles.channelName}>개인 채널</span>
                                    <span className={styles.channelDesc}>나만 볼 수 있는 채널</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                />
            </div>
            <DisplaySettingsDialog open={displaySettingsOpen} onClose={() => setDisplaySettingsOpen(false)} />
        </>
    )
}
