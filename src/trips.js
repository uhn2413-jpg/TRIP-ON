import { supabase } from './supabase'

const tripSelect = `
  id,
  title,
  start_date,
  end_date,
  cover_color,
  tagline,
  cancelled,
  created_at,
  trip_destinations ( id, name, sort_order ),
  trip_members ( id, name, is_owner, sort_order )
`

function toAppTrip(row) {
  const destinations = [...(row.trip_destinations || [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => item.name)

  const companions = [...(row.trip_members || [])]
    .filter((item) => !item.is_owner)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => item.name)

  return {
    id: row.id,
    title: row.title,
    destinations,
    startDate: row.start_date,
    endDate: row.end_date,
    companions,
    coverColor: row.cover_color,
    tagline: row.tagline || '',
    cancelled: row.cancelled || false,
    createdAt: row.created_at,
  }
}

export async function fetchTrips() {
  const { data, error } = await supabase
    .from('trips')
    .select(tripSelect)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map(toAppTrip)
}

async function fetchTrip(id) {
  const { data, error } = await supabase
    .from('trips')
    .select(tripSelect)
    .eq('id', id)
    .single()

  if (error) throw error
  return toAppTrip(data)
}

export async function createTripRecord(trip, userId) {
  const { data: created, error } = await supabase
    .from('trips')
    .insert({
      user_id: userId,
      title: trip.title,
      start_date: trip.startDate || null,
      end_date: trip.endDate || null,
      cover_color: trip.coverColor,
      tagline: trip.tagline || null,
      cancelled: false,
    })
    .select('id')
    .single()

  if (error) throw error

  const tripId = created.id
  const destinations = trip.destinations.map((name, index) => ({
    trip_id: tripId,
    name,
    sort_order: index,
  }))
  const members = [
    { trip_id: tripId, name: '나', is_owner: true, sort_order: 0 },
    ...trip.companions.map((name, index) => ({
      trip_id: tripId,
      name,
      is_owner: false,
      sort_order: index + 1,
    })),
  ]

  if (destinations.length) {
    const { error: destinationError } = await supabase.from('trip_destinations').insert(destinations)
    if (destinationError) throw destinationError
  }

  const { error: memberError } = await supabase.from('trip_members').insert(members)
  if (memberError) throw memberError

  return fetchTrip(tripId)
}

export async function updateTripRecord(trip) {
  const { error } = await supabase
    .from('trips')
    .update({
      title: trip.title,
      start_date: trip.startDate || null,
      end_date: trip.endDate || null,
      cover_color: trip.coverColor,
      tagline: trip.tagline || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', trip.id)

  if (error) throw error

  const { error: deleteDestinationsError } = await supabase
    .from('trip_destinations')
    .delete()
    .eq('trip_id', trip.id)
  if (deleteDestinationsError) throw deleteDestinationsError

  if (trip.destinations.length) {
    const { error: destinationError } = await supabase
      .from('trip_destinations')
      .insert(trip.destinations.map((name, index) => ({ trip_id: trip.id, name, sort_order: index })))
    if (destinationError) throw destinationError
  }

  const { error: deleteMembersError } = await supabase
    .from('trip_members')
    .delete()
    .eq('trip_id', trip.id)
    .eq('is_owner', false)
  if (deleteMembersError) throw deleteMembersError

  if (trip.companions.length) {
    const { error: memberError } = await supabase
      .from('trip_members')
      .insert(trip.companions.map((name, index) => ({
        trip_id: trip.id,
        name,
        is_owner: false,
        sort_order: index + 1,
      })))
    if (memberError) throw memberError
  }

  return fetchTrip(trip.id)
}
