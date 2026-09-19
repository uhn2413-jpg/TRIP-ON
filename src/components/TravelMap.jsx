import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, MapPin, MapPinned, Route, X } from 'lucide-react'
import SheetBackdrop from './SheetBackdrop'
import { isGoogleMapsConfigured, loadGoogleMaps } from '../lib/googleMaps'
import { isKakaoMapsConfigured, loadKakaoMaps } from '../lib/kakaoMaps'
import { allVisualsAreKorean, externalMapLabel, externalMapUrl } from '../lib/mapProviders'
import { fetchAllMapPoints, fetchTripMapPoints, scheduleItemsToMapPoints } from '../lib/places'
import { fetchTimelineMapData } from '../lib/archive'
import '../kakao-maps.css'

function validPoint(point) {
  return point && Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude))
}

function firstVisualPoint(points, pathSegments) {
  const direct = (points || []).find(validPoint)
  if (direct) return direct
  for (const segment of pathSegments || []) {
    const found = (segment?.points || []).find(validPoint)
    if (found) return found
  }
  return null
}

function GoogleMapCanvas({ points, connectPoints, pathSegments, onSelect }) {
  const ref = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const lineRef = useRef(null)
  const pathLinesRef = useRef([])
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    if (!ref.current) return
    const init = async () => {
      try {
        await loadGoogleMaps()
        if (!alive || !ref.current) return
        const first = firstVisualPoint(points, pathSegments)
        const center = first ? { lat: Number(first.latitude), lng: Number(first.longitude) } : { lat: 37.5665, lng: 126.9780 }
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
        pathLinesRef.current.forEach((line) => line.setMap(null))
        pathLinesRef.current = []

        const bounds = new window.google.maps.LatLngBounds()
        ;(points || []).filter(validPoint).forEach((point, index) => {
          const position = { lat: Number(point.latitude), lng: Number(point.longitude) }
          const marker = new window.google.maps.Marker({
            map: mapRef.current,
            position,
            title: point.name,
            label: connectPoints ? String(index + 1) : undefined,
          })
          marker.addListener('click', () => onSelect(point))
          markersRef.current.push(marker)
          bounds.extend(position)
        })

        ;(pathSegments || []).forEach((segment) => {
          const path = (segment.points || []).filter(validPoint).map((point) => ({ lat: Number(point.latitude), lng: Number(point.longitude) }))
          if (path.length < 2) return
          path.forEach((position) => bounds.extend(position))
          pathLinesRef.current.push(new window.google.maps.Polyline({ map: mapRef.current, path, geodesic: true, strokeOpacity: 0.72, strokeWeight: 4 }))
        })

        const cleanPoints = (points || []).filter(validPoint)
        if (connectPoints && cleanPoints.length > 1) {
          lineRef.current = new window.google.maps.Polyline({
            map: mapRef.current,
            path: cleanPoints.map((point) => ({ lat: Number(point.latitude), lng: Number(point.longitude) })),
            geodesic: true,
            strokeOpacity: 0.65,
            strokeWeight: 3,
          })
        }

        const totalVisuals = cleanPoints.length + (pathSegments || []).length
        if (cleanPoints.length === 1 && !(pathSegments || []).length) {
          mapRef.current.setCenter(center)
          mapRef.current.setZoom(15)
        } else if (totalVisuals > 0) {
          mapRef.current.fitBounds(bounds, 42)
        }
      } catch (e) {
        if (alive) setError(e.message)
      }
    }
    init()
    return () => { alive = false }
  }, [points, connectPoints, pathSegments, onSelect])

  if (error) return <MapLoadError message={error} />
  return <div ref={ref} className="trip-map-canvas" />
}

function KakaoMapCanvas({ points, connectPoints, pathSegments, onSelect }) {
  const ref = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const overlaysRef = useRef([])
  const linesRef = useRef([])
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    if (!ref.current) return
    const init = async () => {
      try {
        await loadKakaoMaps()
        if (!alive || !ref.current) return
        const maps = window.kakao.maps
        const first = firstVisualPoint(points, pathSegments)
        const center = first ? new maps.LatLng(Number(first.latitude), Number(first.longitude)) : new maps.LatLng(37.5665, 126.9780)
        if (!mapRef.current) {
          mapRef.current = new maps.Map(ref.current, { center, level: first ? 5 : 12 })
          setTimeout(() => mapRef.current?.relayout?.(), 0)
        }

        markersRef.current.forEach((marker) => marker.setMap(null))
        overlaysRef.current.forEach((overlay) => overlay.setMap(null))
        linesRef.current.forEach((line) => line.setMap(null))
        markersRef.current = []
        overlaysRef.current = []
        linesRef.current = []

        const bounds = new maps.LatLngBounds()
        const cleanPoints = (points || []).filter(validPoint)
        cleanPoints.forEach((point, index) => {
          const position = new maps.LatLng(Number(point.latitude), Number(point.longitude))
          const marker = new maps.Marker({ map: mapRef.current, position, title: point.name })
          maps.event.addListener(marker, 'click', () => onSelect(point))
          markersRef.current.push(marker)
          bounds.extend(position)
          if (connectPoints) {
            const overlay = new maps.CustomOverlay({
              map: mapRef.current,
              position,
              content: `<div class="kakao-order-badge">${index + 1}</div>`,
              yAnchor: 1.75,
            })
            overlaysRef.current.push(overlay)
          }
        })

        ;(pathSegments || []).forEach((segment) => {
          const path = (segment.points || []).filter(validPoint).map((point) => new maps.LatLng(Number(point.latitude), Number(point.longitude)))
          if (path.length < 2) return
          path.forEach((position) => bounds.extend(position))
          const line = new maps.Polyline({ path, strokeWeight: 4, strokeOpacity: 0.72, strokeStyle: 'solid' })
          line.setMap(mapRef.current)
          linesRef.current.push(line)
        })

        if (connectPoints && cleanPoints.length > 1) {
          const line = new maps.Polyline({
            path: cleanPoints.map((point) => new maps.LatLng(Number(point.latitude), Number(point.longitude))),
            strokeWeight: 3,
            strokeOpacity: 0.65,
            strokeStyle: 'solid',
          })
          line.setMap(mapRef.current)
          linesRef.current.push(line)
        }

        if (cleanPoints.length === 1 && !(pathSegments || []).length) {
          mapRef.current.setCenter(center)
          mapRef.current.setLevel(3)
        } else if (cleanPoints.length || (pathSegments || []).some((segment) => (segment.points || []).some(validPoint))) {
          mapRef.current.setBounds(bounds)
        }
        setTimeout(() => mapRef.current?.relayout?.(), 20)
      } catch (e) {
        if (alive) setError(e.message)
      }
    }
    init()
    return () => { alive = false }
  }, [points, connectPoints, pathSegments, onSelect])

  if (error) return <MapLoadError message={error} />
  return <div ref={ref} className="trip-map-canvas" />
}

function MapLoadError({ message }) {
  return <div className="map-error"><MapPinned size={28} /><strong>지도를 불러오지 못했어요</strong><p>{message}</p></div>
}

export function MapCanvas({ points = [], connectPoints = false, pathSegments = [], className = '' }) {
  const [selected, setSelected] = useState(null)
  const [override, setOverride] = useState('auto')
  const googleConfigured = isGoogleMapsConfigured()
  const kakaoConfigured = isKakaoMapsConfigured()
  const hasVisuals = (points || []).some(validPoint) || (pathSegments || []).some((segment) => (segment.points || []).some(validPoint))
  const kakaoEligible = useMemo(() => allVisualsAreKorean(points, pathSegments), [points, pathSegments])

  const autoProvider = kakaoEligible && kakaoConfigured
    ? 'kakao'
    : googleConfigured
      ? 'google'
      : kakaoEligible && kakaoConfigured
        ? 'kakao'
        : ''
  const provider = override === 'auto' ? autoProvider : override
  const canUseKakao = kakaoEligible && kakaoConfigured
  const canUseGoogle = googleConfigured

  useEffect(() => {
    if (override === 'kakao' && !canUseKakao) setOverride('auto')
    if (override === 'google' && !canUseGoogle) setOverride('auto')
  }, [override, canUseKakao, canUseGoogle])

  useEffect(() => setSelected(null), [provider, points, pathSegments])

  if (!hasVisuals) return <div className="map-empty"><MapPin size={28} /><strong>지도에 표시할 장소가 아직 없어요</strong><p>장소 검색으로 좌표가 연결된 일정이나 스크랩, 또는 실제 타임라인을 가져오면 여기에 표시돼요.</p></div>

  if (!provider) {
    if (kakaoEligible) return <MapSetupNotice domestic />
    return <MapSetupNotice overseas />
  }

  return (
    <div className={`trip-map-wrap ${className}`}>
      <div className="map-provider-bar">
        <span>{provider === 'kakao' ? 'Kakao Map' : 'Google Maps'}</span>
        {canUseKakao && canUseGoogle && (
          <div className="map-provider-switch">
            <button className={provider === 'kakao' ? 'active' : ''} onClick={() => setOverride('kakao')}>카카오</button>
            <button className={provider === 'google' ? 'active' : ''} onClick={() => setOverride('google')}>Google</button>
          </div>
        )}
      </div>
      {provider === 'kakao'
        ? <KakaoMapCanvas points={points} connectPoints={connectPoints} pathSegments={pathSegments} onSelect={setSelected} />
        : <GoogleMapCanvas points={points} connectPoints={connectPoints} pathSegments={pathSegments} onSelect={setSelected} />}
      {selected && (
        <div className="map-selected-card">
          <button className="map-selected-close" onClick={() => setSelected(null)} aria-label="장소 카드 닫기"><X size={16} /></button>
          <strong>{selected.name}</strong>
          <span>{[selected.country, selected.city].filter(Boolean).join(' · ') || selected.address || '장소'}</span>
          {selected.address && <small>{selected.address}</small>}
          {selected.tripTitle && <em>{selected.tripTitle}</em>}
          <button onClick={() => window.open(externalMapUrl(selected), '_blank', 'noopener,noreferrer')}><ExternalLink size={15} /> {externalMapLabel(selected)}</button>
        </div>
      )}
    </div>
  )
}

export function MapSetupNotice({ domestic = false, overseas = false }) {
  return (
    <div className="map-setup-notice">
      <MapPinned size={31} />
      <strong>{overseas ? '해외 지도는 Google Maps 연결이 필요해요' : domestic ? '국내 지도 API 연결이 필요해요' : '지도 API 연결이 필요해요'}</strong>
      <p>{overseas ? 'Google Maps API 키를 연결하면 해외 장소와 실제 동선을 지도에서 볼 수 있어요.' : '국내는 카카오맵을 우선 사용하고, Google Maps도 연결되어 있으면 언제든 전환할 수 있어요.'}</p>
      <div className="map-env-list"><code>VITE_KAKAO_MAPS_JAVASCRIPT_KEY</code><code>VITE_GOOGLE_MAPS_API_KEY</code></div>
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
  const [timeline, setTimeline] = useState({ paths: [], visits: [], segmentCount: 0 })
  const [mode, setMode] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    Promise.all([fetchTripMapPoints(trip.id), fetchTimelineMapData(trip.id)])
      .then(([planned, actual]) => { if (alive) { setPoints(planned); setTimeline(actual); setError('') } })
      .catch((e) => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [trip.id])
  const shownPoints = mode === 'actual' ? timeline.visits : mode === 'planned' ? points : [...points, ...timeline.visits]
  const shownPaths = mode === 'planned' ? [] : timeline.paths
  return (
    <SheetBackdrop onRequestClose={onClose}>
      <div className="create-sheet map-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={onClose}>닫기</button><span>여행 지도</span><div /></div>
        <div className="sheet-body map-sheet-body">
          <p className="eyebrow">TRIP MAP</p><h2>{trip.title}</h2>
          <div className="map-mode-toggle"><button className={mode === 'all' ? 'active' : ''} onClick={() => setMode('all')}>함께 보기</button><button className={mode === 'planned' ? 'active' : ''} onClick={() => setMode('planned')}>계획 동선</button><button className={mode === 'actual' ? 'active' : ''} onClick={() => setMode('actual')}>실제 동선</button></div>
          <p className="muted">국내 여행은 카카오맵을 우선 사용하고, 해외나 여러 국가가 섞인 여행은 Google 지도로 보여줘요.</p>
          {error && <div className="schedule-alert">{error}</div>}
          {loading ? <div className="schedule-loading">장소를 불러오는 중…</div> : <MapCanvas points={shownPoints} pathSegments={shownPaths} />}
          {mode !== 'planned' && !timeline.segmentCount && <div className="map-legend-note"><Route size={15} /><span>아직 가져온 실제 동선이 없어요. 여행 개요의 아카이브에서 Google 타임라인을 가져올 수 있어요.</span></div>}
        </div>
      </div>
    </SheetBackdrop>
  )
}

export function DayMapSheet({ day, items, tripId, onClose }) {
  const points = scheduleItemsToMapPoints(items)
  const [timeline, setTimeline] = useState({ paths: [], visits: [], segmentCount: 0 })
  const [mode, setMode] = useState('planned')
  useEffect(() => {
    if (!tripId || !day?.trip_date) return
    let alive = true
    fetchTimelineMapData(tripId, day.trip_date).then((data) => { if (alive) setTimeline(data) }).catch(() => {})
    return () => { alive = false }
  }, [tripId, day?.trip_date])
  const shownPoints = mode === 'actual' ? timeline.visits : mode === 'all' ? [...points, ...timeline.visits] : points
  const shownPaths = mode === 'planned' ? [] : timeline.paths
  return (
    <SheetBackdrop onRequestClose={onClose}>
      <div className="create-sheet map-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={onClose}>닫기</button><span>오늘 동선</span><div /></div>
        <div className="sheet-body map-sheet-body">
          <p className="eyebrow">DAY {day?.day_number} · {day?.trip_date}</p><h2>일정과 실제 이동 비교</h2>
          <div className="map-mode-toggle"><button className={mode === 'planned' ? 'active' : ''} onClick={() => setMode('planned')}>계획</button><button className={mode === 'actual' ? 'active' : ''} onClick={() => setMode('actual')}>실제</button><button className={mode === 'all' ? 'active' : ''} onClick={() => setMode('all')}>함께</button></div>
          <MapCanvas points={shownPoints} connectPoints={mode === 'planned'} pathSegments={shownPaths} />
          {mode === 'planned' && points.length > 1 && <div className="map-legend-note"><Route size={15} /><span>계획선은 일정 순서를 보기 쉽게 이어 놓은 것으로 실제 도로 경로는 아니에요.</span></div>}
          {mode !== 'planned' && !timeline.segmentCount && <div className="map-legend-note"><Route size={15} /><span>이 날짜에 저장된 Google 타임라인 실제 동선이 없어요.</span></div>}
        </div>
      </div>
    </SheetBackdrop>
  )
}
