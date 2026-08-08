import { getChatEmote, type ChatEmoteKey } from '@shared/cosmetics'
import styles from './EmoteNode.module.scss'

interface Props {
    id: ChatEmoteKey
}

export default function EmoteNode({ id }: Props) {
    const emote = getChatEmote(id)
    if (!emote) return null
    return (
        <span className={styles.emote} role="img" aria-label={emote.name} title={emote.name}>
            {emote.glyph}
        </span>
    )
}
