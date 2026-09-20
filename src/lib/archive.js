import { unzipSync, strFromU8 } from 'fflate'
import { supabase } from './supabase'
import { fetchGooglePlaceDetails, isGoogleMapsConfigured } from './googleMaps'
import { savePlaceRecord } from './places'
import { isKoreaCoordinate } from './mapProviders'

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
  const [tripRes, scheduleRes, recordsRes, expensesRes, importsRes, timelineSegmentsRes] = await Promise.all([
    supabase.from('trip_on_trips').select('id, status, completed_at, archive_rating, archive_note').eq('id', tripId).single(),
    supabase.from('trip_on_itinerary_items').select('id, status, place_id, rating').eq('trip_id', tripId),
    supabase.from('trip_on_records').select('id, type, rating').eq('trip_id', tripId),
    supabase.from('trip_on_expenses').select('id, amount, currency, krw_amount').eq('trip_id', tripId),
    supabase.from('trip_on_timeline_imports')
      .select('id, source_file_name, source_range_start, source_range_end, imported_start_date, imported_end_date, segment_count, visit_count, activity_count, path_point_count, created_at')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false }),
    supabase.from('trip_on_timeline_segments')
      .select('id, day_date, segment_type, source_place_id, start_lat, start_lng')
      .eq('trip_id', tripId),
  ])
  for (const result of [tripRes, scheduleRes, recordsRes, expensesRes, importsRes, timelineSegmentsRes]) {
    if (result.error) throw result.error
  }

  const schedule = scheduleRes.data || []
  const records = recordsRes.data || []
  const expenses = expensesRes.data || []
  const timelineSegments = timelineSegmentsRes.data || []
  const timelineVisits = timelineSegments.filter((x) => x.segment_type === 'visit')
  const timelineUniquePlaceKeys = new Set(timelineVisits.map((row) => {
    if (row.source_place_id) return `google:${row.source_place_id}`
    if (row.start_lat != null && row.start_lng != null) return `coord:${Number(row.start_lat).toFixed(5)},${Number(row.start_lng).toFixed(5)}`
    return `segment:${row.id}`
  }))
  const timelineDays = new Set(timelineSegments.map((x) => x.day_date).filter(Boolean))
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
    timeline: {
      segmentCount: timelineSegments.length,
      visitCount: timelineVisits.length,
      uniquePlaces: timelineUniquePlaceKeys.size,
      dayCount: timelineDays.size,
    },
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


async function resolveTimelinePlaceIds(tripId, segments = []) {
  const missingIds = [...new Set(
    segments
      .filter((segment) =>
        segment.segment_type === 'visit'
        && segment.source_place_id
        && (segment.start_lat == null || segment.start_lng == null)
        && (segment.trip_on_places?.latitude == null || segment.trip_on_places?.longitude == null)
      )
      .map((segment) => segment.source_place_id)
  )]

  if (!missingIds.length) return { attempted: 0, resolved: 0, failed: 0, unavailable: false }

  let resolved = 0
  let failed = 0

  const attachPlace = async (placeId, placeRow) => {
    const latitude = placeRow?.latitude == null ? null : Number(placeRow.latitude)
    const longitude = placeRow?.longitude == null ? null : Number(placeRow.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false

    const { error } = await supabase
      .from('trip_on_timeline_segments')
      .update({
        place_id: placeRow.id,
        start_lat: latitude,
        start_lng: longitude,
        end_lat: latitude,
        end_lng: longitude,
      })
      .eq('trip_id', tripId)
      .eq('segment_type', 'visit')
      .eq('source_place_id', placeId)

    if (error) throw error
    return true
  }

  // 이미 다른 일정/스크랩에서 저장해둔 같은 Google Place가 있으면 API 요청 없이 재사용한다.
  const existing = new Map()
  for (let i = 0; i < missingIds.length; i += 100) {
    const { data, error } = await supabase
      .from('trip_on_places')
      .select('id, provider_place_id, name, city, country, address, latitude, longitude, map_url')
      .eq('provider', 'google')
      .in('provider_place_id', missingIds.slice(i, i + 100))
    if (error) throw error
    for (const row of data || []) existing.set(row.provider_place_id, row)
  }

  const unresolved = []
  for (const placeId of missingIds) {
    const row = existing.get(placeId)
    if (row && await attachPlace(placeId, row)) resolved += 1
    else unresolved.push(placeId)
  }

  if (!unresolved.length) return { attempted: missingIds.length, resolved, failed, unavailable: false }
  if (!isGoogleMapsConfigured()) {
    return { attempted: missingIds.length, resolved, failed: unresolved.length, unavailable: true }
  }

  // 사용자가 실제 동선 지도를 열었을 때만, 아직 좌표가 없는 고유 Place ID를 한 번씩 조회한다.
  // 한꺼번에 과도한 요청이 나가지 않도록 소수의 worker로 제한한다.
  let cursor = 0
  const worker = async () => {
    while (cursor < unresolved.length) {
      const placeId = unresolved[cursor++]
      try {
        const details = await fetchGooglePlaceDetails({
          provider: 'google',
          providerPlaceId: placeId,
          name: 'Google 타임라인 방문',
        })
        if (details?.latitude == null || details?.longitude == null) {
          failed += 1
          continue
        }
        const saved = await savePlaceRecord(details)
        if (saved && await attachPlace(placeId, saved)) resolved += 1
        else failed += 1
      } catch (error) {
        console.warn('Timeline place resolution failed', placeId, error)
        failed += 1
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, unresolved.length) }, () => worker()))
  return { attempted: missingIds.length, resolved, failed, unavailable: false }
}

async function loadTimelineRows(tripId, dayDate = null) {
  let query = supabase.from('trip_on_timeline_segments').select(`
    id, day_date, segment_type, start_at, end_at,
    start_timezone_offset_minutes, end_timezone_offset_minutes,
    transport_type, distance_meters,
    source_place_id, place_id, start_lat, start_lng, end_lat, end_lng, path_points,
    trip_on_places ( id, name, city, country, address, latitude, longitude, timezone, provider, provider_place_id, map_url )
  `).eq('trip_id', tripId).order('start_at', { ascending: true })

  if (dayDate) query = query.eq('day_date', dayDate)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function fetchTimelineMapData(tripId, dayDate = null) {
  let data = await loadTimelineRows(tripId, dayDate)
  const placeResolution = await resolveTimelinePlaceIds(tripId, data)
  if (placeResolution.resolved > 0) data = await loadTimelineRows(tripId, dayDate)

  const rows = data.map((segment) => {
    const rawPathPoints = Array.isArray(segment.path_points) ? segment.path_points : []
    const pathPoints = rawPathPoints.map((p) => ({
      latitude: Number(p.latitude ?? p.lat), longitude: Number(p.longitude ?? p.lng), time: p.time || null,
    })).filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
    const linkedPlacePoint = segment.trip_on_places?.latitude != null && segment.trip_on_places?.longitude != null
      ? { latitude: Number(segment.trip_on_places.latitude), longitude: Number(segment.trip_on_places.longitude) }
      : null
    const start = segment.start_lat != null && segment.start_lng != null
      ? { latitude: Number(segment.start_lat), longitude: Number(segment.start_lng) }
      : pathPoints[0] || linkedPlacePoint
    const end = segment.end_lat != null && segment.end_lng != null
      ? { latitude: Number(segment.end_lat), longitude: Number(segment.end_lng) }
      : pathPoints[pathPoints.length - 1] || linkedPlacePoint || start
    return { segment, rawPathPoints, pathPoints, start, end }
  })

  const paths = []
  const visits = []
  const segments = []
  let detailedPathPointCount = 0
  let syntheticPathCount = 0
  let visitOrder = 0

  const nearbyPoint = (index, direction) => {
    for (let i = index + direction; i >= 0 && i < rows.length; i += direction) {
      const candidate = direction < 0 ? (rows[i].end || rows[i].start) : (rows[i].start || rows[i].end)
      if (candidate && Number.isFinite(candidate.latitude) && Number.isFinite(candidate.longitude)) return candidate
    }
    return null
  }

  rows.forEach((row, index) => {
    const { segment, rawPathPoints } = row
    detailedPathPointCount += rawPathPoints.length
    let points = [...row.pathPoints]
    let synthetic = false

    if (points.length < 2 && segment.segment_type !== 'visit') {
      const start = row.start || nearbyPoint(index, -1)
      const end = row.end || nearbyPoint(index, 1)
      if (start && end && (start.latitude !== end.latitude || start.longitude !== end.longitude)) {
        points = [start, end]
        synthetic = true
        syntheticPathCount += 1
      }
    }

    if (points.length > 1) paths.push({
      id: segment.id,
      dayDate: segment.day_date,
      points,
      transportType: segment.transport_type,
      startAt: segment.start_at,
      endAt: segment.end_at,
      synthetic,
    })

    const place = segment.trip_on_places || null
    if (segment.segment_type === 'visit' && row.start) {
      visitOrder += 1
      visits.push({
        id: `timeline-${segment.id}`,
        dayDate: segment.day_date,
        name: place?.name || `방문 ${visitOrder}`,
        city: place?.city || '',
        country: place?.country || '',
        address: place?.address || '',
        latitude: row.start.latitude,
        longitude: row.start.longitude,
        provider: place?.provider || 'google',
        providerPlaceId: segment.source_place_id || place?.provider_place_id || '',
        mapUrl: place?.map_url || '',
        startAt: segment.start_at,
        endAt: segment.end_at,
        startOffset: segment.start_timezone_offset_minutes,
        endOffset: segment.end_timezone_offset_minutes,
        sources: [{ kind: 'timeline', id: segment.id, title: '실제 방문' }],
      })
    }

    segments.push({
      id: segment.id,
      dayDate: segment.day_date,
      segmentType: segment.segment_type,
      startAt: segment.start_at,
      endAt: segment.end_at,
      startOffset: segment.start_timezone_offset_minutes,
      endOffset: segment.end_timezone_offset_minutes,
      transportType: segment.transport_type || '',
      distanceMeters: segment.distance_meters == null ? null : Number(segment.distance_meters),
      sourcePlaceId: segment.source_place_id || '',
      name: place?.name || (segment.segment_type === 'visit' ? `방문 ${visitOrder}` : ''),
      city: place?.city || '',
      country: place?.country || '',
      address: place?.address || '',
      latitude: row.start?.latitude ?? null,
      longitude: row.start?.longitude ?? null,
      pathPointCount: rawPathPoints.length,
      hasRouteGeometry: points.length > 1,
      routeIsSynthetic: synthetic,
    })
  })

  // 아주 오래된/간소화된 Timeline export는 이동 세그먼트에 좌표가 전혀 없을 수 있어요.
  // 그 경우에도 방문 순서를 볼 수 있도록, 같은 날의 방문 지점들을 보조선으로 이어줍니다.
  const daysWithPath = new Set(paths.map((path) => path.dayDate).filter(Boolean))
  const visitsByDay = new Map()
  for (const visit of visits) {
    if (!visitsByDay.has(visit.dayDate)) visitsByDay.set(visit.dayDate, [])
    visitsByDay.get(visit.dayDate).push(visit)
  }
  for (const [date, dayVisits] of visitsByDay.entries()) {
    if (daysWithPath.has(date) || dayVisits.length < 2) continue
    paths.push({
      id: `timeline-visits-${date}`,
      dayDate: date,
      points: dayVisits.map((visit) => ({ latitude: visit.latitude, longitude: visit.longitude })),
      transportType: '',
      startAt: dayVisits[0]?.startAt || null,
      endAt: dayVisits[dayVisits.length - 1]?.endAt || null,
      synthetic: true,
    })
    syntheticPathCount += 1
  }

  const days = [...new Set(segments.map((x) => x.dayDate).filter(Boolean))].sort()
  const unresolvedVisitCount = segments.filter((segment) =>
    segment.segmentType === 'visit' && (segment.latitude == null || segment.longitude == null)
  ).length
  return {
    paths, visits, segments, days, detailedPathPointCount, syntheticPathCount,
    segmentCount: segments.length,
    unresolvedVisitCount,
    placeResolution,
  }
}


function timelineActualTimezone(segment) {
  const place = segment?.trip_on_places
  if (place?.timezone) return place.timezone
  const lat = place?.latitude ?? segment?.start_lat
  const lng = place?.longitude ?? segment?.start_lng
  if (isKoreaCoordinate(lat, lng)) return 'Asia/Seoul'
  return null
}

export async function fetchTimelineScheduleCandidates(tripId) {
  let timelineRows = await loadTimelineRows(tripId)
  const placeResolution = await resolveTimelinePlaceIds(tripId, timelineRows)
  if (placeResolution.resolved > 0) timelineRows = await loadTimelineRows(tripId)

  const [daysRes, itineraryRes] = await Promise.all([
    supabase
      .from('trip_on_trip_days')
      .select('id, day_number, trip_date')
      .eq('trip_id', tripId)
      .order('day_number', { ascending: true }),
    supabase
      .from('trip_on_itinerary_items')
      .select('id, trip_day_id, place_id, title, status, import_source, import_source_ref')
      .eq('trip_id', tripId),
  ])
  if (daysRes.error) throw daysRes.error
  if (itineraryRes.error) throw itineraryRes.error

  const dayByDate = new Map((daysRes.data || []).map((day) => [day.trip_date, day]))
  const items = itineraryRes.data || []
  const exactByRef = new Map(items
    .filter((item) => item.import_source === 'google_timeline' && item.import_source_ref)
    .map((item) => [item.import_source_ref, item]))
  const samePlaceByDay = new Map()
  for (const item of items) {
    if (!item.place_id || !item.trip_day_id) continue
    samePlaceByDay.set(`${item.trip_day_id}:${item.place_id}`, item)
  }

  const visits = timelineRows
    .filter((segment) => segment.segment_type === 'visit')
    .map((segment) => {
      const day = dayByDate.get(segment.day_date) || null
      const place = segment.trip_on_places || null
      const exact = exactByRef.get(segment.id) || null
      const matched = !exact && day && place?.id
        ? samePlaceByDay.get(`${day.id}:${place.id}`) || null
        : null
      return {
        id: segment.id,
        dayDate: segment.day_date,
        dayNumber: day?.day_number || null,
        tripDayId: day?.id || null,
        placeId: place?.id || segment.place_id || null,
        name: place?.name || '방문 장소',
        city: place?.city || '',
        country: place?.country || '',
        address: place?.address || '',
        latitude: place?.latitude ?? segment.start_lat ?? null,
        longitude: place?.longitude ?? segment.start_lng ?? null,
        startAt: segment.start_at,
        endAt: segment.end_at,
        startOffset: segment.start_timezone_offset_minutes,
        endOffset: segment.end_timezone_offset_minutes,
        timezone: timelineActualTimezone(segment),
        alreadyImported: Boolean(exact),
        matchedItemId: matched?.id || null,
        matchedItemTitle: matched?.title || '',
        canImport: Boolean(day?.id && (place?.id || segment.place_id)),
      }
    })

  return { visits, placeResolution }
}

export async function importTimelineVisitsToSchedule({ tripId, segmentIds = [] }) {
  const selectedIds = [...new Set((segmentIds || []).filter(Boolean))]
  if (!selectedIds.length) return { created: 0, linked: 0, skipped: 0 }

  let rows = await loadTimelineRows(tripId)
  const resolution = await resolveTimelinePlaceIds(tripId, rows)
  if (resolution.resolved > 0) rows = await loadTimelineRows(tripId)

  const selected = rows.filter((segment) => selectedIds.includes(segment.id) && segment.segment_type === 'visit')
  if (!selected.length) return { created: 0, linked: 0, skipped: selectedIds.length }

  const [daysRes, itineraryRes] = await Promise.all([
    supabase
      .from('trip_on_trip_days')
      .select('id, day_number, trip_date')
      .eq('trip_id', tripId),
    supabase
      .from('trip_on_itinerary_items')
      .select('id, trip_day_id, place_id, title, import_source, import_source_ref, sort_order')
      .eq('trip_id', tripId),
  ])
  if (daysRes.error) throw daysRes.error
  if (itineraryRes.error) throw itineraryRes.error

  const dayByDate = new Map((daysRes.data || []).map((day) => [day.trip_date, day]))
  const items = itineraryRes.data || []
  const exactRefs = new Set(items
    .filter((item) => item.import_source === 'google_timeline' && item.import_source_ref)
    .map((item) => item.import_source_ref))
  const samePlaceByDay = new Map()
  const maxOrderByDay = new Map()
  for (const item of items) {
    if (item.place_id && item.trip_day_id) samePlaceByDay.set(`${item.trip_day_id}:${item.place_id}`, item)
    if (item.trip_day_id) {
      const current = maxOrderByDay.get(item.trip_day_id) ?? -1
      maxOrderByDay.set(item.trip_day_id, Math.max(current, Number(item.sort_order ?? -1)))
    }
  }

  let created = 0
  let linked = 0
  let skipped = 0

  for (const segment of selected) {
    if (exactRefs.has(segment.id)) {
      skipped += 1
      continue
    }
    const day = dayByDate.get(segment.day_date)
    const place = segment.trip_on_places || null
    const placeId = place?.id || segment.place_id || null
    if (!day?.id || !placeId) {
      skipped += 1
      continue
    }

    const timezone = timelineActualTimezone(segment)
    const samePlaceKey = `${day.id}:${placeId}`
    const samePlace = samePlaceByDay.get(samePlaceKey)
    if (samePlace) {
      const update = {
        status: 'completed',
        import_source: 'google_timeline',
        import_source_ref: segment.id,
        updated_at: new Date().toISOString(),
      }
      if (timezone) {
        update.actual_start_at = segment.start_at || null
        update.actual_end_at = segment.end_at || null
        update.actual_start_timezone = timezone
        update.actual_end_timezone = timezone
      }
      const { error } = await supabase
        .from('trip_on_itinerary_items')
        .update(update)
        .eq('id', samePlace.id)
      if (error) throw error
      exactRefs.add(segment.id)
      samePlaceByDay.delete(samePlaceKey)
      linked += 1
      continue
    }

    const nextOrder = (maxOrderByDay.get(day.id) ?? -1) + 1
    maxOrderByDay.set(day.id, nextOrder)
    const payload = {
      trip_id: tripId,
      trip_day_id: day.id,
      place_id: placeId,
      origin_place_id: null,
      destination_place_id: null,
      title: place?.name || '방문 장소',
      category: 'place',
      city: place?.city || null,
      start_at: null,
      end_at: null,
      start_timezone: timezone || 'Asia/Seoul',
      end_timezone: timezone || 'Asia/Seoul',
      actual_start_at: timezone ? segment.start_at || null : null,
      actual_end_at: timezone ? segment.end_at || null : null,
      actual_start_timezone: timezone,
      actual_end_timezone: timezone,
      is_time_unscheduled: true,
      status: 'completed',
      sort_order: nextOrder,
      import_source: 'google_timeline',
      import_source_ref: segment.id,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('trip_on_itinerary_items').insert(payload)
    if (error) {
      // Unique source index can be hit if the user double-taps the import action.
      if (error.code === '23505') {
        skipped += 1
        continue
      }
      throw error
    }
    exactRefs.add(segment.id)
    created += 1
  }

  return { created, linked, skipped }
}
