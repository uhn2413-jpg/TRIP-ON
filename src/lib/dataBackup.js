import { strFromU8, strToU8, unzip, zip } from 'fflate'
import { supabase } from './supabase'
import { loadAppPreferences } from './preferences'

const FILE_BUCKET = 'trip-on-files'
const BACKUP_TABLES = [
  'trip_on_trips',
  'trip_on_trip_destinations',
  'trip_on_trip_members',
  'trip_on_trip_days',
  'trip_on_places',
  'trip_on_scraps',
  'trip_on_itinerary_items',
  'trip_on_reservations',
  'trip_on_prep_items',
  'trip_on_trip_info',
  'trip_on_records',
  'trip_on_expenses',
  'trip_on_budgets',
  'trip_on_timeline_imports',
  'trip_on_timeline_segments',
  'trip_on_reservation_itinerary_links',
  'trip_on_reservation_files',
  'trip_on_record_media',
  'trip_on_expense_shares',
]

const RESTORE_ORDER = [...BACKUP_TABLES]
const BACKUP_FORMAT_VERSION = 3
const SUPPORTED_BACKUP_VERSIONS = new Set([1, 2, 3])
const FULL_BACKUP_MAX_WARNING_BYTES = 350 * 1024 * 1024

function makeBackupSummary(tables, attachments = []) {
  const count = (table) => Array.isArray(tables?.[table]) ? tables[table].length : 0
  const attachmentBytes = attachments.reduce((sum, item) => sum + Number(item?.byteSize || 0), 0)
  return {
    trips: count('trip_on_trips'),
    itineraryItems: count('trip_on_itinerary_items'),
    scraps: count('trip_on_scraps'),
    records: count('trip_on_records'),
    expenses: count('trip_on_expenses'),
    attachmentReferences: count('trip_on_reservation_files') + count('trip_on_record_media'),
    attachmentFiles: attachments.length,
    attachmentBytes,
    totalRows: BACKUP_TABLES.reduce((sum, table) => sum + count(table), 0),
  }
}

function cleanDate(value) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : new Date()
}

function stamp() {
  const date = new Date()
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
}

function safeBackupFileName(extension = 'json') {
  return `TRIP-ON-backup-${stamp()}.${extension}`
}

function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

async function currentUser() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user?.id) throw new Error('로그인이 필요해요.')
  return data.user
}

async function selectRows(query, label) {
  const { data, error } = await query
  if (error) throw new Error(`${label} 백업 중 오류: ${error.message}`)
  return data || []
}

async function buildOwnedTables(user) {
  const tables = Object.fromEntries(BACKUP_TABLES.map((table) => [table, []]))
  tables.trip_on_trips = await selectRows(
    supabase.from('trip_on_trips').select('*').eq('owner_id', user.id),
    'trip_on_trips'
  )
  const tripIds = tables.trip_on_trips.map((row) => row.id)

  const directTripTables = [
    'trip_on_trip_destinations','trip_on_trip_members','trip_on_trip_days','trip_on_itinerary_items',
    'trip_on_reservations','trip_on_prep_items','trip_on_trip_info','trip_on_records','trip_on_expenses',
    'trip_on_budgets','trip_on_timeline_imports','trip_on_timeline_segments','trip_on_reservation_files',
  ]
  if (tripIds.length) {
    for (const table of directTripTables) {
      tables[table] = await selectRows(supabase.from(table).select('*').in('trip_id', tripIds), table)
    }
  }

  const personalScraps = await selectRows(
    supabase.from('trip_on_scraps').select('*').eq('owner_id', user.id).is('trip_id', null),
    'trip_on_scraps'
  )
  const tripScraps = tripIds.length
    ? await selectRows(supabase.from('trip_on_scraps').select('*').in('trip_id', tripIds), 'trip_on_scraps')
    : []
  tables.trip_on_scraps = [...new Map([...personalScraps, ...tripScraps].map((row) => [row.id, row])).values()]

  const recordIds = tables.trip_on_records.map((row) => row.id)
  if (recordIds.length) tables.trip_on_record_media = await selectRows(supabase.from('trip_on_record_media').select('*').in('record_id', recordIds), 'trip_on_record_media')
  const reservationIds = tables.trip_on_reservations.map((row) => row.id)
  if (reservationIds.length) tables.trip_on_reservation_itinerary_links = await selectRows(supabase.from('trip_on_reservation_itinerary_links').select('*').in('reservation_id', reservationIds), 'trip_on_reservation_itinerary_links')
  const expenseIds = tables.trip_on_expenses.map((row) => row.id)
  if (expenseIds.length) tables.trip_on_expense_shares = await selectRows(supabase.from('trip_on_expense_shares').select('*').in('expense_id', expenseIds), 'trip_on_expense_shares')

  const placeIds = new Set()
  for (const row of tables.trip_on_itinerary_items) {
    if (row.place_id) placeIds.add(row.place_id)
    if (row.origin_place_id) placeIds.add(row.origin_place_id)
    if (row.destination_place_id) placeIds.add(row.destination_place_id)
  }
  for (const table of ['trip_on_reservations','trip_on_scraps','trip_on_records','trip_on_timeline_segments']) {
    for (const row of tables[table] || []) if (row.place_id) placeIds.add(row.place_id)
  }
  const ownPlaces = await selectRows(supabase.from('trip_on_places').select('*').eq('owner_id', user.id), 'trip_on_places')
  const referencedPlaces = placeIds.size
    ? await selectRows(supabase.from('trip_on_places').select('*').in('id', [...placeIds]), 'trip_on_places')
    : []
  tables.trip_on_places = [...new Map([...ownPlaces, ...referencedPlaces].map((row) => [row.id, row])).values()]
  return tables
}

function safeZipPath(storagePath) {
  const cleaned = String(storagePath || '')
    .replace(/^\/+/, '')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/')
  return `files/${cleaned}`
}

function attachmentReferences(tables) {
  const byPath = new Map()
  const add = ({ storagePath, kind, table, rowId, fileName = null, mimeType = null }) => {
    if (!storagePath || /^https?:\/\//i.test(storagePath)) return
    const existing = byPath.get(storagePath) || {
      storagePath,
      zipPath: safeZipPath(storagePath),
      fileName: fileName || storagePath.split('/').pop() || 'file',
      mimeType: mimeType || null,
      kind,
      refs: [],
    }
    if (!existing.mimeType && mimeType) existing.mimeType = mimeType
    existing.refs.push({ table, rowId, kind })
    byPath.set(storagePath, existing)
  }

  for (const row of tables?.trip_on_trips || []) {
    add({ storagePath: row.cover_image_url, kind: 'trip-cover', table: 'trip_on_trips', rowId: row.id })
  }
  for (const row of tables?.trip_on_reservation_files || []) {
    add({ storagePath: row.storage_path, kind: 'reservation-file', table: 'trip_on_reservation_files', rowId: row.id, fileName: row.file_name, mimeType: row.mime_type })
  }
  for (const row of tables?.trip_on_record_media || []) {
    add({ storagePath: row.storage_path, kind: 'record-media', table: 'trip_on_record_media', rowId: row.id, fileName: row.file_name, mimeType: row.mime_type })
  }
  return [...byPath.values()]
}

function zipAsync(entries, options = {}) {
  return new Promise((resolve, reject) => {
    zip(entries, options, (error, data) => {
      if (error) reject(error)
      else resolve(data)
    })
  })
}

function unzipAsync(buffer) {
  return new Promise((resolve, reject) => {
    unzip(buffer, (error, entries) => {
      if (error) reject(error)
      else resolve(entries)
    })
  })
}

export async function buildTripOnBackup({ includeAttachmentManifest = true } = {}) {
  const user = await currentUser()
  const tables = await buildOwnedTables(user)
  const attachments = includeAttachmentManifest ? attachmentReferences(tables) : []
  return {
    app: 'TRIP:ON',
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    ownerId: user.id,
    ownerEmail: user.email || null,
    backupKind: 'data',
    note: 'JSON 백업에는 데이터베이스 행, 앱 환경설정, 첨부파일 경로가 포함됩니다. 원본 이미지·PDF 바이트는 첨부 포함 ZIP 백업에만 포함됩니다.',
    preferences: loadAppPreferences(),
    attachments,
    summary: makeBackupSummary(tables, attachments),
    tables,
  }
}

export async function downloadTripOnBackup() {
  const backup = await buildTripOnBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' })
  saveBlob(blob, safeBackupFileName('json'))
  return backup
}

export async function downloadTripOnFullBackup({ onProgress } = {}) {
  const backup = await buildTripOnBackup()
  const attachments = backup.attachments || []
  const entries = {}
  const manifest = []
  let totalBytes = 0

  onProgress?.({ phase: 'prepare', current: 0, total: attachments.length, message: `첨부파일 ${attachments.length}개를 확인하고 있어요.` })

  for (let index = 0; index < attachments.length; index += 1) {
    const item = attachments[index]
    onProgress?.({ phase: 'download', current: index, total: attachments.length, message: `${index + 1}/${attachments.length} · ${item.fileName || '첨부파일'} 내려받는 중…` })
    const { data, error } = await supabase.storage.from(FILE_BUCKET).download(item.storagePath)
    if (error || !data) throw new Error(`첨부파일을 백업하지 못했어요: ${item.fileName || item.storagePath}${error?.message ? ` (${error.message})` : ''}`)
    const bytes = new Uint8Array(await data.arrayBuffer())
    totalBytes += bytes.byteLength
    entries[item.zipPath] = [bytes, { level: 0 }]
    manifest.push({
      ...item,
      byteSize: bytes.byteLength,
      mimeType: item.mimeType || data.type || null,
    })
  }

  backup.backupKind = 'full'
  backup.attachments = manifest
  backup.summary = makeBackupSummary(backup.tables, manifest)
  backup.note = '이 ZIP에는 backup.json과 TRIP:ON Storage에 업로드된 여행 커버·사진·티켓·영수증·예약 이미지/PDF 원본이 포함됩니다. 공유 멤버 권한과 초대 링크는 보안상 포함하지 않습니다.'
  backup.fullBackupWarning = totalBytes >= FULL_BACKUP_MAX_WARNING_BYTES
    ? '첨부파일 용량이 커서 모바일에서 복원할 때 시간이 오래 걸릴 수 있습니다.'
    : null
  entries['backup.json'] = [strToU8(JSON.stringify(backup, null, 2)), { level: 6 }]

  onProgress?.({ phase: 'zip', current: attachments.length, total: attachments.length, message: 'ZIP 파일로 묶는 중…' })
  const zipped = await zipAsync(entries, { level: 0 })
  saveBlob(new Blob([zipped], { type: 'application/zip' }), safeBackupFileName('zip'))
  onProgress?.({ phase: 'done', current: attachments.length, total: attachments.length, message: '첨부파일 포함 백업을 만들었어요.' })
  return backup
}

async function parseBackupFile(file) {
  if (!file) throw new Error('백업 JSON 또는 ZIP 파일을 선택해주세요.')
  const lower = String(file.name || '').toLowerCase()
  if (lower.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
    let entries
    try {
      entries = await unzipAsync(new Uint8Array(await file.arrayBuffer()))
    } catch {
      throw new Error('백업 ZIP 압축을 풀지 못했어요.')
    }
    const backupBytes = entries['backup.json']
    if (!backupBytes) throw new Error('ZIP 안에서 backup.json을 찾지 못했어요.')
    let backup
    try { backup = JSON.parse(strFromU8(backupBytes)) }
    catch { throw new Error('ZIP 안의 backup.json을 읽지 못했어요.') }
    return { backup, zipEntries: entries }
  }
  try {
    return { backup: JSON.parse(await file.text()), zipEntries: null }
  } catch {
    throw new Error('JSON 파일을 읽지 못했어요.')
  }
}

function validateBackup(backup) {
  if (backup?.app !== 'TRIP:ON' || !SUPPORTED_BACKUP_VERSIONS.has(Number(backup?.formatVersion)) || !backup?.tables) {
    throw new Error('TRIP:ON 백업 파일 형식이 아니에요.')
  }
}

function prepareBackupForRestore(backup, user) {
  const clone = typeof structuredClone === 'function'
    ? structuredClone(backup)
    : JSON.parse(JSON.stringify(backup))
  const tripIds = new Set((clone.tables?.trip_on_trips || []).map((row) => row.id).filter(Boolean))
  const pathMap = new Map()

  for (const item of clone.attachments || []) {
    if (!item?.storagePath || !item?.zipPath) continue
    const parts = String(item.storagePath).replace(/^\/+/, '').split('/').filter(Boolean)
    if (parts.length < 3 || !tripIds.has(parts[1])) {
      throw new Error(`백업 첨부파일 경로를 확인할 수 없어요: ${item.fileName || item.storagePath}`)
    }
    const restoredPath = [user.id, ...parts.slice(1)].join('/')
    pathMap.set(item.storagePath, restoredPath)
    item.originalStoragePath = item.storagePath
    item.storagePath = restoredPath
  }

  const remap = (value) => pathMap.get(value) || value
  for (const row of clone.tables?.trip_on_trips || []) row.cover_image_url = remap(row.cover_image_url)
  for (const row of clone.tables?.trip_on_reservation_files || []) row.storage_path = remap(row.storage_path)
  for (const row of clone.tables?.trip_on_record_media || []) row.storage_path = remap(row.storage_path)
  return clone
}

async function restoreAttachments({ backup, zipEntries, onProgress }) {
  const attachments = Array.isArray(backup?.attachments) ? backup.attachments : []
  if (!zipEntries || !attachments.length) return { restored: 0, total: attachments.length }

  for (const item of attachments) {
    if (!item?.storagePath || !item?.zipPath) continue
    if (!zipEntries[item.zipPath]) throw new Error(`ZIP에서 첨부파일을 찾지 못했어요: ${item.fileName || item.storagePath}`)
  }

  let restored = 0
  for (let index = 0; index < attachments.length; index += 1) {
    const item = attachments[index]
    if (!item?.storagePath || !item?.zipPath) continue
    const bytes = zipEntries[item.zipPath]
    onProgress?.({ phase: 'upload', current: index, total: attachments.length, message: `${index + 1}/${attachments.length} · ${item.fileName || '첨부파일'} 복원 중…` })
    const body = new Blob([bytes], { type: item.mimeType || 'application/octet-stream' })
    const { error } = await supabase.storage.from(FILE_BUCKET).upload(item.storagePath, body, {
      upsert: true,
      contentType: item.mimeType || undefined,
    })
    if (error) throw new Error(`첨부파일 복원 중 오류: ${item.fileName || item.storagePath} (${error.message})`)
    restored += 1
  }
  return { restored, total: attachments.length }
}

async function restoreTables({ backup, user, onProgress, skipTables = new Set() }) {
  for (let tableIndex = 0; tableIndex < RESTORE_ORDER.length; tableIndex += 1) {
    const table = RESTORE_ORDER[tableIndex]
    if (skipTables.has(table)) continue
    const sourceRows = Array.isArray(backup.tables[table]) ? backup.tables[table] : []
    if (!sourceRows.length) continue
    onProgress?.({ phase: 'database', current: tableIndex, total: RESTORE_ORDER.length, message: `${table} 복원 중…` })
    const rows = sourceRows.map((row) => {
      if (!row || typeof row !== 'object') return row
      return Object.prototype.hasOwnProperty.call(row, 'owner_id') ? { ...row, owner_id: user.id } : row
    })

    // 일정 묶음/예정↔실제 연결은 같은 테이블을 참조하므로 모든 일정 행을 먼저 만든 뒤 관계를 복원해요.
    const firstPassRows = table === 'trip_on_itinerary_items'
      ? rows.map((row) => ({ ...row, group_parent_id: null, linked_plan_id: null }))
      : rows

    for (let start = 0; start < firstPassRows.length; start += 100) {
      const chunk = firstPassRows.slice(start, start + 100)
      const { error } = await supabase.from(table).upsert(chunk)
      if (error) throw new Error(`${table} 복원 중 오류: ${error.message}`)
    }

    if (table === 'trip_on_itinerary_items') {
      for (let start = 0; start < rows.length; start += 100) {
        const chunk = rows.slice(start, start + 100)
        const { error } = await supabase.from(table).upsert(chunk)
        if (error) throw new Error(`${table} 연결 복원 중 오류: ${error.message}`)
      }
    }
  }
}

export async function restoreTripOnBackup(file, { onProgress } = {}) {
  const { backup, zipEntries } = await parseBackupFile(file)
  validateBackup(backup)

  const user = await currentUser()
  if (backup.ownerId && backup.ownerId !== user.id) {
    throw new Error('현재는 같은 TRIP:ON 계정에서 만든 백업만 복원할 수 있어요.')
  }

  const restoreBackup = zipEntries ? prepareBackupForRestore(backup, user) : backup

  // Storage INSERT 정책은 여행 접근권한을 확인하므로, 여행 루트 행을 먼저 복원한 뒤 파일을 올려요.
  if (zipEntries && (restoreBackup.tables?.trip_on_trips || []).length) {
    const roots = { ...restoreBackup, tables: { ...restoreBackup.tables } }
    for (const table of BACKUP_TABLES) if (table !== 'trip_on_trips') roots.tables[table] = []
    await restoreTables({ backup: roots, user, onProgress })
  }

  let attachmentRestore = { restored: 0, total: 0 }
  if (zipEntries) attachmentRestore = await restoreAttachments({ backup: restoreBackup, zipEntries, onProgress })
  await restoreTables({ backup: restoreBackup, user, onProgress, skipTables: zipEntries ? new Set(['trip_on_trips']) : new Set() })
  onProgress?.({ phase: 'done', current: 1, total: 1, message: '백업 복원이 끝났어요.' })
  return {
    ...restoreBackup,
    restoredAttachments: attachmentRestore.restored,
    summary: restoreBackup.summary || makeBackupSummary(restoreBackup.tables, restoreBackup.attachments || []),
  }
}

export async function fetchTimelineImportHistory() {
  const { data, error } = await supabase
    .from('trip_on_timeline_imports')
    .select(`
      id, trip_id, source_file_name, imported_start_date, imported_end_date,
      segment_count, visit_count, activity_count, created_at,
      trip_on_trips ( title )
    `)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map((row) => ({
    ...row,
    createdDate: cleanDate(row.created_at),
    tripTitle: row.trip_on_trips?.title || '여행',
  }))
}
