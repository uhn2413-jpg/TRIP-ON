import { supabase } from './supabase'
import { DEFAULT_TIMEZONE, zonedLocalToIso } from './schedule'

const BUCKET = 'trip-on-files'

export const reservationTypeLabels = {
  flight: '항공',
  train: '기차',
  bus: '버스',
  accommodation: '숙소',
  restaurant: '식당',
  ticket: '입장권',
  rental_car: '렌터카',
  other: '기타',
}

export const reservationStatusLabels = {
  planned: '예약 예정',
  confirmed: '예약 완료',
  used: '이용 완료',
  cancelled: '취소',
}

export async function fetchPrepData(tripId) {
  const [prepRes, reservationsRes, infoRes, itineraryRes, daysRes] = await Promise.all([
    supabase
      .from('trip_on_prep_items')
      .select('id, type, title, is_done, sort_order, created_at')
      .eq('trip_id', tripId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('trip_on_reservations')
      .select(`
        id, type, title, reservation_number, provider,
        start_at, end_at, start_timezone, end_timezone,
        amount, currency, url, memo, status, created_at, updated_at,
        trip_on_reservation_itinerary_links ( itinerary_item_id ),
        trip_on_reservation_files ( id, storage_path, file_name, mime_type, created_at )
      `)
      .eq('trip_id', tripId)
      .order('start_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('trip_on_trip_info')
      .select('id, category, label, value, memo, sort_order, created_at')
      .eq('trip_id', tripId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('trip_on_itinerary_items')
      .select('id, title, trip_day_id, start_at, start_timezone, is_time_unscheduled, sort_order')
      .eq('trip_id', tripId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('trip_on_trip_days')
      .select('id, day_number, trip_date')
      .eq('trip_id', tripId)
      .order('day_number', { ascending: true }),
  ])

  for (const result of [prepRes, reservationsRes, infoRes, itineraryRes, daysRes]) {
    if (result.error) throw result.error
  }

  const dayMap = new Map((daysRes.data || []).map((day) => [day.id, day]))
  const itinerary = (itineraryRes.data || []).map((item) => ({ ...item, day: dayMap.get(item.trip_day_id) || null }))

  return {
    prepItems: prepRes.data || [],
    reservations: reservationsRes.data || [],
    infoItems: infoRes.data || [],
    itinerary,
  }
}

export async function savePrepItem({ tripId, item }) {
  const payload = {
    trip_id: tripId,
    type: item.type,
    title: item.title.trim(),
    is_done: Boolean(item.is_done),
    sort_order: Number(item.sort_order || 0),
  }
  if (item.id) {
    const { data, error } = await supabase.from('trip_on_prep_items').update(payload).eq('id', item.id).select('*').single()
    if (error) throw error
    return data
  }
  const { data: lastRows, error: lastError } = await supabase
    .from('trip_on_prep_items')
    .select('sort_order')
    .eq('trip_id', tripId)
    .eq('type', item.type)
    .order('sort_order', { ascending: false })
    .limit(1)
  if (lastError) throw lastError
  payload.sort_order = ((lastRows || [])[0]?.sort_order ?? -1) + 1
  const { data, error } = await supabase.from('trip_on_prep_items').insert(payload).select('*').single()
  if (error) throw error
  return data
}

export async function togglePrepItem(id, isDone) {
  const { error } = await supabase.from('trip_on_prep_items').update({ is_done: isDone }).eq('id', id)
  if (error) throw error
}

export async function deletePrepItem(id) {
  const { error } = await supabase.from('trip_on_prep_items').delete().eq('id', id)
  if (error) throw error
}

export async function saveTripInfo({ tripId, item }) {
  const payload = {
    trip_id: tripId,
    category: item.category?.trim() || null,
    label: item.label.trim(),
    value: item.value?.trim() || null,
    memo: item.memo?.trim() || null,
    sort_order: Number(item.sort_order || 0),
  }
  if (item.id) {
    const { data, error } = await supabase.from('trip_on_trip_info').update(payload).eq('id', item.id).select('*').single()
    if (error) throw error
    return data
  }
  const { data: lastRows, error: lastError } = await supabase
    .from('trip_on_trip_info')
    .select('sort_order')
    .eq('trip_id', tripId)
    .order('sort_order', { ascending: false })
    .limit(1)
  if (lastError) throw lastError
  payload.sort_order = ((lastRows || [])[0]?.sort_order ?? -1) + 1
  const { data, error } = await supabase.from('trip_on_trip_info').insert(payload).select('*').single()
  if (error) throw error
  return data
}

export async function deleteTripInfo(id) {
  const { error } = await supabase.from('trip_on_trip_info').delete().eq('id', id)
  if (error) throw error
}

function dateTimeToIso(value, timezone) {
  if (!value) return null
  const [date, time = '00:00'] = value.split('T')
  return zonedLocalToIso(date, time, timezone || DEFAULT_TIMEZONE)
}

export function isoToLocalInput(iso, timezone = DEFAULT_TIMEZONE) {
  if (!iso) return ''
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone || DEFAULT_TIMEZONE,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).formatToParts(new Date(iso)).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
    )
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
  } catch {
    return new Date(iso).toISOString().slice(0, 16)
  }
}

export async function saveReservation({ tripId, draft }) {
  const payload = {
    trip_id: tripId,
    type: draft.type || 'other',
    title: draft.title.trim(),
    reservation_number: draft.reservationNumber?.trim() || null,
    provider: draft.provider?.trim() || null,
    start_at: dateTimeToIso(draft.startLocal, draft.startTimezone),
    end_at: dateTimeToIso(draft.endLocal, draft.endTimezone || draft.startTimezone),
    start_timezone: draft.startTimezone || DEFAULT_TIMEZONE,
    end_timezone: draft.endTimezone || draft.startTimezone || DEFAULT_TIMEZONE,
    amount: draft.amount ? Number(draft.amount) : null,
    currency: draft.currency || null,
    url: draft.url?.trim() || null,
    memo: draft.memo?.trim() || null,
    status: draft.status || 'confirmed',
    updated_at: new Date().toISOString(),
  }

  let reservation
  if (draft.id) {
    const { data, error } = await supabase.from('trip_on_reservations').update(payload).eq('id', draft.id).select('*').single()
    if (error) throw error
    reservation = data
  } else {
    const { data, error } = await supabase.from('trip_on_reservations').insert(payload).select('*').single()
    if (error) throw error
    reservation = data
  }

  const { error: clearError } = await supabase
    .from('trip_on_reservation_itinerary_links')
    .delete()
    .eq('reservation_id', reservation.id)
  if (clearError) throw clearError

  if (draft.itineraryItemId) {
    const { error: linkError } = await supabase.from('trip_on_reservation_itinerary_links').insert({
      reservation_id: reservation.id,
      itinerary_item_id: draft.itineraryItemId,
    })
    if (linkError) throw linkError
  }

  return reservation
}

function safeFileName(name = 'file') {
  return name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(-100) || 'file'
}

export async function uploadReservationFiles({ tripId, reservationId, files }) {
  if (!files?.length) return
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  const userId = userData.user?.id
  if (!userId) throw new Error('로그인이 필요해요.')

  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name}: 파일은 10MB 이하만 올릴 수 있어요.`)
    if (!(file.type.startsWith('image/') || file.type === 'application/pdf')) throw new Error(`${file.name}: 이미지 또는 PDF만 올릴 수 있어요.`)
    const path = `${userId}/${tripId}/${reservationId}/${crypto.randomUUID?.() || Date.now()}-${safeFileName(file.name)}`
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type })
    if (uploadError) throw uploadError
    const { error: rowError } = await supabase.from('trip_on_reservation_files').insert({
      trip_id: tripId,
      reservation_id: reservationId,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
    })
    if (rowError) {
      await supabase.storage.from(BUCKET).remove([path])
      throw rowError
    }
  }
}

export async function openReservationFile(storagePath) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 300)
  if (error) throw error
  return data.signedUrl
}

export async function deleteReservationFile(file) {
  if (file.storage_path) {
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([file.storage_path])
    if (storageError) throw storageError
  }
  const { error } = await supabase.from('trip_on_reservation_files').delete().eq('id', file.id)
  if (error) throw error
}

export async function deleteReservation(reservation) {
  const files = reservation.trip_on_reservation_files || []
  if (files.length) {
    const paths = files.map((file) => file.storage_path).filter(Boolean)
    if (paths.length) {
      const { error: storageError } = await supabase.storage.from(BUCKET).remove(paths)
      if (storageError) throw storageError
    }
  }
  const { error } = await supabase.from('trip_on_reservations').delete().eq('id', reservation.id)
  if (error) throw error
}
