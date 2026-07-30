/** 모바일 뒤로가기로 키보드만 닫힌 뒤 남아 있는 편집 포커스까지 해제한다. */
export function dismissVirtualKeyboard(): void {
  const active = document.activeElement
  if (active instanceof HTMLElement && (active.isContentEditable || active.matches('input, textarea'))) {
    active.blur()
  }
}
