import { supabase } from './supabase'

export function placeFromRow(row) {
  if (!row) return null
  return {
    dbId: row.id,
    provider: row.provider || 'manual',
    providerPlaceId: row.provider_place_id || '',
    name: row.name || '',
    city: row.city || '',
    country: row.country || '',
    address: row.address || '',
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    timezone: row.timezone || '',
    mapUrl: row.map_url || '',
    websiteUrl: row.website_url || '',
  }
}

export async function savePlaceRecord(place) {
  if (!place?.name?.trim()) return null
  const payload = {
    name: place.name.trim(),
    city: place.city?.trim() || null,
    country: place.country?.trim() || null,
    address: place.address?.trim() || null,
    latitude: place.latitude == null || place.latitude === '' ? null : Number(place.latitude),
    longitude: place.longitude == null || place.longitude === '' ? null : Number(place.longitude),
    timezone: place.timezone || null,
    website_url: place.websiteUrl?.trim() || null,
    memo: place.memo?.trim() || null,
    provider: place.provider || 'manual',
    provider_place_id: place.providerPlaceId || null,
    map_url: place.mapUrl || null,
    updated_at: new Date().toISOString(),
  }

  if (place.dbId) {
    const { data, error } = await supabase.from('trip_on_places').update(payload).eq('id', place.dbId).select('*').single()
    if (error) throw error
    return data
  }

  if (payload.provider_place_id) {
    const { data: existing, error: findError } = await supabase
      .from('trip_on_places')
      .select('*')
      .eq('provider', payload.provider)
      .eq('provider_place_id', payload.provider_place_id)
      .maybeSingle()
    if (findError) throw findError
    if (existing) {
      const { data, error } = await supabase.from('trip_on_places').update(payload).eq('id', existing.id).select('*').single()
      if (error) throw error
      return data
    }
  }

  const { data, error } = await supabase.from('trip_on_places').insert(payload).select('*').single()
  if (error) throw error
  return data
}

function addPoint(map, source) {
  const place = source.trip_on_places
  if (!place || place.latitude == null || place.longitude == null) return
  const key = place.id
  if (!map.has(key)) {
    map.set(key, {
      id: place.id,
      name: place.name,
      city: place.city,
      country: place.country,
      address: place.address,
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
      timezone: place.timezone,
      provider: place.provider,
      providerPlaceId: place.provider_place_id,
      mapUrl: place.map_url,
      tripId: source.trip_id || source.trip_on_trips?.id || null,
      tripTitle: source.trip_on_trips?.title || '',
      tripColor: source.trip_on_trips?.cover_color || '#DCEEFF',
      sources: [],
    })
  }
  map.get(key).sources.push(source._mapSource)
}

export async function fetchTripMapPoints(tripId) {
  const [itemsRes, scrapsRes] = await Promise.all([
    supabase.from('trip_on_itinerary_items').select(`
      id, trip_id, trip_day_id, title, status, sort_order, start_at, is_time_unscheduled,
      trip_on_trip_days ( id, day_number, trip_date ),
      trip_on_places ( id, name, city, country, address, latitude, longitude, timezone, provider, provider_place_id, map_url )
    `).eq('trip_id', tripId),
    supabase.from('trip_on_scraps').select(`
      id, trip_id, title, type, status,
      trip_on_places ( id, name, city, country, address, latitude, longitude, timezone, provider, provider_place_id, map_url )
    `).eq('trip_id', tripId),
  ])
  if (itemsRes.error) throw itemsRes.error
  if (scrapsRes.error) throw scrapsRes.error

  const points = new Map()
  for (const item of itemsRes.data || []) {
    addPoint(points, { ...item, _mapSource: { kind: 'schedule', id: item.id, title: item.title, status: item.status, day: item.trip_on_trip_days } })
  }
  for (const scrap of scrapsRes.data || []) {
    addPoint(points, { ...scrap, _mapSource: { kind: 'scrap', id: scrap.id, title: scrap.title, status: scrap.status, type: scrap.type } })
  }
  return [...points.values()]
}

export async function fetchAllMapPoints() {
  const [itemsRes, scrapsRes] = await Promise.all([
    supabase.from('trip_on_itinerary_items').select(`
      id, trip_id, title, status,
      trip_on_trips ( id, title, cover_color ),
      trip_on_places ( id, name, city, country, address, latitude, longitude, timezone, provider, provider_place_id, map_url )
    `).not('place_id', 'is', null),
    supabase.from('trip_on_scraps').select(`
      id, trip_id, title, type, status,
      trip_on_trips ( id, title, cover_color ),
      trip_on_places ( id, name, city, country, address, latitude, longitude, timezone, provider, provider_place_id, map_url )
    `).not('trip_id', 'is', null).not('place_id', 'is', null),
  ])
  if (itemsRes.error) throw itemsRes.error
  if (scrapsRes.error) throw scrapsRes.error
  const points = new Map()
  for (const item of itemsRes.data || []) {
    addPoint(points, { ...item, _mapSource: { kind: 'schedule', id: item.id, title: item.title, status: item.status } })
  }
  for (const scrap of scrapsRes.data || []) {
    addPoint(points, { ...scrap, _mapSource: { kind: 'scrap', id: scrap.id, title: scrap.title, status: scrap.status, type: scrap.type } })
  }
  return [...points.values()]
}

export function scheduleItemsToMapPoints(items = []) {
  const points = []
  const seen = new Set()
  for (const item of items) {
    const place = item.trip_on_places
    if (!place || place.latitude == null || place.longitude == null) continue
    const key = `${place.id}:${item.id}`
    if (seen.has(key)) continue
    seen.add(key)
    points.push({
      id: key,
      placeId: place.id,
      name: place.name || item.title,
      city: place.city,
      country: place.country,
      address: place.address,
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
      mapUrl: place.map_url,
      sources: [{ kind: 'schedule', id: item.id, title: item.title, status: item.status }],
    })
  }
  return points
}
