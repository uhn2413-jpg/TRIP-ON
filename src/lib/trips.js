import { supabase } from './supabase'

const tripSelect = `
  id,
  title,
  subtitle,
  start_date,
  end_date,
  cover_color,
  cover_image_url,
  status,
  completed_at,
  archive_rating,
  archive_note,
  memo,
  created_at,
  updated_at,
  trip_on_trip_destinations ( id, city, country, sort_order ),
  trip_on_trip_members ( id, name, is_me, created_at )
`

function toAppTrip(row) {
  const destinations = [...(row.trip_on_trip_destinations || [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((item) => item.country ? `${item.country} ${item.city}` : item.city)

  const companions = [...(row.trip_on_trip_members || [])]
    .filter((item) => !item.is_me)
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
    .map((item) => item.name)

  return {
    id: row.id,
    title: row.title,
    destinations,
    startDate: row.start_date,
    endDate: row.end_date,
    companions,
    coverColor: row.cover_color || '#DCEEFF',
    tagline: row.subtitle || '',
    status: row.status || 'active',
    cancelled: row.status === 'cancelled',
    completed: row.status === 'completed',
    completedAt: row.completed_at || null,
    archiveRating: row.archive_rating == null ? null : Number(row.archive_rating),
    archiveNote: row.archive_note || '',
    createdAt: row.created_at,
  }
}

export async function fetchTrips() {
  const { data, error } = await supabase
    .from('trip_on_trips')
    .select(tripSelect)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map(toAppTrip)
}

async function fetchTrip(id) {
  const { data, error } = await supabase
    .from('trip_on_trips')
    .select(tripSelect)
    .eq('id', id)
    .single()

  if (error) throw error
  return toAppTrip(data)
}

export async function createTripRecord(trip, userId) {
  const { data: created, error } = await supabase
    .from('trip_on_trips')
    .insert({
      owner_id: userId,
      title: trip.title,
      subtitle: trip.tagline || null,
      start_date: trip.startDate || null,
      end_date: trip.endDate || null,
      cover_color: trip.coverColor || '#DCEEFF',
      status: trip.cancelled ? 'cancelled' : (trip.status === 'completed' ? 'completed' : 'active'),
    })
    .select('id')
    .single()

  if (error) throw error

  const tripId = created.id

  const destinations = (trip.destinations || []).map((name, index) => ({
    owner_id: userId,
    trip_id: tripId,
    city: name,
    sort_order: index,
  }))

  const members = [
    { owner_id: userId, trip_id: tripId, name: '나', is_me: true },
    ...(trip.companions || []).map((name) => ({
      owner_id: userId,
      trip_id: tripId,
      name,
      is_me: false,
    })),
  ]

  if (destinations.length) {
    const { error: destinationError } = await supabase
      .from('trip_on_trip_destinations')
      .insert(destinations)
    if (destinationError) throw destinationError
  }

  const { error: memberError } = await supabase
    .from('trip_on_trip_members')
    .insert(members)
  if (memberError) throw memberError

  return fetchTrip(tripId)
}

export async function updateTripRecord(trip) {
  const { error } = await supabase
    .from('trip_on_trips')
    .update({
      title: trip.title,
      subtitle: trip.tagline || null,
      start_date: trip.startDate || null,
      end_date: trip.endDate || null,
      cover_color: trip.coverColor || '#DCEEFF',
      status: trip.cancelled ? 'cancelled' : (trip.status === 'completed' ? 'completed' : 'active'),
      updated_at: new Date().toISOString(),
    })
    .eq('id', trip.id)

  if (error) throw error

  const { error: deleteDestinationsError } = await supabase
    .from('trip_on_trip_destinations')
    .delete()
    .eq('trip_id', trip.id)
  if (deleteDestinationsError) throw deleteDestinationsError

  if ((trip.destinations || []).length) {
    const { error: destinationError } = await supabase
      .from('trip_on_trip_destinations')
      .insert(
        trip.destinations.map((name, index) => ({
          trip_id: trip.id,
          city: name,
          sort_order: index,
        }))
      )
    if (destinationError) throw destinationError
  }

  const { error: deleteMembersError } = await supabase
    .from('trip_on_trip_members')
    .delete()
    .eq('trip_id', trip.id)
    .eq('is_me', false)
  if (deleteMembersError) throw deleteMembersError

  if ((trip.companions || []).length) {
    const { error: memberError } = await supabase
      .from('trip_on_trip_members')
      .insert(
        trip.companions.map((name) => ({
          trip_id: trip.id,
          name,
          is_me: false,
        }))
      )
    if (memberError) throw memberError
  }

  return fetchTrip(trip.id)
}


const FILE_BUCKET = 'trip-on-files'

export async function deleteTripRecord(tripId) {
  const storagePaths = []

  const { data: records, error: recordsError } = await supabase
    .from('trip_on_records')
    .select('trip_on_record_media(storage_path)')
    .eq('trip_id', tripId)
  if (recordsError) throw recordsError

  for (const record of records || []) {
    for (const media of record.trip_on_record_media || []) {
      if (media?.storage_path) storagePaths.push(media.storage_path)
    }
  }

  const { data: reservationFiles, error: reservationFilesError } = await supabase
    .from('trip_on_reservation_files')
    .select('storage_path')
    .eq('trip_id', tripId)
  if (reservationFilesError) throw reservationFilesError
  for (const file of reservationFiles || []) {
    if (file?.storage_path) storagePaths.push(file.storage_path)
  }

  const uniquePaths = [...new Set(storagePaths)]
  for (let i = 0; i < uniquePaths.length; i += 100) {
    const chunk = uniquePaths.slice(i, i + 100)
    if (!chunk.length) continue
    const { error: storageError } = await supabase.storage.from(FILE_BUCKET).remove(chunk)
    if (storageError) throw storageError
  }

  const { error } = await supabase
    .from('trip_on_trips')
    .delete()
    .eq('id', tripId)

  if (error) throw error
}
