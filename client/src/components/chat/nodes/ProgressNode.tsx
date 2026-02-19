import styles from './ProgressNode.module.scss'

interface Props {
    value: number
    length: number
    color: string
    thickness: number
    shape: 'rounded' | 'square'
}

export default function ProgressNode({ value, length, color, thickness, shape }: Props) {
    const radius = shape === 'rounded' ? thickness / 2 : 0

    return (
        <span
            className={styles.track}
            style={{
                width: length,
                height: thickness,
                borderRadius: radius,
            }}
        >
            <span
                className={styles.fill}
                style={{
                    width: `${value * 100}%`,
                    backgroundColor: color,
                    borderRadius: radius,
                }}
            />
        </span>
    )
}
