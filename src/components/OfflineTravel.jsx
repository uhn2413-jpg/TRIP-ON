import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Building2, CalendarDays, Clock3, CloudOff, FileText, MapPin, RefreshCw, Route, Ticket, WalletCards } from 'lucide-react'
import { getOfflineFileBlob, getOfflineTripSnapshot } from '../lib/offlineTrips'

function bytes(value) {
  const n=Number(value||0); if(!n) return '0 MB'; if(n<1024*1024) return `${Math.max(1,Math.round(n/1024))} KB`; return `${(n/1024/1024).toFixed(1)} MB`
}
function savedAt(value) { try { return new Date(value).toLocaleString('ko-KR',{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) } catch { return '' } }
function tripDate(trip) {
  if (trip?.startDate && trip?.endDate) return `${trip.startDate} — ${trip.endDate}`
  if (trip?.datePrecision==='month' && trip.approxYear && trip.approxMonth) return `${trip.approxYear}년 ${trip.approxMonth}월 예정`
  if (trip?.datePrecision==='year' && trip.approxYear) return `${trip.approxYear}년 예정`
  return '날짜 미정'
}
function duration(trip) { const d=Number(trip?.durationDays||0); if (!d) return '기간 미정'; const n=trip?.durationNights==null?Math.max(0,d-1):Math.max(0,Number(trip.durationNights)); return d===1&&n===0?'당일치기':`${n}박 ${d}일` }
function statDistance(value) { const n=Number(value||0); if(!n)return '—'; return n>=1000?`${(n/1000).toFixed(n>=10000?0:1)}km`:`${Math.round(n)}m` }
function statMinutes(value) { const n=Math.round(Number(value||0)); if(!n)return '—'; const h=Math.floor(n/60),m=n%60; return h?(m?`${h}시간 ${m}분`:`${h}시간`):`${m}분` }
function statWon(value) { return `₩${Math.round(Number(value||0)).toLocaleString('ko-KR')}` }

function offlineVotingVisible(trip) {
  if (!trip?.itineraryVotingEnabled || trip?.status === 'completed' || trip?.status === 'cancelled') return false
  if (!trip?.endDate) return true
  const today = new Date(); today.setHours(0,0,0,0)
  const end = new Date(`${trip.endDate}T23:59:59`)
  return !Number.isNaN(end.getTime()) && today <= end
}

export function OfflineLibraryScreen({ trips, onOpen, onTryOnline }) {
  return <div className="app-shell offline-library-shell"><main className="offline-library-page">
    <div className="brand compact">TRIP:<span>ON</span></div>
    <section className="offline-library-hero"><CloudOff size={28}/><div><p className="eyebrow">OFFLINE TRAVEL BOX</p><h1>오프라인 여행함</h1><p>인터넷 없이 확인할 수 있도록 이 기기에 저장한 여행이에요.</p></div></section>
    <button className="offline-retry" onClick={onTryOnline}><RefreshCw size={16}/> 온라인 연결 다시 확인</button>
    <div className="offline-library-list">
      {trips.length ? trips.map((trip)=><button key={trip.id} className="offline-trip-card" onClick={()=>onOpen(trip.id)}><div><small>{tripDate(trip)} · {duration(trip)}</small><strong>{trip.title}</strong><span>{(trip.destinations||[]).join(' · ') || '여행지 미정'}</span><em>동기화 {savedAt(trip.offlineSavedAt)} · {bytes(trip.offlineBytes)}{trip.offlinePendingFiles ? ` · 첨부 ${trip.offlinePendingFiles}개 대기` : ''}</em></div><span>보기</span></button>) : <div className="offline-library-empty"><CloudOff size={26}/><strong>이 기기에 저장된 여행이 없어요.</strong><p>온라인 상태에서 여행 목록이나 여행 상세의 ‘오프라인’ 버튼으로 미리 저장해두면 여기서 확인할 수 있어요.</p></div>}
    </div>
  </main></div>
}

function OfflineFileButton({ path, label, mimeType }) {
  const [url,setUrl]=useState('')
  useEffect(()=>{ let alive=true, objectUrl=''; if(!path)return; getOfflineFileBlob(path).then((blob)=>{if(!alive||!blob)return; objectUrl=URL.createObjectURL(blob); setUrl(objectUrl)}).catch(()=>{}); return()=>{alive=false;if(objectUrl)URL.revokeObjectURL(objectUrl)} },[path])
  if (!url) return <span className="offline-file-missing">{label} · 저장 안 됨</span>
  return <a className="offline-file-button" href={url} target="_blank" rel="noreferrer" download={label}>{mimeType?.startsWith('image/') ? '사진' : '문서'} · {label}</a>
}

export function OfflineTripDetail({ tripId, onBack }) {
  const [snapshot,setSnapshot]=useState(null)
  const [tab,setTab]=useState('schedule')
  useEffect(()=>{ let alive=true; getOfflineTripSnapshot(tripId).then((row)=>{if(alive)setSnapshot(row)}); return()=>{alive=false} },[tripId])
  const days=useMemo(()=>snapshot?.schedule?.days||[],[snapshot])
  if(!snapshot) return <div className="app-shell loading-shell"><div className="loading-dot"/><strong>오프라인 여행을 여는 중…</strong></div>
  const trip=snapshot.trip
  const showVotes=offlineVotingVisible(trip)
  return <div className="app-shell offline-detail-shell"><main className="offline-detail-page">
    <header className="offline-detail-head"><button onClick={onBack}><ArrowLeft size={20}/></button><div><small>OFFLINE · {savedAt(snapshot.dataSyncedAt || snapshot.savedAt)} 동기화{snapshot.pendingFileCount ? ` · 첨부 ${snapshot.pendingFileCount}개 대기` : ''}</small><h1>{trip.title}</h1><p>{tripDate(trip)} · {duration(trip)}</p></div></header>
    <div className="offline-detail-tabs">{[['schedule','일정'],['prep','예약·준비'],['record','기록'],['stats','통계']].map(([k,l])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{l}</button>)}</div>
    {tab==='schedule' && <div className="offline-day-list">{days.map((day)=>{const items=(snapshot.schedule.items||[]).filter((i)=>i.trip_day_id===day.id && !i.group_parent_id && !i.linked_plan_id); return <section className="offline-day-card" key={day.id}><div className="offline-day-title"><CalendarDays size={17}/><strong>DAY {day.day_number}</strong><span>{day.trip_date||'날짜 미정'}</span></div>{day.memo&&<p className="offline-day-memo">{day.memo}</p>}{items.length?items.map((item)=>{const votes=item.trip_on_itinerary_votes||[];const go=votes.filter((v)=>v.vote==='go').length,maybe=votes.filter((v)=>v.vote==='maybe').length,skip=votes.filter((v)=>v.vote==='skip').length;return <div className="offline-itinerary-row" key={item.id}><div><strong>{item.title}</strong><small>{[item.city,item.trip_on_places?.address].filter(Boolean).join(' · ')||'장소 정보 없음'}</small>{showVotes&&!['completed','skipped','cancelled'].includes(item.status)&&votes.length>0&&<small>투표 · 가자 {go} · 보류 {maybe} · 패스 {skip}</small>}</div><span>{item.is_time_unscheduled?'시간 미정':item.start_at?new Date(item.start_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):''}</span></div>}):<div className="offline-empty-row">저장된 일정이 없어요.</div>}</section>})}</div>}
    {tab==='prep' && <div className="offline-section-stack">
      {(snapshot.prep.reservations||[]).map((r)=><section className="offline-reservation-card" key={r.id}><div className="offline-reservation-title"><Ticket size={17}/><div><strong>{r.title}</strong><small>{[r.provider,r.reservation_number].filter(Boolean).join(' · ')||'예약 정보'}</small></div></div>{r.memo&&<p>{r.memo}</p>}{(r.trip_on_reservation_files||[]).map((f)=><OfflineFileButton key={f.id} path={f.storage_path} label={f.display_name||f.file_name||'예약 문서'} mimeType={f.mime_type}/>)}</section>)}
      {(snapshot.prep.prepItems||[]).length>0&&<section className="offline-checklist"><h2>준비 체크</h2>{snapshot.prep.prepItems.map((i)=><div key={i.id}><span>{i.is_done?'✓':'○'}</span><strong>{i.title}{i.assignee?.name&&<small> · 담당 {i.assignee.is_me?'나':i.assignee.name}</small>}</strong></div>)}</section>}
      {(snapshot.prep.infoItems||[]).length>0&&<section className="offline-info-list"><h2>여행 정보</h2>{snapshot.prep.infoItems.map((i)=><div key={i.id}><strong>{i.label}</strong><span>{i.value}</span>{i.memo&&<small>{i.memo}</small>}</div>)}</section>}
    </div>}
    {tab==='record' && <div className="offline-section-stack">
      {(snapshot.records.reflections||[]).length>0&&<section className="offline-reflection-list"><h2>DAY 회고</h2>{(snapshot.records.reflections||[]).map((reflection)=>{const day=(snapshot.records.days||[]).find((item)=>item.id===reflection.trip_day_id);return <div key={reflection.id}><strong>DAY {day?.day_number||'-'}</strong><p>{reflection.body}</p></div>})}</section>}
      {(snapshot.records.records||[]).length?(snapshot.records.records||[]).map((r)=><section className="offline-record-card" key={r.id}><div><FileText size={16}/><strong>{r.title||r.place_name||'여행 기록'}</strong></div>{(r.trip_on_places?.name||r.itinerary_item?.trip_on_places?.name||r.place_name)&&<small className="offline-record-place"><MapPin size={12}/>{r.trip_on_places?.name||r.itinerary_item?.trip_on_places?.name||r.place_name}</small>}{r.memo&&<p>{r.memo}</p>}{(r.media||[]).map((m)=><OfflineFileButton key={m.id} path={m.storage_path} label={m.file_name||'기록 파일'} mimeType={m.mime_type}/>)}</section>):(!(snapshot.records.reflections||[]).length&&<div className="offline-empty-large"><FileText size={24}/><strong>저장된 기록이 없어요.</strong></div>)}
    </div>}
    {tab==='stats' && <div className="offline-section-stack">
      <section className="offline-stats-grid">
        <div><Route size={17}/><small>실제 이동 거리</small><strong>{statDistance(snapshot.archiveStats?.timeline?.distanceMeters)}</strong></div>
        <div><Clock3 size={17}/><small>실제 이동 시간</small><strong>{statMinutes(snapshot.archiveStats?.timeline?.movementMinutes)}</strong></div>
        <div><Building2 size={17}/><small>여행지 도시</small><strong>{snapshot.archiveStats?.travelStats?.cityCount||0}곳</strong></div>
        <div><WalletCards size={17}/><small>총 지출</small><strong>{statWon(snapshot.archiveStats?.expenses?.totalKrw)}</strong></div>
      </section>
      {snapshot.archiveStats?.timeline?.longestStay&&<section className="offline-stat-card"><small>가장 오래 머문 장소</small><strong>{snapshot.archiveStats.timeline.longestStay.name}</strong><p>{statMinutes(snapshot.archiveStats.timeline.longestStay.minutes)}{snapshot.archiveStats.timeline.longestStay.city?` · ${snapshot.archiveStats.timeline.longestStay.city}`:''}</p></section>}
      {(snapshot.archiveStats?.travelStats?.daily||[]).length>0&&<section className="offline-stat-card"><small>DAY별 요약</small><div className="offline-stat-days">{snapshot.archiveStats.travelStats.daily.map((day)=><div key={day.dayId}><strong>DAY {day.dayNumber}</strong><span>{[day.visits?`방문 ${day.visits}회`:'',day.distanceMeters?statDistance(day.distanceMeters):'',day.expenseCount?statWon(day.expenseKrw):''].filter(Boolean).join(' · ')||'기록 없음'}</span></div>)}</div></section>}
    </div>}
    <div className="offline-footer-note"><MapPin size={14}/> 이 화면은 {savedAt(snapshot.dataSyncedAt || snapshot.savedAt)}에 동기화된 내용이에요.{snapshot.pendingFileCount ? ` 새 첨부 ${snapshot.pendingFileCount}개는 아직 기기에 없어요.` : ''} 수정은 온라인 연결 후 가능해요.</div>
  </main></div>
}
