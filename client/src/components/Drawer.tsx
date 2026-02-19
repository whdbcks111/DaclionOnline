import { useState, useRef } from 'react'
import styles from './Drawer.module.scss'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

interface Props {
    open: boolean
    onClose: () => void
    nickname?: string
    profileImage?: string
    onProfileUpdate: (filename: string) => void
}

export default function Drawer({ open, onClose, nickname, profileImage, onProfileUpdate }: Props) {
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)
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
