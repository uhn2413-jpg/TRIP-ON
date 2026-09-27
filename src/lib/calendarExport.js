import { supabase } from './supabase'
import { dateInZone, DEFAULT_TIMEZONE } from './schedule'

const ICS_PRODID = '-//TRIP:ON//Travel Calendar//KO'

function pad(value) {
  return String(value).padStart(2, '0')
}

function utcStamp(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
}

function dateStamp(value) {
  return String(value || '').replaceAll('-', '')
}

function addDate(dateString, days) {
  if (!dateString) return ''
  const date = new Date(`${dateString}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return ''
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function escapeIcsText(value) {
  return String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll('\r\n', '\\n')
    .replaceAll('\n', '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
}

function foldLine(line) {
  // RFC 5545 line folding. UTF-8 byte-perfect folding is not essential for modern calendar clients,
  // but keeping lines reasonably short improves compatibility.
  if (line.length <= 72) return line
  const parts = []
  let rest = line
  while (rest.length > 72) {
    parts.push(rest.slice(0, 72))
    rest = rest.slice(72)
  }
  parts.push(rest)
  return parts.join('\r\n ')
}

function eventLines(event, dtstamp) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(event.uid)}`,
    `DTSTAMP:${dtstamp}`,
  ]
  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${dateStamp(event.startDate)}`)
    lines.push(`DTEND;VALUE=DATE:${dateStamp(event.endDateExclusive || addDate(event.startDate, 1))}`)
  } else {
    lines.push(`DTSTART:${utcStamp(event.startAt)}`)
    if (event.endAt) lines.push(`DTEND:${utcStamp(event.endAt)}`)
  }
  lines.push(`SUMMARY:${escapeIcsText(event.title)}`)
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`)
  if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`)
  if (event.url) lines.push(`URL:${escapeIcsText(event.url)}`)
  if (event.category) lines.push(`CATEGORIES:${escapeIcsText(event.category)}`)
  lines.push('END:VEVENT')
  return lines.map(foldLine)
}

function fileSafeName(value) {
  const clean = String(value || 'TRIP-ON')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
  return clean || 'TRIP-ON'
}

function itineraryLocation(item) {
  const place = item.trip_on_places
  return place?.address || place?.name || item.city || ''
}

function itineraryDescription(item, day) {
  return [
    day?.day_number ? `TRIP:ON DAY ${day.day_number}` : '',
    item.category === 'transport' && item.travel_memo ? item.travel_memo : '',
    item.memo || '',
  ].filter(Boolean).join('\n')
}

function itineraryToEvent(item, day) {
  if (!day?.trip_date) return null
  const title = item.category === 'transport' ? `이동 · ${item.title}` : item.title
  if (item.start_at && !item.is_time_unscheduled) {
    return {
      uid: `itinerary-${item.id}@trip-on`,
      title,
      startAt: item.start_at,
      endAt: item.end_at || null,
      allDay: false,
      location: itineraryLocation(item),
      description: itineraryDescription(item, day),
      category: 'TRIP:ON 일정',
    }
  }
  return {
    uid: `itinerary-${item.id}@trip-on`,
    title,
    allDay: true,
    startDate: day.trip_date,
    endDateExclusive: addDate(day.trip_date, 1),
    location: itineraryLocation(item),
    description: itineraryDescription(item, day),
    category: 'TRIP:ON 일정',
  }
}

function reservationDescription(reservation) {
  const label = reservation.type === 'accommodation' ? '숙소' : '예약'
  return [
    `TRIP:ON ${label}`,
    reservation.provider ? `예약처: ${reservation.provider}` : '',
    reservation.reservation_number ? `예약번호: ${reservation.reservation_number}` : '',
    reservation.memo || '',
  ].filter(Boolean).join('\n')
}

function reservationToEvent(reservation) {
  if (!reservation.start_at) return null
  const zone = reservation.start_timezone || DEFAULT_TIMEZONE
  const endZone = reservation.end_timezone || zone
  const startDate = dateInZone(reservation.start_at, zone)
  const endDate = reservation.end_at ? dateInZone(reservation.end_at, endZone) : startDate
  const allDay = Boolean(reservation.is_start_time_unspecified)
  const titlePrefix = reservation.type === 'accommodation' ? '숙소' : '예약'
  if (allDay) {
    return {
      uid: `reservation-${reservation.id}@trip-on`,
      title: `${titlePrefix} · ${reservation.title}`,
      allDay: true,
      startDate,
      endDateExclusive: addDate(endDate || startDate, 1),
      description: reservationDescription(reservation),
      url: reservation.url || '',
      category: 'TRIP:ON 예약',
    }
  }
  return {
    uid: `reservation-${reservation.id}@trip-on`,
    title: `${titlePrefix} · ${reservation.title}`,
    allDay: false,
    startAt: reservation.start_at,
    endAt: reservation.end_at && !reservation.is_end_time_unspecified ? reservation.end_at : null,
    description: reservationDescription(reservation),
    url: reservation.url || '',
    category: 'TRIP:ON 예약',
  }
}

export async function fetchCalendarExportData(tripId) {
  const [daysRes, itemsRes, reservationsRes] = await Promise.all([
    supabase
      .from('trip_on_trip_days')
      .select('id, day_number, trip_date')
      .eq('trip_id', tripId)
      .order('day_number', { ascending: true }),
    supabase
      .from('trip_on_itinerary_items')
      .select(`
        id, trip_day_id, title, category, city, start_at, end_at,
        start_timezone, end_timezone, is_time_unscheduled, travel_memo, memo,
        status, sort_order, import_source, linked_plan_id, group_parent_id, is_visit_group,
        trip_on_places:trip_on_places!trip_on_itinerary_items_place_id_fkey ( id, name, address )
      `)
      .eq('trip_id', tripId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('trip_on_reservations')
      .select(`
        id, type, title, reservation_number, provider, start_at, end_at,
        start_timezone, end_timezone, is_start_time_unspecified, is_end_time_unspecified,
        url, memo, status
      `)
      .eq('trip_id', tripId)
      .order('start_at', { ascending: true, nullsFirst: false }),
  ])
  for (const result of [daysRes, itemsRes, reservationsRes]) if (result.error) throw result.error
  return {
    days: daysRes.data || [],
    items: itemsRes.data || [],
    reservations: reservationsRes.data || [],
  }
}

export function buildTripCalendar({ trip, data, includeSchedule = true, includeReservations = true }) {
  const dayMap = new Map((data.days || []).map((day) => [day.id, day]))
  const events = []
  let skippedUndated = 0
  let skippedCancelled = 0

  if (includeSchedule) {
    for (const item of data.items || []) {
      if (item.import_source === 'google_timeline' || item.linked_plan_id || item.group_parent_id || item.is_visit_group) continue
      if (['cancelled', 'skipped'].includes(item.status)) {
        skippedCancelled += 1
        continue
      }
      const event = itineraryToEvent(item, dayMap.get(item.trip_day_id))
      if (!event) {
        skippedUndated += 1
        continue
      }
      events.push(event)
    }
  }

  if (includeReservations) {
    for (const reservation of data.reservations || []) {
      if (reservation.status === 'cancelled') {
        skippedCancelled += 1
        continue
      }
      const event = reservationToEvent(reservation)
      if (!event) {
        skippedUndated += 1
        continue
      }
      events.push(event)
    }
  }

  events.sort((a, b) => {
    const aKey = a.allDay ? `${a.startDate}T00:00:00` : a.startAt
    const bKey = b.allDay ? `${b.startDate}T00:00:00` : b.startAt
    return String(aKey || '').localeCompare(String(bKey || ''))
  })

  const dtstamp = utcStamp(new Date())
  const calendarName = `${trip.title} · TRIP:ON`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${ICS_PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    ...events.flatMap((event) => eventLines(event, dtstamp)),
    'END:VCALENDAR',
  ]

  const content = `${lines.join('\r\n')}\r\n`
  const filename = `${fileSafeName(trip.title)}-TRIPON.ics`
  return { content, filename, eventCount: events.length, skippedUndated, skippedCancelled }
}

export function calendarFile(result) {
  return new File([result.content], result.filename, { type: 'text/calendar;charset=utf-8' })
}

export function downloadCalendarFile(result) {
  const blob = new Blob([result.content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = result.filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function shareCalendarFile(result) {
  const file = calendarFile(result)
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    await navigator.share({ title: result.filename, files: [file] })
    return 'shared'
  }
  downloadCalendarFile(result)
  return 'downloaded'
}
