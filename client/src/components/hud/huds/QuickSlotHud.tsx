import { useState, useRef } from 'react'
import { useHud, MAX_QUICK_SLOTS } from '../../../context/HudContext'
import { useSocket } from '../../../context/SocketContext'
import styles from './QuickSlotHud.module.scss'

export default function QuickSlotHud() {
  const { quickSlots, addQuickSlot, removeQuickSlot, moveQuickSlot, updateQuickSlot, editMode } = useHud()
  const { socket } = useSocket()
  const [inputValue, setInputValue] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [draggingFrom, setDraggingFrom] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const sendMessage = (text: string) => {
    if (!socket || !text.trim()) return
    socket.emit('sendMessage', text.trim())
  }

  const handleAdd = () => {
    const text = inputValue.trim()
    if (!text || quickSlots.length >= MAX_QUICK_SLOTS) return
    addQuickSlot(text)
    setInputValue('')
  }

  const handleEditConfirm = (index: number) => {
    const text = editingValue.trim()
    if (text) updateQuickSlot(index, text)
    setEditingIndex(null)
    setEditingValue('')
  }

  const handleDragStart = (index: number) => setDraggingFrom(index)

  const handleDrop = (toIndex: number) => {
    if (draggingFrom !== null && draggingFrom !== toIndex) {
      moveQuickSlot(draggingFrom, toIndex)
    }
    setDraggingFrom(null)
    setDragOverIndex(null)
  }

  if (!editMode && quickSlots.length === 0) return null

  return (
    <div className={styles.hud}>
      {quickSlots.map((slot, i) => (
        <div
          key={i}
          className={`${styles.slot} ${dragOverIndex === i ? styles.dragOver : ''}`}
          draggable={editMode}
          onDragStart={() => handleDragStart(i)}
          onDragOver={e => { e.preventDefault(); setDragOverIndex(i) }}
          onDragLeave={() => setDragOverIndex(null)}
          onDrop={() => handleDrop(i)}
        >
          {editMode && editingIndex === i ? (
            <input
              className={styles.editInput}
              value={editingValue}
              autoFocus
              onChange={e => setEditingValue(e.target.value)}
              onBlur={() => handleEditConfirm(i)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleEditConfirm(i)
                if (e.key === 'Escape') { setEditingIndex(null); setEditingValue('') }
              }}
            />
          ) : (
            <button
              className={styles.btn}
              title={slot}
              onMouseDown={e => e.preventDefault()}
              onTouchStart={e => e.preventDefault()}
              onTouchEnd={e => {
                e.preventDefault()
                if(editMode) {
                  setEditingIndex(i);
                  setEditingValue(slot);
                }
                else {
                  sendMessage(slot);
                }
              }}
              onClick={e => {
                if(editMode) {
                  setEditingIndex(i);
                  setEditingValue(slot);
                }
                else {
                  sendMessage(slot);
                }
              }}
            >
              {slot}
            </button>
          )}
          {editMode && editingIndex !== i && (
            <button
              className={styles.removeBtn}
              title="삭제"
              onMouseDown={e => e.preventDefault()}
              onTouchStart={e => e.preventDefault()}
              onTouchEnd={e => { e.preventDefault(); removeQuickSlot(i) }}
              onClick={() => removeQuickSlot(i)}
            >✕</button>
          )}
        </div>
      ))}

      {editMode && quickSlots.length < MAX_QUICK_SLOTS && (
        <div className={styles.addRow}>
          <input
            ref={inputRef}
            className={styles.addInput}
            placeholder="메시지 입력..."
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          />
          <button className={styles.addBtn} onClick={handleAdd} disabled={!inputValue.trim()}>+</button>
        </div>
      )}
    </div>
  )
}
