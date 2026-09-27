import { supabase } from './supabase'

function money(value) {
  const n = Math.round(Number(value || 0))
  return `₩${n.toLocaleString('ko-KR')}`
}

function distanceText(meters) {
  const n = Number(meters || 0)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}km`
  return `${Math.round(n)}m`
}

function minuteText(minutes) {
  const n = Math.max(0, Math.round(Number(minutes || 0)))
  if (!n) return ''
  const hours = Math.floor(n / 60)
  const rest = n % 60
  if (!hours) return `${rest}분`
  if (!rest) return `${hours}시간`
  return `${hours}시간 ${rest}분`
}

function cleanSnippet(text, max = 90) {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  if (!value) return ''
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function uniqueTitles(rows = [], limit = 5) {
  const seen = new Set()
  const result = []
  for (const row of rows) {
    const title = String(row?.title || '').trim()
    if (!title || seen.has(title)) continue
    seen.add(title)
    result.push(title)
    if (result.length >= limit) break
  }
  return result
}

export async function fetchDayReflections(tripId) {
  const { data, error } = await supabase
    .from('trip_on_day_reflections')
    .select('id, trip_id, trip_day_id, body, source_snapshot, generated_at, created_at, updated_at')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function fetchDayReflectionSummary({ tripId, dayId }) {
  const { data: day, error: dayError } = await supabase
    .from('trip_on_trip_days')
    .select('id, trip_id, day_number, trip_date, title, memo')
    .eq('id', dayId)
    .eq('trip_id', tripId)
    .single()
  if (dayError) throw dayError

  const timelinePromise = day.trip_date
    ? supabase
        .from('trip_on_timeline_segments')
        .select('id, segment_type, start_at, end_at, distance_meters, transport_type')
        .eq('trip_id', tripId)
        .eq('day_date', day.trip_date)
    : Promise.resolve({ data: [], error: null })

  const [scheduleRes, recordsRes, expensesRes, timelineRes] = await Promise.all([
    supabase
      .from('trip_on_itinerary_items')
      .select('id, title, category, status, rating, import_source, linked_plan_id, group_parent_id, is_visit_group')
      .eq('trip_id', tripId)
      .eq('trip_day_id', dayId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('trip_on_records')
      .select(`
        id, type, title, memo, rating,
        trip_on_record_media ( id, media_type )
      `)
      .eq('trip_id', tripId)
      .eq('trip_day_id', dayId),
    supabase
      .from('trip_on_expenses')
      .select('id, title, amount, currency, krw_amount')
      .eq('trip_id', tripId)
      .eq('trip_day_id', dayId),
    timelinePromise,
  ])

  for (const result of [scheduleRes, recordsRes, expensesRes, timelineRes]) {
    if (result.error) throw result.error
  }

  const schedule = (scheduleRes.data || []).filter((item) => (
    item.linked_plan_id == null
    && item.group_parent_id == null
    && !item.is_visit_group
    && item.import_source !== 'google_timeline'
  ))
  const completed = schedule.filter((item) => item.status === 'completed')
  const skipped = schedule.filter((item) => item.status === 'skipped')
  const cancelled = schedule.filter((item) => item.status === 'cancelled')
  const activePlanned = schedule.filter((item) => !['cancelled', 'skipped'].includes(item.status))

  const records = recordsRes.data || []
  const media = records.flatMap((record) => record.trip_on_record_media || [])
  const photoFiles = media.filter((item) => item.media_type === 'image').length
  const noteRecords = records.filter((item) => item.type === 'note').length
  const ticketRecords = records.filter((item) => item.type === 'ticket').length
  const receiptRecords = records.filter((item) => item.type === 'receipt').length
  const memoSnippets = records.map((item) => cleanSnippet(item.memo)).filter(Boolean).slice(0, 2)

  const expenses = expensesRes.data || []
  let krwTotal = 0
  let unconvertedExpenses = 0
  for (const row of expenses) {
    if (row.krw_amount != null) krwTotal += Number(row.krw_amount || 0)
    else if (row.currency === 'KRW') krwTotal += Number(row.amount || 0)
    else unconvertedExpenses += 1
  }

  const timeline = timelineRes.data || []
  const visits = timeline.filter((item) => item.segment_type === 'visit')
  const moves = timeline.filter((item) => item.segment_type !== 'visit')
  const movementDistance = moves.reduce((sum, item) => sum + Number(item.distance_meters || 0), 0)
  const movementMinutes = moves.reduce((sum, item) => {
    const start = item.start_at ? new Date(item.start_at).getTime() : NaN
    const end = item.end_at ? new Date(item.end_at).getTime() : NaN
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return sum
    return sum + (end - start) / 60000
  }, 0)

  const ratingValues = [
    ...completed.map((item) => Number(item.rating || 0)),
    ...records.map((item) => Number(item.rating || 0)),
  ].filter((value) => value > 0)

  return {
    day: {
      id: day.id,
      dayNumber: day.day_number,
      tripDate: day.trip_date,
      title: day.title || '',
      memo: day.memo || '',
    },
    schedule: {
      total: schedule.length,
      plannedActive: activePlanned.length,
      completed: completed.length,
      skipped: skipped.length,
      cancelled: cancelled.length,
      completedTitles: uniqueTitles(completed),
    },
    records: {
      total: records.length,
      photoFiles,
      notes: noteRecords,
      tickets: ticketRecords,
      receipts: receiptRecords,
      memoSnippets,
    },
    expenses: {
      count: expenses.length,
      krwTotal,
      unconverted: unconvertedExpenses,
    },
    timeline: {
      available: Boolean(day.trip_date && timeline.length),
      visits: visits.length,
      moves: moves.length,
      distanceMeters: Math.round(movementDistance),
      movementMinutes: Math.round(movementMinutes),
    },
    ratings: {
      count: ratingValues.length,
      average: ratingValues.length ? ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length : null,
    },
  }
}

export function generateDayReflectionDraft(summary) {
  if (!summary?.day) return ''
  const { day, schedule, records, expenses, timeline, ratings } = summary
  const lines = []
  const dayLabel = `DAY ${day.dayNumber}`
  const titles = schedule.completedTitles || []

  if (titles.length) {
    const visible = titles.slice(0, 4)
    const moreCount = Math.max(0, schedule.completed - visible.length)
    const placeText = moreCount ? `${visible.join(', ')} 외 ${moreCount}곳` : `${visible.join(', ')} 등`
    lines.push(`${dayLabel}에는 ${placeText}을 중심으로 하루를 보냈다.`)
  } else if (schedule.total) {
    lines.push(`${dayLabel}에는 계획해둔 일정 ${schedule.total}개를 기준으로 하루를 보냈다.`)
  } else {
    lines.push(`${dayLabel}의 하루를 기록해둔다.`)
  }

  if (schedule.total) {
    const resultBits = [`완료 ${schedule.completed}개`]
    if (schedule.skipped) resultBits.push(`미방문 ${schedule.skipped}개`)
    if (schedule.cancelled) resultBits.push(`취소 ${schedule.cancelled}개`)
    lines.push(`일정은 ${resultBits.join(', ')}로 남았다.`)
  }

  const recordBits = []
  if (records.photoFiles) recordBits.push(`사진 ${records.photoFiles}장`)
  if (records.notes) recordBits.push(`메모 ${records.notes}개`)
  if (records.tickets) recordBits.push(`티켓 ${records.tickets}개`)
  if (records.receipts) recordBits.push(`영수증 ${records.receipts}개`)
  if (recordBits.length) lines.push(`기록으로는 ${recordBits.join(' · ')} 등이 남아 있다.`)

  if (timeline.available) {
    const activityBits = []
    if (timeline.visits) activityBits.push(`실제 방문 ${timeline.visits}회`)
    if (timeline.moves) activityBits.push(`이동 ${timeline.moves}구간`)
    const duration = minuteText(timeline.movementMinutes)
    const distance = distanceText(timeline.distanceMeters)
    const movementBits = [duration ? `약 ${duration}` : null, distance ? `약 ${distance}` : null].filter(Boolean)
    if (activityBits.length || movementBits.length) {
      const movementText = movementBits.length ? `, 이동량은 ${movementBits.join(' · ')}였다` : ''
      lines.push(`Google Timeline에는 ${activityBits.join(' · ')}가 남아 있고${movementText}.`)
    }
  }

  if (expenses.count) {
    if (expenses.krwTotal > 0) {
      const suffix = expenses.unconverted ? ` (환산되지 않은 외화 지출 ${expenses.unconverted}건 제외)` : ''
      lines.push(`이날 기록된 지출은 KRW 기준 ${money(expenses.krwTotal)}${suffix}였다.`)
    } else if (expenses.unconverted) {
      lines.push(`이날 외화 지출 ${expenses.unconverted}건이 기록돼 있다.`)
    }
  }

  if (ratings.count && ratings.average != null) {
    lines.push(`별점을 남긴 기록의 평균은 ${ratings.average.toFixed(1)}점이었다.`)
  }

  if (records.memoSnippets?.length) {
    lines.push(`남겨둔 메모: ${records.memoSnippets.map((memo) => `“${memo}”`).join(' / ')}`)
  }

  return lines.join('\n\n')
}

export async function saveDayReflection({ tripId, dayId, body, sourceSnapshot = {}, generatedAt = null }) {
  const text = String(body || '').trim()
  if (!text) throw new Error('회고 내용을 입력해주세요.')
  const payload = {
    trip_id: tripId,
    trip_day_id: dayId,
    body: text,
    source_snapshot: sourceSnapshot || {},
    generated_at: generatedAt || null,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('trip_on_day_reflections')
    .upsert(payload, { onConflict: 'trip_day_id' })
    .select('id, trip_id, trip_day_id, body, source_snapshot, generated_at, created_at, updated_at')
    .single()
  if (error) throw error
  return data
}

export async function deleteDayReflection(id) {
  const { error } = await supabase.from('trip_on_day_reflections').delete().eq('id', id)
  if (error) throw error
}
