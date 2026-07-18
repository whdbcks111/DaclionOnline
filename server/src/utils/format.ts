/** 게임 내 중량을 최대 소수 둘째 자리의 kg 문자열로 표시한다. */
export function formatWeight(value: number): string {
    const number = Number.isInteger(value)
        ? String(value)
        : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return `${number}kg`;
}
