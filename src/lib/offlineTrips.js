import { supabase } from './supabase'
import { fetchPrepData } from './prep'
import { fetchArchiveData } from './archive'

const DB_NAME = 'tripon-offline-v1'
const DB_VERSION = 1
const SNAPSHOT_STORE = 'snapshots'
const FILE_STORE = 'files'
const FILE_BUCKET = 'trip-on-files'
const AUTO_SYNC_MIN_AGE_MS = 10 * 60 * 1000


async function fetchScheduleSnapshot(tripId) {
  const [daysRes, itemsRes, accommodationsRes] = await Promise.all([
    supabase.from('trip_on_trip_days').select('id, day_number, trip_date, title, memo').eq('trip_id', tripId).order('day_number'),
    supabase.from('trip_on_itinerary_items').select(`
      id, trip_day_id, place_id, title, category, city, start_at, end_at, start_timezone, end_timezone,
      actual_start_at, actual_end_at, actual_start_timezone, actual_end_timezone,
      is_time_unscheduled, status, sort_order, memo, linked_plan_id, group_parent_id, is_visit_group, group_title,
      trip_on_places:trip_on_places!trip_on_itinerary_items_place_id_fkey ( id, name, city, country, address, latitude, longitude, timezone ),
      trip_on_itinerary_votes ( id, user_id, user_email, vote, created_at, updated_at )
    `).eq('trip_id', tripId).order('sort_order', { ascending: true }),
    supabase.from('trip_on_reservations').select('id, title, provider, start_at, end_at, start_timezone, end_timezone, status').eq('trip_id', tripId).eq('type', 'accommodation').neq('status', 'cancelled').order('start_at', { ascending: true, nullsFirst: false }),
  ])
  for (const result of [daysRes, itemsRes, accommodationsRes]) if (result.error) throw result.error
  return { days: daysRes.data || [], items: itemsRes.data || [], accommodations: accommodationsRes.data || [] }
}


async function fetchRecordSnapshot(tripId) {
  const [daysRes, itineraryRes, recordsRes, reflectionsRes] = await Promise.all([
    supabase.from('trip_on_trip_days').select('id, day_number, trip_date, title').eq('trip_id', tripId).order('day_number'),
    supabase.from('trip_on_itinerary_items').select(`id, trip_day_id, place_id, title, city, start_at, start_timezone, is_time_unscheduled, sort_order, trip_on_places:trip_on_places!trip_on_itinerary_items_place_id_fkey ( id, name, city, country, address, latitude, longitude, timezone )`).eq('trip_id', tripId).order('sort_order', { ascending: true }),
    supabase.from('trip_on_records').select(`
      id, trip_day_id, itinerary_item_id, place_id, type, title, memo, recorded_at, recorded_timezone,
      recorded_time_known, place_name, city, rating, created_at, updated_at,
      trip_on_places ( id, name, city, country, address, latitude, longitude, timezone ),
      trip_on_record_media ( id, file_url, storage_path, file_name, mime_type, media_type, sort_order, created_at )
    `).eq('trip_id', tripId).order('recorded_at', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true }),
    supabase.from('trip_on_day_reflections').select('id, trip_day_id, body, generated_at, updated_at').eq('trip_id', tripId).order('created_at', { ascending: true }),
  ])
  for (const result of [daysRes, itineraryRes, recordsRes, reflectionsRes]) if (result.error) throw result.error
  const days = daysRes.data || []
  const itinerary = itineraryRes.data || []
  const dayMap = new Map(days.map((day) => [day.id, day]))
  const itemMap = new Map(itinerary.map((item) => [item.id, item]))
  return {
    days,
    itinerary,
    reflections: reflectionsRes.data || [],
    records: (recordsRes.data || []).map((record) => ({
      ...record,
      day: dayMap.get(record.trip_day_id) || null,
      itinerary_item: itemMap.get(record.itinerary_item_id) || null,
      media: [...(record.trip_on_record_media || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    })),
  }
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('오프라인 저장소를 열 수 없어요.'))
  })
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('오프라인 저장 중 문제가 생겼어요.'))
    tx.onabort = () => reject(tx.error || new Error('오프라인 저장이 취소됐어요.'))
  })
}

function openDb() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('이 브라우저에서는 오프라인 저장을 지원하지 않아요.'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'tripId' })
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        const files = db.createObjectStore(FILE_STORE, { keyPath: 'key' })
        files.createIndex('tripId', 'tripId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('오프라인 저장소를 열 수 없어요.'))
  })
}

function cleanSnapshotTrip(trip) {
  return {
    ...trip,
    coverImageUrl: null,
    offlineOnly: true,
  }
}

function collectReservationFiles(prep) {
  const rows = []
  for (const reservation of prep?.reservations || []) {
    for (const file of reservation.trip_on_reservation_files || []) {
      if (!file.storage_path) continue
      rows.push({
        key: file.storage_path,
        storagePath: file.storage_path,
        fileName: file.display_name || file.file_name || '예약 문서',
        mimeType: file.mime_type || null,
        kind: 'reservation-file',
        reservationId: reservation.id,
      })
    }
  }
  return rows
}

function collectRecordFiles(records) {
  const rows = []
  for (const record of records?.records || []) {
    for (const media of record.media || []) {
      if (!media.storage_path) continue
      rows.push({
        key: media.storage_path,
        storagePath: media.storage_path,
        fileName: media.file_name || '기록 파일',
        mimeType: media.mime_type || null,
        kind: 'record-media',
        recordId: record.id,
      })
    }
  }
  return rows
}

async function getStoredFilesForTrip(db, tripId) {
  const tx = db.transaction(FILE_STORE, 'readonly')
  const rows = await requestToPromise(tx.objectStore(FILE_STORE).index('tripId').getAll(IDBKeyRange.only(tripId)))
  return rows || []
}

async function deleteStoredFileKeys(db, keys = []) {
  if (!keys.length) return
  const tx = db.transaction(FILE_STORE, 'readwrite')
  const store = tx.objectStore(FILE_STORE)
  keys.forEach((key) => store.delete(key))
  await transactionDone(tx)
}

async function deleteStoredFilesForTrip(db, tripId) {
  const rows = await getStoredFilesForTrip(db, tripId)
  await deleteStoredFileKeys(db, rows.map((row) => row.key))
}

function autoAttachmentDownloadAllowed(wifiOnly = true) {
  if (!wifiOnly) return { allowed: true, connectionKnown: true, label: '모든 네트워크' }
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
  const type = String(connection?.type || '').toLowerCase()
  if (type) {
    const allowed = type === 'wifi' || type === 'ethernet'
    return { allowed, connectionKnown: true, label: allowed ? 'Wi-Fi' : type }
  }
  if (connection?.saveData) return { allowed: false, connectionKnown: true, label: '데이터 절약 모드' }
  return { allowed: false, connectionKnown: false, label: '연결 종류 확인 불가' }
}

export function getOfflineAutoSyncNetworkState(wifiOnly = true) {
  return autoAttachmentDownloadAllowed(wifiOnly)
}

async function downloadOfflineFile(item) {
  const { data, error } = await supabase.storage.from(FILE_BUCKET).download(item.storagePath)
  if (error) throw new Error(`${item.fileName} 저장 실패: ${error.message}`)
  return data
}

function scrubSignedUrls(recordData) {
  return {
    ...recordData,
    records: (recordData?.records || []).map((record) => ({
      ...record,
      media: (record.media || []).map(({ signed_url, ...media }) => media),
    })),
  }
}

export async function saveTripOffline({ trip, includeRecordMedia = false, onProgress, downloadMissingFiles = true, syncReason = 'manual' } = {}) {
  if (!trip?.id) throw new Error('저장할 여행을 찾을 수 없어요.')
  onProgress?.('여행 정보를 모으는 중…')
  const [schedule, prep, recordData, archiveStats] = await Promise.all([
    fetchScheduleSnapshot(trip.id),
    fetchPrepData(trip.id),
    fetchRecordSnapshot(trip.id),
    fetchArchiveData(trip.id),
  ])

  const fileRefs = [
    ...collectReservationFiles(prep),
    ...(includeRecordMedia ? collectRecordFiles(recordData) : []),
  ]
  const dedupedRefs = [...new Map(fileRefs.map((item) => [item.storagePath, item])).values()]
  const desiredKeys = new Set(dedupedRefs.map((item) => item.storagePath))
  const db = await openDb()
  const previousTx = db.transaction(SNAPSHOT_STORE, 'readonly')
  const previous = await requestToPromise(previousTx.objectStore(SNAPSHOT_STORE).get(trip.id))
  const existingRows = await getStoredFilesForTrip(db, trip.id)
  const existingByKey = new Map(existingRows.map((row) => [row.key, row]))

  let downloadedCount = 0
  let reusedCount = 0
  let pendingFileCount = 0
  const storedRows = []

  for (let i = 0; i < dedupedRefs.length; i += 1) {
    const item = dedupedRefs[i]
    const existing = existingByKey.get(item.storagePath)
    if (existing?.blob) {
      reusedCount += 1
      storedRows.push({ ...existing, ...item, tripId: trip.id })
      continue
    }
    if (!downloadMissingFiles) {
      pendingFileCount += 1
      continue
    }
    onProgress?.(`새 첨부파일 저장 중 ${downloadedCount + 1} · ${item.fileName}`)
    const blob = await downloadOfflineFile(item)
    const row = { ...item, tripId: trip.id, blob, byteSize: blob.size || 0 }
    const tx = db.transaction(FILE_STORE, 'readwrite')
    tx.objectStore(FILE_STORE).put(row)
    await transactionDone(tx)
    downloadedCount += 1
    storedRows.push(row)
  }

  const staleKeys = existingRows.filter((row) => !desiredKeys.has(row.key)).map((row) => row.key)
  await deleteStoredFileKeys(db, staleKeys)

  const savedAt = new Date().toISOString()
  const allFilesCurrent = pendingFileCount === 0
  const filesSyncedAt = allFilesCurrent ? savedAt : (previous?.filesSyncedAt || previous?.savedAt || null)
  const fileBytes = storedRows.reduce((sum, row) => sum + Number(row.byteSize || row.blob?.size || 0), 0)
  const snapshot = {
    tripId: trip.id,
    savedAt,
    dataSyncedAt: savedAt,
    filesSyncedAt,
    includeRecordMedia,
    fileCount: storedRows.length,
    desiredFileCount: dedupedRefs.length,
    pendingFileCount,
    fileBytes,
    syncReason,
    trip: cleanSnapshotTrip(trip),
    schedule,
    prep,
    records: scrubSignedUrls(recordData),
    archiveStats,
  }
  const textBytes = new Blob([JSON.stringify(snapshot)]).size
  snapshot.totalBytes = textBytes + fileBytes

  const tx = db.transaction(SNAPSHOT_STORE, 'readwrite')
  tx.objectStore(SNAPSHOT_STORE).put(snapshot)
  await transactionDone(tx)
  db.close()
  onProgress?.(pendingFileCount
    ? `데이터 동기화 완료 · 첨부 ${pendingFileCount}개 업데이트 대기`
    : downloadedCount
      ? `오프라인 저장 완료 · 새 파일 ${downloadedCount}개`
      : reusedCount
        ? '오프라인 저장 완료 · 기존 파일은 다시 받지 않았어요.'
        : '오프라인 저장 완료')
  return snapshot
}

export async function syncOfflineTrip({ trip, wifiOnlyAttachments = true, onProgress } = {}) {
  if (!trip?.id) return null
  const current = await getOfflineTripSnapshot(trip.id)
  if (!current) return null
  const network = autoAttachmentDownloadAllowed(wifiOnlyAttachments)
  return saveTripOffline({
    trip,
    includeRecordMedia: Boolean(current.includeRecordMedia),
    downloadMissingFiles: network.allowed,
    syncReason: 'auto',
    onProgress,
  })
}

export async function syncSavedOfflineTrips({ trips = [], wifiOnlyAttachments = true, force = false, onProgress } = {}) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { synced: 0, skipped: 0, failed: 0, pendingFiles: 0 }
  const db = await openDb()
  const tx = db.transaction(SNAPSHOT_STORE, 'readonly')
  const snapshots = await requestToPromise(tx.objectStore(SNAPSHOT_STORE).getAll())
  db.close()
  const tripMap = new Map((trips || []).map((trip) => [trip.id, trip]))
  const now = Date.now()
  let synced = 0
  let skipped = 0
  let failed = 0
  let pendingFiles = 0
  const errors = []

  for (const row of snapshots || []) {
    const trip = tripMap.get(row.tripId)
    if (!trip) { skipped += 1; continue }
    const lastSync = Date.parse(row.dataSyncedAt || row.savedAt || '') || 0
    if (!force && lastSync && now - lastSync < AUTO_SYNC_MIN_AGE_MS) { skipped += 1; continue }
    try {
      onProgress?.({ tripId: trip.id, title: trip.title, status: 'syncing' })
      const next = await syncOfflineTrip({ trip, wifiOnlyAttachments })
      synced += 1
      pendingFiles += Number(next?.pendingFileCount || 0)
      onProgress?.({ tripId: trip.id, title: trip.title, status: 'done', snapshot: next })
    } catch (error) {
      failed += 1
      errors.push({ tripId: trip.id, title: trip.title, message: error?.message || String(error) })
      onProgress?.({ tripId: trip.id, title: trip.title, status: 'error', error })
    }
  }
  return { synced, skipped, failed, pendingFiles, errors }
}

export async function listOfflineTripCards() {
  const db = await openDb()
  const tx = db.transaction(SNAPSHOT_STORE, 'readonly')
  const rows = await requestToPromise(tx.objectStore(SNAPSHOT_STORE).getAll())
  db.close()
  return (rows || [])
    .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')))
    .map((row) => ({ ...row.trip, offlineOnly: true, offlineSavedAt: row.dataSyncedAt || row.savedAt, offlineFilesSyncedAt: row.filesSyncedAt || row.savedAt, offlineBytes: row.totalBytes || 0, offlineFileCount: Number(row.fileCount || 0), offlineDesiredFileCount: Number(row.desiredFileCount ?? row.fileCount ?? 0), offlinePendingFiles: Number(row.pendingFileCount || 0), offlineIncludeRecordMedia: Boolean(row.includeRecordMedia) }))
}

export async function getOfflineTripSnapshot(tripId) {
  const db = await openDb()
  const tx = db.transaction(SNAPSHOT_STORE, 'readonly')
  const row = await requestToPromise(tx.objectStore(SNAPSHOT_STORE).get(tripId))
  db.close()
  return row || null
}

export async function getOfflineTripMeta(tripId) {
  const row = await getOfflineTripSnapshot(tripId)
  if (!row) return null
  return {
    tripId: row.tripId,
    savedAt: row.dataSyncedAt || row.savedAt,
    dataSyncedAt: row.dataSyncedAt || row.savedAt,
    filesSyncedAt: row.filesSyncedAt || row.savedAt,
    includeRecordMedia: Boolean(row.includeRecordMedia),
    fileCount: Number(row.fileCount || 0),
    desiredFileCount: Number(row.desiredFileCount ?? row.fileCount ?? 0),
    pendingFileCount: Number(row.pendingFileCount || 0),
    totalBytes: Number(row.totalBytes || 0),
  }
}

export async function removeOfflineTrip(tripId) {
  const db = await openDb()
  await deleteStoredFilesForTrip(db, tripId)
  const tx = db.transaction(SNAPSHOT_STORE, 'readwrite')
  tx.objectStore(SNAPSHOT_STORE).delete(tripId)
  await transactionDone(tx)
  db.close()
}

export async function getOfflineFileBlob(storagePath) {
  if (!storagePath) return null
  const db = await openDb()
  const tx = db.transaction(FILE_STORE, 'readonly')
  const row = await requestToPromise(tx.objectStore(FILE_STORE).get(storagePath))
  db.close()
  return row?.blob || null
}
