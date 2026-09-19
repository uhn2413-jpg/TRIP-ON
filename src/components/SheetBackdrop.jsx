import React from 'react'

export function confirmSheetClose(dirty, onClose) {
  if (!dirty) {
    onClose()
    return
  }
  if (window.confirm('작성 중인 내용이 있어요. 저장하지 않고 나갈까요?')) onClose()
}

export default function SheetBackdrop({ children, onRequestClose, className = '' }) {
  return (
    <div
      className={`modal-backdrop ${className}`.trim()}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onRequestClose?.()
      }}
    >
      {children}
    </div>
  )
}
