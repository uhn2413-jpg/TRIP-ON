import React, { useEffect, useMemo, useState } from 'react'
import { Archive, CalendarCheck, FileArchive, Footprints, MapPinned, ReceiptText, Route, Trash2, UploadCloud, WalletCards, X } from 'lucide-react'
import RatingSlider from './RatingSlider'
import SheetBackdrop, { confirmSheetClose } from './SheetBackdrop'
import { deleteTimelineImport, fetchArchiveData, previewTimeline, readTimelineFile, saveTimelineImport, updateTripArchive } from '../lib/archive'

const won = (value) => `₩${Math.round(Number(value || 0)).toLocaleString('ko-KR')}`

export default function ArchiveOverview({ trip, onTripUpdated }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [timelineOpen, setTimelineOpen] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try { setData(await fetchArchiveData(trip.id)) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [trip.id])

  const completed = trip.status === 'completed' || data?.trip?.status === 'completed'
  const imports = data?.imports || []

  const saveReflection = async ({ rating, note, markCompleted }) => {
    await updateTripArchive({ tripId: trip.id, status: markCompleted ? 'completed' : undefined, rating, note })
    await load()
    onTripUpdated?.({
      ...trip,
      status: markCompleted ? 'completed' : trip.status,
      completed: markCompleted ? true : trip.completed,
      completedAt: markCompleted ? new Date().toISOString() : trip.completedAt,
      archiveRating: rating || null,
      archiveNote: note || '',
    })
    setEditorOpen(false)
  }

  const reopen = async () => {
    if (!window.confirm('완료 상태를 해제하고 다시 여행 중/예정 상태로 돌릴까요?')) return
    try {
      await updateTripArchive({ tripId: trip.id, status: 'active', rating: data?.trip?.archive_rating, note: data?.trip?.archive_note })
      await load()
      onTripUpdated?.({ ...trip, status: 'active', completed: false, completedAt: null })
    } catch (e) { setError(e.message) }
  }

  return (
    <>
      <section className="archive-hero-card">
        <div className="archive-hero-icon"><Archive size={25} /></div>
        <div>
          <p className="eyebrow">TRIP ARCHIVE</p>
          <h2>{completed ? '이 여행을 이렇게 기억할게요' : '여행을 마무리해볼까요?'}</h2>
          <p>{completed ? '일정·기록·지출·실제 동선을 한곳에 모아두었어요.' : '여행이 끝났다면 완료 처리하고 기록을 아카이브로 남길 수 있어요.'}</p>
        </div>
        <button className="archive-main-action" onClick={() => setEditorOpen(true)}>{completed ? '후기 수정' : '여행 완료하기'}</button>
        {completed && <button className="archive-reopen" onClick={reopen}>완료 상태 해제</button>}
      </section>

      {error && <div className="schedule-alert">{error}</div>}
      {loading ? <div className="schedule-loading">여행 요약을 만드는 중…</div> : data && (
        <>
          <section className="archive-stats-grid">
            <ArchiveStat icon={<CalendarCheck size={19} />} label="완료 일정" value={`${data.schedule.completed}/${data.schedule.total}`} />
            <ArchiveStat icon={<MapPinned size={19} />} label="방문 장소" value={`${data.schedule.visitedPlaces}곳`} />
            <ArchiveStat icon={<FileArchive size={19} />} label="기록" value={`${data.records.total}개`} />
            <ArchiveStat icon={<WalletCards size={19} />} label="총 지출" value={won(data.expenses.totalKrw)} />
          </section>

          {(data.trip?.archive_rating || data.trip?.archive_note) && (
            <section className="archive-reflection-card">
              {data.trip?.archive_rating && <div><small>여행 별점</small><strong>★ {Number(data.trip.archive_rating).toFixed(1)}</strong></div>}
              {data.trip?.archive_note && <p>{data.trip.archive_note}</p>}
            </section>
          )}

          <section className="info-block archive-breakdown">
            <div className="info-head"><h3>여행 결과</h3></div>
            <div className="archive-breakdown-row"><span>완료</span><strong>{data.schedule.completed}</strong><span>미방문</span><strong>{data.schedule.skipped}</strong><span>취소</span><strong>{data.schedule.cancelled}</strong></div>
            <div className="archive-breakdown-row"><span>사진</span><strong>{data.records.photos}</strong><span>티켓</span><strong>{data.records.tickets}</strong><span>메모</span><strong>{data.records.notes}</strong></div>
          </section>

          <section className="info-block archive-timeline-block">
            <div className="info-head"><div><h3>실제 동선</h3><small>Google Maps Timeline</small></div><button onClick={() => setTimelineOpen(true)}>가져오기</button></div>
            {!imports.length ? (
              <div className="archive-timeline-empty"><Route size={24} /><strong>아직 실제 동선을 가져오지 않았어요</strong><p>Google 타임라인 ZIP/JSON에서 이 여행 기간만 골라 저장할 수 있어요.</p><button onClick={() => setTimelineOpen(true)}><UploadCloud size={16} /> 타임라인 가져오기</button></div>
            ) : (
              <div className="timeline-import-list">
                {imports.map((row) => <TimelineImportRow key={row.id} row={row} onDelete={async () => {
                  if (!window.confirm('이 타임라인 가져오기 기록과 실제 동선을 삭제할까요?')) return
                  try { await deleteTimelineImport(row.id); await load() } catch (e) { setError(e.message) }
                }} />)}
              </div>
            )}
          </section>
        </>
      )}

      {editorOpen && <ArchiveEditor trip={trip} data={data} completed={completed} onClose={() => setEditorOpen(false)} onSave={saveReflection} />}
      {timelineOpen && <TimelineImportSheet trip={trip} onClose={() => setTimelineOpen(false)} onSaved={async () => { setTimelineOpen(false); await load() }} />}
    </>
  )
}

function ArchiveStat({ icon, label, value }) {
  return <div className="archive-stat"><span>{icon}</span><small>{label}</small><strong>{value}</strong></div>
}

function TimelineImportRow({ row, onDelete }) {
  return <div className="timeline-import-row"><div><strong>{row.imported_start_date} — {row.imported_end_date}</strong><span>{row.visit_count} 방문 · {row.activity_count} 이동 · 경로점 {Number(row.path_point_count || 0).toLocaleString()}개</span><small>{row.source_file_name || 'Google 타임라인'}</small></div><button onClick={onDelete} aria-label="타임라인 삭제"><Trash2 size={16} /></button></div>
}

function ArchiveEditor({ trip, data, completed, onClose, onSave }) {
  const initialRating = data?.trip?.archive_rating ? Number(data.trip.archive_rating) : 0
  const initialNote = data?.trip?.archive_note || ''
  const [rating, setRating] = useState(initialRating)
  const [note, setNote] = useState(initialNote)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dirty = rating !== initialRating || note !== initialNote
  const requestClose = () => confirmSheetClose(dirty, onClose)

  const save = async () => {
    setSaving(true); setError('')
    try { await onSave({ rating: rating || null, note, markCompleted: !completed }) }
    catch (e) { setError(e.message); setSaving(false) }
  }

  return <SheetBackdrop onRequestClose={requestClose}>
    <div className="create-sheet archive-editor-sheet" onPointerDown={(e) => e.stopPropagation()}>
      <div className="sheet-handle" />
      <div className="sheet-head"><button onClick={requestClose}>취소</button><span>{completed ? '여행 후기' : '여행 완료'}</span><div /></div>
      <div className="sheet-body">
        <p className="eyebrow">TRIP ARCHIVE</p><h2>{completed ? '이 여행을 어떻게 기억하나요?' : `${trip.title} 여행을 완료할까요?`}</h2>
        <p className="muted">완료해도 일정·기록·지출은 계속 수정할 수 있어요.</p>
        <RatingSlider value={rating} onChange={setRating} />
        <label>한줄평 <span className="optional">선택</span><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="이 여행에서 가장 기억에 남는 느낌을 적어보세요." /></label>
        {error && <div className="schedule-alert">{error}</div>}
        <button className="sheet-primary" disabled={saving} onClick={save}>{saving ? '저장 중…' : completed ? '후기 저장' : '여행 완료하기'}</button>
      </div>
    </div>
  </SheetBackdrop>
}

function TimelineImportSheet({ trip, onClose, onSaved }) {
  const [file, setFile] = useState(null)
  const [timeline, setTimeline] = useState(null)
  const [meta, setMeta] = useState(null)
  const [startDate, setStartDate] = useState(trip.startDate || '')
  const [endDate, setEndDate] = useState(trip.endDate || '')
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const dirty = Boolean(file || timeline)
  const requestClose = () => confirmSheetClose(dirty && !saving, onClose)

  const preview = useMemo(() => timeline ? previewTimeline(timeline, startDate, endDate) : null, [timeline, startDate, endDate])

  const chooseFile = async (event) => {
    const next = event.target.files?.[0]
    if (!next) return
    setFile(next); setReading(true); setError(''); setTimeline(null); setMeta(null)
    try {
      const result = await readTimelineFile(next)
      setTimeline(result.data); setMeta(result.meta)
      const suggestedStart = trip.startDate || result.meta.sourceStart || ''
      const suggestedEnd = trip.endDate || result.meta.sourceEnd || suggestedStart
      setStartDate(suggestedStart)
      setEndDate(suggestedEnd)
    } catch (e) { setError(e.message) }
    finally { setReading(false) }
  }

  const save = async () => {
    if (!timeline || !meta || !preview?.segments?.length) return
    setSaving(true); setError('')
    try {
      await saveTimelineImport({ tripId: trip.id, fileName: file?.name, meta, startDate, endDate, preview })
      await onSaved()
    } catch (e) { setError(e.message); setSaving(false) }
  }

  return <SheetBackdrop onRequestClose={requestClose}>
    <div className="create-sheet timeline-import-sheet" onPointerDown={(e) => e.stopPropagation()}>
      <div className="sheet-handle" />
      <div className="sheet-head"><button onClick={requestClose}>닫기</button><span>Google 타임라인</span><div /></div>
      <div className="sheet-body">
        <p className="eyebrow">ACTUAL ROUTE</p><h2>실제 이동 동선을 가져올까요?</h2>
        <p className="muted">파일 전체를 서버에 올리지 않고 이 기기에서 먼저 읽은 뒤, 선택한 기간의 필요한 이동 정보만 TRIP:ON에 저장해요.</p>

        <label className="timeline-file-picker"><UploadCloud size={22} /><span><strong>{file?.name || '타임라인 ZIP / JSON 선택'}</strong><small>{reading ? '파일을 분석하고 있어요…' : 'Google Maps Timeline에서 내보낸 파일'}</small></span><input type="file" accept=".zip,.json,application/zip,application/json" onChange={chooseFile} disabled={reading || saving} /></label>

        {meta && <div className="timeline-source-meta"><span>원본 범위</span><strong>{meta.sourceStart} — {meta.sourceEnd}</strong><small>{meta.segmentCount.toLocaleString()} 세그먼트 · 방문 {meta.visitCount.toLocaleString()} · 이동 {meta.activityCount.toLocaleString()} · 경로점 {meta.pathPointCount.toLocaleString()}</small></div>}

        {timeline && <>
          <div className="date-grid timeline-date-grid"><label>가져올 시작일<input type="date" min={meta?.sourceStart || undefined} max={meta?.sourceEnd || undefined} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label><label>가져올 종료일<input type="date" min={startDate || meta?.sourceStart || undefined} max={meta?.sourceEnd || undefined} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label></div>
          <div className="timeline-preview-card"><div><Footprints size={20} /><span><small>방문</small><strong>{preview?.visitCount || 0}</strong></span></div><div><Route size={20} /><span><small>이동</small><strong>{preview?.activityCount || 0}</strong></span></div><div><MapPinned size={20} /><span><small>경로점</small><strong>{Number(preview?.pathPointCount || 0).toLocaleString()}</strong></span></div></div>
          {trip.startDate && trip.endDate && (startDate !== trip.startDate || endDate !== trip.endDate) && <div className="timeline-range-note">현재 여행 날짜는 {trip.startDate} — {trip.endDate}예요. 필요하면 다른 기간을 가져와도 돼요.</div>}
        </>}

        {error && <div className="schedule-alert">{error}</div>}
        <button className="sheet-primary" disabled={!timeline || !preview?.segments?.length || saving || reading} onClick={save}>{saving ? `저장 중… (${preview?.segments?.length || 0}개)` : preview?.segments?.length ? `${preview.segments.length.toLocaleString()}개 세그먼트 가져오기` : '가져올 데이터가 없어요'}</button>
      </div>
    </div>
  </SheetBackdrop>
}
