import type { ChatNode } from '@shared/types'
import { useSocket } from '../../../context/SocketContext'
import { renderNode } from '../ChatMessage'
import styles from '../ChatMessage.module.scss'

interface Props {
    action: string
    children: ChatNode[]
}

export default function ButtonNode({ action, children }: Props) {
    const { socket } = useSocket()

    const handleClick = () => {
        if (!socket) return
        socket.emit('chatButtonClick', action)
    }

    return (
        <button className={styles.chatButton} onClick={handleClick}>
            {children.map((node, i) => renderNode(node, i))}
        </button>
    )
}
