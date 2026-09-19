import { unzipSync, strFromU8 } from 'fflate'
import { supabase } from './supabase'

const CHUNK_SIZE = 120

function clampRating(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return Math.min(5, Math.max(0.5, Math.round(number * 2) / 2))
}

export async function updateTripArchive({ tripId, status, rating, note }) {
  const payload = {
    archive_rating: clampRating(rating),
    archive_note: note?.trim() || null,
    updated_at: new Date().toISOString(),
  }
  if (status) {
    payload.status = status
    payload.completed_at = status === 'completed' ? new Date().toISOString() : null
  }
  const { error } = await supabase.from('trip_on_trips').update(payload).eq('id', tripId)
  if (error) throw error
}

export async function fetchArchiveData(tripId) {
  const [tripRes, scheduleRes, recordsRes, expensesRes, importsRes] = await Promise.all([
    supabase.from('trip_on_trips').select('id, status, completed_at, archive_rating, archive_note').eq('id', tripId).single(),
    supabase.from('trip_on_itinerary_items').select('id, status, place_id, rating').eq('trip_id', tripId),
    supabase.from('trip_on_records').select('id, type, rating').eq('trip_id', tripId),
    supabase.from('trip_on_expenses').select('id, amount, currency, krw_amount').eq('trip_id', tripId),
    supabase.from('trip_on_timeline_imports')
      .select('id, source_file_name, source_range_start, source_range_end, imported_start_date, imported_end_date, segment_count, visit_count, activity_count, path_point_count, created_at')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false }),
  ])
  for (const result of [tripRes, scheduleRes, recordsRes, expensesRes, importsRes]) {
    if (result.error) throw result.error
  }

  const schedule = scheduleRes.data || []
  const records = recordsRes.data || []
  const expenses = expensesRes.data || []
  const visitedPlaceIds = new Set(schedule.filter((x) => x.status === 'completed' && x.place_id).map((x) => x.place_id))
  const totalKrw = expenses.reduce((sum, row) => {
    if (row.krw_amount != null) return sum + Number(row.krw_amount || 0)
    if (row.currency === 'KRW') return sum + Number(row.amount || 0)
    return sum
  }, 0)

  return {
    trip: tripRes.data,
    schedule: {
      total: schedule.length,
      completed: schedule.filter((x) => x.status === 'completed').length,
      skipped: schedule.filter((x) => x.status === 'skipped').length,
      cancelled: schedule.filter((x) => x.status === 'cancelled').length,
      planned: schedule.filter((x) => x.status === 'planned').length,
      visitedPlaces: visitedPlaceIds.size,
    },
    records: {
      total: records.length,
      photos: records.filter((x) => x.type === 'photo').length,
      tickets: records.filter((x) => x.type === 'ticket').length,
      receipts: records.filter((x) => x.type === 'receipt').length,
      notes: records.filter((x) => x.type === 'note').length,
    },
    expenses: { count: expenses.length, totalKrw },
    imports: importsRes.data || [],
  }
}

function pickTimelineJson(entries) {
  const names = Object.keys(entries).filter((name) => /\.json$/i.test(name) && !name.startsWith('__MACOSX/'))
  if (!names.length) throw new Error('ZIP 안에서 JSON 파일을 찾지 못했어요.')
  const preferred = names.find((name) => /타임라인|timeline|location.?history/i.test(name))
  return entries[preferred || names.sort((a, b) => entries[b].length - entries[a].length)[0]]
}

export async function readTimelineFile(file) {
  if (!file) throw new Error('파일을 선택해주세요.')
  const lower = file.name.toLowerCase()
  let text
  if (lower.endsWith('.zip')) {
    const buffer = new Uint8Array(await file.arrayBuffer())
    const entries = unzipSync(buffer)
    text = strFromU8(pickTimelineJson(entries))
  } else if (lower.endsWith('.json')) {
    text = await file.text()
  } else {
    throw new Error('Google 타임라인 ZIP 또는 JSON 파일을 선택해주세요.')
  }

  let data
  try { data = JSON.parse(text) } catch { throw new Error('JSON을 읽지 못했어요. Google 타임라인 내보내기 파일인지 확인해주세요.') }
  if (!Array.isArray(data?.semanticSegments)) {
    throw new Error('semanticSegments를 찾지 못했어요. 현재 Google 타임라인 내보내기 형식과 다른 파일 같아요.')
  }
  const meta = inspectTimeline(data)
  return { data, meta }
}

function parseGeo(value) {
  if (!value) return null
  if (typeof value === 'object') {
    const rawLat = value.latitude ?? value.lat ?? value.latE7 ?? null
    const rawLng = value.longitude ?? value.lng ?? value.lon ?? value.longitudeE7 ?? null
    const lat = rawLat == null ? null : Number(rawLat)
    const lng = rawLng == null ? null : Number(rawLng)
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { latitude: Math.abs(lat) > 90 ? lat / 1e7 : lat, longitude: Math.abs(lng) > 180 ? lng / 1e7 : lng }
    }
    value = value.latLng || value.point || value.geo || ''
  }
  const match = String(value).match(/(?:geo:)?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i)
  if (!match) return null
  return { latitude: Number(match[1]), longitude: Number(match[2]) }
}

function segmentTimes(segment) {
  const startAt = segment.startTime || segment.startTimestamp || segment.start || segment.startDateTime || null
  const endAt = segment.endTime || segment.endTimestamp || segment.end || segment.endDateTime || startAt
  return { startAt, endAt }
}

function offsetMinutes(segment, side) {
  const raw = side === 'start'
    ? (segment.startTimeTimezoneUtcOffsetMinutes ?? segment.startTimezoneUtcOffsetMinutes ?? segment.startTimeZoneUtcOffsetMinutes)
    : (segment.endTimeTimezoneUtcOffsetMinutes ?? segment.endTimezoneUtcOffsetMinutes ?? segment.endTimeZoneUtcOffsetMinutes)
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function localDateFromIso(iso, offset) {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return String(iso).slice(0, 10)
  if (offset != null) return new Date(date.getTime() + offset * 60000).toISOString().slice(0, 10)
  const direct = String(iso).match(/^(\d{4}-\d{2}-\d{2})/)
  return direct?.[1] || date.toISOString().slice(0, 10)
}

function visitCandidate(visit = {}) {
  return visit.topCandidate || visit.candidate || visit.place || visit.location || {}
}

function activityCandidate(activity = {}) {
  return activity.topCandidate || activity.candidate || activity || {}
}

function pathPointsFromSegment(segment) {
  const list = segment.timelinePath || segment.path || []
  if (!Array.isArray(list)) return []
  return list.map((point) => {
    const geo = parseGeo(point.point || point.location || point.latLng || point)
    if (!geo) return null
    return {
      ...geo,
      time: point.time || point.timestamp || point.duration?.startTimestamp || null,
    }
  }).filter(Boolean)
}

function normalizeSegment(segment, index) {
  const { startAt, endAt } = segmentTimes(segment)
  if (!startAt) return null
  const startOffset = offsetMinutes(segment, 'start')
  const endOffset = offsetMinutes(segment, 'end')
  const dayDate = localDateFromIso(startAt, startOffset)

  if (segment.visit) {
    const candidate = visitCandidate(segment.visit)
    const geo = parseGeo(candidate.placeLocation || candidate.location || candidate.latLng || segment.visit.placeLocation)
    return {
      sourceIndex: index,
      segmentType: 'visit', dayDate, startAt, endAt: endAt || startAt,
      startOffset, endOffset,
      transportType: null, distanceMeters: null,
      sourcePlaceId: candidate.placeId || candidate.placeID || segment.visit.placeId || segment.visit.placeID || null,
      startLat: geo?.latitude ?? null, startLng: geo?.longitude ?? null,
      endLat: geo?.latitude ?? null, endLng: geo?.longitude ?? null,
      pathPoints: pathPointsFromSegment(segment),
    }
  }

  if (segment.activity) {
    const activity = segment.activity
    const candidate = activityCandidate(activity)
    const startGeo = parseGeo(activity.start?.latLng || activity.start?.location || activity.start || segment.startLocation)
    const endGeo = parseGeo(activity.end?.latLng || activity.end?.location || activity.end || segment.endLocation)
    return {
      sourceIndex: index,
      segmentType: 'activity', dayDate, startAt, endAt: endAt || startAt,
      startOffset, endOffset,
      transportType: candidate.type || activity.type || activity.activityType || null,
      distanceMeters: Number(activity.distanceMeters ?? candidate.distanceMeters ?? 0) || null,
      sourcePlaceId: null,
      startLat: startGeo?.latitude ?? null, startLng: startGeo?.longitude ?? null,
      endLat: endGeo?.latitude ?? null, endLng: endGeo?.longitude ?? null,
      pathPoints: pathPointsFromSegment(segment),
    }
  }

  const pathPoints = pathPointsFromSegment(segment)
  if (pathPoints.length) {
    const start = pathPoints[0]
    const end = pathPoints[pathPoints.length - 1]
    return {
      sourceIndex: index,
      segmentType: 'path', dayDate, startAt, endAt: endAt || startAt,
      startOffset, endOffset,
      transportType: null, distanceMeters: null, sourcePlaceId: null,
      startLat: start.latitude, startLng: start.longitude,
      endLat: end.latitude, endLng: end.longitude,
      pathPoints,
    }
  }
  return null
}

export function inspectTimeline(data) {
  const normalized = (data?.semanticSegments || []).map(normalizeSegment).filter(Boolean)
  const dates = normalized.map((x) => x.dayDate).filter(Boolean).sort()
  return {
    segmentCount: normalized.length,
    sourceStart: dates[0] || null,
    sourceEnd: dates[dates.length - 1] || null,
    visitCount: normalized.filter((x) => x.segmentType === 'visit').length,
    activityCount: normalized.filter((x) => x.segmentType === 'activity').length,
    pathPointCount: normalized.reduce((sum, x) => sum + x.pathPoints.length, 0),
  }
}

export function previewTimeline(data, startDate, endDate) {
  if (!startDate || !endDate || startDate > endDate) {
    return { segments: [], visitCount: 0, activityCount: 0, pathPointCount: 0 }
  }
  const segments = (data?.semanticSegments || [])
    .map(normalizeSegment)
    .filter(Boolean)
    .filter((segment) => segment.dayDate >= startDate && segment.dayDate <= endDate)

  return {
    segments,
    visitCount: segments.filter((x) => x.segmentType === 'visit').length,
    activityCount: segments.filter((x) => x.segmentType === 'activity').length,
    pathPointCount: segments.reduce((sum, x) => sum + x.pathPoints.length, 0),
  }
}

async function findExistingPlaces(placeIds) {
  const ids = [...new Set(placeIds.filter(Boolean))]
  if (!ids.length) return new Map()
  const map = new Map()
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from('trip_on_places')
      .select('id, provider_place_id')
      .eq('provider', 'google')
      .in('provider_place_id', ids.slice(i, i + 100))
    if (error) throw error
    for (const row of data || []) map.set(row.provider_place_id, row.id)
  }
  return map
}

export async function saveTimelineImport({ tripId, fileName, meta, startDate, endDate, preview }) {
  if (!preview?.segments?.length) throw new Error('선택한 기간에 가져올 타임라인이 없어요.')
  const { data: importRow, error: importError } = await supabase.from('trip_on_timeline_imports').insert({
    trip_id: tripId,
    source_file_name: fileName || null,
    source_range_start: meta.sourceStart,
    source_range_end: meta.sourceEnd,
    imported_start_date: startDate,
    imported_end_date: endDate,
    segment_count: preview.segments.length,
    visit_count: preview.visitCount,
    activity_count: preview.activityCount,
    path_point_count: preview.pathPointCount,
  }).select('id').single()
  if (importError) throw importError

  try {
    const placeMap = await findExistingPlaces(preview.segments.map((x) => x.sourcePlaceId))
    const rows = preview.segments.map((segment) => ({
      trip_id: tripId,
      import_id: importRow.id,
      day_date: segment.dayDate,
      segment_type: segment.segmentType,
      start_at: segment.startAt,
      end_at: segment.endAt,
      start_timezone_offset_minutes: segment.startOffset,
      end_timezone_offset_minutes: segment.endOffset,
      transport_type: segment.transportType,
      distance_meters: segment.distanceMeters,
      source_place_id: segment.sourcePlaceId,
      place_id: placeMap.get(segment.sourcePlaceId) || null,
      start_lat: segment.startLat,
      start_lng: segment.startLng,
      end_lat: segment.endLat,
      end_lng: segment.endLng,
      path_points: segment.pathPoints,
    }))

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const { error } = await supabase.from('trip_on_timeline_segments').insert(rows.slice(i, i + CHUNK_SIZE))
      if (error) throw error
    }
    return importRow.id
  } catch (error) {
    await supabase.from('trip_on_timeline_imports').delete().eq('id', importRow.id)
    throw error
  }
}

export async function deleteTimelineImport(importId) {
  const { error } = await supabase.from('trip_on_timeline_imports').delete().eq('id', importId)
  if (error) throw error
}

export async function fetchTimelineMapData(tripId, dayDate = null) {
  let query = supabase.from('trip_on_timeline_segments').select(`
    id, day_date, segment_type, start_at, end_at, transport_type, distance_meters,
    source_place_id, start_lat, start_lng, end_lat, end_lng, path_points,
    trip_on_places ( id, name, city, country, address, latitude, longitude, provider, provider_place_id, map_url )
  `).eq('trip_id', tripId).order('start_at', { ascending: true })
  if (dayDate) query = query.eq('day_date', dayDate)
  const { data, error } = await query
  if (error) throw error

  const paths = []
  const visits = []
  for (const segment of data || []) {
    const points = Array.isArray(segment.path_points) ? segment.path_points.map((p) => ({
      latitude: Number(p.latitude ?? p.lat), longitude: Number(p.longitude ?? p.lng), time: p.time || null,
    })).filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)) : []
    if (!points.length && segment.start_lat != null && segment.start_lng != null && segment.end_lat != null && segment.end_lng != null) {
      points.push({ latitude: Number(segment.start_lat), longitude: Number(segment.start_lng) })
      if (segment.start_lat !== segment.end_lat || segment.start_lng !== segment.end_lng) points.push({ latitude: Number(segment.end_lat), longitude: Number(segment.end_lng) })
    }
    if (points.length > 1) paths.push({ id: segment.id, points, transportType: segment.transport_type })
    if (segment.segment_type === 'visit' && segment.start_lat != null && segment.start_lng != null) {
      visits.push({
        id: `timeline-${segment.id}`,
        name: segment.trip_on_places?.name || '방문 장소',
        city: segment.trip_on_places?.city || '',
        country: segment.trip_on_places?.country || '',
        address: segment.trip_on_places?.address || '',
        latitude: Number(segment.start_lat),
        longitude: Number(segment.start_lng),
        providerPlaceId: segment.source_place_id || '',
        mapUrl: segment.trip_on_places?.map_url || '',
        sources: [{ kind: 'timeline', id: segment.id, title: '실제 방문' }],
      })
    }
  }
  return { paths, visits, segmentCount: (data || []).length }
}
