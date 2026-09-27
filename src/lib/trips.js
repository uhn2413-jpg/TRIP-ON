import { supabase } from './supabase'
import { normalizeUploadFile, previewableImageUrl } from './imageUploads'

const FILE_BUCKET = 'trip-on-files'
const COVER_SIGN_SECONDS = 60 * 60 * 12

const tripSelect = `
  id,
  owner_id,
  title,
  subtitle,
  start_date,
  end_date,
  date_precision,
  approx_year,
  approx_month,
  duration_days,
  cover_color,
  cover_image_url,
  status,
  completed_at,
  archive_rating,
  archive_note,
  itinerary_voting_enabled,
  memo,
  created_at,
  updated_at,
  trip_on_trip_destinations ( id, city, country, sort_order ),
  trip_on_trip_members ( id, name, is_me, created_at )
`

function safeFileName(name = 'cover') {
  return name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(-100) || 'cover'
}

const coverPreviewCache = new Map()

async function resolveCoverImage(pathOrUrl) {
  if (!pathOrUrl) return null
  if (coverPreviewCache.has(pathOrUrl)) return coverPreviewCache.get(pathOrUrl)

  const directUrl = /^https?:\/\//i.test(pathOrUrl)
    ? pathOrUrl
    : (await supabase.storage.from(FILE_BUCKET).createSignedUrl(pathOrUrl, COVER_SIGN_SECONDS)).data?.signedUrl

  if (!directUrl) return null

  const previewUrl = await previewableImageUrl({
    url: directUrl,
    fileName: pathOrUrl,
    cacheKey: pathOrUrl,
  })
  if (previewUrl) coverPreviewCache.set(pathOrUrl, previewUrl)
  return previewUrl
}

async function toAppTrip(row, accessRole = 'owner') {
  const destinations = [...(row.trip_on_trip_destinations || [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((item) => item.country ? `${item.country} ${item.city}` : item.city)

  const companions = [...(row.trip_on_trip_members || [])]
    .filter((item) => !item.is_me)
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
    .map((item) => item.name)

  return {
    id: row.id,
    title: row.title,
    destinations,
    startDate: row.start_date,
    endDate: row.end_date,
    datePrecision: row.date_precision === 'exact' && !(row.start_date && row.end_date) ? 'tbd' : (row.date_precision || (row.start_date && row.end_date ? 'exact' : 'tbd')),
    approxYear: row.approx_year == null ? null : Number(row.approx_year),
    approxMonth: row.approx_month == null ? null : Number(row.approx_month),
    durationDays: row.duration_days == null ? (row.start_date && row.end_date ? Math.max(1, Math.round((new Date(`${row.end_date}T00:00:00Z`) - new Date(`${row.start_date}T00:00:00Z`)) / 86400000) + 1) : null) : Number(row.duration_days),
    companions,
    coverColor: row.cover_color || '#DCEEFF',
    coverImagePath: row.cover_image_url || null,
    coverImageUrl: await resolveCoverImage(row.cover_image_url),
    tagline: row.subtitle || '',
    status: row.status || 'active',
    cancelled: row.status === 'cancelled',
    completed: row.status === 'completed',
    completedAt: row.completed_at || null,
    archiveRating: row.archive_rating == null ? null : Number(row.archive_rating),
    archiveNote: row.archive_note || '',
    itineraryVotingEnabled: Boolean(row.itinerary_voting_enabled),
    createdAt: row.created_at,
    ownerId: row.owner_id || null,
    accessRole: accessRole || 'viewer',
    isShared: accessRole !== 'owner',
  }
}

export async function fetchTrips() {
  const [{ data, error }, authRes] = await Promise.all([
    supabase.from('trip_on_trips').select(tripSelect).order('created_at', { ascending: false }),
    supabase.auth.getUser(),
  ])
  if (error) throw error
  if (authRes.error) throw authRes.error
  const userId = authRes.data.user?.id
  const rows = data || []
  const sharedIds = rows.filter((row) => row.owner_id !== userId).map((row) => row.id)
  const roleMap = new Map()
  if (sharedIds.length) {
    const { data: memberships, error: membershipError } = await supabase
      .from('trip_on_trip_collaborators')
      .select('trip_id, role')
      .eq('user_id', userId)
      .in('trip_id', sharedIds)
    if (membershipError) throw membershipError
    for (const membership of memberships || []) roleMap.set(membership.trip_id, membership.role)
  }
  return Promise.all(rows.map((row) => toAppTrip(row, row.owner_id === userId ? 'owner' : (roleMap.get(row.id) || 'viewer'))))
}

export async function fetchTrip(id) {
  const [{ data, error }, authRes] = await Promise.all([
    supabase.from('trip_on_trips').select(tripSelect).eq('id', id).single(),
    supabase.auth.getUser(),
  ])
  if (error) throw error
  if (authRes.error) throw authRes.error
  const userId = authRes.data.user?.id
  let role = data.owner_id === userId ? 'owner' : null
  if (!role) {
    const { data: roleData, error: roleError } = await supabase.rpc('trip_on_trip_role', { p_trip_id: id })
    if (roleError) throw roleError
    role = roleData || 'viewer'
  }
  return toAppTrip(data, role)
}

export async function createTripRecord(trip, userId) {
  const { data: created, error } = await supabase
    .from('trip_on_trips')
    .insert({
      owner_id: userId,
      title: trip.title,
      subtitle: trip.tagline || null,
      start_date: trip.datePrecision === 'exact' ? (trip.startDate || null) : null,
      end_date: trip.datePrecision === 'exact' ? (trip.endDate || null) : null,
      date_precision: trip.datePrecision || (trip.startDate && trip.endDate ? 'exact' : 'tbd'),
      approx_year: trip.datePrecision === 'month' || trip.datePrecision === 'year' ? (trip.approxYear || null) : null,
      approx_month: trip.datePrecision === 'month' ? (trip.approxMonth || null) : null,
      duration_days: trip.durationDays || null,
      cover_color: trip.coverColor || '#DCEEFF',
      cover_image_url: trip.coverImagePath || null,
      status: trip.cancelled ? 'cancelled' : (trip.status === 'completed' ? 'completed' : 'active'),
      itinerary_voting_enabled: Boolean(trip.itineraryVotingEnabled),
    })
    .select('id')
    .single()

  if (error) throw error

  const tripId = created.id

  const destinations = (trip.destinations || []).map((name, index) => ({
    owner_id: userId,
    trip_id: tripId,
    city: name,
    sort_order: index,
  }))

  const members = [
    { owner_id: userId, trip_id: tripId, name: '나', is_me: true },
    ...(trip.companions || []).map((name) => ({
      owner_id: userId,
      trip_id: tripId,
      name,
      is_me: false,
    })),
  ]

  if (destinations.length) {
    const { error: destinationError } = await supabase
      .from('trip_on_trip_destinations')
      .insert(destinations)
    if (destinationError) throw destinationError
  }

  const { error: memberError } = await supabase
    .from('trip_on_trip_members')
    .insert(members)
  if (memberError) throw memberError

  return fetchTrip(tripId)
}

export async function updateTripRecord(trip) {
  const nextDuration = Number(trip.durationDays || 0)
  if (trip.id && nextDuration > 0) {
    const { data: dayRows, error: dayError } = await supabase
      .from('trip_on_trip_days')
      .select('id, day_number, title, memo')
      .eq('trip_id', trip.id)
      .order('day_number')
    if (dayError) throw dayError
    const trailing = (dayRows || []).filter((day) => Number(day.day_number) > nextDuration)
    if (trailing.length) {
      const trailingIds = trailing.map((day) => day.id)
      const hasDayMemo = trailing.some((day) => day.title?.trim?.() || day.memo?.trim?.())
      const [itineraryRes, recordsRes, expensesRes] = await Promise.all([
        supabase.from('trip_on_itinerary_items').select('id', { count: 'exact', head: true }).in('trip_day_id', trailingIds),
        supabase.from('trip_on_records').select('id', { count: 'exact', head: true }).in('trip_day_id', trailingIds),
        supabase.from('trip_on_expenses').select('id', { count: 'exact', head: true }).in('trip_day_id', trailingIds),
      ])
      for (const result of [itineraryRes, recordsRes, expensesRes]) if (result.error) throw result.error
      if (hasDayMemo || itineraryRes.count || recordsRes.count || expensesRes.count) {
        const first = Math.min(...trailing.map((day) => Number(day.day_number || 0)).filter(Boolean))
        throw new Error(`DAY ${first} 이후에 일정·메모·기록이 있어 여행 기간을 ${nextDuration}일로 줄일 수 없어요. 먼저 뒤쪽 DAY 내용을 옮기거나 정리해주세요.`)
      }
    }
  }
  const payload = {
    title: trip.title,
    subtitle: trip.tagline || null,
    start_date: trip.datePrecision === 'exact' ? (trip.startDate || null) : null,
    end_date: trip.datePrecision === 'exact' ? (trip.endDate || null) : null,
    date_precision: trip.datePrecision || (trip.startDate && trip.endDate ? 'exact' : 'tbd'),
    approx_year: trip.datePrecision === 'month' || trip.datePrecision === 'year' ? (trip.approxYear || null) : null,
    approx_month: trip.datePrecision === 'month' ? (trip.approxMonth || null) : null,
    duration_days: trip.durationDays || null,
    cover_color: trip.coverColor || '#DCEEFF',
    status: trip.cancelled ? 'cancelled' : (trip.status === 'completed' ? 'completed' : 'active'),
    updated_at: new Date().toISOString(),
  }
  if (Object.prototype.hasOwnProperty.call(trip, 'coverImagePath')) payload.cover_image_url = trip.coverImagePath || null

  const { error } = await supabase
    .from('trip_on_trips')
    .update(payload)
    .eq('id', trip.id)

  if (error) throw error

  const { error: deleteDestinationsError } = await supabase
    .from('trip_on_trip_destinations')
    .delete()
    .eq('trip_id', trip.id)
  if (deleteDestinationsError) throw deleteDestinationsError

  if ((trip.destinations || []).length) {
    const { error: destinationError } = await supabase
      .from('trip_on_trip_destinations')
      .insert(
        trip.destinations.map((name, index) => ({
          trip_id: trip.id,
          city: name,
          sort_order: index,
        }))
      )
    if (destinationError) throw destinationError
  }

  const { error: deleteMembersError } = await supabase
    .from('trip_on_trip_members')
    .delete()
    .eq('trip_id', trip.id)
    .eq('is_me', false)
  if (deleteMembersError) throw deleteMembersError

  if ((trip.companions || []).length) {
    const { error: memberError } = await supabase
      .from('trip_on_trip_members')
      .insert(
        trip.companions.map((name) => ({
          trip_id: trip.id,
          name,
          is_me: false,
        }))
      )
    if (memberError) throw memberError
  }

  return fetchTrip(trip.id)
}


export async function updateTripVotingEnabled(tripId, enabled) {
  if (!tripId) throw new Error('여행을 찾지 못했어요.')
  const { error } = await supabase
    .from('trip_on_trips')
    .update({ itinerary_voting_enabled: Boolean(enabled), updated_at: new Date().toISOString() })
    .eq('id', tripId)
  if (error) throw error
  return fetchTrip(tripId)
}


export async function duplicateTripRecord(sourceTripId, draft, userId, options = {}) {
  if (!sourceTripId) throw new Error('복제할 여행을 찾지 못했어요.')
  if (!userId) throw new Error('로그인이 필요해요.')

  const source = await fetchTrip(sourceTripId)
  const target = {
    ...source,
    id: undefined,
    title: draft.title?.trim() || `${source.title} 복사본`,
    startDate: draft.datePrecision === 'exact' ? (draft.startDate || null) : null,
    endDate: draft.datePrecision === 'exact' ? (draft.endDate || null) : null,
    datePrecision: draft.datePrecision || source.datePrecision || 'tbd',
    approxYear: draft.approxYear || null,
    approxMonth: draft.approxMonth || null,
    durationDays: draft.durationDays || null,
    coverImagePath: null,
    coverImageUrl: null,
    status: 'active',
    cancelled: false,
    completed: false,
    completedAt: null,
    archiveRating: null,
    archiveNote: '',
    itineraryVotingEnabled: false,
  }

  const created = await createTripRecord(target, userId)
  const duration = Number(target.durationDays || 0)
  const exactDates = target.startDate && target.endDate ? (() => {
    const rows = []
    const start = new Date(`${target.startDate}T00:00:00Z`)
    const end = new Date(`${target.endDate}T00:00:00Z`)
    for (let cursor = new Date(start), guard = 0; cursor <= end && guard < 370; guard += 1) {
      rows.push(cursor.toISOString().slice(0, 10))
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return rows
  })() : []
  const dayCount = exactDates.length || duration

  let targetDays = []
  if (dayCount > 0) {
    const { data, error } = await supabase
      .from('trip_on_trip_days')
      .insert(Array.from({ length: dayCount }, (_, index) => ({
        owner_id: userId,
        trip_id: created.id,
        day_number: index + 1,
        trip_date: exactDates[index] || null,
      })))
      .select('id, day_number, trip_date')
    if (error) throw error
    targetDays = data || []
  }

  if (options.copyPrep !== false) {
    const { data: prepRows, error: prepError } = await supabase
      .from('trip_on_prep_items')
      .select('type, title, sort_order')
      .eq('trip_id', sourceTripId)
      .order('sort_order')
    if (prepError) throw prepError
    if (prepRows?.length) {
      const { error } = await supabase.from('trip_on_prep_items').insert(prepRows.map((row) => ({
        owner_id: userId,
        trip_id: created.id,
        type: row.type,
        title: row.title,
        is_done: false,
        sort_order: row.sort_order || 0,
      })))
      if (error) throw error
    }
  }

  if (options.copySchedule && targetDays.length) {
    const [{ data: sourceDays, error: daysError }, { data: items, error: itemsError }] = await Promise.all([
      supabase.from('trip_on_trip_days').select('id, day_number').eq('trip_id', sourceTripId),
      supabase.from('trip_on_itinerary_items').select(`
        id, trip_day_id, place_id, origin_place_id, destination_place_id, title, category, city,
        start_timezone, end_timezone, transport_type, travel_minutes, travel_memo,
        expected_cost, expected_currency, sort_order, memo, is_visit_group, import_source, linked_plan_id, group_parent_id
      `).eq('trip_id', sourceTripId).order('sort_order'),
    ])
    if (daysError) throw daysError
    if (itemsError) throw itemsError
    const sourceDayNumber = new Map((sourceDays || []).map((row) => [row.id, row.day_number]))
    const targetDayId = new Map(targetDays.map((row) => [row.day_number, row.id]))
    const copyRows = (items || [])
      .filter((item) => item.import_source !== 'google_timeline' && !item.linked_plan_id && !item.group_parent_id && !item.is_visit_group)
      .map((item) => {
        const dayNumber = sourceDayNumber.get(item.trip_day_id)
        const mappedDayId = targetDayId.get(dayNumber)
        if (!mappedDayId) return null
        return {
          owner_id: userId,
          trip_id: created.id,
          trip_day_id: mappedDayId,
          place_id: item.place_id || null,
          origin_place_id: item.origin_place_id || null,
          destination_place_id: item.destination_place_id || null,
          title: item.title,
          category: item.category || null,
          city: item.city || null,
          start_at: null,
          end_at: null,
          start_timezone: item.start_timezone || null,
          end_timezone: item.end_timezone || item.start_timezone || null,
          actual_start_at: null,
          actual_end_at: null,
          actual_start_timezone: null,
          actual_end_timezone: null,
          is_time_unscheduled: true,
          transport_type: item.transport_type || null,
          travel_minutes: item.travel_minutes || null,
          travel_memo: item.travel_memo || null,
          expected_cost: item.expected_cost || null,
          expected_currency: item.expected_currency || null,
          status: 'planned',
          sort_order: item.sort_order || 0,
          memo: item.memo || null,
          rating: null,
          import_source: null,
          import_source_ref: null,
          linked_plan_id: null,
          group_parent_id: null,
          is_visit_group: false,
          group_title: null,
          link_display_mode: 'plan',
        }
      }).filter(Boolean)
    if (copyRows.length) {
      const { error } = await supabase.from('trip_on_itinerary_items').insert(copyRows)
      if (error) throw error
    }
  }

  return fetchTrip(created.id)
}

export async function uploadTripCover(tripId, file) {
  if (!file) throw new Error('사진을 선택해주세요.')
  const uploadFile = await normalizeUploadFile(file, {
    allowPdf: false,
    maxSourceBytes: 20 * 1024 * 1024,
    maxOutputBytes: 12 * 1024 * 1024,
  })

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  const userId = userData.user?.id
  if (!userId) throw new Error('로그인이 필요해요.')

  const { data: current, error: currentError } = await supabase
    .from('trip_on_trips')
    .select('cover_image_url')
    .eq('id', tripId)
    .single()
  if (currentError) throw currentError

  const path = `${userId}/${tripId}/cover/${crypto.randomUUID?.() || Date.now()}-${safeFileName(uploadFile.name)}`
  const { error: uploadError } = await supabase.storage.from(FILE_BUCKET).upload(path, uploadFile, {
    upsert: false,
    contentType: uploadFile.type || undefined,
  })
  if (uploadError) throw uploadError

  const { error: updateError } = await supabase
    .from('trip_on_trips')
    .update({ cover_image_url: path, updated_at: new Date().toISOString() })
    .eq('id', tripId)
  if (updateError) {
    await supabase.storage.from(FILE_BUCKET).remove([path])
    throw updateError
  }

  const oldPath = current?.cover_image_url
  if (oldPath && !/^https?:\/\//i.test(oldPath) && oldPath !== path) {
    await supabase.storage.from(FILE_BUCKET).remove([oldPath])
  }

  return fetchTrip(tripId)
}

export async function removeTripCover(tripId) {
  const { data: current, error: currentError } = await supabase
    .from('trip_on_trips')
    .select('cover_image_url')
    .eq('id', tripId)
    .single()
  if (currentError) throw currentError

  const { error: updateError } = await supabase
    .from('trip_on_trips')
    .update({ cover_image_url: null, updated_at: new Date().toISOString() })
    .eq('id', tripId)
  if (updateError) throw updateError

  const oldPath = current?.cover_image_url
  if (oldPath && !/^https?:\/\//i.test(oldPath)) {
    await supabase.storage.from(FILE_BUCKET).remove([oldPath])
  }
  return fetchTrip(tripId)
}

export async function deleteTripRecord(tripId) {
  const storagePaths = []

  const { data: tripRow, error: tripRowError } = await supabase
    .from('trip_on_trips')
    .select('cover_image_url')
    .eq('id', tripId)
    .single()
  if (tripRowError) throw tripRowError
  if (tripRow?.cover_image_url && !/^https?:\/\//i.test(tripRow.cover_image_url)) storagePaths.push(tripRow.cover_image_url)

  const { data: records, error: recordsError } = await supabase
    .from('trip_on_records')
    .select('trip_on_record_media(storage_path)')
    .eq('trip_id', tripId)
  if (recordsError) throw recordsError

  for (const record of records || []) {
    for (const media of record.trip_on_record_media || []) {
      if (media?.storage_path) storagePaths.push(media.storage_path)
    }
  }

  const { data: reservationFiles, error: reservationFilesError } = await supabase
    .from('trip_on_reservation_files')
    .select('storage_path')
    .eq('trip_id', tripId)
  if (reservationFilesError) throw reservationFilesError
  for (const file of reservationFiles || []) {
    if (file?.storage_path) storagePaths.push(file.storage_path)
  }

  const uniquePaths = [...new Set(storagePaths)]
  for (let i = 0; i < uniquePaths.length; i += 100) {
    const chunk = uniquePaths.slice(i, i + 100)
    if (!chunk.length) continue
    const { error: storageError } = await supabase.storage.from(FILE_BUCKET).remove(chunk)
    if (storageError) throw storageError
  }

  const { error } = await supabase
    .from('trip_on_trips')
    .delete()
    .eq('id', tripId)

  if (error) throw error
}
