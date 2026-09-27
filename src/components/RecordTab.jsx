import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  Clock3,
  FileText,
  Image as ImageIcon,
  MapPin,
  MapPinned,
  NotebookTabs,
  Paperclip,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Sparkles,
  Star,
  Ticket,
  Trash2,
  X,
} from 'lucide-react'
import RatingSlider from './RatingSlider'
import { MapCanvas } from './TravelMap'
import SheetBackdrop, { confirmSheetClose } from './SheetBackdrop'
import { DEFAULT_TIMEZONE } from '../lib/schedule'
import {
  deleteRecord,
  deleteRecordMedia,
  fetchRecordData,
  isoToRecordDateTime,
  openRecordMedia,
  recordTypeLabels,
  saveRecord,
  uploadRecordFiles,
} from '../lib/records'
import { deleteDayReflection, fetchDayReflectionSummary, generateDayReflectionDraft, saveDayReflection } from '../lib/dayReflections'

const typeIcons = {
  photo: Camera,
  ticket: Ticket,
  receipt: ReceiptText,
  note: FileText,
}

const filterItems = [
  ['all', '전체'],
  ['photo', '사진'],
  ['ticket', '티켓'],
  ['receipt', '영수증'],
  ['note', '메모'],
]

const timezoneOptions = [
  ['Asia/Seoul', '서울 · KST'],
  ['Asia/Tokyo', '도쿄 · JST'],
  ['Europe/London', '런던'],
  ['Europe/Paris', '파리'],
  ['Europe/Prague', '프라하'],
  ['Europe/Rome', '로마'],
  ['America/New_York', '뉴욕'],
  ['America/Los_Angeles', 'LA'],
  ['Pacific/Honolulu', '하와이'],
]

function currentTripDay(trip, days) {
  if (!trip.startDate || !trip.endDate) return days[0] || null
  const today = new Date().toISOString().slice(0, 10)
  return days.find((day) => day.trip_date === today) || days[0] || null
}

function formatDayTitle(day) {
  if (!day) return '여행 전체'
  if (!day.trip_date) return `DAY ${day.day_number} · 날짜 미정`
  const d = new Date(`${day.trip_date}T00:00:00`)
  return `DAY ${day.day_number} · ${d.getMonth() + 1}월 ${d.getDate()}일`
}

function formatRecordTime(record) {
  if (!record.recorded_at || record.recorded_time_known === false) return ''
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: record.recorded_timezone || DEFAULT_TIMEZONE,
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date(record.recorded_at))
  } catch {
    return ''
  }
}

function fallbackTitle(record) {
  return record.title || `${recordTypeLabels[record.type] || '기록'} 기록`
}

export default function RecordTab({ trip, refreshKey = 0, readOnly = false, quickCreateRequest = null, onQuickCreateDone }) {
  const [data, setData] = useState({ days: [], itinerary: [], records: [], reflections: [], mapPoints: [] })
  const [filter, setFilter] = useState('all')
  const [view, setView] = useState('list')
  const [editor, setEditor] = useState(null)
  const [viewer, setViewer] = useState(null)
  const [reflectionEditor, setReflectionEditor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const handledQuickRef = useRef(null)

  const reload = async () => {
    setLoading(true)
    try {
      setData(await fetchRecordData(trip.id))
      setMessage('')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [trip.id, refreshKey])

  useEffect(() => {
    if (readOnly || loading || !quickCreateRequest?.id || handledQuickRef.current === quickCreateRequest.id) return
    const preferred = data.days.find((day) => day.id === quickCreateRequest.preferredDayId)
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const todayDay = data.days.find((day) => day.trip_date === today)
    const defaultDay = preferred || todayDay || data.days[0] || null
    handledQuickRef.current = quickCreateRequest.id
    setEditor({ __new: true, tripDayId: defaultDay?.id || '', defaultType: quickCreateRequest.recordType || 'photo', __quick: true })
  }, [quickCreateRequest?.id, loading, readOnly, data.days])

  const filtered = useMemo(
    () => data.records.filter((record) => filter === 'all' || record.type === filter),
    [data.records, filter]
  )

  const reflectionMap = useMemo(() => new Map((data.reflections || []).map((row) => [row.trip_day_id, row])), [data.reflections])

  const groups = useMemo(() => {
    const dayMap = new Map(data.days.map((day) => [day.id, { key: day.id, day, records: [] }]))
    const tripLevel = { key: 'trip', day: null, records: [] }
    filtered.forEach((record) => {
      if (record.trip_day_id && dayMap.has(record.trip_day_id)) dayMap.get(record.trip_day_id).records.push(record)
      else tripLevel.records.push(record)
    })
    const ordered = data.days.map((day) => dayMap.get(day.id)).filter((group) => group.records.length)
    if (tripLevel.records.length) ordered.push(tripLevel)
    return ordered
  }, [data.days, filtered])

  const startNew = () => {
    const day = currentTripDay(trip, data.days)
    setEditor({ __new: true, tripDayId: day?.id || '' })
  }

  if (loading) return (
    <div className="tab-loading-shell record-tab-loading">
      <span className="loading-pulse-dot" />
      <strong>기록을 꺼내고 있어요</strong>
      <small>사진과 메모를 불러오는 중이에요.</small>
    </div>
  )

  return (
    <>
      <div className="record-toolbar">
        <div className="record-view-toggle" role="group" aria-label="기록 보기 방식">
          <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}><NotebookTabs size={15} /> 기록</button>
          <button className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}><MapPinned size={15} /> 사진 지도</button>
        </div>
        {view === 'list' && <div className="chip-row record-filter-row">
          {filterItems.map(([key, label]) => (
            <button key={key} className={filter === key ? 'chip active' : 'chip'} onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>}
        {!readOnly && <button className="primary-wide" onClick={startNew}><Plus size={18} /> 기록 추가</button>}
      </div>

      {message && <div className="schedule-alert">{message}</div>}

      {view === 'map' ? (
        <PhotoMapView data={data} onOpenRecord={(record) => setViewer(record)} />
      ) : <>
      <DayReflectionSection
        trip={trip}
        days={data.days}
        reflectionMap={reflectionMap}
        readOnly={readOnly}
        onOpen={(day, reflection) => setReflectionEditor({ day, reflection: reflection || null })}
      />

      {filtered.length === 0 ? (
        <div className="record-empty">
          <NotebookTabs size={31} />
          <strong>{filter === 'all' ? '여행의 흔적을 남겨보세요' : `${filterItems.find(([key]) => key === filter)?.[1]} 기록이 아직 없어요`}</strong>
          <p>사진은 일정에 연결하지 않아도 괜찮아요. 걷다가 찍은 하늘 사진처럼 그날의 순간만 따로 남길 수도 있어요.</p>
          <div className="rating-demo"><span>별점은 선택사항</span><Star size={17} fill="currentColor" /> 0.5 단위</div>
        </div>
      ) : (
        <div className="record-groups">
          {groups.map((group) => (
            <section className="record-day-group" key={group.key}>
              <div className="record-day-heading">
                <div><span>{group.day ? `DAY ${group.day.day_number}` : 'TRIP'}</span><strong>{formatDayTitle(group.day)}</strong></div>
                <small>{group.records.length}개</small>
              </div>
              <div className="record-list">
                {group.records.map((record) => (
                  <RecordCard key={record.id} record={record} onClick={() => setViewer(record)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      </>}

      {!readOnly && editor && (
        <RecordEditorModal
          trip={trip}
          data={data}
          record={editor.__new ? null : editor}
          defaultDayId={editor.tripDayId || ''}
          defaultType={editor.defaultType || 'photo'}
          onClose={() => { const wasQuick = editor.__quick; setEditor(null); if (wasQuick) onQuickCreateDone?.() }}
          onSaved={async () => { const wasQuick = editor.__quick; setEditor(null); await reload(); if (wasQuick) onQuickCreateDone?.() }}
        />
      )}

      {viewer && (
        <RecordDetailModal
          record={viewer}
          onClose={() => setViewer(null)}
          onEdit={() => { setEditor(viewer); setViewer(null) }}
          onDeleted={async () => { setViewer(null); await reload() }}
          readOnly={readOnly}
        />
      )}

      {reflectionEditor && (
        <DayReflectionEditor
          trip={trip}
          day={reflectionEditor.day}
          reflection={reflectionEditor.reflection}
          readOnly={readOnly}
          onClose={() => setReflectionEditor(null)}
          onSaved={async () => { setReflectionEditor(null); await reload() }}
          onDeleted={async () => { setReflectionEditor(null); await reload() }}
        />
      )}
    </>
  )
}


function cleanPlaceText(value = '') {
  return String(value || '').trim().toLocaleLowerCase().replace(/\s+/g, '').replace(/[()\[\]{}·,._-]/g, '')
}

function pointFromPlace(place) {
  if (!place || place.latitude == null || place.longitude == null) return null
  return {
    id: place.id,
    placeId: place.id,
    name: place.name,
    city: place.city,
    country: place.country,
    address: place.address,
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
    timezone: place.timezone,
    provider: place.provider,
    providerPlaceId: place.provider_place_id,
    mapUrl: place.map_url,
  }
}

function resolveRecordPoint(record, mapPoints = []) {
  const direct = pointFromPlace(record.trip_on_places)
  if (direct) return direct
  const itinerary = pointFromPlace(record.itinerary_item?.trip_on_places)
  if (itinerary) return itinerary
  const names = [record.place_name, record.itinerary_item?.title].map(cleanPlaceText).filter(Boolean)
  if (!names.length) return null
  const sameCity = cleanPlaceText(record.city || record.itinerary_item?.city)
  const exact = mapPoints.find((point) => {
    const pointName = cleanPlaceText(point.name)
    if (!names.includes(pointName)) return false
    if (!sameCity) return true
    return !point.city || cleanPlaceText(point.city) === sameCity
  })
  return exact || mapPoints.find((point) => names.includes(cleanPlaceText(point.name))) || null
}

function buildPhotoMapData(data, dayId = 'all') {
  const grouped = new Map()
  const unlocated = []
  for (const record of data.records || []) {
    if (dayId !== 'all' && record.trip_day_id !== dayId) continue
    const images = (record.media || []).filter((media) => media.media_type === 'image' && media.signed_url)
    if (!images.length) continue
    const point = resolveRecordPoint(record, data.mapPoints || [])
    if (!point) {
      unlocated.push({ record, images })
      continue
    }
    const key = point.placeId || point.id || `${Number(point.latitude).toFixed(5)},${Number(point.longitude).toFixed(5)}`
    if (!grouped.has(key)) grouped.set(key, { key, point, records: new Map(), images: [] })
    const group = grouped.get(key)
    group.records.set(record.id, record)
    images.forEach((media) => group.images.push({ media, record }))
  }
  const groups = [...grouped.values()].map((group) => ({ ...group, records: [...group.records.values()] }))
  return { groups, unlocated }
}

function PhotoMapView({ data, onOpenRecord }) {
  const [dayId, setDayId] = useState('all')
  const { groups, unlocated } = useMemo(() => buildPhotoMapData(data, dayId), [data, dayId])
  const points = useMemo(() => groups.map((group) => ({
    ...group.point,
    id: `photo:${group.key}`,
    photoGroupKey: group.key,
    name: group.point.name || group.records[0]?.place_name || '사진 장소',
    markerLabel: String(group.images.length),
  })), [groups])
  const locatedCount = groups.reduce((sum, group) => sum + group.images.length, 0)
  const unlocatedCount = unlocated.reduce((sum, group) => sum + group.images.length, 0)
  const totalCount = locatedCount + unlocatedCount

  const renderSelected = (selected, close) => {
    const group = groups.find((entry) => entry.key === selected.photoGroupKey)
    if (!group) return null
    return (
      <div className="map-selected-card photo-map-selected-card">
        <button className="map-selected-close" onClick={close} aria-label="사진 장소 카드 닫기"><X size={16} /></button>
        <strong>{selected.name}</strong>
        <span>{[selected.city, selected.country].filter(Boolean).join(' · ') || selected.address || '사진 장소'} · 사진 {group.images.length}장</span>
        <div className="photo-map-selected-grid">
          {group.images.slice(0, 6).map(({ media, record }, index) => (
            <button key={`${media.id}-${index}`} onClick={() => onOpenRecord(record)} aria-label={`${fallbackTitle(record)} 열기`}>
              <img src={media.signed_url} alt={fallbackTitle(record)} />
            </button>
          ))}
          {group.images.length > 6 && <button className="photo-map-more" onClick={() => onOpenRecord(group.images[6].record)}>+{group.images.length - 6}</button>}
        </div>
        <small>{group.records.length}개의 기록에 연결되어 있어요.</small>
      </div>
    )
  }

  if (!totalCount) return (
    <div className="photo-map-empty">
      <MapPinned size={29} />
      <strong>지도에 모아볼 사진이 아직 없어요</strong>
      <p>사진 기록을 남기고 일정이나 기존 여행 장소에 연결하면 여행 사진 지도가 만들어져요.</p>
    </div>
  )

  return (
    <section className="photo-map-view">
      <div className="photo-map-heading">
        <div><span><MapPinned size={16} /> PHOTO MAP</span><strong>사진으로 다시 보는 여행</strong><small>마커 숫자는 그 장소에 연결된 사진 수예요.</small></div>
        <em>{locatedCount}/{totalCount}장 위치 연결</em>
      </div>
      <div className="chip-row photo-map-day-filter">
        <button className={dayId === 'all' ? 'chip active' : 'chip'} onClick={() => setDayId('all')}>전체</button>
        {(data.days || []).map((day) => <button key={day.id} className={dayId === day.id ? 'chip active' : 'chip'} onClick={() => setDayId(day.id)}>DAY {day.day_number}</button>)}
      </div>
      {groups.length > 0 ? <MapCanvas className="photo-map-canvas" points={points} renderSelected={renderSelected} /> : <div className="photo-map-no-points"><MapPin size={25} /><strong>이 DAY에는 위치가 연결된 사진이 없어요.</strong></div>}
      {unlocatedCount > 0 && (
        <section className="photo-map-unlocated">
          <div><strong>위치 미연결 사진</strong><small>{unlocatedCount}장 · 기록을 수정해 기존 여행 장소에 연결하면 지도에 표시돼요.</small></div>
          <div className="photo-map-unlocated-list">
            {unlocated.map(({ record, images }) => (
              <button key={record.id} onClick={() => onOpenRecord(record)}>
                <img src={images[0].signed_url} alt={fallbackTitle(record)} />
                <span><strong>{fallbackTitle(record)}</strong><small>{record.day ? `DAY ${record.day.day_number}` : '여행 전체'} · 사진 {images.length}장</small></span>
              </button>
            ))}
          </div>
        </section>
      )}
    </section>
  )
}

function DayReflectionSection({ trip, days, reflectionMap, readOnly, onOpen }) {
  const savedCount = days.filter((day) => reflectionMap.has(day.id)).length
  if (!days.length) return null
  if (readOnly && savedCount === 0) return null
  return (
    <section className="day-reflection-section">
      <div className="day-reflection-head">
        <div><span><Sparkles size={15} /> DAY 회고</span><small>일정·사진·지출·실제 동선을 모아 하루 초안을 만들어요.</small></div>
        <em>{savedCount}/{days.length}</em>
      </div>
      <div className="day-reflection-list">
        {days.map((day) => {
          const reflection = reflectionMap.get(day.id) || null
          if (readOnly && !reflection) return null
          return (
            <button key={day.id} className={`day-reflection-card ${reflection ? 'saved' : ''}`} onClick={() => onOpen(day, reflection)}>
              <span className="day-reflection-day">DAY {day.day_number}</span>
              <div>
                <strong>{reflection ? '회고가 저장되어 있어요' : '자동 회고 초안 만들기'}</strong>
                <p>{reflection ? reflection.body : `${formatDayTitle(day)}의 일정과 기록을 한 문장씩 정리해드려요.`}</p>
              </div>
              <span className="day-reflection-action">{reflection ? (readOnly ? '보기' : '수정') : '만들기'}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function DayReflectionEditor({ trip, day, reflection, readOnly, onClose, onSaved, onDeleted }) {
  const [body, setBody] = useState(reflection?.body || '')
  const [summary, setSummary] = useState(reflection?.source_snapshot || null)
  const [generatedAt, setGeneratedAt] = useState(reflection?.generated_at || null)
  const [loadingDraft, setLoadingDraft] = useState(!reflection && !readOnly)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const initialBody = reflection?.body || ''

  const makeDraft = async () => {
    setLoadingDraft(true)
    setError('')
    try {
      const nextSummary = await fetchDayReflectionSummary({ tripId: trip.id, dayId: day.id })
      setSummary(nextSummary)
      setBody(generateDayReflectionDraft(nextSummary))
      setGeneratedAt(new Date().toISOString())
    } catch (e) { setError(e.message) }
    finally { setLoadingDraft(false) }
  }

  useEffect(() => {
    if (!reflection && !readOnly) makeDraft()
  }, [day.id])

  const requestClose = () => confirmSheetClose(!readOnly && body !== initialBody, onClose)

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await saveDayReflection({ tripId: trip.id, dayId: day.id, body, sourceSnapshot: summary || {}, generatedAt })
      await onSaved()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const remove = async () => {
    if (!reflection?.id || !window.confirm('이 DAY 회고를 삭제할까요?')) return
    setSaving(true)
    try { await deleteDayReflection(reflection.id); await onDeleted() }
    catch (e) { setError(e.message); setSaving(false) }
  }

  const stats = summary ? [
    summary.schedule?.completed ? `완료 ${summary.schedule.completed}` : null,
    summary.records?.photoFiles ? `사진 ${summary.records.photoFiles}장` : null,
    summary.timeline?.distanceMeters ? `이동 ${Math.max(0.1, summary.timeline.distanceMeters / 1000).toFixed(summary.timeline.distanceMeters >= 10000 ? 0 : 1)}km` : null,
    summary.expenses?.krwTotal ? `지출 ₩${Math.round(summary.expenses.krwTotal).toLocaleString('ko-KR')}` : null,
  ].filter(Boolean) : []

  return (
    <SheetBackdrop onRequestClose={requestClose}>
      <div className="create-sheet day-reflection-editor" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={requestClose}>닫기</button><span>DAY {day.day_number} 회고</span><div /></div>
        <div className="sheet-body">
          <p className="eyebrow">DAY REFLECTION</p>
          <h2>{readOnly ? '이날의 회고' : reflection ? '이날의 기억을 다듬어보세요' : '하루 기록을 모아 초안을 만들었어요'}</h2>
          <p className="day-reflection-date">{formatDayTitle(day)}</p>
          {stats.length > 0 && <div className="day-reflection-stats">{stats.map((item) => <span key={item}>{item}</span>)}</div>}
          {loadingDraft ? (
            <div className="day-reflection-generating"><Sparkles size={20} /><strong>하루 기록을 모으는 중…</strong><small>일정·사진·지출·Timeline을 확인하고 있어요.</small></div>
          ) : readOnly ? (
            <div className="day-reflection-readonly">{body}</div>
          ) : (
            <>
              <label className="day-reflection-textarea">회고<textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="이날 기억하고 싶은 일을 자유롭게 적어보세요." /></label>
              <button className="day-reflection-regenerate" onClick={makeDraft} disabled={loadingDraft || saving}><RefreshCw size={15} /> 현재 기록으로 초안 다시 만들기</button>
            </>
          )}
          {error && <div className="schedule-alert">{error}</div>}
          {!readOnly && !loadingDraft && <div className="day-reflection-bottom-actions">{reflection?.id && <button className="danger-text" onClick={remove} disabled={saving}><Trash2 size={15} /> 삭제</button>}<button className="sheet-primary" onClick={save} disabled={saving || !body.trim()}>{saving ? '저장 중…' : '회고 저장'}</button></div>}
        </div>
      </div>
    </SheetBackdrop>
  )
}

function RecordCard({ record, onClick }) {
  const Icon = typeIcons[record.type] || NotebookTabs
  const images = (record.media || []).filter((media) => media.media_type === 'image' && media.signed_url)
  const time = formatRecordTime(record)
  return (
    <button className="record-card" onClick={onClick}>
      {images.length > 0 && (
        <div className={`record-card-images count-${Math.min(images.length, 3)}`}>
          {images.slice(0, 3).map((media, index) => <img key={media.id} src={media.signed_url} alt={`${fallbackTitle(record)} ${index + 1}`} />)}
          {images.length > 3 && <span className="record-more-count">+{images.length - 3}</span>}
        </div>
      )}
      <div className="record-card-body">
        <div className="record-type-icon"><Icon size={17} /></div>
        <div className="record-card-copy">
          <div className="record-card-title"><strong>{fallbackTitle(record)}</strong>{time && <small><Clock3 size={12} /> {time}</small>}</div>
          <p>{[
            record.place_name,
            record.city,
            record.itinerary_item?.title ? `일정 · ${record.itinerary_item.title}` : null,
          ].filter(Boolean).join(' · ') || recordTypeLabels[record.type]}</p>
          {record.memo && <em>{record.memo}</em>}
          <div className="record-card-meta">
            {record.rating && <span><Star size={13} fill="currentColor" /> {Number(record.rating).toFixed(1)}</span>}
            {(record.media || []).length > 0 && <span><Paperclip size={13} /> {(record.media || []).length}</span>}
          </div>
        </div>
      </div>
    </button>
  )
}

function RecordEditorModal({ trip, data, record, defaultDayId, defaultType = 'photo', onClose, onSaved }) {
  const initialDateTime = isoToRecordDateTime(record?.recorded_at, record?.recorded_timezone || DEFAULT_TIMEZONE)
  if (record && record.recorded_time_known === false) initialDateTime.time = ''
  const defaultDay = data.days.find((day) => day.id === (record?.trip_day_id || defaultDayId)) || null
  const [type, setType] = useState(record?.type || defaultType || 'photo')
  const [title, setTitle] = useState(record?.title || '')
  const [tripDayId, setTripDayId] = useState(record?.trip_day_id || defaultDayId || '')
  const [itineraryItemId, setItineraryItemId] = useState(record?.itinerary_item_id || '')
  const [recordDate, setRecordDate] = useState(initialDateTime.date || defaultDay?.trip_date || '')
  const [recordTime, setRecordTime] = useState(initialDateTime.time || '')
  const [timezone, setTimezone] = useState(record?.recorded_timezone || DEFAULT_TIMEZONE)
  const [placeId, setPlaceId] = useState(record?.place_id || '')
  const [placeName, setPlaceName] = useState(record?.place_name || record?.trip_on_places?.name || '')
  const [city, setCity] = useState(record?.city || record?.trip_on_places?.city || '')
  const [memo, setMemo] = useState(record?.memo || '')
  const [rating, setRating] = useState(record?.rating ? String(record.rating) : '')
  const [files, setFiles] = useState([])
  const [existingMedia, setExistingMedia] = useState(record?.media || [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const initialSnapshot = JSON.stringify({ type: record?.type || defaultType || 'photo', title: record?.title || '', tripDayId: record?.trip_day_id || defaultDayId || '', itineraryItemId: record?.itinerary_item_id || '', placeId: record?.place_id || '', recordDate: initialDateTime.date || defaultDay?.trip_date || '', recordTime: initialDateTime.time || '', timezone: record?.recorded_timezone || DEFAULT_TIMEZONE, placeName: record?.place_name || record?.trip_on_places?.name || '', city: record?.city || record?.trip_on_places?.city || '', memo: record?.memo || '', rating: record?.rating ? String(record.rating) : '' })
  const currentSnapshot = JSON.stringify({ type, title, tripDayId, itineraryItemId, placeId, recordDate, recordTime, timezone, placeName, city, memo, rating })
  const requestClose = () => confirmSheetClose(initialSnapshot !== currentSnapshot || files.length > 0, onClose)

  const itineraryForDay = data.itinerary.filter((item) => !tripDayId || item.trip_day_id === tripDayId)

  const changeDay = (dayId) => {
    setTripDayId(dayId)
    setItineraryItemId('')
    setPlaceId('')
    const day = data.days.find((item) => item.id === dayId)
    if (day?.trip_date) setRecordDate(day.trip_date)
  }

  const changeItinerary = (itemId) => {
    setItineraryItemId(itemId)
    const item = data.itinerary.find((entry) => entry.id === itemId)
    if (!item) return
    if (item.trip_day_id) {
      setTripDayId(item.trip_day_id)
      const day = data.days.find((entry) => entry.id === item.trip_day_id)
      if (day?.trip_date) setRecordDate(day.trip_date)
    }
    if (item.place_id) {
      setPlaceId(item.place_id)
      setPlaceName(item.trip_on_places?.name || item.title || '')
      setCity(item.trip_on_places?.city || item.city || '')
    } else {
      if (!placeName) setPlaceName(item.title || '')
      if (!city && item.city) setCity(item.city)
    }
  }

  const changeLinkedPlace = (nextPlaceId) => {
    setPlaceId(nextPlaceId)
    const point = (data.mapPoints || []).find((entry) => (entry.placeId || entry.id) === nextPlaceId)
    if (!point) return
    setPlaceName(point.name || '')
    setCity(point.city || '')
  }

  const removeExistingMedia = async (media) => {
    if (!window.confirm('이 첨부파일을 삭제할까요?')) return
    try {
      await deleteRecordMedia(media)
      setExistingMedia((prev) => prev.filter((item) => item.id !== media.id))
    } catch (e) {
      setError(e.message)
    }
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const saved = await saveRecord({
        tripId: trip.id,
        draft: {
          id: record?.id,
          type, title, tripDayId, itineraryItemId, placeId,
          recordDate, recordTime, timezone,
          placeName, city, memo, rating,
        },
      })
      if (files.length) await uploadRecordFiles({ tripId: trip.id, recordId: saved.id, files })
      await onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SheetBackdrop onRequestClose={requestClose}>
      <div className="create-sheet record-editor-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={requestClose}>취소</button><span>{record ? '기록 수정' : '기록 추가'}</span><div /></div>
        <div className="sheet-body record-form">
          <p className="eyebrow">TRAVEL RECORD</p>
          <h2>{record ? '기록을 다듬어볼까요?' : '어떤 순간을 남길까요?'}</h2>

          <div className="record-type-picker">
            {Object.entries(recordTypeLabels).map(([key, label]) => {
              const Icon = typeIcons[key]
              return <button key={key} className={type === key ? 'active' : ''} onClick={() => setType(key)}><Icon size={18} /><span>{label}</span></button>
            })}
          </div>

          <label>제목 <span className="optional">선택</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'photo' ? '예: 파리에서 본 저녁 하늘' : '기록 제목'} /></label>

          <div className="form-two">
            <label>DAY <span className="optional">선택</span><select value={tripDayId} onChange={(e) => changeDay(e.target.value)}><option value="">여행 전체</option>{data.days.map((day) => <option key={day.id} value={day.id}>DAY {day.day_number}{day.trip_date ? ` · ${day.trip_date}` : ' · 날짜 미정'}</option>)}</select></label>
            <label>일정 연결 <span className="optional">선택</span><select value={itineraryItemId} onChange={(e) => changeItinerary(e.target.value)}><option value="">연결 안 함</option>{itineraryForDay.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          </div>

          <div className="form-two">
            <label>날짜 <span className="optional">선택</span><input type="date" value={recordDate} onChange={(e) => setRecordDate(e.target.value)} /></label>
            <label>시간 <span className="optional">선택</span><input type="time" value={recordTime} onChange={(e) => setRecordTime(e.target.value)} /></label>
          </div>

          <label>기록 시간대<select value={timezone} onChange={(e) => setTimezone(e.target.value)}>{timezoneOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>

          <label>기존 여행 장소 연결 <span className="optional">선택 · 사진 지도에 사용</span><select value={placeId} onChange={(e) => changeLinkedPlace(e.target.value)}><option value="">연결 안 함</option>{(data.mapPoints || []).map((point) => <option key={point.placeId || point.id} value={point.placeId || point.id}>{point.name}{point.city ? ` · ${point.city}` : ''}</option>)}</select></label>

          <div className="form-two">
            <label>장소 <span className="optional">선택</span><input value={placeName} onChange={(e) => { setPlaceName(e.target.value); if (placeId) setPlaceId('') }} placeholder="예: 센강 산책로" /></label>
            <label>도시 <span className="optional">선택</span><input value={city} onChange={(e) => setCity(e.target.value)} placeholder="예: 파리" /></label>
          </div>

          <label>메모 <span className="optional">선택</span><textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="그 순간 기억하고 싶은 걸 적어두세요." /></label>

          <RatingSlider value={rating} onChange={setRating} label="이 기록의 별점" />

          <div className="record-file-box">
            <div className="record-file-head"><div><strong>사진 · 파일</strong><small>사진은 여러 장, 티켓·영수증은 이미지나 PDF로 첨부할 수 있어요.</small></div><label className="record-file-add"><Plus size={16} /> 추가<input type="file" accept="image/*,.heic,.heif,application/pdf" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} /></label></div>
            {existingMedia.length > 0 && <div className="existing-media-list">{existingMedia.map((media) => <div key={media.id} className="existing-media-item">{media.media_type === 'image' && media.signed_url ? <img src={media.signed_url} alt="첨부 이미지" /> : <FileText size={20} />}<span>{media.file_name || '첨부파일'}</span><button onClick={() => removeExistingMedia(media)}><X size={15} /></button></div>)}</div>}
            {files.length > 0 && <div className="pending-files">{files.map((file, index) => <span key={`${file.name}-${index}`}><Paperclip size={13} /> {file.name}</span>)}</div>}
          </div>

          {error && <div className="schedule-alert">{error}</div>}
          <button className="sheet-primary" disabled={saving} onClick={save}>{saving ? '저장 중…' : record ? '수정 저장' : '기록 저장'}</button>
        </div>
      </div>
    </SheetBackdrop>
  )
}

function RecordDetailModal({ record, onClose, onEdit, onDeleted, readOnly = false }) {
  const [working, setWorking] = useState(false)
  const Icon = typeIcons[record.type] || NotebookTabs
  const time = formatRecordTime(record)

  const remove = async () => {
    if (!window.confirm('이 기록을 삭제할까요? 첨부한 사진과 파일도 함께 삭제돼요.')) return
    setWorking(true)
    try {
      await deleteRecord(record)
      await onDeleted()
    } finally {
      setWorking(false)
    }
  }

  const openMedia = async (media) => {
    try {
      const url = await openRecordMedia(media)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      window.alert(error.message)
    }
  }

  return (
    <SheetBackdrop onRequestClose={onClose}>
      <div className="create-sheet record-detail-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={onClose}>닫기</button><span>기록 상세</span>{readOnly ? <div /> : <button onClick={onEdit}><Pencil size={17} /></button>}</div>
        <div className="sheet-body">
          <div className="record-detail-kicker"><span><Icon size={16} /> {recordTypeLabels[record.type]}</span>{record.day && <small>DAY {record.day.day_number}{record.day.trip_date ? ` · ${record.day.trip_date}` : ' · 날짜 미정'}</small>}</div>
          <h2 className="record-detail-title">{fallbackTitle(record)}</h2>

          <div className="record-detail-meta">
            {time && <span><Clock3 size={15} /> {time}</span>}
            {(record.place_name || record.city) && <span><MapPin size={15} /> {[record.place_name, record.city].filter(Boolean).join(' · ')}</span>}
            {record.itinerary_item?.title && <span><NotebookTabs size={15} /> {record.itinerary_item.title}</span>}
            {record.rating && <span><Star size={15} fill="currentColor" /> {Number(record.rating).toFixed(1)} / 5.0</span>}
          </div>

          {record.memo && <div className="record-detail-memo"><p>{record.memo}</p></div>}

          {(record.media || []).length > 0 && (
            <div className="record-media-grid">
              {(record.media || []).map((media) => media.media_type === 'image' && media.signed_url ? (
                <button key={media.id} className="record-media-image" onClick={() => openMedia(media)}><img src={media.signed_url} alt={media.file_name || '기록 이미지'} /></button>
              ) : (
                <button key={media.id} className="record-media-file" onClick={() => openMedia(media)}><FileText size={22} /><span>{media.file_name || '첨부파일'}</span></button>
              ))}
            </div>
          )}

          {!readOnly && <div className="detail-bottom-actions"><button className="danger-text" disabled={working} onClick={remove}><Trash2 size={16} /> 삭제</button><button className="sheet-primary" onClick={onEdit}><Pencil size={16} /> 수정</button></div>}
        </div>
      </div>
    </SheetBackdrop>
  )
}
