import { supabase } from './supabase'

const PENDING_INVITE_KEY = 'tripon:pending-share-token'
const DIRECT_TRIP_TABLES = [
  'trip_on_trip_destinations','trip_on_trip_members','trip_on_trip_days','trip_on_scraps',
  'trip_on_itinerary_items','trip_on_reservations','trip_on_reservation_files','trip_on_prep_items',
  'trip_on_trip_info','trip_on_records','trip_on_expenses','trip_on_budgets',
  'trip_on_timeline_imports','trip_on_timeline_segments','trip_on_trip_collaborators',
]
const INDIRECT_TABLES = ['trip_on_places','trip_on_record_media','trip_on_reservation_itinerary_links','trip_on_expense_shares']

export function inviteTokenFromLocation() {
  try {
    return new URL(window.location.href).searchParams.get('share') || ''
  } catch { return '' }
}

export function rememberInviteToken(token) {
  if (!token) return
  localStorage.setItem(PENDING_INVITE_KEY, token)
}

export function pendingInviteToken() {
  return inviteTokenFromLocation() || localStorage.getItem(PENDING_INVITE_KEY) || ''
}

export function clearPendingInviteToken() {
  localStorage.removeItem(PENDING_INVITE_KEY)
  try {
    const url = new URL(window.location.href)
    url.searchParams.delete('share')
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}` || '/')
  } catch {}
}

export function buildInviteUrl(token) {
  const url = new URL(window.location.origin)
  url.searchParams.set('share', token)
  return url.toString()
}

export async function acceptTripInvite(token) {
  if (!token) throw new Error('초대 토큰이 없어요.')
  const { data, error } = await supabase.rpc('trip_on_accept_invite', { p_token: token })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.trip_id) throw new Error('초대받은 여행을 찾지 못했어요.')
  return { tripId: row.trip_id, role: row.role || 'editor' }
}

export async function fetchTripRole(tripId) {
  const { data, error } = await supabase.rpc('trip_on_trip_role', { p_trip_id: tripId })
  if (error) throw error
  return data || null
}

export async function fetchTripSharing(tripId) {
  const role = await fetchTripRole(tripId)
  const collaboratorsRes = await supabase
    .from('trip_on_trip_collaborators')
    .select('id, trip_id, user_id, user_email, role, joined_at')
    .eq('trip_id', tripId)
    .order('joined_at', { ascending: true })
  if (collaboratorsRes.error) throw collaboratorsRes.error

  let invites = []
  if (role === 'owner') {
    const invitesRes = await supabase
      .from('trip_on_trip_invites')
      .select('id, trip_id, token, role, is_active, expires_at, created_at')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false })
    if (invitesRes.error) throw invitesRes.error
    invites = invitesRes.data || []
  }

  return { role, collaborators: collaboratorsRes.data || [], invites }
}

export async function createTripInvite(tripId, role = 'editor') {
  const normalizedRole = role === 'viewer' ? 'viewer' : 'editor'
  const { data, error } = await supabase
    .from('trip_on_trip_invites')
    .insert({ trip_id: tripId, role: normalizedRole })
    .select('id, trip_id, token, role, is_active, expires_at, created_at')
    .single()
  if (error) throw error
  return { ...data, url: buildInviteUrl(data.token) }
}

export async function deactivateTripInvite(inviteId) {
  const { error } = await supabase.from('trip_on_trip_invites').update({ is_active: false }).eq('id', inviteId)
  if (error) throw error
}

export async function updateCollaboratorRole(collaboratorId, role) {
  const normalizedRole = role === 'viewer' ? 'viewer' : 'editor'
  const { error } = await supabase.from('trip_on_trip_collaborators').update({ role: normalizedRole }).eq('id', collaboratorId)
  if (error) throw error
}

export async function removeCollaborator(collaboratorId) {
  const { error } = await supabase.from('trip_on_trip_collaborators').delete().eq('id', collaboratorId)
  if (error) throw error
}

export async function leaveSharedTrip(tripId) {
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  const userId = authData.user?.id
  if (!userId) throw new Error('로그인이 필요해요.')
  const { error } = await supabase.from('trip_on_trip_collaborators').delete().eq('trip_id', tripId).eq('user_id', userId)
  if (error) throw error
}

export function subscribeToTripChanges(tripId, onChange) {
  if (!tripId || typeof onChange !== 'function') return () => {}
  const channel = supabase.channel(`trip-on:${tripId}:${Math.random().toString(36).slice(2)}`)
  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'trip_on_trips', filter: `id=eq.${tripId}` }, (payload) => onChange(payload))
  for (const table of DIRECT_TRIP_TABLES) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `trip_id=eq.${tripId}` }, (payload) => onChange(payload))
  }
  for (const table of INDIRECT_TABLES) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => onChange(payload))
  }
  channel.subscribe()
  return () => { supabase.removeChannel(channel) }
}
