import React, { useEffect, useMemo, useState } from 'react'
import {
  BedDouble,
  Bus,
  CalendarPlus,
  ChevronRight,
  ExternalLink,
  FileText,
  Link2,
  MapPin,
  Pencil,
  Plus,
  Store,
  Trash2,
} from 'lucide-react'
import SheetBackdrop, { confirmSheetClose } from './SheetBackdrop'
import {
  addScrapToSchedule,
  commitScrapToSchedule,
  deleteScrap,
  fetchScraps,
  isPlaceScrap,
  saveScrap,
  scrapStatusLabels,
  scrapTypeLabels,
} from '../lib/scraps'

const typeIcons = {
  place: MapPin,
  accommodation: BedDouble,
  restaurant: Store,
  transport: Bus,
  link: Link2,
  memo: FileText,
  other: FileText,
}

const filters = [
  ['all', '전체'],
  ['place', '장소'],
  ['accommodation', '숙소'],
  ['restaurant', '맛집'],
  ['transport', '교통'],
  ['link-memo', '링크·메모'],
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

function tripLabel(scrap) {
  return scrap.trip_on_trips?.title || '여행 미정'
}

function placeMeta(scrap) {
  const place = scrap.trip_on_places
  if (!place) return ''
  return [place.country, place.city, place.address].filter(Boolean).join(' · ')
}

export default function ScrapTab({ trips }) {
  const [scraps, setScraps] = useState([])
  const [filter, setFilter] = useState('all')
  const [tripFilter, setTripFilter] = useState('all')
  const [editor, setEditor] = useState(null)
  const [viewer, setViewer] = useState(null)
  const [scheduleTarget, setScheduleTarget] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const reload = async () => {
    setLoading(true)
    try {
      setScraps(await fetchScraps())
      setMessage('')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  const filtered = useMemo(() => scraps.filter((scrap) => {
    const typeOk = filter === 'all'
      || scrap.type === filter
      || (filter === 'link-memo' && ['link', 'memo', 'other'].includes(scrap.type))
    const tripOk = tripFilter === 'all'
      || (tripFilter === 'none' && !scrap.trip_id)
      || scrap.trip_id === tripFilter
    return typeOk && tripOk
  }), [scraps, filter, tripFilter])

  return (
    <>
      <section className="hero-copy small scrap-hero">
        <p className="eyebrow">COLLECT FOR LATER</p>
        <h1>스크랩</h1>
        <p>여행을 준비하면서 발견한 장소와 링크를 모아두고, 나중에 일정으로 바로 옮길 수 있어요.</p>
      </section>

      <div className="scrap-toolbar">
        <div className="chip-row scrap-filter-row">
          {filters.map(([key, label]) => <button key={key} className={filter === key ? 'chip active' : 'chip'} onClick={() => setFilter(key)}>{label}</button>)}
        </div>
        <select className="scrap-trip-filter" value={tripFilter} onChange={(e) => setTripFilter(e.target.value)} aria-label="여행별 스크랩 필터">
          <option value="all">모든 여행</option>
          <option value="none">여행 미정</option>
          {trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.title}</option>)}
        </select>
        <button className="primary-wide" onClick={() => setEditor({ __new: true })}><Plus size={18} /> 스크랩 추가</button>
      </div>

      {message && <div className="schedule-alert">{message}</div>}
      {loading ? (
        <div className="scrap-loading">스크랩을 불러오는 중…</div>
      ) : filtered.length === 0 ? (
        <div className="scrap-empty">
          <MapPin size={31} />
          <strong>{scraps.length ? '조건에 맞는 스크랩이 없어요' : '아직 스크랩이 없어요'}</strong>
          <p>가고 싶은 장소, 숙소 후보, 맛집, 교통 정보, 참고 링크를 여행이 정해지기 전부터 자유롭게 모아둘 수 있어요.</p>
        </div>
      ) : (
        <div className="scrap-grid">
          {filtered.map((scrap) => <ScrapCard key={scrap.id} scrap={scrap} onClick={() => setViewer(scrap)} />)}
        </div>
      )}

      {editor && (
        <ScrapEditor
          scrap={editor.__new ? null : editor}
          trips={trips}
          onClose={() => setEditor(null)}
          onSaved={async () => { setEditor(null); await reload() }}
        />
      )}

      {viewer && (
        <ScrapDetail
          scrap={viewer}
          trips={trips}
          onClose={() => setViewer(null)}
          onEdit={() => { setEditor(viewer); setViewer(null) }}
          onSchedule={() => { setScheduleTarget(viewer); setViewer(null) }}
          onDeleted={async () => { setViewer(null); await reload() }}
        />
      )}

      {scheduleTarget && (
        <ScrapScheduleModal
          scrap={scheduleTarget}
          trips={trips}
          onClose={() => setScheduleTarget(null)}
          onSaved={async () => { setScheduleTarget(null); await reload() }}
        />
      )}
    </>
  )
}

function ScrapCard({ scrap, onClick }) {
  const Icon = typeIcons[scrap.type] || FileText
  return (
    <button className="scrap-card" onClick={onClick}>
      <div className="scrap-card-icon"><Icon size={18} /></div>
      <div className="scrap-card-copy">
        <div className="scrap-card-top"><span>{scrapTypeLabels[scrap.type] || '스크랩'}</span><em className={`scrap-status status-${scrap.status}`}>{scrapStatusLabels[scrap.status] || scrap.status}</em></div>
        <strong>{scrap.title}</strong>
        <p>{placeMeta(scrap) || (scrap.url ? scrap.url.replace(/^https?:\/\//, '').split('/')[0] : '메모')}</p>
        <small>{tripLabel(scrap)}</small>
      </div>
      <ChevronRight size={17} />
    </button>
  )
}

function ScrapEditor({ scrap, trips, onClose, onSaved }) {
  const place = scrap?.trip_on_places
  const [type, setType] = useState(scrap?.type || 'place')
  const [title, setTitle] = useState(scrap?.title || '')
  const [tripId, setTripId] = useState(scrap?.trip_id || '')
  const [country, setCountry] = useState(place?.country || '')
  const [city, setCity] = useState(place?.city || '')
  const [address, setAddress] = useState(place?.address || '')
  const [timezone, setTimezone] = useState(place?.timezone || 'Asia/Seoul')
  const [url, setUrl] = useState(scrap?.url || '')
  const [memo, setMemo] = useState(scrap?.memo || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const initialSnapshot = JSON.stringify({ type: scrap?.type || 'place', title: scrap?.title || '', tripId: scrap?.trip_id || '', country: place?.country || '', city: place?.city || '', address: place?.address || '', timezone: place?.timezone || 'Asia/Seoul', url: scrap?.url || '', memo: scrap?.memo || '' })
  const currentSnapshot = JSON.stringify({ type, title, tripId, country, city, address, timezone, url, memo })
  const requestClose = () => confirmSheetClose(initialSnapshot !== currentSnapshot, onClose)

  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    setError('')
    try {
      await saveScrap({
        id: scrap?.id,
        placeId: scrap?.place_id,
        status: scrap?.status || 'saved',
        type, title, tripId, country, city, address, timezone, url, memo,
      })
      await onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const placeFields = isPlaceScrap(type)
  return (
    <SheetBackdrop onRequestClose={requestClose}>
      <div className="create-sheet scrap-editor-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={requestClose}>취소</button><span>{scrap ? '스크랩 수정' : '스크랩 추가'}</span><div /></div>
        <div className="sheet-body scrap-form">
          <p className="eyebrow">SAVE FOR LATER</p>
          <h2>{scrap ? '저장한 내용을 다듬을까요?' : '무엇을 저장할까요?'}</h2>
          <label>종류<select value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(scrapTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>이름<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'restaurant' ? '예: 파리 크레페 맛집' : '예: 몽마르트르 언덕'} /></label>
          <label>연결할 여행 <span className="optional">선택</span><select value={tripId} onChange={(e) => setTripId(e.target.value)}><option value="">아직 여행 미정</option>{trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.title}</option>)}</select></label>

          {placeFields && (
            <div className="scrap-place-box">
              <div className="form-two"><label>국가 <span className="optional">선택</span><input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="예: 프랑스" /></label><label>도시 <span className="optional">선택</span><input value={city} onChange={(e) => setCity(e.target.value)} placeholder="예: 파리" /></label></div>
              <label>주소 <span className="optional">선택</span><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="주소나 지역명을 적어두세요" /></label>
              <label>시간대 <span className="optional">선택</span><select value={timezone} onChange={(e) => setTimezone(e.target.value)}>{timezoneOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            </div>
          )}

          <label>링크 <span className="optional">선택</span><input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." /></label>
          <label>메모 <span className="optional">선택</span><textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="왜 저장했는지, 먹고 싶은 메뉴나 참고할 점을 적어두세요." /></label>
          {error && <div className="schedule-alert">{error}</div>}
          <button className="sheet-primary" disabled={!title.trim() || saving} onClick={save}>{saving ? '저장 중…' : scrap ? '수정 저장' : '스크랩 저장'}</button>
        </div>
      </div>
    </SheetBackdrop>
  )
}

function ScrapDetail({ scrap, trips, onClose, onEdit, onSchedule, onDeleted }) {
  const Icon = typeIcons[scrap.type] || FileText
  const canSchedule = isPlaceScrap(scrap.type) || ['other'].includes(scrap.type)
  const remove = async () => {
    if (!window.confirm('이 스크랩을 삭제할까요?')) return
    try {
      await deleteScrap(scrap.id)
      await onDeleted()
    } catch (error) {
      window.alert(error.message)
    }
  }
  return (
    <SheetBackdrop onRequestClose={onClose}>
      <div className="create-sheet scrap-detail-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={onClose}>닫기</button><span>스크랩 상세</span><div /></div>
        <div className="sheet-body scrap-detail-body">
          <div className="scrap-detail-title"><div className="scrap-card-icon"><Icon size={20} /></div><div><span>{scrapTypeLabels[scrap.type]}</span><h2>{scrap.title}</h2></div></div>
          <div className="scrap-detail-tags"><span>{tripLabel(scrap)}</span><span>{scrapStatusLabels[scrap.status]}</span></div>
          {placeMeta(scrap) && <div className="detail-line"><MapPin size={17} /><span>{placeMeta(scrap)}</span></div>}
          {scrap.trip_on_places?.timezone && <div className="detail-line"><span className="detail-line-label">시간대</span><span>{scrap.trip_on_places.timezone}</span></div>}
          {scrap.memo && <div className="scrap-detail-note">{scrap.memo}</div>}
          {scrap.url && <button className="outline-wide" onClick={() => window.open(scrap.url, '_blank', 'noopener,noreferrer')}><ExternalLink size={17} /> 원본 링크 열기</button>}
          <div className="scrap-detail-actions">
            <button onClick={onEdit}><Pencil size={17} /> 수정</button>
            <button className="danger" onClick={remove}><Trash2 size={17} /> 삭제</button>
          </div>
          {canSchedule && <button className="sheet-primary" onClick={onSchedule}><CalendarPlus size={18} /> 일정에 추가</button>}
        </div>
      </div>
    </SheetBackdrop>
  )
}

function ScrapScheduleModal({ scrap, trips, onClose, onSaved }) {
  const [tripId, setTripId] = useState(scrap.trip_id || '')
  const [days, setDays] = useState([])
  const [dayId, setDayId] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const trip = trips.find((item) => item.id === tripId)

  useEffect(() => {
    let alive = true
    setDays([])
    setDayId('')
    setError('')
    if (!trip) return
    setLoading(true)
    addScrapToSchedule({ scrap, trip })
      .then((result) => {
        if (!alive) return
        setDays(result)
        setDayId(result[0]?.id || '')
      })
      .catch((e) => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [tripId])

  const save = async () => {
    const day = days.find((item) => item.id === dayId)
    if (!trip || !day) return
    setSaving(true)
    setError('')
    try {
      await commitScrapToSchedule({ scrap, trip, day })
      await onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SheetBackdrop onRequestClose={onClose}>
      <div className="create-sheet scrap-schedule-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={onClose}>취소</button><span>일정에 추가</span><div /></div>
        <div className="sheet-body">
          <p className="eyebrow">SCRAP → PLAN</p>
          <h2>{scrap.title}</h2>
          <p className="muted">시간은 아직 정하지 않은 일정으로 들어가요. 일정 탭에서 나중에 시간을 붙일 수 있어요.</p>
          <label>여행<select value={tripId} onChange={(e) => setTripId(e.target.value)}><option value="">여행 선택</option>{trips.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          {loading ? <div className="schedule-loading">DAY를 불러오는 중…</div> : trip && days.length > 0 && <label>DAY<select value={dayId} onChange={(e) => setDayId(e.target.value)}>{days.map((day) => <option key={day.id} value={day.id}>DAY {day.day_number} · {day.trip_date}</option>)}</select></label>}
          {error && <div className="schedule-alert">{error}</div>}
          <button className="sheet-primary" disabled={!tripId || !dayId || saving || loading} onClick={save}>{saving ? '추가 중…' : '시간 미정 일정으로 추가'}</button>
        </div>
      </div>
    </SheetBackdrop>
  )
}
