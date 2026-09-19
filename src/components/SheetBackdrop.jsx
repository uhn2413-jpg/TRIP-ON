import React, { useEffect, useRef } from 'react'

export function confirmSheetClose(dirty, onClose) {
  if (!dirty) {
    onClose()
    return true
  }
  if (window.confirm('작성 중인 내용이 있어요. 저장하지 않고 나갈까요?')) {
    onClose()
    return true
  }
  return false
}

export default function SheetBackdrop({ children, onRequestClose, className = '' }) {
  const closeRef = useRef(onRequestClose)
  const markerRef = useRef(`trip-on-sheet-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  useEffect(() => { closeRef.current = onRequestClose }, [onRequestClose])

  useEffect(() => {
    const marker = markerRef.current
    const base = history.state && typeof history.state === 'object' ? history.state : {}
    history.pushState({ ...base, tripOnSheet: marker }, '', location.href)

    const onPopState = () => {
      const result = closeRef.current?.()
      if (result === false) {
        const restored = history.state && typeof history.state === 'object' ? history.state : {}
        history.pushState({ ...restored, tripOnSheet: marker }, '', location.href)
      }
    }
    window.addEventListener('popstate', onPopState)

    return () => {
      window.removeEventListener('popstate', onPopState)
      if (history.state?.tripOnSheet === marker) history.back()
    }
  }, [])

  return (
    <div
      className={`modal-backdrop ${className}`.trim()}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) closeRef.current?.()
      }}
    >
      {children}
    </div>
  )
}
