import { supabase } from './supabase'
import { loadAppPreferences } from './preferences'

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
const BACKUP_FORMAT_VERSION = 2
const SUPPORTED_BACKUP_VERSIONS = new Set([1, 2])

function makeBackupSummary(tables) {
  const count = (table) => Array.isArray(tables?.[table]) ? tables[table].length : 0
  return {
    trips: count('trip_on_trips'),
    itineraryItems: count('trip_on_itinerary_items'),
    scraps: count('trip_on_scraps'),
    records: count('trip_on_records'),
    expenses: count('trip_on_expenses'),
    attachmentReferences: count('trip_on_reservation_files') + count('trip_on_record_media'),
    totalRows: BACKUP_TABLES.reduce((sum, table) => sum + count(table), 0),
  }
}

function cleanDate(value) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : new Date()
}

function safeBackupFileName() {
  const date = new Date()
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  return `TRIP-ON-backup-${stamp}.json`
}

async function currentUser() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user?.id) throw new Error('로그인이 필요해요.')
  return data.user
}

export async function buildTripOnBackup() {
  const user = await currentUser()
  const tables = {}
  for (const table of BACKUP_TABLES) {
    const { data, error } = await supabase.from(table).select('*')
    if (error) throw new Error(`${table} 백업 중 오류: ${error.message}`)
    tables[table] = data || []
  }
  return {
    app: 'TRIP:ON',
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    ownerId: user.id,
    ownerEmail: user.email || null,
    note: 'JSON에는 데이터베이스 행, 앱 환경설정, 첨부파일 경로가 포함되지만 업로드한 이미지·PDF 원본 파일 바이트 자체는 포함되지 않습니다.',
    preferences: loadAppPreferences(),
    summary: makeBackupSummary(tables),
    tables,
  }
}

export async function downloadTripOnBackup() {
  const backup = await buildTripOnBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = safeBackupFileName()
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return backup
}

export async function restoreTripOnBackup(file) {
  if (!file) throw new Error('백업 JSON 파일을 선택해주세요.')
  let backup
  try {
    backup = JSON.parse(await file.text())
  } catch {
    throw new Error('JSON 파일을 읽지 못했어요.')
  }
  if (backup?.app !== 'TRIP:ON' || !SUPPORTED_BACKUP_VERSIONS.has(Number(backup?.formatVersion)) || !backup?.tables) {
    throw new Error('TRIP:ON 백업 파일 형식이 아니에요.')
  }

  const user = await currentUser()
  if (backup.ownerId && backup.ownerId !== user.id) {
    throw new Error('현재는 같은 TRIP:ON 계정에서 만든 백업만 복원할 수 있어요.')
  }

  for (const table of RESTORE_ORDER) {
    const sourceRows = Array.isArray(backup.tables[table]) ? backup.tables[table] : []
    if (!sourceRows.length) continue
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
  return { ...backup, summary: backup.summary || makeBackupSummary(backup.tables) }
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
