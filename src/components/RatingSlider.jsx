import React, { useRef, useState } from 'react'

const STAR_PATH = 'M12 2.9l2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 16.93l-5.5 2.89 1.05-6.12L3.1 9.37l6.15-.9L12 2.9z'

function StarRow() {
  return Array.from({ length: 5 }, (_, index) => (
    <svg key={index} viewBox="0 0 24 24" aria-hidden="true">
      <path className="rating-star-shape" d={STAR_PATH} />
    </svg>
  ))
}

export default function RatingSlider({ value, onChange, optional = true, label = '별점' }) {
  const controlRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const numeric = value === '' || value == null ? 0 : Number(value)
  const specified = value !== '' && value != null

  const setFromClientX = (clientX) => {
    const rect = controlRef.current?.getBoundingClientRect()
    if (!rect) return
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)))
    const next = Math.max(0.5, Math.ceil(ratio * 10) / 2)
    onChange(String(next))
  }

  return (
    <div className={`drag-rating-field ${specified ? '' : 'is-unspecified'}`}>
      <div className="drag-rating-heading">
        <div>
          <strong>{label}</strong>
          <small>별 위를 누르거나 드래그해서 0.5 단위로 선택해요.</small>
        </div>
        {optional && (
          <label className="drag-rating-none">
            <input
              type="checkbox"
              checked={!specified}
              onChange={(e) => onChange(e.target.checked ? '' : '0.5')}
            />
            미지정
          </label>
        )}
      </div>
      <div className="drag-rating-row">
        <div
          ref={controlRef}
          className="drag-rating-control"
          role="slider"
          aria-valuemin="0.5"
          aria-valuemax="5"
          aria-valuestep="0.5"
          aria-valuenow={specified ? numeric : undefined}
          tabIndex={0}
          onPointerDown={(e) => {
            setDragging(true)
            e.currentTarget.setPointerCapture?.(e.pointerId)
            setFromClientX(e.clientX)
          }}
          onPointerMove={(e) => {
            if (dragging) setFromClientX(e.clientX)
          }}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          onKeyDown={(e) => {
            if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return
            e.preventDefault()
            const current = specified ? numeric : 0.5
            const next = Math.max(0.5, Math.min(5, current + (e.key === 'ArrowRight' ? 0.5 : -0.5)))
            onChange(String(next))
          }}
        >
          <div className="drag-rating-stars">
            <span className="drag-rating-stars-base"><StarRow /></span>
            <span className="drag-rating-stars-fill" style={{ width: `${numeric * 20}%` }}><StarRow /></span>
          </div>
        </div>
        <span className="drag-rating-number">{specified ? numeric.toFixed(1) : '—'}</span>
      </div>
    </div>
  )
}
