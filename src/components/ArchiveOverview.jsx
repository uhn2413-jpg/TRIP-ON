import React, { useEffect, useMemo, useState } from 'react'
import { Archive, CalendarCheck, ChevronDown, ChevronUp, FileArchive, Footprints, MapPinned, Navigation, Route, Trash2, UploadCloud, WalletCards } from 'lucide-react'
import RatingSlider from './RatingSlider'
import SheetBackdrop, { confirmSheetClose } from './SheetBackdrop'
import { MapCanvas } from './TravelMap'
import { deleteTimelineImport, fetchArchiveData, fetchTimelineMapData, fetchTimelineScheduleCandidates, importTimelineVisitsToSchedule, previewTimeline, readTimelineFile, saveTimelineImport, updateTripArchive } from '../lib/archive'

const won = (value) => `₩${Math.round(Number(value || 0)).toLocaleString('ko-KR')}`

export default function ArchiveOverview({ trip, onTripUpdated, refreshKey = 0, readOnly = false }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [routeOpen, setRouteOpen] = useState(false)
  const [scheduleImportOpen, setScheduleImportOpen] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try { setData(await fetchArchiveData(trip.id)) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [trip.id, refreshKey])

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
        {!readOnly && <button className="archive-main-action" onClick={() => setEditorOpen(true)}>{completed ? '후기 수정' : '여행 완료하기'}</button>}
        {!readOnly && completed && <button className="archive-reopen" onClick={reopen}>완료 상태 해제</button>}
      </section>

      {error && <div className="schedule-alert">{error}</div>}
      {loading ? <div className="schedule-loading">여행 요약을 만드는 중…</div> : data && (
        <>
          <section className="archive-stats-grid">
            <ArchiveStat icon={<CalendarCheck size={19} />} label="완료 일정" value={`${data.schedule.completed}/${data.schedule.total}`} />
            <ArchiveStat icon={<MapPinned size={19} />} label={data.timeline?.visitCount ? '실제 방문' : '방문 장소'} value={`${data.timeline?.visitCount ? (data.timeline.uniquePlaces || data.timeline.visitCount) : data.schedule.visitedPlaces}곳`} />
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
            <div className="info-head"><div><h3>실제 동선</h3><small>Google Maps Timeline</small></div>{!readOnly && <button onClick={() => setTimelineOpen(true)}>가져오기</button>}</div>
            {!imports.length ? (
              <div className="archive-timeline-empty"><Route size={24} /><strong>아직 실제 동선을 가져오지 않았어요</strong><p>Google 타임라인 ZIP/JSON에서 이 여행 기간만 골라 저장할 수 있어요.</p>{!readOnly && <button onClick={() => setTimelineOpen(true)}><UploadCloud size={16} /> 타임라인 가져오기</button>}</div>
            ) : (
              <>
                <button className="timeline-route-toggle" onClick={() => setRouteOpen((value) => !value)}>
                  <span className="timeline-route-toggle-icon"><Route size={18} /></span>
                  <span><strong>지도에서 실제 동선 보기</strong><small>{data.timeline?.visitCount || 0}회 방문 · {Math.max(0, (data.timeline?.segmentCount || 0) - (data.timeline?.visitCount || 0))}개 이동 구간 · 처음 열면 장소 위치를 자동 연결해요</small></span>
                  {routeOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                {routeOpen && <TimelineRoutePanel tripId={trip.id} />}
                {!readOnly && <button className="timeline-schedule-import-button" onClick={() => setScheduleImportOpen(true)}>
                  <span><MapPinned size={17} /></span>
                  <div><strong>방문 장소를 일정에 넣기</strong><small>이동은 제외하고, Timeline에서 확인된 방문 장소만 DAY별 일정으로 가져와요.</small></div>
                  <ChevronDown size={17} />
                </button>}
                <div className="timeline-import-list">
                  {imports.map((row) => <TimelineImportRow key={row.id} row={row} onDelete={readOnly ? null : async () => {
                    if (!window.confirm('이 타임라인 가져오기 기록과 실제 동선을 삭제할까요?')) return
                    try { await deleteTimelineImport(row.id); await load() } catch (e) { setError(e.message) }
                  }} />)}
                </div>
              </>
            )}
          </section>
        </>
      )}

      {!readOnly && editorOpen && <ArchiveEditor trip={trip} data={data} completed={completed} onClose={() => setEditorOpen(false)} onSave={saveReflection} />}
      {!readOnly && timelineOpen && <TimelineImportSheet trip={trip} onClose={() => setTimelineOpen(false)} onSaved={async () => { setTimelineOpen(false); await load(); setRouteOpen(true) }} />}
      {!readOnly && scheduleImportOpen && <TimelineScheduleImportSheet trip={trip} onClose={() => setScheduleImportOpen(false)} onImported={async () => { setScheduleImportOpen(false); await load() }} />}
    </>
  )
}

function ArchiveStat({ icon, label, value }) {
  return <div className="archive-stat"><span>{icon}</span><small>{label}</small><strong>{value}</strong></div>
}

function TimelineImportRow({ row, onDelete }) {
  return <div className="timeline-import-row"><div><strong>{row.imported_start_date} — {row.imported_end_date}</strong><span>{row.visit_count} 방문 · {row.activity_count} 이동 · 경로점 {Number(row.path_point_count || 0).toLocaleString()}개</span><small>{row.source_file_name || 'Google 타임라인'}</small></div>{onDelete && <button onClick={onDelete} aria-label="타임라인 삭제"><Trash2 size={16} /></button>}</div>
}


const transportLabels = {
  WALKING: '도보', RUNNING: '달리기', CYCLING: '자전거', BICYCLING: '자전거',
  IN_PASSENGER_VEHICLE: '차량', IN_VEHICLE: '차량', DRIVING: '차량', MOTORCYCLING: '오토바이',
  BUS: '버스', SUBWAY: '지하철', TRAIN: '기차', TRAM: '트램', FERRY: '배',
  FLYING: '항공', AIRPLANE: '항공', SKIING: '스키', SAILING: '배',
}

function formatTimelineTime(iso, offsetMinutes) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return String(iso).slice(11, 16)
  if (offsetMinutes != null && Number.isFinite(Number(offsetMinutes))) {
    return new Date(date.getTime() + Number(offsetMinutes) * 60000).toISOString().slice(11, 16)
  }
  return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}

function shortDay(date) {
  if (!date) return ''
  const [, month, day] = String(date).split('-')
  return `${Number(month)} / ${Number(day)}`
}

function distanceText(value) {
  const meters = Number(value)
  if (!Number.isFinite(meters) || meters <= 0) return ''
  if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)}km`
  return `${Math.round(meters)}m`
}

function TimelineRoutePanel({ tripId }) {
  const [route, setRoute] = useState(null)
  const [day, setDay] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchTimelineMapData(tripId)
      .then((result) => { if (alive) { setRoute(result); setError('') } })
      .catch((e) => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [tripId])

  const shown = useMemo(() => {
    if (!route) return { visits: [], paths: [], segments: [] }
    if (day === 'all') return route
    return {
      ...route,
      visits: route.visits.filter((item) => item.dayDate === day),
      paths: route.paths.filter((item) => item.dayDate === day),
      segments: route.segments.filter((item) => item.dayDate === day),
    }
  }, [route, day])

  const daySummaries = useMemo(() => (route?.days || []).map((date) => {
    const segments = route.segments.filter((item) => item.dayDate === date)
    return {
      date,
      visits: segments.filter((item) => item.segmentType === 'visit').length,
      moves: segments.filter((item) => item.segmentType !== 'visit').length,
    }
  }), [route])

  if (loading) return <div className="schedule-loading timeline-route-loading"><strong>실제 동선을 준비하고 있어요</strong><span>필요한 방문 장소만 Google Places와 한 번 연결한 뒤 지도에 표시해요.</span></div>
  if (error) return <div className="schedule-alert">{error}</div>
  if (!route?.segmentCount) return <div className="archive-timeline-empty compact"><Route size={20} /><strong>표시할 실제 동선이 없어요</strong></div>

  return <div className="timeline-route-panel">
    <div className="timeline-day-tabs">
      <button className={day === 'all' ? 'active' : ''} onClick={() => setDay('all')}>전체</button>
      {route.days.map((date) => <button key={date} className={day === date ? 'active' : ''} onClick={() => setDay(date)}>{shortDay(date)}</button>)}
    </div>

    {route.placeResolution?.resolved > 0 && <div className="timeline-resolution-note success"><MapPinned size={15} /><span>{route.placeResolution.resolved}개 방문 장소의 위치를 연결했어요. 다음부터는 저장된 위치를 재사용해요.</span></div>}
    {route.unresolvedVisitCount > 0 && <div className="timeline-resolution-note warning"><Navigation size={15} /><span>{route.unresolvedVisitCount}개 방문 장소는 위치를 확인하지 못했어요.{route.placeResolution?.unavailable ? ' Google Maps API 연결 상태를 확인해주세요.' : ' 확인 가능한 장소만 지도에 표시해요.'}</span></div>}
    <MapCanvas className="timeline-route-map" points={shown.visits} pathSegments={shown.paths} />

    {route.detailedPathPointCount === 0 && <div className="map-legend-note timeline-route-note"><Navigation size={15} /><span>이 파일에는 세밀한 GPS 경로점이 없어서 이동 구간의 시작·종료 좌표와 방문 순서를 이용해 동선을 재구성해 보여줘요.</span></div>}

    {day === 'all' ? (
      <div className="timeline-day-summary-list">
        {daySummaries.map((item) => <button key={item.date} onClick={() => setDay(item.date)}><strong>{item.date}</strong><span>{item.visits}회 방문 · {item.moves}개 이동</span><ChevronDown size={16} /></button>)}
      </div>
    ) : (
      <div className="timeline-segment-list">
        {shown.segments.map((segment) => {
          const visit = segment.segmentType === 'visit'
          const transport = transportLabels[String(segment.transportType || '').toUpperCase()] || '이동'
          const start = formatTimelineTime(segment.startAt, segment.startOffset)
          const end = formatTimelineTime(segment.endAt, segment.endOffset)
          return <div key={segment.id} className={`timeline-segment-row ${visit ? 'visit' : 'move'}`}>
            <span className="timeline-segment-icon">{visit ? <MapPinned size={16} /> : <Route size={16} />}</span>
            <div><small>{start}{end && end !== start ? ` – ${end}` : ''}</small><strong>{visit ? segment.name || '실제 방문' : transport}</strong>{visit ? <span>{segment.address || [segment.city, segment.country].filter(Boolean).join(' · ') || 'Google 타임라인에서 감지된 방문'}</span> : <span>{[distanceText(segment.distanceMeters), segment.pathPointCount ? `경로점 ${segment.pathPointCount}개` : segment.routeIsSynthetic ? '방문 순서 기준 재구성' : '시작·종료 좌표 기준'].filter(Boolean).join(' · ')}</span>}</div>
          </div>
        })}
      </div>
    )}
  </div>
}

function TimelineScheduleImportSheet({ trip, onClose, onImported }) {
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchTimelineScheduleCandidates(trip.id)
      .then((result) => {
        if (!alive) return
        setData(result)
        setSelected(new Set(result.visits
          .filter((visit) => visit.canImport && !visit.alreadyImported)
          .map((visit) => visit.id)))
        setError('')
      })
      .catch((e) => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [trip.id])

  const available = useMemo(() => (data?.visits || []).filter((visit) => visit.canImport && !visit.alreadyImported), [data])
  const grouped = useMemo(() => {
    const groups = new Map()
    for (const visit of data?.visits || []) {
      const key = visit.dayDate || '날짜 미정'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(visit)
    }
    return [...groups.entries()]
  }, [data])

  const toggle = (id) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = available.length > 0 && available.every((visit) => selected.has(visit.id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(available.map((visit) => visit.id)))

  const save = async () => {
    if (!selected.size) return
    setSaving(true)
    setError('')
    try {
      const result = await importTimelineVisitsToSchedule({ tripId: trip.id, segmentIds: [...selected] })
      window.alert([
        result.created ? `${result.created}개 장소를 새 일정으로 추가했어요.` : '',
        result.linked ? `${result.linked}개는 기존 일정과 연결했어요.` : '',
        result.skipped ? `${result.skipped}개는 이미 반영됐거나 연결할 수 없어 건너뛰었어요.` : '',
      ].filter(Boolean).join('\n') || '가져올 새로운 방문 장소가 없어요.')
      await onImported()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return <SheetBackdrop onRequestClose={saving ? undefined : onClose}>
    <div className="create-sheet timeline-schedule-sheet" onPointerDown={(e) => e.stopPropagation()}>
      <div className="sheet-handle" />
      <div className="sheet-head"><button onClick={onClose} disabled={saving}>닫기</button><span>방문 장소 가져오기</span><div /></div>
      <div className="sheet-body">
        <p className="eyebrow">TIMELINE → SCHEDULE</p>
        <h2>실제로 들른 장소를 일정에 넣을까요?</h2>
        <p className="muted">이동 구간은 만들지 않고 방문 장소만 DAY별로 추가해요. 이미 같은 날 같은 장소가 일정에 있으면 새로 만들지 않고 완료 기록과 연결해요.</p>

        {loading ? <div className="schedule-loading timeline-schedule-loading"><strong>방문 장소를 확인하고 있어요</strong><span>좌표가 없는 Google Place ID만 처음 한 번 확인하고, 다음부터는 저장된 장소를 재사용해요.</span></div> : <>
          <div className="timeline-schedule-toolbar">
            <div><strong>{available.length}개 가져오기 가능</strong><small>이미 반영된 장소는 자동으로 제외돼요.</small></div>
            <button type="button" onClick={toggleAll} disabled={!available.length}>{allSelected ? '전체 해제' : '전체 선택'}</button>
          </div>

          <div className="timeline-schedule-groups">
            {grouped.map(([date, visits]) => <section key={date} className="timeline-schedule-day">
              <div className="timeline-schedule-day-head"><strong>{date}</strong><span>{visits.length}곳</span></div>
              {visits.map((visit) => {
                const disabled = !visit.canImport || visit.alreadyImported
                const start = formatTimelineTime(visit.startAt, visit.startOffset)
                const end = formatTimelineTime(visit.endAt, visit.endOffset)
                return <label key={visit.id} className={`timeline-visit-choice ${disabled ? 'disabled' : ''}`}>
                  <input type="checkbox" checked={!disabled && selected.has(visit.id)} disabled={disabled || saving} onChange={() => toggle(visit.id)} />
                  <span className="timeline-visit-check" />
                  <div>
                    <strong>{visit.name}</strong>
                    <small>{start}{end && end !== start ? ` – ${end}` : ''}{visit.city ? ` · ${visit.city}` : ''}</small>
                    {visit.matchedItemId && !visit.alreadyImported && <em>기존 일정 “{visit.matchedItemTitle}”과 연결 예정</em>}
                    {visit.alreadyImported && <em>이미 일정에 반영됨</em>}
                    {!visit.canImport && <em>장소 위치 또는 여행 DAY를 연결하지 못함</em>}
                  </div>
                </label>
              })}
            </section>)}
          </div>
        </>}

        {error && <div className="schedule-alert">{error}</div>}
        <button className="sheet-primary" disabled={loading || saving || !selected.size} onClick={save}>{saving ? '일정에 반영 중…' : `${selected.size}개 방문 장소 일정에 추가`}</button>
      </div>
    </div>
  </SheetBackdrop>
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
          {Number(preview?.pathPointCount || 0) === 0 && preview?.visitCount > 0 && <div className="timeline-import-help"><MapPinned size={15} /><span><strong>경로점이 0이어도 괜찮아요.</strong> 가져온 뒤 ‘지도에서 실제 동선 보기’를 누르면 Google Place ID로 방문 위치를 연결하고, 방문 순서를 이용해 동선을 재구성해요.</span></div>}
          {trip.startDate && trip.endDate && (startDate !== trip.startDate || endDate !== trip.endDate) && <div className="timeline-range-note">현재 여행 날짜는 {trip.startDate} — {trip.endDate}예요. 필요하면 다른 기간을 가져와도 돼요.</div>}
        </>}

        {error && <div className="schedule-alert">{error}</div>}
        <button className="sheet-primary" disabled={!timeline || !preview?.segments?.length || saving || reading} onClick={save}>{saving ? `저장 중… (${preview?.segments?.length || 0}개)` : preview?.segments?.length ? `${preview.segments.length.toLocaleString()}개 세그먼트 가져오기` : '가져올 데이터가 없어요'}</button>
      </div>
    </div>
  </SheetBackdrop>
}
