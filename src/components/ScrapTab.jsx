import React, { useEffect, useMemo, useState } from 'react'
import {
  CalendarPlus,
  ChevronRight,
  ExternalLink,
  FileText,
  Link2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import SheetBackdrop, { confirmSheetClose } from './SheetBackdrop'
import PlaceSearchField from './PlaceSearchField'
import { placeFromRow } from '../lib/places'
import { googleMapsSearchUrl } from '../lib/googleMaps'
import {
  addScrapToSchedule,
  commitScrapToSchedule,
  defaultScrapTags,
  deleteScrap,
  fetchScraps,
  getScrapFormat,
  getScrapTags,
  isPlaceFormat,
  saveScrap,
  scrapFormatLabels,
  scrapStatusLabels,
} from '../lib/scraps'

const formatIcons = {
  place: MapPin,
  link: Link2,
  memo: FileText,
}

const formatFilters = [
  ['all', '전체'],
  ['place', '장소'],
  ['link', '링크'],
  ['memo', '메모'],
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

function normalizeTag(value) {
  return String(value || '').trim().replace(/^#+/, '').slice(0, 24)
}

export default function ScrapTab({ trips }) {
  const [scraps, setScraps] = useState([])
  const [tagFilter, setTagFilter] = useState('all')
  const [formatFilter, setFormatFilter] = useState('all')
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

  const allTags = useMemo(() => {
    const custom = []
    scraps.forEach((scrap) => getScrapTags(scrap).forEach((tag) => {
      if (!defaultScrapTags.includes(tag) && !custom.includes(tag)) custom.push(tag)
    }))
    return [...defaultScrapTags, ...custom]
  }, [scraps])

  const filtered = useMemo(() => scraps.filter((scrap) => {
    const tags = getScrapTags(scrap)
    const tagOk = tagFilter === 'all' || tags.includes(tagFilter)
    const formatOk = formatFilter === 'all' || getScrapFormat(scrap) === formatFilter
    const tripOk = tripFilter === 'all'
      || (tripFilter === 'none' && !scrap.trip_id)
      || scrap.trip_id === tripFilter
    return tagOk && formatOk && tripOk
  }), [scraps, tagFilter, formatFilter, tripFilter])

  return (
    <>
      <section className="hero-copy small scrap-hero">
        <p className="eyebrow">COLLECT FOR LATER</p>
        <h1>스크랩</h1>
        <p>장소와 링크, 메모를 모아두고 여러 태그를 붙여 여행 준비 자료를 원하는 기준으로 다시 찾아보세요.</p>
      </section>

      <div className="scrap-toolbar">
        <div className="scrap-format-filter" aria-label="스크랩 형식 필터">
          {formatFilters.map(([key, label]) => <button key={key} className={formatFilter === key ? 'active' : ''} onClick={() => setFormatFilter(key)}>{label}</button>)}
        </div>

        <div className="scrap-filter-group">
          <small>태그</small>
          <div className="chip-row scrap-filter-row">
            <button className={tagFilter === 'all' ? 'chip active' : 'chip'} onClick={() => setTagFilter('all')}>전체</button>
            {allTags.map((tag) => <button key={tag} className={tagFilter === tag ? 'chip active' : 'chip'} onClick={() => setTagFilter(tag)}>{tag}</button>)}
          </div>
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
          <p>맛집·카페·숙소·여행루트처럼 필요한 태그를 여러 개 붙여 자유롭게 모아둘 수 있어요.</p>
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
          knownTags={allTags}
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
  const format = getScrapFormat(scrap)
  const tags = getScrapTags(scrap)
  const Icon = formatIcons[format] || FileText
  return (
    <button className="scrap-card" onClick={onClick}>
      <div className="scrap-card-icon"><Icon size={18} /></div>
      <div className="scrap-card-copy">
        <div className="scrap-card-top"><span>{scrapFormatLabels[format] || '스크랩'}</span><em className={`scrap-status status-${scrap.status}`}>{scrapStatusLabels[scrap.status] || scrap.status}</em></div>
        <strong>{scrap.title}</strong>
        {tags.length > 0 && <div className="scrap-card-tags">{tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}{tags.length > 3 && <span>+{tags.length - 3}</span>}</div>}
        <p>{placeMeta(scrap) || (scrap.url ? scrap.url.replace(/^https?:\/\//, '').split('/')[0] : '메모')}</p>
        <small>{tripLabel(scrap)}</small>
      </div>
      <ChevronRight size={17} />
    </button>
  )
}

function ScrapEditor({ scrap, trips, knownTags, onClose, onSaved }) {
  const place = scrap?.trip_on_places
  const [format, setFormat] = useState(() => scrap ? getScrapFormat(scrap) : 'place')
  const [tags, setTags] = useState(() => scrap ? getScrapTags(scrap) : [])
  const [customTag, setCustomTag] = useState('')
  const [title, setTitle] = useState(scrap?.title || '')
  const [tripId, setTripId] = useState(scrap?.trip_id || '')
  const [country, setCountry] = useState(place?.country || '')
  const [city, setCity] = useState(place?.city || '')
  const [address, setAddress] = useState(place?.address || '')
  const [timezone, setTimezone] = useState(place?.timezone || 'Asia/Seoul')
  const [mapPlace, setMapPlace] = useState(() => placeFromRow(place))
  const [url, setUrl] = useState(scrap?.url || '')
  const [memo, setMemo] = useState(scrap?.memo || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const tagChoices = useMemo(() => [...new Set([...defaultScrapTags, ...(knownTags || []), ...tags])], [knownTags, tags])
  const sortedTags = [...tags].sort((a, b) => a.localeCompare(b, 'ko'))
  const initialSnapshot = JSON.stringify({ format: scrap ? getScrapFormat(scrap) : 'place', tags: scrap ? [...getScrapTags(scrap)].sort((a, b) => a.localeCompare(b, 'ko')) : [], title: scrap?.title || '', tripId: scrap?.trip_id || '', country: place?.country || '', city: place?.city || '', address: place?.address || '', timezone: place?.timezone || 'Asia/Seoul', url: scrap?.url || '', memo: scrap?.memo || '', mapKey: place?.provider_place_id || place?.id || '' })
  const currentSnapshot = JSON.stringify({ format, tags: sortedTags, title, tripId, country, city, address, timezone, url, memo, mapKey: mapPlace?.providerPlaceId || mapPlace?.dbId || '' })
  const requestClose = () => confirmSheetClose(initialSnapshot !== currentSnapshot, onClose)

  const toggleTag = (tag) => setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])
  const addCustomTag = () => {
    const value = normalizeTag(customTag)
    if (!value) return
    setTags((current) => current.includes(value) ? current : [...current, value])
    setCustomTag('')
  }

  const save = async () => {
    if (!title.trim()) return
    if (format === 'link' && !url.trim()) { setError('링크 형식은 URL을 입력해주세요.'); return }
    setSaving(true)
    setError('')
    try {
      await saveScrap({
        id: scrap?.id,
        placeId: scrap?.place_id,
        status: scrap?.status || 'saved',
        format, tags, title, tripId, country, city, address, timezone, url, memo, mapPlace,
      })
      await onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const placeFields = format === 'place'
  return (
    <SheetBackdrop onRequestClose={requestClose}>
      <div className="create-sheet scrap-editor-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={requestClose}>취소</button><span>{scrap ? '스크랩 수정' : '스크랩 추가'}</span><div /></div>
        <div className="sheet-body scrap-form">
          <p className="eyebrow">SAVE FOR LATER</p>
          <h2>{scrap ? '저장한 내용을 다듬을까요?' : '무엇을 저장할까요?'}</h2>

          <div className="scrap-editor-section">
            <span className="scrap-editor-label">형식</span>
            <div className="scrap-format-picker" role="radiogroup" aria-label="스크랩 형식">
              {Object.entries(scrapFormatLabels).map(([key, label]) => {
                const Icon = formatIcons[key]
                return <button type="button" key={key} className={format === key ? 'active' : ''} onClick={() => setFormat(key)}><Icon size={16} /><span>{label}</span></button>
              })}
            </div>
          </div>

          <label>이름<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={format === 'link' ? '예: 묵호 2박3일 여행코스' : format === 'memo' ? '예: 다음에 확인할 것' : '예: 미유키말차'} /></label>
          <label>연결할 여행 <span className="optional">선택</span><select value={tripId} onChange={(e) => setTripId(e.target.value)}><option value="">아직 여행 미정</option>{trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.title}</option>)}</select></label>

          <div className="scrap-editor-section tag-editor-section">
            <span className="scrap-editor-label">태그 <em>여러 개 선택 가능</em></span>
            <div className="scrap-tag-picker">
              {tagChoices.map((tag) => <button type="button" key={tag} className={tags.includes(tag) ? 'selected' : ''} onClick={() => toggleTag(tag)}>{tag}</button>)}
            </div>
            <div className="scrap-custom-tag-row">
              <input value={customTag} onChange={(e) => setCustomTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag() } }} placeholder="직접 태그 추가 · 예: 사진스팟" />
              <button type="button" onClick={addCustomTag} disabled={!normalizeTag(customTag)}><Plus size={15} /> 추가</button>
            </div>
          </div>

          {placeFields && (
            <div className="scrap-place-box">
              <PlaceSearchField
                value={mapPlace}
                onChange={setMapPlace}
                onApply={(result) => {
                  if (!title.trim()) setTitle(result.name || '')
                  if (result.country) setCountry(result.country)
                  if (result.city) setCity(result.city)
                  if (result.address) setAddress(result.address)
                }}
                label="Google 장소 연결"
                placeholder="예: 몽마르트르, Cafe de Flore"
              />
              <div className="form-two"><label>국가 <span className="optional">선택</span><input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="예: 프랑스" /></label><label>도시 <span className="optional">선택</span><input value={city} onChange={(e) => setCity(e.target.value)} placeholder="예: 파리" /></label></div>
              <label>주소 <span className="optional">선택</span><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="주소나 지역명을 적어두세요" /></label>
              <label>시간대 <span className="optional">선택</span><select value={timezone} onChange={(e) => setTimezone(e.target.value)}>{timezoneOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            </div>
          )}

          {format !== 'memo' && <label>링크 <span className={format === 'link' ? '' : 'optional'}>{format === 'place' ? '선택' : ''}</span><input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." /></label>}
          <label>메모 <span className="optional">선택</span><textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="왜 저장했는지, 먹고 싶은 메뉴나 참고할 점을 적어두세요." /></label>
          {error && <div className="schedule-alert">{error}</div>}
          <button className="sheet-primary" disabled={!title.trim() || saving || (format === 'link' && !url.trim())} onClick={save}>{saving ? '저장 중…' : scrap ? '수정 저장' : '스크랩 저장'}</button>
        </div>
      </div>
    </SheetBackdrop>
  )
}

function ScrapDetail({ scrap, trips, onClose, onEdit, onSchedule, onDeleted }) {
  const format = getScrapFormat(scrap)
  const tags = getScrapTags(scrap)
  const Icon = formatIcons[format] || FileText
  const canSchedule = isPlaceFormat(scrap)
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
          <div className="scrap-detail-title"><div className="scrap-card-icon"><Icon size={20} /></div><div><span>{scrapFormatLabels[format]}</span><h2>{scrap.title}</h2></div></div>
          <div className="scrap-detail-tags"><span>{tripLabel(scrap)}</span><span>{scrapStatusLabels[scrap.status]}</span>{tags.map((tag) => <span className="topic" key={tag}>{tag}</span>)}</div>
          {placeMeta(scrap) && <div className="detail-line"><MapPin size={17} /><span>{placeMeta(scrap)}</span></div>}
          {scrap.trip_on_places?.timezone && <div className="detail-line"><span className="detail-line-label">시간대</span><span>{scrap.trip_on_places.timezone}</span></div>}
          {scrap.trip_on_places?.latitude != null && scrap.trip_on_places?.longitude != null && <button className="outline-wide" onClick={() => window.open(googleMapsSearchUrl(placeFromRow(scrap.trip_on_places)), '_blank', 'noopener,noreferrer')}><MapPin size={17} /> Google 지도에서 보기</button>}
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
