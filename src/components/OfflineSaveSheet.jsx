import React, { useEffect, useState } from 'react'
import { Check, CloudDownload, Image, Trash2 } from 'lucide-react'
import SheetBackdrop from './SheetBackdrop'
import { getOfflineTripMeta, removeOfflineTrip, saveTripOffline } from '../lib/offlineTrips'
import { loadAppPreferences } from '../lib/preferences'

function formatBytes(value) {
  const bytes = Number(value || 0)
  if (!bytes) return '0 MB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(bytes > 20 * 1024 * 1024 ? 0 : 1)} MB`
}

function savedLabel(value) {
  if (!value) return ''
  try { return new Date(value).toLocaleString('ko-KR', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }) }
  catch { return '' }
}

export default function OfflineSaveSheet({ trip, onClose, onSaved }) {
  const [mode, setMode] = useState('essential')
  const [meta, setMeta] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [prefs, setPrefs] = useState(() => loadAppPreferences())

  const loadMeta = async () => {
    try {
      const next = await getOfflineTripMeta(trip.id)
      setMeta(next)
      if (next) setMode(next.includeRecordMedia ? 'full' : 'essential')
    } catch { setMeta(null) }
  }

  useEffect(() => { loadMeta() }, [trip.id])
  useEffect(() => {
    const handler = (event) => setPrefs(event?.detail || loadAppPreferences())
    window.addEventListener('tripon:preferences-changed', handler)
    return () => window.removeEventListener('tripon:preferences-changed', handler)
  }, [])

  const save = async () => {
    setBusy(true); setError(''); setProgress('오프라인 저장을 준비하는 중…')
    try {
      const snapshot = await saveTripOffline({
        trip,
        includeRecordMedia: mode === 'full',
        onProgress: setProgress,
      })
      setMeta({ tripId: trip.id, savedAt: snapshot.savedAt, dataSyncedAt: snapshot.dataSyncedAt, filesSyncedAt: snapshot.filesSyncedAt, includeRecordMedia: snapshot.includeRecordMedia, fileCount: snapshot.fileCount, desiredFileCount: snapshot.desiredFileCount, pendingFileCount: snapshot.pendingFileCount, totalBytes: snapshot.totalBytes })
      setProgress('이 여행을 오프라인에서도 볼 수 있어요.')
      onSaved?.()
    } catch (e) {
      setError(e.message)
      setProgress('')
    } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!window.confirm('이 여행의 오프라인 저장본을 삭제할까요? 온라인 원본은 그대로 유지돼요.')) return
    setBusy(true); setError('')
    try {
      await removeOfflineTrip(trip.id)
      setMeta(null); setProgress('오프라인 저장본을 삭제했어요.')
      onSaved?.()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  return (
    <SheetBackdrop onRequestClose={busy ? () => {} : onClose}>
      <div className="offline-save-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={onClose} disabled={busy}>닫기</button><span>오프라인 여행함</span><div /></div>
        <div className="sheet-body offline-save-body">
          <p className="eyebrow">READY WITHOUT DATA</p>
          <h2>{trip.title}</h2>
          <p className="muted">해외에서 인터넷이 끊겨도 일정·주소·숙소·예약정보와 저장한 문서를 확인할 수 있게 기기에 보관해요.</p>

          {meta && <div className="offline-current-state"><Check size={18}/><div><strong>오프라인 저장됨</strong><small>데이터 {savedLabel(meta.dataSyncedAt || meta.savedAt)} 기준 · 파일 {meta.fileCount || 0}개 · {formatBytes(meta.totalBytes)}</small>{Number(meta.pendingFileCount || 0) > 0 && <small className="offline-pending-note">첨부 {meta.pendingFileCount}개는 다음 허용 네트워크에서 자동 업데이트돼요.</small>}</div></div>}

          <div className="offline-mode-picker">
            <button className={mode === 'essential' ? 'selected' : ''} onClick={() => setMode('essential')} disabled={busy}>
              <span><CloudDownload size={19}/></span><div><strong>필수 정보</strong><small>일정·주소·예약·바우처/PDF·메모</small></div>{mode === 'essential' && <Check size={17}/>} 
            </button>
            <button className={mode === 'full' ? 'selected' : ''} onClick={() => setMode('full')} disabled={busy}>
              <span><Image size={19}/></span><div><strong>기록 사진까지</strong><small>필수 정보 + 기록 탭의 사진·티켓·영수증</small></div>{mode === 'full' && <Check size={17}/>} 
            </button>
          </div>

          {progress && <div className="offline-progress">{progress}</div>}
          {error && <div className="schedule-alert">{error}</div>}
          <button className="sheet-primary" onClick={save} disabled={busy}>{busy ? '저장 중…' : meta ? '오프라인 저장본 업데이트' : '이 여행 오프라인 저장'}</button>
          {meta && <button className="offline-remove" onClick={remove} disabled={busy}><Trash2 size={16}/> 오프라인 저장본 삭제</button>}
          <small className="offline-note">오프라인 저장본은 이 기기에만 저장돼요. {prefs.offlineAutoSync ? '인터넷이 다시 연결되면 데이터는 자동으로 최신화돼요.' : '자동 동기화는 현재 꺼져 있어요.'} {prefs.offlineAutoSync && prefs.offlineWifiOnlyAttachments ? '새 사진·PDF는 Wi-Fi가 확인되는 경우에만 자동으로 받아요.' : ''}</small>
        </div>
      </div>
    </SheetBackdrop>
  )
}
