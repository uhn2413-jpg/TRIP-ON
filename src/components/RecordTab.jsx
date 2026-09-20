import React, { useEffect, useMemo, useState } from 'react'
import {
  Camera,
  Clock3,
  FileText,
  Image as ImageIcon,
  MapPin,
  NotebookTabs,
  Paperclip,
  Pencil,
  Plus,
  ReceiptText,
  Star,
  Ticket,
  Trash2,
  X,
} from 'lucide-react'
import RatingSlider from './RatingSlider'
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
  if (!trip.startDate || !trip.endDate) return null
  const today = new Date().toISOString().slice(0, 10)
  return days.find((day) => day.trip_date === today) || days[0] || null
}

function formatDayTitle(day) {
  if (!day) return '여행 전체'
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

export default function RecordTab({ trip }) {
  const [data, setData] = useState({ days: [], itinerary: [], records: [] })
  const [filter, setFilter] = useState('all')
  const [editor, setEditor] = useState(null)
  const [viewer, setViewer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

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
  }, [trip.id])

  const filtered = useMemo(
    () => data.records.filter((record) => filter === 'all' || record.type === filter),
    [data.records, filter]
  )

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
        <div className="chip-row record-filter-row">
          {filterItems.map(([key, label]) => (
            <button key={key} className={filter === key ? 'chip active' : 'chip'} onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>
        <button className="primary-wide" onClick={startNew}><Plus size={18} /> 기록 추가</button>
      </div>

      {message && <div className="schedule-alert">{message}</div>}

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

      {editor && (
        <RecordEditorModal
          trip={trip}
          data={data}
          record={editor.__new ? null : editor}
          defaultDayId={editor.tripDayId || ''}
          onClose={() => setEditor(null)}
          onSaved={async () => { setEditor(null); await reload() }}
        />
      )}

      {viewer && (
        <RecordDetailModal
          record={viewer}
          onClose={() => setViewer(null)}
          onEdit={() => { setEditor(viewer); setViewer(null) }}
          onDeleted={async () => { setViewer(null); await reload() }}
        />
      )}
    </>
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

function RecordEditorModal({ trip, data, record, defaultDayId, onClose, onSaved }) {
  const initialDateTime = isoToRecordDateTime(record?.recorded_at, record?.recorded_timezone || DEFAULT_TIMEZONE)
  if (record && record.recorded_time_known === false) initialDateTime.time = ''
  const defaultDay = data.days.find((day) => day.id === (record?.trip_day_id || defaultDayId)) || null
  const [type, setType] = useState(record?.type || 'photo')
  const [title, setTitle] = useState(record?.title || '')
  const [tripDayId, setTripDayId] = useState(record?.trip_day_id || defaultDayId || '')
  const [itineraryItemId, setItineraryItemId] = useState(record?.itinerary_item_id || '')
  const [recordDate, setRecordDate] = useState(initialDateTime.date || defaultDay?.trip_date || '')
  const [recordTime, setRecordTime] = useState(initialDateTime.time || '')
  const [timezone, setTimezone] = useState(record?.recorded_timezone || DEFAULT_TIMEZONE)
  const [placeName, setPlaceName] = useState(record?.place_name || '')
  const [city, setCity] = useState(record?.city || '')
  const [memo, setMemo] = useState(record?.memo || '')
  const [rating, setRating] = useState(record?.rating ? String(record.rating) : '')
  const [files, setFiles] = useState([])
  const [existingMedia, setExistingMedia] = useState(record?.media || [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const initialSnapshot = JSON.stringify({ type: record?.type || 'photo', title: record?.title || '', tripDayId: record?.trip_day_id || defaultDayId || '', itineraryItemId: record?.itinerary_item_id || '', recordDate: initialDateTime.date || defaultDay?.trip_date || '', recordTime: initialDateTime.time || '', timezone: record?.recorded_timezone || DEFAULT_TIMEZONE, placeName: record?.place_name || '', city: record?.city || '', memo: record?.memo || '', rating: record?.rating ? String(record.rating) : '' })
  const currentSnapshot = JSON.stringify({ type, title, tripDayId, itineraryItemId, recordDate, recordTime, timezone, placeName, city, memo, rating })
  const requestClose = () => confirmSheetClose(initialSnapshot !== currentSnapshot || files.length > 0, onClose)

  const itineraryForDay = data.itinerary.filter((item) => !tripDayId || item.trip_day_id === tripDayId)

  const changeDay = (dayId) => {
    setTripDayId(dayId)
    setItineraryItemId('')
    const day = data.days.find((item) => item.id === dayId)
    if (day) setRecordDate(day.trip_date)
  }

  const changeItinerary = (itemId) => {
    setItineraryItemId(itemId)
    const item = data.itinerary.find((entry) => entry.id === itemId)
    if (!item) return
    if (item.trip_day_id) {
      setTripDayId(item.trip_day_id)
      const day = data.days.find((entry) => entry.id === item.trip_day_id)
      if (day) setRecordDate(day.trip_date)
    }
    if (!placeName) setPlaceName(item.title || '')
    if (!city && item.city) setCity(item.city)
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
          type, title, tripDayId, itineraryItemId,
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
            <label>DAY <span className="optional">선택</span><select value={tripDayId} onChange={(e) => changeDay(e.target.value)}><option value="">여행 전체</option>{data.days.map((day) => <option key={day.id} value={day.id}>DAY {day.day_number} · {day.trip_date}</option>)}</select></label>
            <label>일정 연결 <span className="optional">선택</span><select value={itineraryItemId} onChange={(e) => changeItinerary(e.target.value)}><option value="">연결 안 함</option>{itineraryForDay.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          </div>

          <div className="form-two">
            <label>날짜 <span className="optional">선택</span><input type="date" value={recordDate} onChange={(e) => setRecordDate(e.target.value)} /></label>
            <label>시간 <span className="optional">선택</span><input type="time" value={recordTime} onChange={(e) => setRecordTime(e.target.value)} /></label>
          </div>

          <label>기록 시간대<select value={timezone} onChange={(e) => setTimezone(e.target.value)}>{timezoneOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>

          <div className="form-two">
            <label>장소 <span className="optional">선택</span><input value={placeName} onChange={(e) => setPlaceName(e.target.value)} placeholder="예: 센강 산책로" /></label>
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

function RecordDetailModal({ record, onClose, onEdit, onDeleted }) {
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
        <div className="sheet-head"><button onClick={onClose}>닫기</button><span>기록 상세</span><button onClick={onEdit}><Pencil size={17} /></button></div>
        <div className="sheet-body">
          <div className="record-detail-kicker"><span><Icon size={16} /> {recordTypeLabels[record.type]}</span>{record.day && <small>DAY {record.day.day_number} · {record.day.trip_date}</small>}</div>
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

          <div className="detail-bottom-actions"><button className="danger-text" disabled={working} onClick={remove}><Trash2 size={16} /> 삭제</button><button className="sheet-primary" onClick={onEdit}><Pencil size={16} /> 수정</button></div>
        </div>
      </div>
    </SheetBackdrop>
  )
}
