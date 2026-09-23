import React, { useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Link as LinkIcon,
  Paperclip,
  Pencil,
  Plane,
  TrainFront,
  BusFront,
  BedDouble,
  CalendarDays,
  Utensils,
  CarFront,
  Plus,
  Ticket,
  Trash2,
  X,
} from 'lucide-react'
import {
  deletePrepItem,
  deleteReservation,
  deleteReservationFile,
  deleteTripInfo,
  fetchPrepData,
  isoToLocalInput,
  openReservationFile,
  reservationStatusLabels,
  reservationTypeLabels,
  savePrepItem,
  saveReservation,
  saveTripInfo,
  togglePrepItem,
  updateReservationFileMeta,
  uploadReservationFiles,
} from '../lib/prep'
import { DEFAULT_TIMEZONE } from '../lib/schedule'
import SheetBackdrop, { confirmSheetClose } from './SheetBackdrop'

const timezoneOptions = [
  ['Asia/Seoul', '서울 · KST'],
  ['Asia/Tokyo', '도쿄 · JST'],
  ['Europe/London', '런던'],
  ['Europe/Paris', '파리'],
  ['Europe/Rome', '로마'],
  ['America/New_York', '뉴욕'],
  ['America/Los_Angeles', 'LA'],
  ['Pacific/Honolulu', '하와이'],
]

const reservationIconMap = {
  flight: Plane,
  train: TrainFront,
  bus: BusFront,
  accommodation: BedDouble,
  restaurant: Utensils,
  ticket: Ticket,
  rental_car: CarFront,
  other: ClipboardCheck,
}

const reservationTypes = Object.entries(reservationTypeLabels)
const currencies = ['KRW', 'JPY', 'USD', 'EUR', 'GBP', 'CZK']

function formatMoney(amount, currency) {
  if (amount == null || amount === '') return ''
  return `${Number(amount).toLocaleString()} ${currency || ''}`.trim()
}

function formatDateTime(iso, timezone, { dateOnly = false } = {}) {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: timezone || DEFAULT_TIMEZONE,
      month: 'numeric', day: 'numeric',
      ...(dateOnly ? {} : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    }).format(new Date(iso))
  } catch {
    const date = new Date(iso)
    return dateOnly
      ? `${date.getMonth() + 1}.${date.getDate()}`
      : date.toLocaleString('ko-KR')
  }
}

function isPdfLike(file) {
  return file?.mime_type === 'application/pdf' || file?.file?.type === 'application/pdf' || /\.pdf$/i.test(String(file?.file_name || file?.file?.name || ''))
}

function isImageLike(file) {
  return file?.mime_type?.startsWith?.('image/') || file?.file?.type?.startsWith?.('image/')
}

function fileLabel(file) {
  return file?.display_name?.trim() || file?.file_name || file?.file?.name || '첨부파일'
}

function reservationMetaLine(reservation) {
  const amount = formatMoney(reservation.amount, reservation.currency)
  if (reservation.type === 'accommodation') {
    const checkIn = reservation.start_at ? `${formatDateTime(reservation.start_at, reservation.start_timezone, { dateOnly: true })} 체크인` : ''
    const checkOut = reservation.end_at ? `${formatDateTime(reservation.end_at, reservation.end_timezone || reservation.start_timezone, { dateOnly: true })} 체크아웃` : ''
    return [reservation.provider, [checkIn, checkOut].filter(Boolean).join(' · '), amount].filter(Boolean).join(' · ')
  }
  return [
    reservation.provider,
    formatDateTime(reservation.start_at, reservation.start_timezone),
    amount,
  ].filter(Boolean).join(' · ')
}

function tripIsActive(trip) {
  if (!trip.startDate || !trip.endDate) return false
  const now = new Date()
  const start = new Date(`${trip.startDate}T00:00:00`)
  const end = new Date(`${trip.endDate}T23:59:59`)
  return now >= start && now <= end
}

function ReservationFileCard({ file, subtitle, onOpen, onRemove, onLabelChange, editableLabel = false, compact = false }) {
  const [previewUrl, setPreviewUrl] = useState(file.preview_url || '')
  const pdf = isPdfLike(file)
  const image = isImageLike(file)

  useEffect(() => {
    let alive = true
    if (file.preview_url) {
      setPreviewUrl(file.preview_url)
      return () => { alive = false }
    }
    if (file.file && file.preview_url) {
      setPreviewUrl(file.preview_url)
      return () => { alive = false }
    }
    if (!file.storage_path) return () => { alive = false }
    openReservationFile(file)
      .then((url) => { if (alive) setPreviewUrl(url || '') })
      .catch(() => { if (alive) setPreviewUrl('') })
    return () => { alive = false }
  }, [file.id, file.storage_path, file.preview_url])

  return (
    <div className={`reservation-file-card${compact ? ' compact' : ''}`}>
      <button type="button" className="reservation-file-open" onClick={() => onOpen?.(file)}>
        <div className={`reservation-file-preview ${pdf ? 'pdf' : image ? 'image' : 'generic'}`}>
          {image && previewUrl ? (
            <img src={previewUrl} alt={fileLabel(file)} />
          ) : pdf && previewUrl ? (
            <iframe src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0&page=1&view=FitH`} title={fileLabel(file)} />
          ) : pdf ? (
            <span className="reservation-file-fallback"><FileText size={22} /></span>
          ) : (
            <span className="reservation-file-fallback"><Paperclip size={20} /></span>
          )}
        </div>
        <div className="reservation-file-copy">
          <strong>{fileLabel(file)}</strong>
          {subtitle && <small>{subtitle}</small>}
          {!subtitle && file.file_name && file.display_name?.trim() && <small>{file.file_name}</small>}
        </div>
        <ExternalLink size={15} />
      </button>
      {editableLabel && (
        <label className="reservation-file-label-edit">
          <span>표시 이름 <small>선택</small></span>
          <input
            value={file.display_name || ''}
            onChange={(event) => onLabelChange?.(event.target.value)}
            placeholder="앱 안에서 보일 이름"
          />
        </label>
      )}
      {onRemove && <button type="button" className="reservation-file-remove" onClick={() => onRemove(file)} aria-label="첨부 삭제"><X size={15} /></button>}
    </div>
  )
}

export default function PrepTab({ trip, refreshKey = 0, readOnly = false }) {
  const [data, setData] = useState({ prepItems: [], reservations: [], infoItems: [], itinerary: [] })
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [prepModal, setPrepModal] = useState(null)
  const [reservationModal, setReservationModal] = useState(null)
  const [reservationViewer, setReservationViewer] = useState(null)
  const [infoModal, setInfoModal] = useState(null)
  const [working, setWorking] = useState(false)

  const reload = async () => {
    setLoading(true)
    try {
      setData(await fetchPrepData(trip.id))
      setMessage('')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [trip.id, refreshKey])

  const todos = data.prepItems.filter((item) => item.type === 'todo')
  const packing = data.prepItems.filter((item) => item.type === 'packing')
  const done = data.prepItems.filter((item) => item.is_done).length
  const total = data.prepItems.length
  const allFiles = useMemo(() => data.reservations.flatMap((reservation) =>
    (reservation.trip_on_reservation_files || []).map((file) => ({ ...file, reservationTitle: reservation.title }))
  ), [data.reservations])
  const activeTrip = tripIsActive(trip)

  const toggle = async (item) => {
    try {
      await togglePrepItem(item.id, !item.is_done)
      setData((prev) => ({ ...prev, prepItems: prev.prepItems.map((x) => x.id === item.id ? { ...x, is_done: !x.is_done } : x) }))
    } catch (error) { setMessage(error.message) }
  }

  const removePrep = async (item) => {
    if (!window.confirm(`“${item.title}”을 삭제할까요?`)) return
    try { await deletePrepItem(item.id); await reload() } catch (error) { setMessage(error.message) }
  }

  const removeInfo = async (item) => {
    if (!window.confirm(`“${item.label}” 정보를 삭제할까요?`)) return
    try { await deleteTripInfo(item.id); await reload() } catch (error) { setMessage(error.message) }
  }

  const removeReservation = async (reservation) => {
    if (!window.confirm(`“${reservation.title}” 예약을 삭제할까요? 첨부 문서도 함께 삭제돼요.`)) return
    setWorking(true)
    try { await deleteReservation(reservation); await reload() } catch (error) { setMessage(error.message) } finally { setWorking(false) }
  }

  const openFile = async (file) => {
    try {
      const url = await openReservationFile(file)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) { setMessage(error.message) }
  }

  const reservationSection = (
    <section className="prep-section">
      <div className="prep-section-head">
        <div><span className="prep-kicker">BOOKINGS</span><h3>예약</h3></div>
        {!readOnly && <button className="prep-add-btn" onClick={() => setReservationModal({})}><Plus size={16} /> 추가</button>}
      </div>
      {data.reservations.length === 0 ? (
        <div className="prep-empty"><Ticket size={22} /><span>항공·숙소·식당·입장권 예약을 모아둘 수 있어요.</span></div>
      ) : (
        <div className="reservation-list">
          {data.reservations.map((reservation) => {
            const linkIds = (reservation.trip_on_reservation_itinerary_links || []).map((link) => link.itinerary_item_id).filter(Boolean)
            const linkedItineraries = linkIds.map((id) => data.itinerary.find((item) => item.id === id)).filter(Boolean)
            const itinerary = linkedItineraries[0]
            const fileCount = reservation.trip_on_reservation_files?.length || 0
            const ReservationIcon = reservationIconMap[reservation.type] || ClipboardCheck
            return (
              <article className="reservation-card" key={reservation.id}>
                <button className="reservation-main" onClick={() => readOnly ? setReservationViewer(reservation) : setReservationModal(reservation)}>
                  <div className={`reservation-type-icon type-${reservation.type || 'other'}`}><ReservationIcon size={18} /></div>
                  <div className="reservation-copy">
                    <div className="reservation-topline"><span>{reservationTypeLabels[reservation.type] || '예약'}</span><em className={`reservation-status ${reservation.status}`}>{reservationStatusLabels[reservation.status] || reservation.status}</em></div>
                    <strong>{reservation.title}</strong>
                    <small>{reservationMetaLine(reservation)}</small>
                    {(linkedItineraries.length > 0 || fileCount > 0) && <small className="reservation-linkline">{linkedItineraries.length > 0 ? (linkedItineraries.length === 1 ? `일정 연결 · ${itinerary.day ? `DAY ${itinerary.day.day_number} ` : ''}${itinerary.title}` : `일정 연결 · ${linkedItineraries.length}개`) : ''}{linkedItineraries.length > 0 && fileCount ? '  ·  ' : ''}{fileCount ? `문서 ${fileCount}개` : ''}</small>}
                  </div>
                  <ChevronRight size={18} />
                </button>
                {!readOnly && <button className="reservation-delete" disabled={working} onClick={() => removeReservation(reservation)} aria-label="예약 삭제"><Trash2 size={15} /></button>}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )

  const checklistSection = (
    <>
      <PrepChecklist title="할 일" kicker="TO DO" items={todos} onToggle={toggle} onAdd={() => setPrepModal({ type: 'todo' })} onEdit={setPrepModal} onDelete={removePrep} empty="환전·보험·예약 같은 할 일을 추가해보세요." readOnly={readOnly} />
      <PrepChecklist title="준비물" kicker="PACKING" items={packing} onToggle={toggle} onAdd={() => setPrepModal({ type: 'packing' })} onEdit={setPrepModal} onDelete={removePrep} empty="여권·충전기·상비약 같은 준비물을 적어둘 수 있어요." readOnly={readOnly} />
    </>
  )

  return (
    <div className="prep-tab">
      <section className="prep-summary-card">
        <div><span>준비 현황</span><strong>{done} / {total}</strong></div>
        <div className="prep-progress"><i style={{ width: `${total ? Math.round(done / total * 100) : 0}%` }} /></div>
        <p>{total ? `${Math.round(done / total * 100)}% 완료했어요.` : '할 일과 준비물을 추가하면 준비 현황을 한눈에 볼 수 있어요.'}</p>
      </section>

      {message && <button className="prep-message" onClick={() => setMessage('')}>{message}</button>}
      {loading ? <div className="prep-loading">준비 정보를 불러오는 중…</div> : (
        <>
          {activeTrip ? reservationSection : checklistSection}
          {activeTrip ? checklistSection : reservationSection}

          <section className="prep-section">
            <div className="prep-section-head">
              <div><span className="prep-kicker">VOUCHERS</span><h3>바우처 & 문서</h3></div>
              <span className="prep-count">{allFiles.length}</span>
            </div>
            {allFiles.length === 0 ? (
              <div className="prep-empty"><Paperclip size={21} /><span>예약을 추가할 때 QR·예약확인서·PDF를 함께 첨부할 수 있어요.</span></div>
            ) : (
              <div className="voucher-grid">
                {allFiles.map((file) => (
                  <ReservationFileCard
                    key={file.id}
                    file={file}
                    subtitle={file.reservationTitle}
                    onOpen={openFile}
                    compact
                  />
                ))}
              </div>
            )}
          </section>

          <section className="prep-section">
            <div className="prep-section-head">
              <div><span className="prep-kicker">TRIP INFO</span><h3>여행 정보</h3></div>
              {!readOnly && <button className="prep-add-btn" onClick={() => setInfoModal({})}><Plus size={16} /> 추가</button>}
            </div>
            {data.infoItems.length === 0 ? (
              <div className="prep-empty"><FileText size={21} /><span>환전·eSIM·비상연락처 등 일정에 넣기 애매한 정보를 저장해보세요.</span></div>
            ) : (
              <div className="trip-info-list">
                {data.infoItems.map((item) => (
                  <div className="trip-info-row" key={item.id}>
                    <button onClick={() => !readOnly && setInfoModal(item)} aria-disabled={readOnly}>
                      <strong>{item.label}</strong>
                      <small>{[item.category, item.value].filter(Boolean).join(' · ') || '여행 정보'}</small>
                    </button>
                    {!readOnly && <button className="trip-info-delete" onClick={() => removeInfo(item)} aria-label="정보 삭제"><Trash2 size={15} /></button>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {reservationViewer && <ReservationViewer reservation={reservationViewer} itinerary={data.itinerary} onClose={() => setReservationViewer(null)} onOpenFile={openFile} />}

      {!readOnly && prepModal && <PrepItemModal initial={prepModal} tripId={trip.id} onClose={() => setPrepModal(null)} onSaved={async () => { setPrepModal(null); await reload() }} />}
      {!readOnly && reservationModal && <ReservationModal initial={reservationModal} trip={trip} itinerary={data.itinerary} onClose={() => setReservationModal(null)} onSaved={async () => { setReservationModal(null); await reload() }} onMessage={setMessage} />}
      {!readOnly && infoModal && <TripInfoModal initial={infoModal} tripId={trip.id} onClose={() => setInfoModal(null)} onSaved={async () => { setInfoModal(null); await reload() }} />}
    </div>
  )
}

function ReservationViewer({ reservation, itinerary, onClose, onOpenFile }) {
  const linkIds = (reservation.trip_on_reservation_itinerary_links || []).map((link) => link.itinerary_item_id).filter(Boolean)
  const linked = linkIds.map((id) => itinerary.find((item) => item.id === id)).filter(Boolean)
  const files = reservation.trip_on_reservation_files || []
  const ReservationIcon = reservationIconMap[reservation.type] || ClipboardCheck
  return (
    <SheetBackdrop onRequestClose={onClose}>
      <div className="create-sheet reservation-viewer-sheet" onPointerDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={onClose}>닫기</button><span>예약 상세</span><div /></div>
        <div className="sheet-body">
          <div className="reservation-viewer-title"><span className={`reservation-type-icon type-${reservation.type || 'other'}`}><ReservationIcon size={19} /></span><div><small>{reservationTypeLabels[reservation.type] || '예약'} · {reservationStatusLabels[reservation.status] || reservation.status}</small><h2>{reservation.title}</h2></div></div>
          <div className="detail-facts reservation-viewer-facts">
            {reservation.provider && <div><ClipboardCheck size={18} /><span><small>예약처</small><strong>{reservation.provider}</strong></span></div>}
            {reservation.start_at && <div><CalendarDays size={18} /><span><small>{reservation.type === 'accommodation' ? '체크인' : '시작'}</small><strong>{formatDateTime(reservation.start_at, reservation.start_timezone)}</strong></span></div>}
            {reservation.end_at && <div><CalendarDays size={18} /><span><small>{reservation.type === 'accommodation' ? '체크아웃' : '종료'}</small><strong>{formatDateTime(reservation.end_at, reservation.end_timezone || reservation.start_timezone)}</strong></span></div>}
            {reservation.amount != null && <div><Ticket size={18} /><span><small>금액</small><strong>{formatMoney(reservation.amount, reservation.currency)}</strong></span></div>}
          </div>
          {linked.length > 0 && <div className="reservation-viewer-linked"><small>연결된 일정</small>{linked.map((item) => <span key={item.id}><strong>{item.day ? `DAY ${item.day.day_number} · ` : ''}{item.title}</strong></span>)}</div>}
          {reservation.memo && <div className="itinerary-memo"><small>메모</small><p>{reservation.memo}</p></div>}
          {reservation.url && <button className="outline-wide" onClick={() => window.open(reservation.url, '_blank', 'noopener,noreferrer')}><ExternalLink size={16} /> 예약 페이지 열기</button>}
          {files.length > 0 && <div className="reservation-viewer-files"><small>첨부 문서</small><div className="voucher-grid">{files.map((file) => <ReservationFileCard key={file.id} file={file} onOpen={onOpenFile} compact />)}</div></div>}
        </div>
      </div>
    </SheetBackdrop>
  )
}

function PrepChecklist({ title, kicker, items, onToggle, onAdd, onEdit, onDelete, empty, readOnly = false }) {
  const done = items.filter((item) => item.is_done).length
  return (
    <section className="prep-section">
      <div className="prep-section-head">
        <div><span className="prep-kicker">{kicker}</span><h3>{title}</h3></div>
        <div className="prep-head-actions"><span className="prep-count">{done}/{items.length}</span>{!readOnly && <button className="prep-add-btn" onClick={onAdd}><Plus size={16} /> 추가</button>}</div>
      </div>
      {items.length === 0 ? <div className="prep-empty"><ClipboardCheck size={21} /><span>{empty}</span></div> : (
        <div className="checklist-list">
          {items.map((item) => (
            <div className={`checklist-row ${item.is_done ? 'done' : ''}`} key={item.id}>
              <button className="checklist-check" onClick={() => !readOnly && onToggle(item)} disabled={readOnly} aria-label={item.is_done ? '완료 해제' : '완료'}>{item.is_done && <Check size={15} strokeWidth={3} />}</button>
              <button className="checklist-title" onClick={() => !readOnly && onEdit(item)} aria-disabled={readOnly}>{item.title}</button>
              {!readOnly && <button className="checklist-delete" onClick={() => onDelete(item)} aria-label="삭제"><X size={15} /></button>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function PrepItemModal({ initial, tripId, onClose, onSaved }) {
  const [title, setTitle] = useState(initial.title || '')
  const [saving, setSaving] = useState(false)
  const type = initial.type || 'todo'
  const requestClose = () => confirmSheetClose(title !== (initial.title || ''), onClose)
  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await savePrepItem({ tripId, item: { ...initial, type, title } })
      await onSaved()
    } finally { setSaving(false) }
  }
  return (
    <SheetBackdrop onRequestClose={requestClose}>
      <div className="create-sheet compact-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={requestClose}>취소</button><span>{type === 'packing' ? '준비물' : '할 일'} {initial.id ? '수정' : '추가'}</span><div /></div>
        <div className="sheet-body tidy-form">
          <p className="eyebrow">{type === 'packing' ? 'PACKING' : 'TO DO'}</p>
          <h2>{initial.id ? '내용을 수정할까요?' : `${type === 'packing' ? '챙길 것' : '할 일'}을 추가해볼까요?`}</h2>
          <label>내용<input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'packing' ? '예: 보조배터리' : '예: 여행자 보험 가입'} /></label>
          <button className="sheet-primary" disabled={!title.trim() || saving} onClick={save}>{saving ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    </SheetBackdrop>
  )
}

function ReservationModal({ initial, trip, itinerary, onClose, onSaved, onMessage }) {
  const editing = Boolean(initial.id)
  const startLocalInitial = initial.start_at ? isoToLocalInput(initial.start_at, initial.start_timezone || DEFAULT_TIMEZONE) : ''
  const endLocalInitial = initial.end_at ? isoToLocalInput(initial.end_at, initial.end_timezone || initial.start_timezone || DEFAULT_TIMEZONE) : ''
  const linkedInitialItems = (initial.trip_on_reservation_itinerary_links || [])
    .map((link) => itinerary.find((item) => item.id === link.itinerary_item_id))
    .filter(Boolean)
    .sort((a, b) => {
      const dayDiff = (a.day?.day_number ?? 999) - (b.day?.day_number ?? 999)
      if (dayDiff) return dayDiff
      const aTime = a.start_at || a.actual_start_at || ''
      const bTime = b.start_at || b.actual_start_at || ''
      return aTime && bTime ? new Date(aTime) - new Date(bTime) : aTime ? -1 : bTime ? 1 : 0
    })
  const initialCheckInItineraryId = linkedInitialItems[0]?.id || ''
  const initialCheckOutItineraryId = linkedInitialItems.length > 1 ? linkedInitialItems[linkedInitialItems.length - 1]?.id || '' : ''

  const [type, setType] = useState(initial.type || 'flight')
  const [title, setTitle] = useState(initial.title || '')
  const [provider, setProvider] = useState(initial.provider || '')
  const [reservationNumber, setReservationNumber] = useState(initial.reservation_number || '')
  const [startTimezone, setStartTimezone] = useState(initial.start_timezone || DEFAULT_TIMEZONE)
  const [endTimezone, setEndTimezone] = useState(initial.end_timezone || initial.start_timezone || DEFAULT_TIMEZONE)
  const [startLocal, setStartLocal] = useState(startLocalInitial)
  const [endLocal, setEndLocal] = useState(endLocalInitial)
  const [checkInDate, setCheckInDate] = useState(startLocalInitial ? startLocalInitial.slice(0, 10) : '')
  const [checkOutDate, setCheckOutDate] = useState(endLocalInitial ? endLocalInitial.slice(0, 10) : '')
  const [checkInTime, setCheckInTime] = useState(initial.is_start_time_unspecified ? '' : (startLocalInitial ? startLocalInitial.slice(11, 16) : ''))
  const [checkOutTime, setCheckOutTime] = useState(initial.is_end_time_unspecified ? '' : (endLocalInitial ? endLocalInitial.slice(11, 16) : ''))
  const [amount, setAmount] = useState(initial.amount ?? '')
  const [currency, setCurrency] = useState(initial.currency || 'KRW')
  const [url, setUrl] = useState(initial.url || '')
  const [memo, setMemo] = useState(initial.memo || '')
  const [status, setStatus] = useState(initial.status || 'confirmed')
  const [itineraryItemId, setItineraryItemId] = useState(initial.trip_on_reservation_itinerary_links?.[0]?.itinerary_item_id || '')
  const [checkInItineraryItemId, setCheckInItineraryItemId] = useState(initialCheckInItineraryId)
  const [checkOutItineraryItemId, setCheckOutItineraryItemId] = useState(initialCheckOutItineraryId)
  const [files, setFiles] = useState([])
  const [existingFiles, setExistingFiles] = useState((initial.trip_on_reservation_files || []).map((file) => ({ ...file, display_name: file.display_name || '' })))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isAccommodation = type === 'accommodation'
  const initialSnapshot = JSON.stringify({
    type: initial.type || 'flight',
    title: initial.title || '',
    provider: initial.provider || '',
    reservationNumber: initial.reservation_number || '',
    startTimezone: initial.start_timezone || DEFAULT_TIMEZONE,
    endTimezone: initial.end_timezone || initial.start_timezone || DEFAULT_TIMEZONE,
    startLocal: startLocalInitial,
    endLocal: endLocalInitial,
    checkInDate: startLocalInitial ? startLocalInitial.slice(0, 10) : '',
    checkOutDate: endLocalInitial ? endLocalInitial.slice(0, 10) : '',
    checkInTime: initial.is_start_time_unspecified ? '' : (startLocalInitial ? startLocalInitial.slice(11, 16) : ''),
    checkOutTime: initial.is_end_time_unspecified ? '' : (endLocalInitial ? endLocalInitial.slice(11, 16) : ''),
    amount: String(initial.amount ?? ''),
    currency: initial.currency || 'KRW',
    url: initial.url || '',
    memo: initial.memo || '',
    status: initial.status || 'confirmed',
    itineraryItemId: initial.trip_on_reservation_itinerary_links?.[0]?.itinerary_item_id || '',
    checkInItineraryItemId: initialCheckInItineraryId,
    checkOutItineraryItemId: initialCheckOutItineraryId,
    existingFiles: (initial.trip_on_reservation_files || []).map((file) => ({ id: file.id, display_name: file.display_name || '' })),
  })
  const currentSnapshot = JSON.stringify({
    type, title, provider, reservationNumber, startTimezone, endTimezone, startLocal, endLocal,
    checkInDate, checkOutDate, checkInTime, checkOutTime,
    amount: String(amount), currency, url, memo, status, itineraryItemId, checkInItineraryItemId, checkOutItineraryItemId,
    existingFiles: existingFiles.map((file) => ({ id: file.id, display_name: file.display_name || '' })),
  })
  const requestClose = () => confirmSheetClose(initialSnapshot !== currentSnapshot || files.length > 0, onClose)
  const itineraryOptionLabel = (item) => {
    const dayLabel = item.day ? `DAY ${item.day.day_number}` : 'DAY 미정'
    const timeSource = item.start_at || item.actual_start_at
    const timezone = item.start_timezone || item.actual_start_timezone || DEFAULT_TIMEZONE
    const timeLabel = timeSource ? new Intl.DateTimeFormat('ko-KR', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(timeSource)) : '시간 미정'
    return `${dayLabel} · ${timeLabel} · ${item.title}`
  }

  const chooseFiles = (event) => {
    const next = Array.from(event.target.files || []).map((file, index) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${index}`,
      file,
      file_name: file.name,
      display_name: '',
      mime_type: file.type || null,
      preview_url: URL.createObjectURL(file),
    }))
    event.target.value = ''
    setFiles((prev) => [...prev, ...next])
  }

  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    setError('')
    try {
      const saved = await saveReservation({
        tripId: trip.id,
        draft: isAccommodation
          ? {
              id: initial.id,
              type, title, provider, reservationNumber,
              startDate: checkInDate,
              endDate: checkOutDate,
              startTime: checkInTime,
              endTime: checkOutTime,
              isStartTimeUnspecified: !checkInTime,
              isEndTimeUnspecified: !checkOutTime,
              startTimezone, endTimezone,
              amount, currency, url, memo, status,
              itineraryItemIds: [checkInItineraryItemId, checkOutItineraryItemId].filter(Boolean),
            }
          : {
              id: initial.id,
              type, title, provider, reservationNumber,
              startLocal, endLocal, startTimezone, endTimezone,
              amount, currency, url, memo, status, itineraryItemId,
            },
      })
      const changedExisting = existingFiles.filter((file) => {
        const original = (initial.trip_on_reservation_files || []).find((row) => row.id === file.id)
        return (original?.display_name || '') !== (file.display_name || '')
      })
      if (changedExisting.length) {
        await Promise.all(changedExisting.map((file) => updateReservationFileMeta(file.id, { displayName: file.display_name })))
      }
      if (files.length) {
        await uploadReservationFiles({
          tripId: trip.id,
          reservationId: saved.id,
          files: files.map((entry) => ({ file: entry.file, displayName: entry.display_name })),
        })
      }
      await onSaved()
    } catch (e) {
      setError(e.message)
    } finally { setSaving(false) }
  }

  const openFile = async (file) => {
    try {
      if (file.preview_url?.startsWith?.('blob:')) {
        window.open(file.preview_url, '_blank', 'noopener,noreferrer')
        return
      }
      window.open(await openReservationFile(file), '_blank', 'noopener,noreferrer')
    } catch (e) { onMessage(e.message) }
  }
  const removeFile = async (file) => {
    if (!window.confirm(`${fileLabel(file)} 문서를 삭제할까요?`)) return
    try {
      await deleteReservationFile(file)
      setExistingFiles((prev) => prev.filter((x) => x.id !== file.id))
    } catch (e) { setError(e.message) }
  }
  const removePending = (target) => {
    if (target.preview_url?.startsWith?.('blob:')) URL.revokeObjectURL(target.preview_url)
    setFiles((prev) => prev.filter((entry) => entry.id !== target.id))
  }

  return (
    <SheetBackdrop onRequestClose={requestClose}>
      <div className="create-sheet reservation-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={requestClose}>취소</button><span>{editing ? '예약 수정' : '예약 추가'}</span><div /></div>
        <div className="sheet-body tidy-form">
          <p className="eyebrow">BOOKING</p>
          <h2>{editing ? '예약 정보를 수정할까요?' : '예약 정보를 모아둘까요?'}</h2>

          <div className="form-two">
            <label>종류<select value={type} onChange={(e) => setType(e.target.value)}>{reservationTypes.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
            <label>상태<select value={status} onChange={(e) => setStatus(e.target.value)}>{Object.entries(reservationStatusLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
          </div>
          <label>예약 이름<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isAccommodation ? '예: 묵호 에어비앤비' : '예: 파리 호텔 / 유로스타'} /></label>
          <div className="form-two">
            <label>예약처 <span className="optional">선택</span><input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder={isAccommodation ? '예: 에어비앤비' : '예: Booking.com'} /></label>
            <label>예약번호 <span className="optional">선택</span><input value={reservationNumber} onChange={(e) => setReservationNumber(e.target.value)} /></label>
          </div>

          {isAccommodation ? (
            <>
              <div className="form-two">
                <label>체크인 날짜 <span className="optional">선택</span><input type="date" value={checkInDate} onChange={(e) => setCheckInDate(e.target.value)} /></label>
                <label>체크아웃 날짜 <span className="optional">선택</span><input type="date" value={checkOutDate} onChange={(e) => setCheckOutDate(e.target.value)} /></label>
              </div>
              <div className="form-two">
                <label>체크인 시간 <span className="optional">선택</span><input type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} /></label>
                <label>체크아웃 시간 <span className="optional">선택</span><input type="time" value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)} /></label>
              </div>
              <small className="field-help">숙소는 시간이 애매하면 날짜만 기록해도 괜찮아요. 시간은 비워두면 앱에서는 날짜 위주로 보여줘요.</small>
            </>
          ) : (
            <div className="form-two">
              <label>시작 <span className="optional">선택</span><input type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} /></label>
              <label>종료 <span className="optional">선택</span><input type="datetime-local" value={endLocal} onChange={(e) => setEndLocal(e.target.value)} /></label>
            </div>
          )}

          <div className="form-two">
            <label>{isAccommodation ? '체크인 시간대' : '시작 시간대'}<select value={startTimezone} onChange={(e) => { setStartTimezone(e.target.value); if (!initial.end_timezone) setEndTimezone(e.target.value) }}>{timezoneOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label>{isAccommodation ? '체크아웃 시간대' : '종료 시간대'}<select value={endTimezone} onChange={(e) => setEndTimezone(e.target.value)}>{timezoneOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          </div>

          <div className="form-two">
            <label>금액 <span className="optional">선택</span><input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <label>통화<select value={currency} onChange={(e) => setCurrency(e.target.value)}>{currencies.map((x) => <option key={x}>{x}</option>)}</select></label>
          </div>
          {isAccommodation ? (
            <div className="accommodation-itinerary-links">
              <div className="form-two">
                <label>체크인 일정 연결 <span className="optional">선택</span>
                  <select value={checkInItineraryItemId} onChange={(e) => setCheckInItineraryItemId(e.target.value)}>
                    <option value="">연결하지 않음</option>
                    {itinerary.map((item) => <option value={item.id} key={item.id}>{itineraryOptionLabel(item)}</option>)}
                  </select>
                </label>
                <label>체크아웃 일정 연결 <span className="optional">선택</span>
                  <select value={checkOutItineraryItemId} onChange={(e) => setCheckOutItineraryItemId(e.target.value)}>
                    <option value="">연결하지 않음</option>
                    {itinerary.map((item) => <option value={item.id} key={item.id}>{itineraryOptionLabel(item)}</option>)}
                  </select>
                </label>
              </div>
              <small className="field-help">숙박 기간 전체를 일정에 붙이지 않고, 필요한 경우 체크인·체크아웃 일정만 각각 연결해요.</small>
            </div>
          ) : (
            <label>일정 연결 <span className="optional">선택</span>
              <select value={itineraryItemId} onChange={(e) => setItineraryItemId(e.target.value)}>
                <option value="">연결하지 않음</option>
                {itinerary.map((item) => <option value={item.id} key={item.id}>{itineraryOptionLabel(item)}</option>)}
              </select>
            </label>
          )}
          <label>예약 링크 <span className="optional">선택</span><input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></label>
          <label>메모 <span className="optional">선택</span><textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="체크인 방법, 취소 규정, 좌석 등을 적어두세요." /></label>

          <div className="file-field">
            <div className="file-field-head"><strong>바우처 & 문서</strong><small>이미지·PDF · 파일당 10MB 이하</small></div>
            {existingFiles.length > 0 && (
              <div className="existing-files-grid">
                {existingFiles.map((file) => (
                  <ReservationFileCard
                    key={file.id}
                    file={file}
                    onOpen={openFile}
                    onRemove={removeFile}
                    editableLabel
                    onLabelChange={(value) => setExistingFiles((prev) => prev.map((entry) => entry.id === file.id ? { ...entry, display_name: value } : entry))}
                  />
                ))}
              </div>
            )}
            <label className="file-upload-button"><Paperclip size={17} /> 파일 선택<input type="file" accept="image/*,.heic,.heif,application/pdf" multiple onChange={chooseFiles} /></label>
            {files.length > 0 && (
              <div className="existing-files-grid pending-grid">
                {files.map((file) => (
                  <ReservationFileCard
                    key={file.id}
                    file={file}
                    onOpen={openFile}
                    onRemove={removePending}
                    editableLabel
                    onLabelChange={(value) => setFiles((prev) => prev.map((entry) => entry.id === file.id ? { ...entry, display_name: value } : entry))}
                  />
                ))}
              </div>
            )}
          </div>

          {error && <div className="schedule-alert">{error}</div>}
          <button className="sheet-primary" disabled={!title.trim() || saving} onClick={save}>{saving ? '저장 중…' : editing ? '수정 저장' : '예약 추가'}</button>
        </div>
      </div>
    </SheetBackdrop>
  )
}

function TripInfoModal({ initial, tripId, onClose, onSaved }) {
  const [category, setCategory] = useState(initial.category || '')
  const [label, setLabel] = useState(initial.label || '')
  const [value, setValue] = useState(initial.value || '')
  const [memo, setMemo] = useState(initial.memo || '')
  const [saving, setSaving] = useState(false)
  const requestClose = () => confirmSheetClose(JSON.stringify({ category, label, value, memo }) !== JSON.stringify({ category: initial.category || '', label: initial.label || '', value: initial.value || '', memo: initial.memo || '' }), onClose)
  const save = async () => {
    if (!label.trim()) return
    setSaving(true)
    try {
      await saveTripInfo({ tripId, item: { ...initial, category, label, value, memo } })
      await onSaved()
    } finally { setSaving(false) }
  }
  return (
    <SheetBackdrop onRequestClose={requestClose}>
      <div className="create-sheet compact-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={requestClose}>취소</button><span>여행 정보 {initial.id ? '수정' : '추가'}</span><div /></div>
        <div className="sheet-body tidy-form">
          <p className="eyebrow">TRIP INFO</p><h2>따로 기억할 정보를 적어둘까요?</h2>
          <label>분류 <span className="optional">선택</span><input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="예: 통신 / 환전 / 비상연락처" /></label>
          <label>제목<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="예: eSIM" /></label>
          <label>내용 <span className="optional">선택</span><input value={value} onChange={(e) => setValue(e.target.value)} placeholder="예: 5일 무제한" /></label>
          <label>메모 <span className="optional">선택</span><textarea value={memo} onChange={(e) => setMemo(e.target.value)} /></label>
          <button className="sheet-primary" disabled={!label.trim() || saving} onClick={save}>{saving ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    </SheetBackdrop>
  )
}
