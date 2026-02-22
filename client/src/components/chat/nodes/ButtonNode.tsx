import { useContext } from 'react'
import type { ChatNode } from '@shared/types'
import { useSocket } from '../../../context/SocketContext'
import { renderNode } from '../ChatMessage'
import { HideCloseContext } from './HideNode'
import styles from '../ChatMessage.module.scss'

interface Props {
    action: string
    closeOnClick?: boolean
    children: ChatNode[]
}

export default function ButtonNode({ action, closeOnClick, children }: Props) {
    const { socket } = useSocket()
    const hideClose = useContext(HideCloseContext)

    const handleClick = () => {
        if (!socket) return
        socket.emit('chatButtonClick', action)
        if (closeOnClick) hideClose?.()
    }

    return (
        <button className={styles.chatButton} onClick={handleClick}>
            {children.map((node, i) => renderNode(node, i))}
        </button>
    )
}
