import { supabase } from './supabase'
import { savePlaceRecord } from './places'

const DEFAULT_TIMEZONE = 'Asia/Seoul'

function addDays(dateString, amount) {
  const date = new Date(`${dateString}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

export function buildTripDates(startDate, endDate) {
  if (!startDate || !endDate || startDate > endDate) return []
  const result = []
  let current = startDate
  let guard = 0
  while (current <= endDate && guard < 370) {
    result.push(current)
    current = addDays(current, 1)
    guard += 1
  }
  return result
}

export async function ensureTripDays(trip) {
  if (!trip?.id || !trip.startDate || !trip.endDate) return []

  const desired = buildTripDates(trip.startDate, trip.endDate)
  const { data: existing, error } = await supabase
    .from('trip_on_trip_days')
    .select('id, day_number, trip_date, title, memo')
    .eq('trip_id', trip.id)
    .order('day_number')

  if (error) throw error

  const exact = (existing || []).length === desired.length &&
    (existing || []).every((row, index) => row.day_number === index + 1 && row.trip_date === desired[index])

  if (exact) return existing

  const { count: itemCount, error: itemError } = await supabase
    .from('trip_on_itinerary_items')
    .select('id', { count: 'exact', head: true })
    .eq('trip_id', trip.id)

  if (itemError) throw itemError

  // 일정이 아직 없을 때는 날짜 변경에 맞춰 DAY를 안전하게 재생성한다.
  if (!itemCount) {
    const { error: deleteError } = await supabase
      .from('trip_on_trip_days')
      .delete()
      .eq('trip_id', trip.id)
    if (deleteError) throw deleteError

    if (!desired.length) return []
    const { data, error: insertError } = await supabase
      .from('trip_on_trip_days')
      .insert(desired.map((tripDate, index) => ({
        trip_id: trip.id,
        day_number: index + 1,
        trip_date: tripDate,
      })))
      .select('id, day_number, trip_date, title, memo')
    if (insertError) throw insertError
    return (data || []).sort((a, b) => a.day_number - b.day_number)
  }

  // 이미 일정이 있으면 DAY 연결을 잃지 않도록 기존 DAY를 보존한다.
  return existing || []
}

export async function fetchSchedule(trip) {
  const days = await ensureTripDays(trip)
  const { data: items, error } = await supabase
    .from('trip_on_itinerary_items')
    .select(`
      id, trip_day_id, place_id, origin_place_id, destination_place_id, title, category, city,
      start_at, end_at, start_timezone, end_timezone,
      actual_start_at, actual_end_at, actual_start_timezone, actual_end_timezone,
      is_time_unscheduled, transport_type, travel_minutes, travel_memo,
      expected_cost, expected_currency, status, sort_order, memo, rating,
      created_at, updated_at,
      trip_on_places ( id, name, city, country, address, latitude, longitude, timezone, provider, provider_place_id, map_url ),
      origin_place:trip_on_places!trip_on_itinerary_items_origin_place_id_fkey ( id, name, city, country, address, latitude, longitude, timezone, provider, provider_place_id, map_url ),
      destination_place:trip_on_places!trip_on_itinerary_items_destination_place_id_fkey ( id, name, city, country, address, latitude, longitude, timezone, provider, provider_place_id, map_url )
    `)
    .eq('trip_id', trip.id)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return { days, items: items || [] }
}

function getOffsetMilliseconds(instant, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(
    formatter.formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  )
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second || 0)
  )
  return asUtc - instant.getTime()
}

export function zonedLocalToIso(dateString, timeString, timeZone = DEFAULT_TIMEZONE) {
  if (!dateString || !timeString) return null
  const [year, month, day] = dateString.split('-').map(Number)
  const [hour, minute] = timeString.split(':').map(Number)
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute, 0)
  let candidate = new Date(wallClockUtc)
  let offset = getOffsetMilliseconds(candidate, timeZone)
  candidate = new Date(wallClockUtc - offset)
  const secondOffset = getOffsetMilliseconds(candidate, timeZone)
  if (secondOffset !== offset) candidate = new Date(wallClockUtc - secondOffset)
  return candidate.toISOString()
}

export function timeInZone(iso, timeZone = DEFAULT_TIMEZONE) {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: timeZone || DEFAULT_TIMEZONE,
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date(iso))
  } catch {
    return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
  }
}

export async function saveItineraryItem({ trip, day, draft }) {
  const timezone = draft.timezone || DEFAULT_TIMEZONE
  const endTimezone = draft.endTimezone || timezone
  const dayDate = day?.trip_date
  const unscheduled = Boolean(draft.isTimeUnscheduled)
  const isTransport = draft.category === 'transport'

  let placeId = null
  let originPlaceId = null
  let destinationPlaceId = null

  if (!isTransport && draft.place) {
    const place = await savePlaceRecord({
      ...draft.place,
      name: draft.place.name || draft.title,
      city: draft.city || draft.place.city,
      timezone: draft.place.timezone || timezone,
    })
    placeId = place?.id || null
  }

  if (isTransport && draft.originPlace) {
    const place = await savePlaceRecord({
      ...draft.originPlace,
      name: draft.originPlace.name || '출발지',
      timezone: draft.originPlace.timezone || timezone,
    })
    originPlaceId = place?.id || null
  }

  if (isTransport && draft.destinationPlace) {
    const place = await savePlaceRecord({
      ...draft.destinationPlace,
      name: draft.destinationPlace.name || '도착지',
      timezone: draft.destinationPlace.timezone || endTimezone,
    })
    destinationPlaceId = place?.id || null
  }

  const autoTransportTitle = isTransport && draft.originPlace?.name && draft.destinationPlace?.name
    ? `${draft.originPlace.name} → ${draft.destinationPlace.name}`
    : ''
  const title = draft.title?.trim() || autoTransportTitle
  if (!title) throw new Error('일정 이름을 입력해주세요.')

  const payload = {
    trip_id: trip.id,
    trip_day_id: day?.id || null,
    place_id: isTransport ? null : placeId,
    origin_place_id: isTransport ? originPlaceId : null,
    destination_place_id: isTransport ? destinationPlaceId : null,
    title,
    category: draft.category || null,
    city: draft.city?.trim() || (isTransport ? draft.destinationPlace?.city?.trim() || null : null),
    start_at: unscheduled ? null : zonedLocalToIso(dayDate, draft.startTime, timezone),
    end_at: unscheduled || !draft.endTime ? null : zonedLocalToIso(dayDate, draft.endTime, endTimezone),
    start_timezone: timezone,
    end_timezone: endTimezone,
    actual_start_at: draft.actualStartTime ? zonedLocalToIso(dayDate, draft.actualStartTime, timezone) : null,
    actual_end_at: draft.actualEndTime ? zonedLocalToIso(dayDate, draft.actualEndTime, endTimezone) : null,
    actual_start_timezone: draft.actualStartTime ? timezone : null,
    actual_end_timezone: draft.actualEndTime ? endTimezone : null,
    is_time_unscheduled: unscheduled,
    transport_type: draft.transportType || null,
    travel_minutes: draft.travelMinutes ? Number(draft.travelMinutes) : null,
    expected_cost: draft.expectedCost ? Number(draft.expectedCost) : null,
    expected_currency: draft.expectedCurrency || null,
    status: draft.status || 'planned',
    memo: draft.memo?.trim() || null,
    rating: draft.rating ? Number(draft.rating) : null,
    updated_at: new Date().toISOString(),
  }

  if (draft.id) {
    const { data, error } = await supabase
      .from('trip_on_itinerary_items')
      .update(payload)
      .eq('id', draft.id)
      .select('*')
      .single()
    if (error) throw error
    return data
  }

  const { data: orderRows, error: orderError } = await supabase
    .from('trip_on_itinerary_items')
    .select('sort_order')
    .eq('trip_id', trip.id)
    .eq('trip_day_id', day?.id || '')
    .order('sort_order', { ascending: false })
    .limit(1)
  if (orderError) throw orderError

  payload.sort_order = ((orderRows || [])[0]?.sort_order ?? -1) + 1

  const { data, error } = await supabase
    .from('trip_on_itinerary_items')
    .insert(payload)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteItineraryItem(id) {
  const { error } = await supabase.from('trip_on_itinerary_items').delete().eq('id', id)
  if (error) throw error
}

export async function updateItineraryStatus(id, status) {
  const { data, error } = await supabase
    .from('trip_on_itinerary_items')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateDayMemo(dayId, memo) {
  const { error } = await supabase
    .from('trip_on_trip_days')
    .update({ memo: memo?.trim() || null })
    .eq('id', dayId)
  if (error) throw error
}

export async function moveItineraryItem(items, id, direction) {
  const index = items.findIndex((item) => item.id === id)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return
  const current = items[index]
  const other = items[nextIndex]
  const a = current.sort_order ?? index
  const b = other.sort_order ?? nextIndex

  const { error: firstError } = await supabase
    .from('trip_on_itinerary_items')
    .update({ sort_order: b })
    .eq('id', current.id)
  if (firstError) throw firstError

  const { error: secondError } = await supabase
    .from('trip_on_itinerary_items')
    .update({ sort_order: a })
    .eq('id', other.id)
  if (secondError) throw secondError
}

export { DEFAULT_TIMEZONE }
