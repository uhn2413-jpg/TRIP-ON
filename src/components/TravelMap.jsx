import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, MapPin, MapPinned, Route, X } from 'lucide-react'
import SheetBackdrop from './SheetBackdrop'
import { googleMapsSearchUrl, isGoogleMapsConfigured, loadGoogleMaps } from '../lib/googleMaps'
import { fetchAllMapPoints, fetchTripMapPoints, scheduleItemsToMapPoints } from '../lib/places'

export function MapCanvas({ points = [], connectPoints = false, className = '' }) {
  const ref = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const lineRef = useRef(null)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState('')
  const configured = isGoogleMapsConfigured()

  useEffect(() => {
    let alive = true
    if (!configured || !ref.current) return
    const init = async () => {
      try {
        await loadGoogleMaps()
        if (!alive || !ref.current) return
        const first = points[0]
        const center = first ? { lat: first.latitude, lng: first.longitude } : { lat: 37.5665, lng: 126.9780 }
        if (!mapRef.current) {
          mapRef.current = new window.google.maps.Map(ref.current, {
            center,
            zoom: first ? 13 : 5,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            gestureHandling: 'greedy',
          })
        }
        markersRef.current.forEach((marker) => marker.setMap(null))
        markersRef.current = []
        if (lineRef.current) { lineRef.current.setMap(null); lineRef.current = null }

        const bounds = new window.google.maps.LatLngBounds()
        points.forEach((point, index) => {
          const position = { lat: Number(point.latitude), lng: Number(point.longitude) }
          const marker = new window.google.maps.Marker({
            map: mapRef.current,
            position,
            title: point.name,
            label: connectPoints ? String(index + 1) : undefined,
          })
          marker.addListener('click', () => setSelected(point))
          markersRef.current.push(marker)
          bounds.extend(position)
        })
        if (connectPoints && points.length > 1) {
          lineRef.current = new window.google.maps.Polyline({
            map: mapRef.current,
            path: points.map((point) => ({ lat: Number(point.latitude), lng: Number(point.longitude) })),
            geodesic: true,
            strokeOpacity: 0.65,
            strokeWeight: 3,
          })
        }
        if (points.length === 1) {
          mapRef.current.setCenter(center)
          mapRef.current.setZoom(15)
        } else if (points.length > 1) {
          mapRef.current.fitBounds(bounds, 42)
        }
      } catch (e) {
        if (alive) setError(e.message)
      }
    }
    init()
    return () => { alive = false }
  }, [configured, points, connectPoints])

  if (!configured) return <MapSetupNotice />
  if (error) return <div className="map-error"><MapPinned size={28} /><strong>지도를 불러오지 못했어요</strong><p>{error}</p></div>
  if (!points.length) return <div className="map-empty"><MapPin size={28} /><strong>지도에 표시할 장소가 아직 없어요</strong><p>장소 검색으로 좌표가 연결된 일정이나 스크랩이 생기면 여기에 표시돼요.</p></div>

  return (
    <div className={`trip-map-wrap ${className}`}>
      <div ref={ref} className="trip-map-canvas" />
      {selected && (
        <div className="map-selected-card">
          <button className="map-selected-close" onClick={() => setSelected(null)} aria-label="장소 카드 닫기"><X size={16} /></button>
          <strong>{selected.name}</strong>
          <span>{[selected.country, selected.city].filter(Boolean).join(' · ') || selected.address || '장소'}</span>
          {selected.address && <small>{selected.address}</small>}
          {selected.tripTitle && <em>{selected.tripTitle}</em>}
          <button onClick={() => window.open(googleMapsSearchUrl(selected), '_blank', 'noopener,noreferrer')}><ExternalLink size={15} /> Google 지도에서 보기</button>
        </div>
      )}
    </div>
  )
}

export function MapSetupNotice() {
  return (
    <div className="map-setup-notice">
      <MapPinned size={31} />
      <strong>Google Maps 연결이 필요해요</strong>
      <p>API 키를 Vercel 환경변수에 넣으면 장소 검색과 지도가 켜져요. 키가 없어도 기존 일정·기록 기능은 그대로 사용할 수 있어요.</p>
      <code>VITE_GOOGLE_MAPS_API_KEY</code>
    </div>
  )
}

export function AllTripsMap({ trips = [] }) {
  const [points, setPoints] = useState([])
  const [tripId, setTripId] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchAllMapPoints().then((rows) => { if (alive) { setPoints(rows); setError('') } }).catch((e) => { if (alive) setError(e.message) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const shown = useMemo(() => tripId === 'all' ? points : points.filter((point) => point.tripId === tripId), [points, tripId])
  return (
    <section className="all-trips-map-section">
      <div className="map-toolbar">
        <div><strong>나의 여행 지도</strong><small>좌표가 연결된 일정·스크랩 {shown.length}곳</small></div>
        <select value={tripId} onChange={(e) => setTripId(e.target.value)}><option value="all">모든 여행</option>{trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.title}</option>)}</select>
      </div>
      {error && <div className="schedule-alert">{error}</div>}
      {loading ? <div className="schedule-loading">장소를 불러오는 중…</div> : <MapCanvas points={shown} />}
    </section>
  )
}

export function TripMapSheet({ trip, onClose }) {
  const [points, setPoints] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    fetchTripMapPoints(trip.id).then((rows) => { if (alive) { setPoints(rows); setError('') } }).catch((e) => { if (alive) setError(e.message) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [trip.id])
  return (
    <SheetBackdrop onRequestClose={onClose}>
      <div className="create-sheet map-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={onClose}>닫기</button><span>여행 지도</span><div /></div>
        <div className="sheet-body map-sheet-body">
          <p className="eyebrow">TRIP MAP</p><h2>{trip.title}</h2>
          <p className="muted">일정과 스크랩에서 Google 장소를 연결하면 같은 장소가 한 핀으로 모여요.</p>
          {error && <div className="schedule-alert">{error}</div>}
          {loading ? <div className="schedule-loading">장소를 불러오는 중…</div> : <MapCanvas points={points} />}
          <div className="map-legend-note"><MapPin size={15} /><span>현재는 저장한 장소를 표시해요. Google 타임라인에서 실제 이동 동선을 가져오는 기능은 다음 단계에서 이 지도 위에 연결할 수 있게 만들 예정이에요.</span></div>
        </div>
      </div>
    </SheetBackdrop>
  )
}

export function DayMapSheet({ day, items, onClose }) {
  const points = scheduleItemsToMapPoints(items)
  return (
    <SheetBackdrop onRequestClose={onClose}>
      <div className="create-sheet map-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={onClose}>닫기</button><span>오늘 동선</span><div /></div>
        <div className="sheet-body map-sheet-body">
          <p className="eyebrow">DAY {day?.day_number} · {day?.trip_date}</p><h2>일정 순서대로 보기</h2>
          <MapCanvas points={points} connectPoints />
          {points.length > 1 && <div className="map-legend-note"><Route size={15} /><span>선은 일정 순서를 보기 쉽게 이어 놓은 것으로, 실제 도로 길찾기 경로는 아니에요.</span></div>}
        </div>
      </div>
    </SheetBackdrop>
  )
}
