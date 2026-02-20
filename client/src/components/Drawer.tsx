import { useState, useRef } from 'react'
import styles from './Drawer.module.scss'
import type { ChannelInfo } from '@shared/types'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

interface Props {
    open: boolean
    onClose: () => void
    nickname?: string
    profileImage?: string
    onProfileUpdate: (filename: string) => void
    userId?: number
    currentChannel: string | null
    channelList: ChannelInfo[]
    onJoinChannel: (channel: string | null) => void
}

export default function Drawer({ open, onClose, nickname, profileImage, onProfileUpdate, userId, currentChannel, channelList, onJoinChannel }: Props) {
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [showChannels, setShowChannels] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

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
                                    {ch.description && (
                                        <span className={styles.channelDesc}>{ch.description}</span>
                                    )}
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
        </>
    )
}
