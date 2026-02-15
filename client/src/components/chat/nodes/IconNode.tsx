import styles from '../ChatMessage.module.scss'

interface Props {
    name: string
}

export default function IconNode({ name }: Props) {
    return (
        <img
            src={`/icons/${name}.png`}
            alt={name}
            className={styles.icon}
        />
    )
}
