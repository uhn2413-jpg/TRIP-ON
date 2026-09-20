import { supabase } from './supabase'
import { DEFAULT_TIMEZONE, zonedLocalToIso } from './schedule'
import { normalizeUploadFile, previewableImageUrl } from './imageUploads'

const BUCKET = 'trip-on-files'

export const recordTypeLabels = {
  photo: '사진',
  ticket: '티켓',
  receipt: '영수증',
  note: '메모',
}

function safeFileName(name = 'file') {
  return name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(-100) || 'file'
}

function localDateTimeToIso(date, time, timezone) {
  if (!date) return null
  return zonedLocalToIso(date, time || '12:00', timezone || DEFAULT_TIMEZONE)
}

export function isoToRecordDateTime(iso, timezone = DEFAULT_TIMEZONE) {
  if (!iso) return { date: '', time: '' }
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone || DEFAULT_TIMEZONE,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).formatToParts(new Date(iso)).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])
    )
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      time: `${parts.hour}:${parts.minute}`,
    }
  } catch {
    const local = new Date(iso)
    return { date: local.toISOString().slice(0, 10), time: local.toISOString().slice(11, 16) }
  }
}

async function signMedia(media) {
  if (!media?.storage_path) return { ...media, signed_url: media?.file_url || null }
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(media.storage_path, 60 * 60)
  if (error) return { ...media, signed_url: null }
  const signedUrl = data.signedUrl
  const previewUrl = media.media_type === 'image'
    ? await previewableImageUrl({
        url: signedUrl,
        fileName: media.file_name,
        mimeType: media.mime_type,
        cacheKey: media.storage_path,
      })
    : signedUrl
  return { ...media, signed_url: previewUrl || signedUrl }
}

export async function fetchRecordData(tripId) {
  const [daysRes, itineraryRes, recordsRes] = await Promise.all([
    supabase
      .from('trip_on_trip_days')
      .select('id, day_number, trip_date, title')
      .eq('trip_id', tripId)
      .order('day_number', { ascending: true }),
    supabase
      .from('trip_on_itinerary_items')
      .select('id, trip_day_id, title, city, start_at, start_timezone, is_time_unscheduled, sort_order')
      .eq('trip_id', tripId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('trip_on_records')
      .select(`
        id, trip_day_id, itinerary_item_id, place_id,
        type, title, memo, recorded_at, recorded_timezone, recorded_time_known,
        place_name, city, rating, created_at, updated_at,
        trip_on_record_media (
          id, file_url, storage_path, file_name, mime_type, media_type, sort_order, created_at
        )
      `)
      .eq('trip_id', tripId)
      .order('recorded_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
  ])

  for (const result of [daysRes, itineraryRes, recordsRes]) {
    if (result.error) throw result.error
  }

  const days = daysRes.data || []
  const itinerary = itineraryRes.data || []
  const dayMap = new Map(days.map((day) => [day.id, day]))
  const itineraryMap = new Map(itinerary.map((item) => [item.id, item]))

  const records = await Promise.all((recordsRes.data || []).map(async (record) => ({
    ...record,
    day: dayMap.get(record.trip_day_id) || null,
    itinerary_item: itineraryMap.get(record.itinerary_item_id) || null,
    media: await Promise.all((record.trip_on_record_media || [])
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map(signMedia)),
  })))

  return { days, itinerary, records }
}

export async function saveRecord({ tripId, draft }) {
  const payload = {
    trip_id: tripId,
    trip_day_id: draft.tripDayId || null,
    itinerary_item_id: draft.itineraryItemId || null,
    type: draft.type || 'note',
    title: draft.title?.trim() || null,
    memo: draft.memo?.trim() || null,
    recorded_at: localDateTimeToIso(draft.recordDate, draft.recordTime, draft.timezone),
    recorded_timezone: draft.timezone || DEFAULT_TIMEZONE,
    recorded_time_known: Boolean(draft.recordTime),
    place_name: draft.placeName?.trim() || null,
    city: draft.city?.trim() || null,
    rating: draft.rating ? Number(draft.rating) : null,
    updated_at: new Date().toISOString(),
  }

  if (draft.id) {
    const { data, error } = await supabase
      .from('trip_on_records')
      .update(payload)
      .eq('id', draft.id)
      .select('*')
      .single()
    if (error) throw error
    return data
  }

  const { data, error } = await supabase
    .from('trip_on_records')
    .insert(payload)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function uploadRecordFiles({ tripId, recordId, files }) {
  if (!files?.length) return
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  const userId = userData.user?.id
  if (!userId) throw new Error('로그인이 필요해요.')

  let sortOrder = 0
  const { data: existing, error: existingError } = await supabase
    .from('trip_on_record_media')
    .select('sort_order')
    .eq('record_id', recordId)
    .order('sort_order', { ascending: false })
    .limit(1)
  if (existingError) throw existingError
  sortOrder = ((existing || [])[0]?.sort_order ?? -1) + 1

  for (const sourceFile of files) {
    const file = await normalizeUploadFile(sourceFile, {
      allowPdf: true,
      maxSourceBytes: 20 * 1024 * 1024,
      maxOutputBytes: 12 * 1024 * 1024,
    })

    const path = `${userId}/${tripId}/records/${recordId}/${crypto.randomUUID?.() || Date.now()}-${safeFileName(file.name)}`
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
      upsert: false,
      contentType: file.type || undefined,
    })
    if (uploadError) throw uploadError

    const { error: rowError } = await supabase.from('trip_on_record_media').insert({
      record_id: recordId,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      media_type: file.type === 'application/pdf' ? 'file' : 'image',
      sort_order: sortOrder++,
    })
    if (rowError) {
      await supabase.storage.from(BUCKET).remove([path])
      throw rowError
    }
  }
}

export async function openRecordMedia(media) {
  if (media.signed_url) return media.signed_url
  if (!media.storage_path) return media.file_url || null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(media.storage_path, 300)
  if (error) throw error
  return data.signedUrl
}

export async function deleteRecordMedia(media) {
  if (media.storage_path) {
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([media.storage_path])
    if (storageError) throw storageError
  }
  const { error } = await supabase.from('trip_on_record_media').delete().eq('id', media.id)
  if (error) throw error
}

export async function deleteRecord(record) {
  const media = record.media || record.trip_on_record_media || []
  const paths = media.map((item) => item.storage_path).filter(Boolean)
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from(BUCKET).remove(paths)
    if (storageError) throw storageError
  }
  const { error } = await supabase.from('trip_on_records').delete().eq('id', record.id)
  if (error) throw error
}
