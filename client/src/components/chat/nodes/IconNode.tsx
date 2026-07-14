import styles from '../ChatMessage.module.scss'

interface Props {
    name: string
}

export default function IconNode({ name }: Props) {
    return (
        <img
            src={`/icons/${name}.png`}
            alt=""
            aria-hidden="true"
            className={styles.icon}
            onError={event => { event.currentTarget.hidden = true }}
        />
    )
}
