/** 모바일 뒤로가기로 키보드만 닫힌 뒤 남아 있는 편집 포커스까지 해제한다. */
export function dismissVirtualKeyboard(): void {
  const active = document.activeElement
  if (active instanceof HTMLElement && (active.isContentEditable || active.matches('input, textarea'))) {
    active.blur()
  }
}

/** HUD/채팅 버튼 탭이 현재 편집기의 focus를 빼앗지 않도록 pointer 기본 동작만 막는다. */
export function preserveActiveEditableFocus(event: {
  target: EventTarget | null
  preventDefault: () => void
}): void {
  const target = event.target
  if (!(target instanceof Element) || !target.closest('button')) return
  const active = document.activeElement
  if (active instanceof HTMLElement && (active.isContentEditable || active.matches('input, textarea'))) {
    event.preventDefault()
  }
}
