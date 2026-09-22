import { supabase } from './supabase'
import { ensureTripDays } from './schedule'
import { savePlaceRecord } from './places'

export const scrapTypeLabels = {
  place: '장소',
  accommodation: '숙소',
  restaurant: '맛집',
  transport: '교통',
  link: '링크',
  reference: '참고링크',
  memo: '메모',
  other: '기타',
}

export const scrapStatusLabels = {
  saved: '저장됨',
  planned: '일정에 추가됨',
  reserved: '예약됨',
  completed: '다녀옴',
}

const PLACE_TYPES = new Set(['place', 'accommodation', 'restaurant', 'transport'])

export function isPlaceScrap(type) {
  return PLACE_TYPES.has(type)
}

export async function fetchScraps() {
  const { data, error } = await supabase
    .from('trip_on_scraps')
    .select(`
      id, trip_id, place_id, type, title, url, image_url, memo, status, created_at, updated_at,
      trip_on_trips ( id, title, cover_color, start_date, end_date ),
      trip_on_places ( id, name, city, country, address, latitude, longitude, timezone, provider, provider_place_id, map_url )
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

async function savePlace(draft) {
  if (!isPlaceScrap(draft.type)) return null
  return savePlaceRecord({
    dbId: draft.placeId || draft.mapPlace?.dbId || null,
    provider: draft.mapPlace?.provider || 'manual',
    providerPlaceId: draft.mapPlace?.providerPlaceId || null,
    mapUrl: draft.mapPlace?.mapUrl || null,
    latitude: draft.mapPlace?.latitude ?? null,
    longitude: draft.mapPlace?.longitude ?? null,
    name: draft.mapPlace?.providerPlaceId ? (draft.mapPlace.name || draft.title.trim()) : draft.title.trim(),
    city: draft.city?.trim() || draft.mapPlace?.city || null,
    country: draft.country?.trim() || draft.mapPlace?.country || null,
    address: draft.address?.trim() || draft.mapPlace?.address || null,
    timezone: draft.timezone || draft.mapPlace?.timezone || null,
    websiteUrl: draft.url?.trim() || null,
    memo: draft.memo?.trim() || null,
  })
}


export async function saveScrap(draft) {
  const place = await savePlace(draft)
  const payload = {
    trip_id: draft.tripId || null,
    place_id: place?.id || (isPlaceScrap(draft.type) ? draft.placeId || null : null),
    type: draft.type || 'place',
    title: draft.title.trim(),
    url: draft.url?.trim() || null,
    memo: draft.memo?.trim() || null,
    status: draft.status || 'saved',
    updated_at: new Date().toISOString(),
  }

  if (draft.id) {
    const { data, error } = await supabase
      .from('trip_on_scraps')
      .update(payload)
      .eq('id', draft.id)
      .select('*')
      .single()
    if (error) throw error
    return data
  }

  const { data, error } = await supabase
    .from('trip_on_scraps')
    .insert(payload)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deleteScrap(id) {
  const { error } = await supabase.from('trip_on_scraps').delete().eq('id', id)
  if (error) throw error
}

function scrapToItineraryCategory(type) {
  if (type === 'restaurant') return 'food'
  if (type === 'transport') return 'transport'
  if (type === 'accommodation') return 'accommodation'
  if (type === 'place') return 'place'
  return 'other'
}

export async function addScrapToSchedule({ scrap, trip }) {
  if (!trip?.startDate || !trip?.endDate) throw new Error('여행 날짜를 먼저 정해주세요.')
  const days = await ensureTripDays(trip)
  if (!days.length) throw new Error('여행 DAY를 만들 수 없어요.')
  return days
}

export async function commitScrapToSchedule({ scrap, trip, day }) {
  if (!day?.id) throw new Error('추가할 DAY를 선택해주세요.')

  const { data: orderRows, error: orderError } = await supabase
    .from('trip_on_itinerary_items')
    .select('sort_order')
    .eq('trip_id', trip.id)
    .eq('trip_day_id', day.id)
    .order('sort_order', { ascending: false })
    .limit(1)
  if (orderError) throw orderError

  const place = scrap.trip_on_places
  const payload = {
    trip_id: trip.id,
    trip_day_id: day.id,
    place_id: scrap.place_id || null,
    source_scrap_id: scrap.id,
    title: scrap.title,
    category: scrapToItineraryCategory(scrap.type),
    city: place?.city || null,
    is_time_unscheduled: true,
    status: 'planned',
    sort_order: ((orderRows || [])[0]?.sort_order ?? -1) + 1,
    memo: scrap.memo || null,
    start_timezone: place?.timezone || 'Asia/Seoul',
    end_timezone: place?.timezone || 'Asia/Seoul',
  }

  const { data, error } = await supabase
    .from('trip_on_itinerary_items')
    .insert(payload)
    .select('*')
    .single()
  if (error) throw error

  const { error: scrapError } = await supabase
    .from('trip_on_scraps')
    .update({ trip_id: trip.id, status: 'planned', updated_at: new Date().toISOString() })
    .eq('id', scrap.id)
  if (scrapError) throw scrapError

  return data
}
