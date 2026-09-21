import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

let activeSheetCount = 0
let cleanupTimer = null

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
    if (cleanupTimer) {
      window.clearTimeout(cleanupTimer)
      cleanupTimer = null
    }

    const existingMarker = history.state?.tripOnSheet
    const marker = existingMarker || markerRef.current
    markerRef.current = marker
    activeSheetCount += 1

    // When one sheet is replaced by another (detail → edit/link), reuse the
    // same history entry instead of stacking another one. This prevents the
    // previous sheet's cleanup from immediately closing the newly opened one.
    if (!existingMarker) {
      const base = history.state && typeof history.state === 'object' ? history.state : {}
      history.pushState({ ...base, tripOnSheet: marker }, '', location.href)
    }

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
      activeSheetCount = Math.max(0, activeSheetCount - 1)

      // React may unmount one sheet and mount its replacement in the same
      // commit. Wait one tick before removing the history entry so a replacement
      // can adopt it instead of being popped immediately.
      cleanupTimer = window.setTimeout(() => {
        cleanupTimer = null
        if (activeSheetCount === 0 && history.state?.tripOnSheet === marker) history.back()
      }, 0)
    }
  }, [])

  const sheet = (
    <div
      className={`modal-backdrop ${className}`.trim()}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) event.stopPropagation()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        event.stopPropagation()
        closeRef.current?.()
      }}
    >
      {children}
    </div>
  )

  // Keep fixed bottom sheets out of animated/transformed page containers.
  // Mobile browsers otherwise treat the transformed page as the fixed-position containing block.
  return createPortal(sheet, document.body)
}
