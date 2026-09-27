import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  CircleUserRound,
  ClipboardCheck,
  Cloud,
  CloudDownload,
  Database,
  Download,
  FileText,
  Home,
  ImagePlus,
  LogIn,
  LogOut,
  MapPin,
  MapPinned,
  MoreHorizontal,
  NotebookTabs,
  Paperclip,
  Palette,
  Plus,
  Settings,
  Star,
  Ticket,
  Upload,
  UploadCloud,
  WalletCards,
  Clock,
  Navigation,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Save,
  Layers3,
  BedDouble,
  Link2,
  Unlink,
  Share2,
  Eye,
  EyeOff,
  Copy,
  Heart,
  CheckCircle2,
  CircleHelp,
  XCircle,
} from 'lucide-react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { createTripRecord, deleteTripRecord, duplicateTripRecord, fetchTrip, fetchTrips, removeTripCover, updateTripRecord, uploadTripCover } from './lib/trips'
import { expenseKrw, fetchExpenseData } from './lib/expenses'
import PrepTab from './components/PrepTab'
import RecordTab from './components/RecordTab'
import RatingSlider from './components/RatingSlider'
import ExpenseTab from './components/ExpenseTab'
import ScrapTab from './components/ScrapTab'
import PlaceSearchField from './components/PlaceSearchField'
import { AllTripsMap, DayMapSheet, MapCanvas, TripMapSheet } from './components/TravelMap'
import SheetBackdrop, { confirmSheetClose } from './components/SheetBackdrop'
import ArchiveOverview from './components/ArchiveOverview'
import ShareTripSheet from './components/ShareTripSheet'
import OfflineSaveSheet from './components/OfflineSaveSheet'
import { OfflineLibraryScreen, OfflineTripDetail } from './components/OfflineTravel'
import { placeFromRow } from './lib/places'
import { externalMapLabel, externalMapUrl } from './lib/mapProviders'
import { commitScrapToSchedule, fetchScheduleCandidateScraps, getScrapTags, removeScrapScheduleCandidate, setScrapScheduleCandidate, toggleScrapWish } from './lib/scraps'
import { loadAppPreferences, saveAppPreferences } from './lib/preferences'
import { buildKoreaDestination, formatKoreaSggName, koreaSggOptions, koreaSidoOptions, loadKoreaDongOptions, parseKoreaDestination } from './lib/koreaRegions'
import { downloadTripOnBackup, downloadTripOnFullBackup, fetchTimelineImportHistory, restoreTripOnBackup } from './lib/dataBackup'
import { acceptTripInvite, clearPendingInviteToken, inviteTokenFromLocation, pendingInviteToken, rememberInviteToken, subscribeToTripChanges } from './lib/sharing'
import { listOfflineTripCards, syncSavedOfflineTrips } from './lib/offlineTrips'
import { fetchTimelineDayTravelSummary } from './lib/archive'
import { buildTripCalendar, downloadCalendarFile, fetchCalendarExportData, shareCalendarFile } from './lib/calendarExport'
import {
  DEFAULT_TIMEZONE,
  dateInZone,
  deleteItineraryItem,
  dissolveVisitGroup,
  fetchSchedule,
  isTimelineActualItem,
  linkActualToPlan,
  moveItineraryItem,
  removeItemFromVisitGroup,
  replacePlanActualLinks,
  saveItineraryItem,
  updatePlanLinkDisplayMode,
  saveVisitGroup,
  timeInZone,
  updateDayMemo,
  updateItineraryStatus,
  setItineraryVote,
} from './lib/schedule'

const LOCAL_KEY = 'tripon:v0.4:trips'
const LEGACY_KEYS = ['tripon:v0.3:trips', 'tripon:v0.2:trips', 'tripon:v0.1:trips']
const PENDING_SHARE_TARGET_KEY = 'tripon:pending-share-target'

const extractSharedUrl = (text = '') => {
  const match = String(text).match(/https?:\/\/[^\s]+/i)
  return match ? match[0].replace(/[),.;!?]+$/, '') : ''
}

const normalizeIncomingShareTarget = ({ title = '', text = '', url = '' } = {}) => {
  const cleanTitle = String(title || '').trim()
  const cleanText = String(text || '').trim()
  const cleanUrl = String(url || '').trim() || extractSharedUrl(cleanText)
  const cleanMemo = cleanUrl ? cleanText.replace(cleanUrl, '').trim() : cleanText
  let fallbackTitle = cleanTitle
  if (!fallbackTitle && cleanUrl) {
    try { fallbackTitle = new URL(cleanUrl).hostname.replace(/^www\./, '') } catch { fallbackTitle = '공유한 링크' }
  }
  if (!fallbackTitle) fallbackTitle = cleanMemo.slice(0, 70) || '공유한 항목'
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    format: cleanUrl ? 'link' : 'memo',
    title: fallbackTitle,
    url: cleanUrl,
    memo: cleanMemo,
  }
}

const loadPendingShareTarget = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_SHARE_TARGET_KEY))
    return parsed?.id ? parsed : null
  } catch { return null }
}

const rememberPendingShareTarget = (draft) => {
  if (!draft?.id) return
  try { localStorage.setItem(PENDING_SHARE_TARGET_KEY, JSON.stringify(draft)) } catch { /* ignore */ }
}

const clearPendingShareTarget = () => {
  try { localStorage.removeItem(PENDING_SHARE_TARGET_KEY) } catch { /* ignore */ }
}

const coverPalette = [
  { name: '소다', value: '#DCEEFF' },
  { name: '블루', value: '#CFDDF8' },
  { name: '라일락', value: '#E3DAFF' },
  { name: '라벤더', value: '#D8D3F2' },
  { name: '민트', value: '#D9F1E7' },
  { name: '아쿠아', value: '#D8F0F2' },
  { name: '세이지', value: '#E2ECD9' },
  { name: '버터', value: '#F7EABC' },
  { name: '피치', value: '#FFE0D0' },
  { name: '살구', value: '#F7D6BA' },
  { name: '블러시', value: '#F5D6DF' },
  { name: '로즈', value: '#EBCBD9' },
]

const legacyCoverMap = {
  'cover-sand': '#FFE0B5',
  'cover-sky': '#DCEEFF',
  'cover-sage': '#DDEBCB',
  'cover-lilac': '#DED7FF',
  'cover-sunset': '#FFD8C8',
}

const createId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`

const normalizeTrip = (trip) => {
  const startDate = trip.startDate || null
  const endDate = trip.endDate || null
  const exactDuration = startDate && endDate
    ? Math.max(1, Math.round((new Date(`${endDate}T00:00:00Z`) - new Date(`${startDate}T00:00:00Z`)) / 86400000) + 1)
    : null
  return {
    ...trip,
    destinations: Array.isArray(trip.destinations) ? trip.destinations : [],
    companions: Array.isArray(trip.companions) ? trip.companions : [],
    coverColor: trip.coverColor || legacyCoverMap[trip.cover] || coverPalette[0].value,
    coverImagePath: trip.coverImagePath || null,
    coverImageUrl: trip.coverImageUrl || null,
    datePrecision: trip.datePrecision || (startDate && endDate ? 'exact' : 'tbd'),
    approxYear: trip.approxYear == null ? null : Number(trip.approxYear),
    approxMonth: trip.approxMonth == null ? null : Number(trip.approxMonth),
    durationDays: trip.durationDays == null ? exactDuration : Number(trip.durationDays),
  }
}

const loadLocalTrips = () => {
  for (const key of [LOCAL_KEY, ...LEGACY_KEYS]) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key))
      if (Array.isArray(parsed) && parsed.length) return parsed.map(normalizeTrip)
    } catch { /* ignore */ }
  }
  return []
}

const clearLocalTrips = () => {
  for (const key of [LOCAL_KEY, ...LEGACY_KEYS]) localStorage.removeItem(key)
}

const tripImportFingerprint = (trip) => {
  const normalized = normalizeTrip(trip)
  const clean = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
  return JSON.stringify({
    title: clean(normalized.title),
    startDate: normalized.startDate || null,
    endDate: normalized.endDate || null,
    datePrecision: normalized.datePrecision || 'tbd',
    approxYear: normalized.approxYear || null,
    approxMonth: normalized.approxMonth || null,
    durationDays: normalized.durationDays || null,
    destinations: (normalized.destinations || []).map(clean),
  })
}

const pendingLocalTrips = (remoteTrips = []) => {
  const remoteFingerprints = new Set(remoteTrips.map(tripImportFingerprint))
  return loadLocalTrips().filter((trip) => !remoteFingerprints.has(tripImportFingerprint(trip)))
}

const formatDate = (date) => {
  if (!date) return ''
  const d = new Date(`${date}T00:00:00`)
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`
}

const nightsAndDays = (start, end) => {
  if (!start || !end) return '날짜 미정'
  const a = new Date(`${start}T00:00:00`)
  const b = new Date(`${end}T00:00:00`)
  const days = Math.max(1, Math.round((b - a) / 86400000) + 1)
  return `${days - 1}박 ${days}일`
}

const durationLabel = (trip) => {
  const days = Number(trip?.durationDays || 0)
  if (days > 0) return days === 1 ? '당일치기' : `${days - 1}박 ${days}일`
  return trip?.startDate && trip?.endDate ? nightsAndDays(trip.startDate, trip.endDate) : '기간 미정'
}

const tripDateLabel = (trip) => {
  const normalized = normalizeTrip(trip)
  if (normalized.datePrecision === 'exact' && normalized.startDate && normalized.endDate) {
    return `${formatDate(normalized.startDate)} — ${formatDate(normalized.endDate)}`
  }
  if (normalized.datePrecision === 'month' && normalized.approxYear && normalized.approxMonth) {
    return `${normalized.approxYear}년 ${normalized.approxMonth}월 예정`
  }
  if (normalized.datePrecision === 'year' && normalized.approxYear) return `${normalized.approxYear}년 예정`
  return '날짜 미정'
}

const tripDateDurationLabel = (trip) => {
  const date = tripDateLabel(trip)
  const duration = durationLabel(trip)
  return duration === '기간 미정' ? date : `${date} · ${duration}`
}

const tripSortKey = (trip) => {
  const normalized = normalizeTrip(trip)
  if (normalized.startDate) return normalized.startDate
  if (normalized.approxYear && normalized.approxMonth) return `${normalized.approxYear}-${String(normalized.approxMonth).padStart(2, '0')}-99`
  if (normalized.approxYear) return `${normalized.approxYear}-99-99`
  return '9999-99-99'
}

const getTripState = (trip) => {
  if (trip.cancelled) return 'cancelled'
  if (trip.status === 'completed' || trip.completed) return 'completed'
  if (!trip.startDate || !trip.endDate) return 'planning'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(`${trip.startDate}T00:00:00`)
  const end = new Date(`${trip.endDate}T23:59:59`)
  if (today < start) return 'upcoming'
  if (today <= end) return 'ongoing'
  return 'past'
}

const getDday = (trip) => {
  if (!trip.startDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(`${trip.startDate}T00:00:00`)
  const diff = Math.ceil((start - today) / 86400000)
  if (diff > 0) return `D-${diff}`
  if (diff === 0) return 'D-DAY'
  return null
}

const getTextColor = (hex = '#DCEEFF') => {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return '#24231f'
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.62 ? '#24231f' : '#ffffff'
}

const coverStyle = (trip) => {
  const normalized = normalizeTrip(trip)
  const backgroundColor = normalized.coverColor
  if (normalized.coverImageUrl) {
    return {
      backgroundColor,
      backgroundImage: `linear-gradient(rgba(20,22,26,.38), rgba(20,22,26,.45)), url("${normalized.coverImageUrl}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      color: '#ffffff',
    }
  }
  return { backgroundColor, color: getTextColor(backgroundColor) }
}

function App() {
  const remoteMode = isSupabaseConfigured
  const [tab, setTab] = useState('home')
  const [trips, setTrips] = useState(() => remoteMode ? [] : loadLocalTrips())
  const [selectedTripId, setSelectedTripId] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editingTrip, setEditingTrip] = useState(null)
  const [colorEditingTrip, setColorEditingTrip] = useState(null)
  const [duplicatingTrip, setDuplicatingTrip] = useState(null)
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(!remoteMode)
  const [loading, setLoading] = useState(remoteMode)
  const [inviteConnecting, setInviteConnecting] = useState(false)
  const [message, setMessage] = useState('')
  const [incomingShareTarget, setIncomingShareTarget] = useState(() => loadPendingShareTarget())
  const [preferences, setPreferences] = useState(() => loadAppPreferences())
  const [offlineTrips, setOfflineTrips] = useState([])
  const [offlineReady, setOfflineReady] = useState(false)
  const [offlineMode, setOfflineMode] = useState(false)
  const [offlineSelectedTripId, setOfflineSelectedTripId] = useState(null)
  const [offlineSaveTrip, setOfflineSaveTrip] = useState(null)
  const historyReadyRef = useRef(false)
  const offlineSyncRunningRef = useRef(false)
  const inviteHandledRef = useRef('')

  const refreshOfflineTrips = async () => {
    try {
      const rows = await listOfflineTripCards()
      setOfflineTrips(rows)
      return rows
    } catch {
      setOfflineTrips([])
      return []
    } finally {
      setOfflineReady(true)
    }
  }

  useEffect(() => { refreshOfflineTrips() }, [])

  const reloadRemoteTrips = async () => {
    if (!remoteMode || !session) return []
    const rows = await fetchTrips()
    setTrips(rows)
    setOfflineMode(false)
    return rows
  }

  const runOfflineAutoSync = async ({ sourceTrips = trips, force = false, notify = false } = {}) => {
    if (!remoteMode || !session || !navigator.onLine || !preferences.offlineAutoSync || offlineSyncRunningRef.current) return null
    offlineSyncRunningRef.current = true
    try {
      const result = await syncSavedOfflineTrips({
        trips: sourceTrips,
        wifiOnlyAttachments: preferences.offlineWifiOnlyAttachments,
        force,
      })
      await refreshOfflineTrips()
      if (notify && result?.synced) {
        if (result.pendingFiles) setMessage(`오프라인 여행 ${result.synced}개 데이터를 최신화했어요. 첨부 ${result.pendingFiles}개는 Wi-Fi 업데이트를 기다리고 있어요.`)
        else setMessage(`오프라인 여행 ${result.synced}개를 최신 상태로 동기화했어요.`)
      } else if (notify && result?.failed) {
        setMessage(`오프라인 자동 동기화 중 ${result.failed}개 여행을 업데이트하지 못했어요.`)
      }
      return result
    } finally {
      offlineSyncRunningRef.current = false
    }
  }


  useEffect(() => {
    if (!remoteMode || !session?.user?.id || !navigator.onLine || !preferences.offlineAutoSync || !trips.length) return
    runOfflineAutoSync({ sourceTrips: trips, force: false, notify: false }).catch(() => {})
  }, [remoteMode, session?.user?.id, trips.length, preferences.offlineAutoSync, preferences.offlineWifiOnlyAttachments])

  useEffect(() => {
    if (!remoteMode) return undefined
    const handleOnline = async () => {
      if (!session?.user?.id || !preferences.offlineAutoSync) return
      try {
        const rows = await reloadRemoteTrips()
        await runOfflineAutoSync({ sourceTrips: rows, force: true, notify: true })
      } catch (error) {
        setMessage(`인터넷은 연결됐지만 오프라인 저장본을 최신화하지 못했어요: ${error.message}`)
      }
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [remoteMode, session?.user?.id, preferences.offlineAutoSync, preferences.offlineWifiOnlyAttachments])

  const historyState = (layer = 'root', extra = {}) => ({
    ...(history.state && typeof history.state === 'object' ? history.state : {}),
    tripOnApp: true,
    tripOnLayer: layer,
    tripOnTab: tab,
    ...extra,
  })

  const changeTab = (nextTab) => {
    if (nextTab === tab && !selectedTripId) return
    history.pushState(historyState('root', { tripOnTab: nextTab, tripOnTripId: null, tripOnSheet: undefined }), '', location.href)
    setSelectedTripId(null)
    setTab(nextTab)
  }

  const openTrip = (tripId) => {
    history.pushState(historyState('trip', { tripOnTripId: tripId, tripOnSheet: undefined }), '', location.href)
    setSelectedTripId(tripId)
  }

  const closeTrip = () => {
    if (history.state?.tripOnApp && history.state?.tripOnLayer === 'trip') history.back()
    else setSelectedTripId(null)
  }

  useEffect(() => {
    document.documentElement.dataset.triponMotion = preferences.pageTransitions ? 'on' : 'off'
  }, [preferences.pageTransitions])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      const resolved = preferences.theme === 'system' ? (media.matches ? 'dark' : 'light') : preferences.theme
      document.documentElement.dataset.triponTheme = resolved
      document.documentElement.style.colorScheme = resolved
    }
    applyTheme()
    media.addEventListener?.('change', applyTheme)
    return () => media.removeEventListener?.('change', applyTheme)
  }, [preferences.theme])

  const updatePreferences = (patch) => {
    setPreferences((current) => saveAppPreferences({ ...current, ...patch }))
  }

  useEffect(() => {
    const token = inviteTokenFromLocation()
    if (token) rememberInviteToken(token)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('share_target') !== '1') return
    const draft = normalizeIncomingShareTarget({
      title: params.get('title') || '',
      text: params.get('text') || '',
      url: params.get('url') || '',
    })
    rememberPendingShareTarget(draft)
    setIncomingShareTarget(draft)
    params.delete('share_target')
    params.delete('title')
    params.delete('text')
    params.delete('url')
    const nextQuery = params.toString()
    const cleanUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`
    history.replaceState(history.state, '', cleanUrl)
  }, [])

  useEffect(() => {
    if (!remoteMode) return
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthReady(true)
    })
    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [remoteMode])

  useEffect(() => {
    if (remoteMode && (!authReady || !session)) return

    if (!historyReadyRef.current) {
      const current = history.state && typeof history.state === 'object' ? history.state : {}
      history.replaceState({ ...current, tripOnApp: true, tripOnLayer: 'root', tripOnTab: tab, tripOnTripId: null, tripOnSheet: undefined }, '', location.href)
      historyReadyRef.current = true
    }

    const handlePopState = (event) => {
      const state = event.state
      if (!state?.tripOnApp) return
      setTab(state.tripOnTab || 'home')
      setSelectedTripId(state.tripOnLayer === 'trip' ? state.tripOnTripId || null : null)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [remoteMode, authReady, session])

  useEffect(() => {
    if (!remoteMode) {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(trips))
      return
    }
    if (!session) {
      setTrips([])
      setLoading(false)
      return
    }

    // 공유 링크로 OAuth에서 돌아온 직후에는 초대 수락이 먼저 끝나야 한다.
    // 일반 여행 목록 로드와 초대 RPC가 동시에 실행되면 인증 세션이 안정되기 전
    // 일시적인 fetch/RPC 오류가 사용자에게 먼저 보일 수 있다.
    const pendingToken = pendingInviteToken()
    if (pendingToken && inviteHandledRef.current !== pendingToken) return

    setLoading(true)
    reloadRemoteTrips()
      .catch(async (error) => {
        if (!navigator.onLine) {
          const saved = await refreshOfflineTrips()
          setOfflineMode(true)
          setMessage(saved.length ? '인터넷 연결이 없어 오프라인 여행함을 열었어요.' : '인터넷 연결이 없고 저장된 오프라인 여행도 없어요.')
          return
        }
        setMessage(`여행을 불러오지 못했어요: ${error.message}`)
      })
      .finally(() => setLoading(false))
  }, [remoteMode, session])

  useEffect(() => {
    if (!remoteMode || !session?.user?.id) return
    const token = pendingInviteToken()
    if (!token || inviteHandledRef.current === token) return
    let alive = true
    ;(async () => {
      try {
        setMessage('')
        setInviteConnecting(true)
        setLoading(true)
        let accepted = null
        let lastError = null
        for (let attempt = 0; attempt < 3 && alive; attempt += 1) {
          try {
            accepted = await acceptTripInvite(token)
            break
          } catch (error) {
            lastError = error
            const message = String(error?.message || '')
            if (/유효하지 않|만료|초대 토큰이 없/.test(message) || attempt === 2) throw error
            await new Promise((resolve) => setTimeout(resolve, 650 + attempt * 500))
          }
        }
        if (!alive || !accepted) {
          if (lastError) throw lastError
          return
        }
        clearPendingInviteToken()
        inviteHandledRef.current = token
        const rows = await reloadRemoteTrips()
        if (!alive) return
        const sharedTrip = rows.find((item) => item.id === accepted.tripId)
        setTab('trips')
        setSelectedTripId(accepted.tripId)
        const current = history.state && typeof history.state === 'object' ? history.state : {}
        history.replaceState({ ...current, tripOnApp: true, tripOnLayer: 'trip', tripOnTab: 'trips', tripOnTripId: accepted.tripId, tripOnSheet: undefined }, '', location.href)
        setMessage(sharedTrip ? `“${sharedTrip.title}” 공유 여행에 참여했어요.` : '공유 여행에 참여했어요.')
      } catch (error) {
        inviteHandledRef.current = ''
        if (alive) {
          const raw = String(error?.message || '')
          const userMessage = /유효하지 않|만료|초대 토큰이 없/.test(raw)
            ? raw
            : '공유 여행 연결이 잠시 지연되고 있어요. 잠시 후 다시 열어 주세요.'
          setMessage(`초대 링크를 열지 못했어요: ${userMessage}`)
        }
      } finally {
        if (alive) {
          setInviteConnecting(false)
          setLoading(false)
        }
      }
    })()
    return () => { alive = false }
  }, [remoteMode, session?.user?.id])

  useEffect(() => {
    if (!incomingShareTarget?.id) return
    if (remoteMode && (!authReady || !session)) return
    if (pendingInviteToken()) return
    setSelectedTripId(null)
    setTab('scrap')
    if (historyReadyRef.current) {
      const current = history.state && typeof history.state === 'object' ? history.state : {}
      history.replaceState({ ...current, tripOnApp: true, tripOnLayer: 'root', tripOnTab: 'scrap', tripOnTripId: null, tripOnSheet: undefined }, '', location.href)
    }
  }, [incomingShareTarget?.id, remoteMode, authReady, session?.user?.id])

  const consumeIncomingShareTarget = () => {
    clearPendingShareTarget()
    setIncomingShareTarget(null)
  }

  const selectedTrip = trips.find((t) => t.id === selectedTripId)

  const saveTrip = async (draft) => {
    try {
      setMessage('')
      let saved
      if (remoteMode) {
        saved = draft.id
          ? await updateTripRecord(draft)
          : await createTripRecord(draft, session.user.id)
        setTrips((prev) => draft.id
          ? prev.map((item) => item.id === saved.id ? saved : item)
          : [saved, ...prev])
      } else {
        saved = { ...draft, id: draft.id || createId(), createdAt: draft.createdAt || new Date().toISOString() }
        setTrips((prev) => draft.id
          ? prev.map((item) => item.id === saved.id ? saved : item)
          : [saved, ...prev])
      }
      const isNewTrip = !draft.id
      if (isNewTrip && saved?.id) {
        const current = history.state && typeof history.state === 'object' ? history.state : {}
        history.replaceState({ ...current, tripOnApp: true, tripOnLayer: 'trip', tripOnTab: tab, tripOnTripId: saved.id, tripOnSheet: undefined }, '', location.href)
        setSelectedTripId(saved.id)
      }
      setShowCreate(false)
      setEditingTrip(null)
    } catch (error) {
      setMessage(`저장하지 못했어요: ${error.message}`)
    }
  }

  const duplicateTrip = async (sourceTrip, draft, options) => {
    if (!remoteMode || !session?.user?.id) throw new Error('로그인이 필요해요.')
    const created = await duplicateTripRecord(sourceTrip.id, draft, session.user.id, options)
    const normalized = normalizeTrip(created)
    setTrips((prev) => [normalized, ...prev])
    setDuplicatingTrip(null)
    const current = history.state && typeof history.state === 'object' ? history.state : {}
    history.pushState({ ...current, tripOnApp: true, tripOnLayer: 'trip', tripOnTab: 'trips', tripOnTripId: normalized.id, tripOnSheet: undefined }, '', location.href)
    setTab('trips')
    setSelectedTripId(normalized.id)
    setMessage('새 여행 초안을 만들었어요.')
    return normalized
  }

  const importLocalTrips = async () => {
    if (!remoteMode || !session) return
    const locals = loadLocalTrips()
    const pending = pendingLocalTrips(trips)
    if (!locals.length) {
      setMessage('가져올 로컬 여행이 없어요.')
      return
    }
    if (!pending.length) {
      clearLocalTrips()
      setMessage('이미 가져온 로컬 여행이에요. 중복 백업을 정리했어요.')
      return
    }
    try {
      setLoading(true)
      const imported = []
      for (const trip of pending) {
        const copy = { ...trip, id: undefined, createdAt: undefined }
        imported.push(await createTripRecord(copy, session.user.id))
      }
      setTrips((prev) => [...imported, ...prev])
      clearLocalTrips()
      const skipped = locals.length - pending.length
      setMessage(skipped > 0
        ? `${imported.length}개를 가져왔고, 이미 있던 ${skipped}개는 건너뛰었어요. 로컬 백업도 정리했어요.`
        : `${imported.length}개의 로컬 여행을 가져왔어요. 로컬 백업도 정리했어요.`)
    } catch (error) {
      setMessage(`가져오기 중 문제가 생겼어요: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const deleteTrip = async (trip) => {
    if (!trip?.id) return
    const confirmed = window.confirm(`“${trip.title}” 여행을 삭제할까요?\n\n일정·예약·기록·지출·실제 동선까지 함께 삭제되며 되돌릴 수 없어요.`)
    if (!confirmed) return
    try {
      setLoading(true)
      if (remoteMode) await deleteTripRecord(trip.id)
      setTrips((prev) => prev.filter((item) => item.id !== trip.id))
      setEditingTrip(null)
      setColorEditingTrip(null)
      setSelectedTripId(null)
      setTab('trips')
      const current = history.state && typeof history.state === 'object' ? history.state : {}
      history.replaceState({ ...current, tripOnApp: true, tripOnLayer: 'root', tripOnTab: 'trips', tripOnTripId: null, tripOnSheet: undefined }, '', location.href)
      setMessage('여행을 삭제했어요.')
    } catch (error) {
      setMessage(`여행을 삭제하지 못했어요: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  if (offlineSelectedTripId) return <OfflineTripDetail tripId={offlineSelectedTripId} onBack={() => setOfflineSelectedTripId(null)} />
  if (remoteMode && authReady && !session && !navigator.onLine && !offlineReady) return <LoadingScreen text="오프라인 여행함을 확인하고 있어요" />
  if (offlineMode || (remoteMode && authReady && !session && !navigator.onLine && offlineReady)) {
    return <OfflineLibraryScreen trips={offlineTrips} onOpen={setOfflineSelectedTripId} onTryOnline={() => { if (navigator.onLine) window.location.reload(); else window.alert('아직 인터넷 연결이 없어요.') }} />
  }
  if (remoteMode && !authReady) return <LoadingScreen text="로그인 상태를 확인하고 있어요" />
  if (remoteMode && !session) return <AuthScreen message={message} setMessage={setMessage} />
  if (inviteConnecting) return <LoadingScreen text="공유 여행에 연결 중이에요" />
  if (loading && trips.length === 0) return <LoadingScreen text="여행을 불러오고 있어요" />

  if (selectedTrip) {
    return (
      <>
        <TripDetail
          trip={selectedTrip}
          onBack={closeTrip}
          onEdit={() => setEditingTrip(selectedTrip)}
          onDelete={() => deleteTrip(selectedTrip)}
          onColorEdit={() => setColorEditingTrip(selectedTrip)}
          onDuplicate={() => setDuplicatingTrip(selectedTrip)}
          onTripRefresh={async () => {
            try {
              const updated = await fetchTrip(selectedTrip.id)
              setTrips((prev) => prev.map((item) => item.id === updated.id ? normalizeTrip(updated) : item))
              return updated
            } catch {
              try {
                const rows = await reloadRemoteTrips()
                if (!rows.some((item) => item.id === selectedTrip.id)) {
                  setSelectedTripId(null)
                  setTab('trips')
                  setMessage('이 여행의 공유 권한이 종료되었어요.')
                }
              } catch { /* 다음 화면 갱신 때 다시 확인 */ }
              return null
            }
          }}
          onLeaveShared={async () => {
            setSelectedTripId(null)
            setTab('trips')
            await reloadRemoteTrips().catch(() => {})
          }}
          onTripUpdated={(updated) => setTrips((prev) => prev.map((item) => item.id === updated.id ? normalizeTrip(updated) : item))}
          onOfflineSaved={refreshOfflineTrips}
          preferences={preferences}
          onPreferencesChange={updatePreferences}
        />
        {editingTrip && (
          <TripEditorModal
            initialTrip={editingTrip}
            onClose={() => setEditingTrip(null)}
            onSave={saveTrip}
          />
        )}
        {colorEditingTrip && (
          <CoverEditorModal
            trip={colorEditingTrip}
            onClose={() => setColorEditingTrip(null)}
            onSaveColor={async (coverColor) => {
              const updated = await updateTripRecord({ ...colorEditingTrip, coverColor })
              setTrips((prev) => prev.map((item) => item.id === updated.id ? normalizeTrip(updated) : item))
              setColorEditingTrip(null)
            }}
            onUploadPhoto={async (file) => {
              const updated = await uploadTripCover(colorEditingTrip.id, file)
              setTrips((prev) => prev.map((item) => item.id === updated.id ? normalizeTrip(updated) : item))
              setColorEditingTrip(normalizeTrip(updated))
            }}
            onRemovePhoto={async () => {
              const updated = await removeTripCover(colorEditingTrip.id)
              setTrips((prev) => prev.map((item) => item.id === updated.id ? normalizeTrip(updated) : item))
              setColorEditingTrip(normalizeTrip(updated))
            }}
          />
        )}
        {duplicatingTrip && (
          <DuplicateTripModal
            trip={duplicatingTrip}
            onClose={() => setDuplicatingTrip(null)}
            onDuplicate={(draft, options) => duplicateTrip(duplicatingTrip, draft, options)}
          />
        )}
        {message && <Toast message={message} onClose={() => setMessage('')} />}
      </>
    )
  }

  return (
    <div className="app-shell">
      <DesktopNav tab={tab} setTab={changeTab} />
      <BrandHeader compact root />
      <main key={tab} className={`page root-page root-tab-${tab}`}>
        {tab === 'home' && <HomeScreen trips={trips} onOpenTrip={openTrip} onCreate={() => setShowCreate(true)} />}
        {tab === 'trips' && <TripsScreen trips={trips} offlineTrips={offlineTrips} onOpenTrip={openTrip} onOfflineSave={setOfflineSaveTrip} onCreate={() => setShowCreate(true)} />}
        {tab === 'scrap' && <ScrapTab trips={trips} shareDraft={incomingShareTarget} onShareDraftConsumed={consumeIncomingShareTarget} />}
        {tab === 'my' && (
          <MyScreen
            trips={trips}
            remoteMode={remoteMode}
            user={session?.user}
            onSignOut={() => supabase?.auth.signOut()}
            onImportLocal={importLocalTrips}
            preferences={preferences}
            onPreferencesChange={updatePreferences}
            onBackupImported={async () => setTrips(await fetchTrips())}
          />
        )}
      </main>
      <BottomNav tab={tab} setTab={changeTab} />

      {showCreate && <TripEditorModal onClose={() => setShowCreate(false)} onSave={saveTrip} />}
      {offlineSaveTrip && <OfflineSaveSheet trip={offlineSaveTrip} onClose={() => setOfflineSaveTrip(null)} onSaved={refreshOfflineTrips} />}
      {message && <Toast message={message} onClose={() => setMessage('')} />}
    </div>
  )
}

function AuthScreen({ message, setMessage }) {
  const [signingIn, setSigningIn] = useState(false)
  const login = async () => {
    setMessage('')
    setSigningIn(true)
    const inviteToken = pendingInviteToken()
    const redirectUrl = new URL('/', window.location.origin)
    if (inviteToken) redirectUrl.searchParams.set('share', inviteToken)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl.toString() },
    })
    if (error) {
      setMessage(`로그인을 시작하지 못했어요: ${error.message}`)
      setSigningIn(false)
    }
  }
  return (
    <div className="app-shell auth-shell">
      <div className="auth-card">
        <div className="brand big">TRIP:<span>ON</span></div>
        <p className="eyebrow">YOUR TRAVEL LIFE, ON</p>
        <h1>여행을 준비하고,<br />기록하고, 다시 꺼내보세요.</h1>
        <p>Supabase가 연결된 TRIP:ON은 로그인한 계정에 여행을 안전하게 저장해요.</p>
        <button className="primary-wide google-login" onClick={login} disabled={signingIn}><span className="google-mark">G</span>{signingIn ? 'Google로 이동 중…' : 'Google로 계속하기'}</button>
        {message && <p className="auth-error">{message}</p>}
      </div>
    </div>
  )
}

function LoadingScreen({ text }) {
  return <div className="app-shell loading-shell"><div className="loading-dot" /><strong>{text}</strong></div>
}

function Toast({ message, onClose }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 3000)
    return () => window.clearTimeout(timer)
  }, [message, onClose])
  return <button className="toast" onClick={onClose}>{message}</button>
}

function BrandHeader({ compact = false, root = false }) {
  return (
    <header className={`brand-header ${compact ? 'compact' : ''} ${root ? 'root-brand-header' : ''}`.trim()}>
      <div className="brand">TRIP:<span>ON</span></div>
    </header>
  )
}

function HomeScreen({ trips, onOpenTrip, onCreate }) {
  const ordered = useMemo(() => [...trips].sort((a, b) => tripSortKey(a).localeCompare(tripSortKey(b))), [trips])
  const ongoing = ordered.find((t) => getTripState(t) === 'ongoing')
  const upcoming = ordered.find((t) => ['upcoming', 'planning'].includes(getTripState(t)))
  const focus = ongoing || upcoming
  const recent = [...trips].filter((t) => ['past', 'completed'].includes(getTripState(t))).sort((a, b) => (b.endDate || '').localeCompare(a.endDate || ''))[0]

  return (
    <>
      <section className="hero-copy home-hero-copy">
        <p className="eyebrow">YOUR TRAVEL DASHBOARD</p>
        <h1>{ongoing ? '여행 중이에요.' : focus ? '다음 여행을 준비해볼까요?' : '다음 여행을 켜볼까요?'}</h1>
      </section>
      <div className="home-dashboard-grid">
        <div className="home-dashboard-primary">
          {focus ? <TripFocusCard trip={focus} onOpen={() => onOpenTrip(focus.id)} /> : <EmptyCard title="아직 등록된 여행이 없어요" description="여행 이름과 여행지만 정해도 바로 시작할 수 있어요." action="새 여행 만들기" onClick={onCreate} />}
        </div>
        <aside className="home-dashboard-side">
          {focus && (
            <section className="section-block home-status-block">
              <SectionTitle title={getTripState(focus) === 'ongoing' ? '오늘' : '준비 현황'} />
              <div className="mini-grid">
                <MiniStat label="일정" value="0" suffix="개" icon={<CalendarDays size={19} />} />
                <MiniStat label="준비" value="0 / 0" icon={<ClipboardCheck size={19} />} />
                <MiniStat label="기록" value="0" suffix="개" icon={<NotebookTabs size={19} />} />
                <MiniStat label="지출" value="₩0" icon={<WalletCards size={19} />} />
              </div>
            </section>
          )}
          {recent && (
            <section className="section-block home-recent-block">
              <SectionTitle title="최근 여행" />
              <button className="recent-trip" onClick={() => onOpenTrip(recent.id)}>
                <div><span className="tiny-label">지난 여행</span><strong>{recent.title}</strong><p>{recent.destinations.join(' · ')}</p></div>
                <ChevronRight size={20} />
              </button>
            </section>
          )}
          <button className="primary-wide home-create-button" onClick={onCreate}><Plus size={18} /> 새 여행 만들기</button>
        </aside>
      </div>
    </>
  )
}

function TripFocusCard({ trip, onOpen }) {
  const state = getTripState(trip)
  const dday = getDday(trip)
  let badge = tripDateLabel(trip)
  if (state === 'ongoing') badge = 'TRIP:ON'
  else if (dday) badge = dday
  return (
    <button className="focus-card" style={coverStyle(trip)} onClick={onOpen}>
      <div className="focus-topline"><span className="focus-badges"><span className="status-pill">{badge}</span>{trip.isShared && <span className={`shared-trip-badge ${trip.accessRole || 'viewer'}`}><Share2 size={11} /> 공유 · {trip.accessRole === 'editor' ? '편집' : '보기'}</span>}</span><ChevronRight size={22} /></div>
      <div className="focus-bottom"><p>{trip.destinations.join(' · ') || '여행지 미정'}</p><h2>{trip.title}</h2><span>{tripDateDurationLabel(trip)}</span></div>
    </button>
  )
}

function offlineSyncTimeLabel(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString('ko-KR', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })
  } catch { return '' }
}

function TripsScreen({ trips, offlineTrips = [], onOpenTrip, onOfflineSave, onCreate }) {
  const [mode, setMode] = useState('list')
  const offlineMap = useMemo(() => new Map((offlineTrips || []).map((trip) => [trip.id, trip])), [offlineTrips])
  const groups = {
    ongoing: trips.filter((t) => getTripState(t) === 'ongoing'),
    upcoming: trips.filter((t) => ['upcoming', 'planning'].includes(getTripState(t))),
    past: trips.filter((t) => ['past', 'completed'].includes(getTripState(t))),
  }
  return (
    <>
      <div className="page-title-row"><div><p className="eyebrow">ALL TRIPS</p><h1>여행</h1></div><button className="round-plus" onClick={onCreate}><Plus size={22} /></button></div>
      <div className="segmented trips-view-toggle"><button className={mode === 'list' ? 'active' : ''} onClick={() => setMode('list')}>목록</button><button className={mode === 'map' ? 'active' : ''} onClick={() => setMode('map')}>지도</button></div>
      <div className="trips-desktop-layout">
        <div className={`trips-list-pane ${mode !== 'list' ? 'mobile-pane-hidden' : ''}`}>
          {trips.length === 0 ? (
            <EmptyCard title="여행 기록이 아직 없어요" description="첫 여행을 만들면 준비 중·여행 중·지난 여행으로 자동 분류돼요." action="첫 여행 만들기" onClick={onCreate} />
          ) : (
            <div className="trip-groups"><TripGroup title="여행 중" trips={groups.ongoing} offlineMap={offlineMap} onOpenTrip={onOpenTrip} onOfflineSave={onOfflineSave} /><TripGroup title="준비 중" trips={groups.upcoming} offlineMap={offlineMap} onOpenTrip={onOpenTrip} onOfflineSave={onOfflineSave} /><TripGroup title="지난 여행" trips={groups.past} offlineMap={offlineMap} onOpenTrip={onOpenTrip} onOfflineSave={onOfflineSave} /></div>
          )}
        </div>
        <div className={`trips-map-pane ${mode !== 'map' ? 'mobile-pane-hidden' : ''}`}><AllTripsMap trips={trips} /></div>
      </div>
    </>
  )
}

function TripGroup({ title, trips, offlineMap, onOpenTrip, onOfflineSave }) {
  if (!trips.length) return null
  return (
    <section className="section-block">
      <SectionTitle title={title} count={trips.length} />
      <div className="stack-list">
        {trips.map((trip) => {
          const offline = offlineMap?.get(trip.id)
          const pending = Number(offline?.offlinePendingFiles || 0)
          return (
            <div key={trip.id} className="trip-row trip-row-offline" role="button" tabIndex={0} onClick={() => onOpenTrip(trip.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenTrip(trip.id) } }}>
              <div className="trip-thumb" style={coverStyle(trip)} />
              <div className="trip-row-copy">
                <div className="trip-row-title-line"><strong>{trip.title}</strong>{trip.isShared && <em className={`shared-trip-badge ${trip.accessRole || 'viewer'}`}><Share2 size={11} /> 공유 · {trip.accessRole === 'editor' ? '편집' : '보기'}</em>}</div>
                <span>{trip.destinations.join(' · ') || '여행지 미정'}</span><small>{tripDateDurationLabel(trip)}</small>
                <em className={`trip-offline-status ${offline ? 'saved' : 'online-only'} ${pending ? 'pending' : ''}`}>{offline ? `오프라인 저장됨${offlineSyncTimeLabel(offline.offlineSavedAt) ? ` · ${offlineSyncTimeLabel(offline.offlineSavedAt)}` : ''}${pending ? ` · 첨부 ${pending}개 대기` : ''}` : '온라인에서만 사용 가능'}</em>
              </div>
              <button className={`trip-offline-action ${offline ? 'saved' : ''}`} type="button" aria-label={offline ? `${trip.title} 오프라인 저장 관리` : `${trip.title} 오프라인 저장`} onClick={(event) => { event.stopPropagation(); onOfflineSave?.(trip) }}>{offline ? <Check size={17}/> : <CloudDownload size={17}/>}<span>{offline ? '관리' : '저장'}</span></button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function MyScreen({ trips, remoteMode, user, onSignOut, onImportLocal, preferences, onPreferencesChange, onBackupImported }) {
  const [view, setView] = useState('main')
  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || '나의 여행'
  const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture
  const past = trips.filter((t) => ['past', 'completed'].includes(getTripState(t))).length
  const localCount = remoteMode ? pendingLocalTrips(trips).length : loadLocalTrips().length

  if (view === 'settings') {
    return <MySettingsScreen preferences={preferences} onChange={onPreferencesChange} onBack={() => setView('main')} />
  }
  if (view === 'data') {
    return <DataBackupScreen remoteMode={remoteMode} onBack={() => setView('main')} onBackupImported={onBackupImported} onPreferencesImported={onPreferencesChange} />
  }

  return (
    <>
      <section className="profile-card"><div className="profile-icon">{avatarUrl ? <img src={avatarUrl} alt="Google 프로필" /> : <CircleUserRound size={32} />}</div><div><p className="eyebrow">MY TRIP:ON</p><h1>{remoteMode ? displayName : '나의 여행'}</h1>{remoteMode && <small className="account-email">{user?.email}</small>}</div></section>
      <div className="mini-grid"><MiniStat label="전체 여행" value={trips.length} suffix="회" icon={<NotebookTabs size={19} />} /><MiniStat label="지난 여행" value={past} suffix="회" icon={<MapPin size={19} />} /></div>
      <section className="section-block">
        <SectionTitle title="데이터" />
        <div className="settings-list">
          <button><Database size={19} /> {remoteMode ? 'Supabase 연결됨' : '로컬 저장 모드'} <span className={`data-dot ${remoteMode ? 'online' : ''}`} /></button>
          {remoteMode && localCount > 0 && <button onClick={onImportLocal}><UploadCloud size={19} /> 로컬 여행 {localCount}개 가져오기 <ChevronRight size={18} /></button>}
        </div>
      </section>
      <section className="section-block">
        <SectionTitle title="설정" />
        <div className="settings-list">
          <button onClick={() => setView('settings')}><Settings size={19} /> 환경설정 <ChevronRight size={18} /></button>
          <button onClick={() => setView('data')}><FileText size={19} /> 데이터·백업 <ChevronRight size={18} /></button>
          {remoteMode && <button onClick={onSignOut}><LogOut size={19} /> 로그아웃 <ChevronRight size={18} /></button>}
        </div>
      </section>
    </>
  )
}

function MySubpageHeader({ eyebrow, title, description, onBack }) {
  return (
    <>
      <div className="my-subpage-header">
        <button className="my-subpage-back" onClick={onBack} aria-label="MY로 돌아가기"><ArrowLeft size={20} /></button>
        <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p>{description}</p>}</div>
      </div>
    </>
  )
}

function MySettingsScreen({ preferences, onChange, onBack }) {
  return (
    <div className="my-subpage my-settings-screen">
      <MySubpageHeader eyebrow="PREFERENCES" title="환경설정" description="TRIP:ON을 사용하는 방식을 정해요." onBack={onBack} />

      <section className="section-block settings-card-block">
        <div className="preference-heading"><div><strong>테마</strong><small>앱 전체 화면의 밝기를 선택해요.</small></div></div>
        <div className="preference-segmented theme-segmented" role="group" aria-label="화면 테마">
          <button className={preferences.theme === 'light' ? 'active' : ''} onClick={() => onChange({ theme: 'light' })}><span>라이트</span><small>항상 밝게</small></button>
          <button className={preferences.theme === 'system' ? 'active' : ''} onClick={() => onChange({ theme: 'system' })}><span>시스템</span><small>기기 설정 따라가기</small></button>
          <button className={preferences.theme === 'dark' ? 'active' : ''} onClick={() => onChange({ theme: 'dark' })}><span>다크</span><small>항상 어둡게</small></button>
        </div>
      </section>

      <section className="section-block settings-card-block">
        <div className="preference-heading"><div><strong>지도 기본값</strong><small>장소를 검색하거나 지도를 열 때 처음 선택할 서비스를 정해요.</small></div></div>
        <div className="preference-segmented" role="group" aria-label="기본 지도 서비스">
          <button className={preferences.mapProvider === 'auto' ? 'active' : ''} onClick={() => onChange({ mapProvider: 'auto' })}><span>자동</span><small>국내 카카오 · 해외 Google</small></button>
          <button className={preferences.mapProvider === 'kakao' ? 'active' : ''} onClick={() => onChange({ mapProvider: 'kakao' })}><span>카카오 우선</span><small>국내 여행에 편리해요</small></button>
          <button className={preferences.mapProvider === 'google' ? 'active' : ''} onClick={() => onChange({ mapProvider: 'google' })}><span>Google 우선</span><small>해외 여행에 편리해요</small></button>
        </div>
        <p className="preference-note">선택한 지도를 사용할 수 없는 장소에서는 연결 가능한 다른 지도로 자동 전환될 수 있어요.</p>
      </section>

      <section className="section-block settings-card-block">
        <div className="preference-toggle-row">
          <div><strong>페이지 전환 효과</strong><small>탭이나 화면을 바꿀 때 부드럽게 올라오며 나타나는 효과를 사용해요.</small></div>
          <button className={`switch-control ${preferences.pageTransitions ? 'on' : ''}`} onClick={() => onChange({ pageTransitions: !preferences.pageTransitions })} role="switch" aria-checked={preferences.pageTransitions}><span /></button>
        </div>
      </section>

      <section className="section-block settings-card-block">
        <div className="preference-toggle-row">
          <div><strong>오프라인 여행 자동 동기화</strong><small>인터넷이 다시 연결되면 이 기기에 저장한 여행의 일정·예약·기록을 자동으로 최신화해요.</small></div>
          <button className={`switch-control ${preferences.offlineAutoSync ? 'on' : ''}`} onClick={() => onChange({ offlineAutoSync: !preferences.offlineAutoSync })} role="switch" aria-checked={preferences.offlineAutoSync}><span /></button>
        </div>
        <div className={`preference-toggle-row offline-wifi-setting ${preferences.offlineAutoSync ? '' : 'disabled'}`}>
          <div><strong>첨부파일은 Wi-Fi에서만</strong><small>사진·PDF 같은 큰 파일은 브라우저가 Wi-Fi 연결을 확인할 수 있을 때만 자동으로 새 파일을 받아요. 일정·메모 같은 데이터는 네트워크 종류와 관계없이 동기화돼요.</small></div>
          <button disabled={!preferences.offlineAutoSync} className={`switch-control ${preferences.offlineWifiOnlyAttachments ? 'on' : ''}`} onClick={() => onChange({ offlineWifiOnlyAttachments: !preferences.offlineWifiOnlyAttachments })} role="switch" aria-checked={preferences.offlineWifiOnlyAttachments}><span /></button>
        </div>
        <p className="preference-note">일부 브라우저는 Wi-Fi 여부를 알려주지 않아요. 그 경우 Wi-Fi 전용이 켜져 있으면 새 첨부파일 자동 다운로드만 보류하고, 여행 데이터는 먼저 최신화해요. 수동 ‘업데이트’는 언제든 전체 파일을 받을 수 있어요.</p>
      </section>
    </div>
  )
}

function DataBackupScreen({ remoteMode, onBack, onBackupImported, onPreferencesImported }) {
  const inputRef = useRef(null)
  const [historyRows, setHistoryRows] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(remoteMode)
  const [working, setWorking] = useState('')
  const [status, setStatus] = useState('')
  const summaryText = (backup) => {
    const summary = backup?.summary
    if (!summary) return ''
    return `여행 ${summary.trips || 0}개 · 일정 ${summary.itineraryItems || 0}개 · 스크랩 ${summary.scraps || 0}개 · 기록 ${summary.records || 0}개`
  }

  useEffect(() => {
    let alive = true
    if (!remoteMode) { setLoadingHistory(false); return undefined }
    fetchTimelineImportHistory()
      .then((rows) => { if (alive) setHistoryRows(rows) })
      .catch((error) => { if (alive) setStatus(`Timeline 내역을 불러오지 못했어요: ${error.message}`) })
      .finally(() => { if (alive) setLoadingHistory(false) })
    return () => { alive = false }
  }, [remoteMode])

  const download = async () => {
    if (!remoteMode) { setStatus('Supabase에 로그인한 상태에서 사용할 수 있어요.'); return }
    setWorking('export')
    setStatus('')
    try {
      const backup = await downloadTripOnBackup()
      setStatus(`데이터 백업을 만들었어요.${summaryText(backup) ? ` ${summaryText(backup)}` : ''}`)
    } catch (error) {
      setStatus(`백업을 만들지 못했어요: ${error.message}`)
    } finally { setWorking('') }
  }

  const downloadFull = async () => {
    if (!remoteMode) { setStatus('Supabase에 로그인한 상태에서 사용할 수 있어요.'); return }
    setWorking('export-full')
    setStatus('첨부파일을 확인하고 있어요…')
    try {
      const backup = await downloadTripOnFullBackup({
        onProgress: (progress) => setStatus(progress?.message || '첨부파일 포함 백업을 만드는 중…'),
      })
      const size = Number(backup?.summary?.attachmentBytes || 0)
      const sizeText = size ? ` · 첨부 ${(size / 1024 / 1024).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)}MB` : ''
      setStatus(`첨부파일 포함 ZIP 백업을 만들었어요.${summaryText(backup) ? ` ${summaryText(backup)}` : ''}${sizeText}`)
    } catch (error) {
      setStatus(`첨부파일 포함 백업을 만들지 못했어요: ${error.message}`)
    } finally { setWorking('') }
  }

  const restore = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!window.confirm('이 백업의 같은 ID 데이터는 현재 데이터에 덮어쓰고, 백업 이후 새로 만든 데이터는 그대로 둬요. 계속할까요?')) return
    setWorking('import')
    setStatus('')
    try {
      const backup = await restoreTripOnBackup(file, { onProgress: (progress) => setStatus(progress?.message || '복원하는 중…') })
      if (backup?.preferences) await onPreferencesImported?.(backup.preferences)
      await onBackupImported?.()
      const rows = await fetchTimelineImportHistory()
      setHistoryRows(rows)
      setStatus(`백업을 복원했어요.${summaryText(backup) ? ` ${summaryText(backup)}` : ''}${backup?.restoredAttachments ? ` · 첨부 ${backup.restoredAttachments}개 복원` : ''}`)
    } catch (error) {
      setStatus(`복원하지 못했어요: ${error.message}`)
    } finally { setWorking('') }
  }

  return (
    <div className="my-subpage data-backup-screen">
      <MySubpageHeader eyebrow="DATA & BACKUP" title="데이터·백업" description="여행 데이터를 내보내고 가져온 기록을 확인해요." onBack={onBack} />

      <section className="section-block settings-card-block">
        <div className="backup-section-head"><div><strong>백업 만들기</strong><small>가볍게 데이터만 보관하거나, 사진·PDF까지 한 번에 보관할 수 있어요.</small></div></div>
        <div className="backup-mode-grid">
          <button className="backup-action-card" disabled={!remoteMode || !!working} onClick={download}>
            <span className="backup-action-icon"><FileText size={19} /></span>
            <span><strong>데이터만</strong><small>JSON · 일정·스크랩·설정 등을 빠르게 백업</small></span>
            <Download size={17} />
          </button>
          <button className="backup-action-card" disabled={!remoteMode || !!working} onClick={downloadFull}>
            <span className="backup-action-icon"><Paperclip size={19} /></span>
            <span><strong>첨부파일 포함</strong><small>ZIP · 여행 커버·사진·티켓·영수증·예약 PDF까지</small></span>
            <Download size={17} />
          </button>
        </div>
        <div className="backup-actions">
          <button className="outline-btn" disabled={!remoteMode || !!working} onClick={() => inputRef.current?.click()}><Upload size={17} /> {working === 'import' ? '복원하는 중…' : '백업 가져오기'}</button>
          <input ref={inputRef} className="visually-hidden-file" type="file" accept="application/json,.json,application/zip,.zip" onChange={restore} />
        </div>
        <p className="preference-note">같은 계정에서 만든 JSON 또는 ZIP을 합쳐서 복원해요. ZIP 백업은 Storage의 원본 첨부파일도 다시 연결해요. 공유 멤버 권한과 초대 링크는 보안상 백업하지 않아요. 사진이 많으면 모바일에서 시간이 오래 걸릴 수 있어요.</p>
        {working === 'export-full' && <p className="backup-live-note">백업이 끝날 때까지 이 화면을 닫지 않는 것을 권장해요.</p>}
        {status && <p className="backup-status">{status}</p>}
      </section>

      <section className="section-block settings-card-block">
        <div className="backup-section-head"><div><strong>Google Timeline 가져오기 내역</strong><small>어떤 여행에 어떤 기간의 Timeline을 가져왔는지 확인해요.</small></div><span>{historyRows.length}</span></div>
        {loadingHistory ? <div className="backup-empty">내역을 불러오는 중…</div> : historyRows.length ? (
          <div className="timeline-history-list">
            {historyRows.map((row) => <div className="timeline-history-row" key={row.id}><div><strong>{row.tripTitle}</strong><span>{row.imported_start_date || '시작일 미상'} — {row.imported_end_date || '종료일 미상'}</span><small>{row.source_file_name || 'Google Timeline'} · 방문 {row.visit_count || 0} · 이동 {row.activity_count || 0}</small></div><time>{row.createdDate.toLocaleDateString('ko-KR')}</time></div>)}
          </div>
        ) : <div className="backup-empty">아직 Timeline을 가져온 기록이 없어요.</div>}
      </section>
    </div>
  )
}

function TripDetail({ trip, onBack, onEdit, onDelete, onColorEdit, onDuplicate, onTripUpdated, onTripRefresh, onLeaveShared, onOfflineSaved, preferences, onPreferencesChange }) {
  const [active, setActive] = useState('overview')
  const [mapOpen, setMapOpen] = useState(false)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [offlineSaveOpen, setOfflineSaveOpen] = useState(false)
  const [calendarExportOpen, setCalendarExportOpen] = useState(false)
  const [syncVersion, setSyncVersion] = useState(0)
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickRequest, setQuickRequest] = useState(null)
  const [quickOriginTab, setQuickOriginTab] = useState('overview')
  const [lastScheduleDayId, setLastScheduleDayId] = useState(null)
  const state = getTripState(trip)
  const accessRole = trip.accessRole || 'owner'
  const isOwner = accessRole === 'owner'
  const canEdit = accessRole === 'owner' || accessRole === 'editor'
  const dday = getDday(trip)
  const tabs = [['overview', '개요'], ['schedule', '일정'], ['prep', '준비'], ['record', '기록'], ['expense', '지출']]

  useEffect(() => {
    let timer = null
    const unsubscribe = subscribeToTripChanges(trip.id, () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(async () => {
        setSyncVersion((value) => value + 1)
        await onTripRefresh?.()
      }, 180)
    })
    return () => { window.clearTimeout(timer); unsubscribe?.() }
  }, [trip.id])

  const startQuickCreate = (kind) => {
    const target = kind === 'expense' ? 'expense' : 'record'
    setQuickOriginTab(active)
    setQuickOpen(false)
    setQuickRequest({ id: Date.now(), target, recordType: kind === 'note' ? 'note' : kind === 'photo' ? 'photo' : null, preferredDayId: lastScheduleDayId })
    setActive(target)
  }

  const finishQuickCreate = () => {
    setQuickRequest(null)
    setActive(quickOriginTab)
  }

  return (
    <div className="app-shell detail-shell">
      <main className="page detail-page">
        <div className="trip-hero" style={coverStyle(trip)}>
          <button className="hero-back" onClick={onBack}><ArrowLeft size={21} /></button>
          <div className="hero-actions">
            <button className="hero-color" onClick={() => setMapOpen(true)} aria-label="여행 지도 보기"><MapPinned size={17} /><span>지도</span></button>
            <button className="hero-color" onClick={() => setShareOpen(true)} aria-label="여행 공유"><Share2 size={17} /><span>공유</span></button>
            <button className="hero-color" onClick={() => setOfflineSaveOpen(true)} aria-label="오프라인 저장"><Cloud size={17} /><span>오프라인</span></button>
            {canEdit && <button className="hero-color" onClick={onColorEdit} aria-label="여행 커버 수정"><ImagePlus size={17} /><span>커버</span></button>}
            <button className="hero-more" onClick={() => setActionsOpen(true)} aria-label="여행 메뉴 열기"><MoreHorizontal size={22} /></button>
          </div>
          <div className="trip-hero-copy">
            <span className="status-pill">{state === 'ongoing' ? 'TRIP:ON' : state === 'completed' ? 'ARCHIVED' : dday || (state === 'past' ? '여행 종료' : tripDateLabel(trip))}</span>
            <h1>{trip.title}</h1>
            <p>{trip.destinations.join(' · ') || '여행지 미정'}</p>
            <small>{tripDateDurationLabel(trip)}</small>
            {trip.companions?.length > 0 && <small>👥 {['나', ...trip.companions].join(' · ')}</small>}
            {trip.tagline && <em>{trip.tagline}</em>}
          </div>
        </div>
        <div className="detail-tabs">{tabs.map(([key, label]) => <button key={key} className={active === key ? 'active' : ''} onClick={() => setActive(key)}>{label}</button>)}</div>
        {!canEdit && <div className="shared-viewer-banner"><Eye size={16}/><span><strong>보기 전용 공유 여행</strong><small>다른 사람이 수정한 내용은 실시간으로 반영돼요.</small></span></div>}
        <div key={active} className={`detail-content detail-tab-${active} ${canEdit ? '' : 'trip-read-only'}`}>
          {active === 'overview' && <OverviewTab trip={trip} onTripUpdated={onTripUpdated} refreshKey={syncVersion} readOnly={!canEdit} />}
          {active === 'schedule' && <ScheduleTab trip={trip} refreshKey={syncVersion} readOnly={!canEdit} onSelectedDayChange={setLastScheduleDayId} preferences={preferences} onPreferencesChange={onPreferencesChange} />}
          {active === 'prep' && <PrepTab trip={trip} refreshKey={syncVersion} readOnly={!canEdit} />}
          {active === 'record' && <RecordTab trip={trip} refreshKey={syncVersion} readOnly={!canEdit} quickCreateRequest={quickRequest?.target === 'record' ? quickRequest : null} onQuickCreateDone={finishQuickCreate} />}
          {active === 'expense' && <ExpenseTab trip={trip} refreshKey={syncVersion} readOnly={!canEdit} quickCreateRequest={quickRequest?.target === 'expense' ? quickRequest : null} onQuickCreateDone={finishQuickCreate} />}
        </div>
      </main>
      {canEdit && <button className="quick-record-fab" type="button" onClick={() => setQuickOpen(true)} aria-label="빠른 기록 열기"><Plus size={20} /><span>빠른 기록</span></button>}
      {quickOpen && <QuickRecordSheet onClose={() => setQuickOpen(false)} onSelect={startQuickCreate} />}
      {mapOpen && <TripMapSheet trip={trip} onClose={() => setMapOpen(false)} />}
      {shareOpen && <ShareTripSheet trip={trip} onClose={() => setShareOpen(false)} onLeft={onLeaveShared} />}
      {offlineSaveOpen && <OfflineSaveSheet trip={trip} onClose={() => setOfflineSaveOpen(false)} onSaved={onOfflineSaved} />}
      {calendarExportOpen && <CalendarExportSheet trip={trip} onClose={() => setCalendarExportOpen(false)} />}
      {actionsOpen && (
        <TripActionsSheet
          trip={trip}
          isOwner={isOwner}
          canEdit={canEdit}
          onClose={() => setActionsOpen(false)}
          onEdit={() => {
            setActionsOpen(false)
            onEdit()
          }}
          onDuplicate={() => {
            setActionsOpen(false)
            onDuplicate?.()
          }}
          onCalendar={() => {
            setActionsOpen(false)
            setCalendarExportOpen(true)
          }}
          onDelete={() => {
            setActionsOpen(false)
            onDelete()
          }}
        />
      )}
    </div>
  )
}


function CalendarExportSheet({ trip, onClose }) {
  const [includeSchedule, setIncludeSchedule] = useState(true)
  const [includeReservations, setIncludeReservations] = useState(true)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState('')
  const [data, setData] = useState({ days: [], items: [], reservations: [] })
  const [preview, setPreview] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchCalendarExportData(trip.id)
      .then((rows) => { if (alive) setData(rows) })
      .catch((error) => { if (alive) setMessage(error.message || '캘린더 데이터를 불러오지 못했어요.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [trip.id])

  useEffect(() => {
    if (loading || (!includeSchedule && !includeReservations)) {
      setPreview(null)
      return
    }
    setPreview(buildTripCalendar({ trip, data, includeSchedule, includeReservations }))
  }, [trip, data, includeSchedule, includeReservations, loading])

  const exportFile = async (mode) => {
    if (!preview?.eventCount) return
    setWorking(mode)
    setMessage('')
    try {
      if (mode === 'share') {
        const result = await shareCalendarFile(preview)
        setMessage(result === 'downloaded' ? '이 기기에서는 공유 대신 .ics 파일로 저장했어요.' : '캘린더 파일을 공유했어요.')
      } else {
        downloadCalendarFile(preview)
        setMessage('.ics 파일을 저장했어요.')
      }
    } catch (error) {
      if (error?.name !== 'AbortError') setMessage(error.message || '캘린더 파일을 만들지 못했어요.')
    } finally {
      setWorking('')
    }
  }

  const undatedTrip = trip.datePrecision !== 'exact' || !trip.startDate
  return (
    <SheetBackdrop onRequestClose={working ? undefined : onClose}>
      <div className="calendar-export-sheet" onPointerDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="calendar-export-head">
          <div><small>CALENDAR</small><strong>캘린더 내보내기</strong><p>{trip.title}</p></div>
          <button type="button" onClick={onClose} disabled={!!working}>닫기</button>
        </div>

        <div className="calendar-export-options">
          <label className={includeSchedule ? 'checked' : ''}>
            <input type="checkbox" checked={includeSchedule} onChange={(event) => setIncludeSchedule(event.target.checked)} />
            <span><CalendarDays size={18} /></span>
            <div><strong>일정</strong><small>DAY별 장소·이동 일정을 내보내요.</small></div>
            <Check size={18} />
          </label>
          <label className={includeReservations ? 'checked' : ''}>
            <input type="checkbox" checked={includeReservations} onChange={(event) => setIncludeReservations(event.target.checked)} />
            <span><Ticket size={18} /></span>
            <div><strong>예약</strong><small>숙소·교통·식당·티켓 예약을 내보내요.</small></div>
            <Check size={18} />
          </label>
        </div>

        {loading ? (
          <div className="calendar-export-status">캘린더에 넣을 항목을 확인하는 중…</div>
        ) : !includeSchedule && !includeReservations ? (
          <div className="calendar-export-status warning">일정 또는 예약을 하나 이상 선택해주세요.</div>
        ) : (
          <div className="calendar-export-summary">
            <div><strong>{preview?.eventCount || 0}</strong><span>개 이벤트</span></div>
            <p>시간이 정해진 항목은 해당 시간으로, 시간 미정 일정은 하루 종일 일정으로 들어가요.</p>
            {preview?.skippedUndated > 0 && <p className="warning">달력 날짜가 아직 없는 항목 {preview.skippedUndated}개는 제외돼요.</p>}
            {preview?.skippedCancelled > 0 && <p>취소·미방문 항목 {preview.skippedCancelled}개는 자동 제외돼요.</p>}
            {undatedTrip && includeSchedule && <p className="warning">이 여행은 날짜가 아직 확정되지 않았어요. 실제 날짜가 없는 DAY 일정은 캘린더에 넣을 수 없어요.</p>}
          </div>
        )}

        <div className="calendar-export-actions">
          <button type="button" className="primary-wide" disabled={!!working || !preview?.eventCount} onClick={() => exportFile('share')}>
            <Share2 size={17} /> {working === 'share' ? '준비하는 중…' : '캘린더 앱으로 보내기'}
          </button>
          <button type="button" className="outline-wide" disabled={!!working || !preview?.eventCount} onClick={() => exportFile('download')}>
            <Download size={17} /> {working === 'download' ? '저장하는 중…' : '.ics 파일 저장'}
          </button>
        </div>
        <p className="calendar-export-note">삼성 캘린더·Google Calendar 등 .ics를 지원하는 캘린더 앱에서 가져올 수 있어요. 기기에 따라 공유 시트에서 캘린더 앱을 직접 고르거나, 저장한 파일을 열어 가져오면 돼요.</p>
        {message && <div className="calendar-export-message">{message}</div>}
      </div>
    </SheetBackdrop>
  )
}

function QuickRecordSheet({ onClose, onSelect }) {
  return (
    <SheetBackdrop onRequestClose={onClose}>
      <div className="quick-record-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="quick-record-head"><div><small>QUICK ADD</small><strong>빠르게 남기기</strong></div><button type="button" onClick={onClose}>닫기</button></div>
        <div className="quick-record-actions">
          <button type="button" onClick={() => onSelect('photo')}><span><ImagePlus size={20} /></span><div><strong>사진</strong><small>사진부터 바로 기록해요.</small></div><ChevronRight size={18} /></button>
          <button type="button" onClick={() => onSelect('note')}><span><NotebookTabs size={20} /></span><div><strong>메모</strong><small>짧은 순간이나 생각을 남겨요.</small></div><ChevronRight size={18} /></button>
          <button type="button" onClick={() => onSelect('expense')}><span><WalletCards size={20} /></span><div><strong>지출</strong><small>쓴 금액을 바로 적어요.</small></div><ChevronRight size={18} /></button>
        </div>
      </div>
    </SheetBackdrop>
  )
}

function TripActionsSheet({ trip, onClose, onEdit, onDuplicate, onCalendar, onDelete, isOwner = true, canEdit = true }) {
  return (
    <SheetBackdrop onRequestClose={onClose}>
      <div className="trip-actions-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="trip-actions-head">
          <div>
            <small>TRIP MENU</small>
            <strong>{trip.title}</strong>
          </div>
          <button type="button" onClick={onClose}>닫기</button>
        </div>
        <div className="trip-actions-list">
          {canEdit && <button type="button" onClick={onEdit}>
            <span className="trip-action-icon"><Pencil size={19} /></span>
            <span><strong>여행 수정</strong><small>여행지·날짜·기간·동행인·설명을 수정해요.</small></span>
            <ChevronRight size={18} />
          </button>}
          <button type="button" onClick={onCalendar}>
            <span className="trip-action-icon"><CalendarDays size={19} /></span>
            <span><strong>캘린더 내보내기</strong><small>일정과 예약을 .ics 파일로 캘린더 앱에 옮겨요.</small></span>
            <ChevronRight size={18} />
          </button>
          {isOwner && <button type="button" onClick={onDuplicate}>
            <span className="trip-action-icon"><Copy size={19} /></span>
            <span><strong>여행 복제</strong><small>기간·준비물·일정 초안을 새 여행으로 가져와요.</small></span>
            <ChevronRight size={18} />
          </button>}
          {isOwner && <button type="button" className="danger" onClick={onDelete}>
            <span className="trip-action-icon"><Trash2 size={19} /></span>
            <span><strong>여행 삭제</strong><small>일정·기록·지출·실제 동선까지 함께 삭제해요.</small></span>
            <ChevronRight size={18} />
          </button>}
        </div>
      </div>
    </SheetBackdrop>
  )
}

function OverviewTab({ trip, onTripUpdated, refreshKey = 0, readOnly = false }) {
  const state = getTripState(trip)
  const [expenseSummary, setExpenseSummary] = useState({ budget: 0, spent: 0 })
  useEffect(() => {
    let alive = true
    fetchExpenseData(trip.id).then((data) => {
      if (!alive) return
      const spent = data.expenses.reduce((sum, expense) => sum + (expenseKrw(expense) ?? 0), 0)
      setExpenseSummary({ budget: Number(data.budget?.amount_krw || 0), spent })
    }).catch(() => {})
    return () => { alive = false }
  }, [trip.id, refreshKey])
  const won = (value) => `₩${Math.round(Number(value || 0)).toLocaleString('ko-KR')}`
  if (state === 'past' || state === 'completed') return <ArchiveOverview trip={trip} onTripUpdated={onTripUpdated} refreshKey={refreshKey} readOnly={readOnly} />
  return (
    <>
      <section className="summary-banner"><span>{state === 'past' ? '여행 요약' : state === 'ongoing' ? '오늘의 여행' : '여행 준비'}</span><strong>{state === 'past' ? durationLabel(trip) : state === 'ongoing' ? 'TRIP:ON' : '0 / 0 완료'}</strong><p>{state === 'past' ? '사진과 기록을 채우면 이곳에 여행 요약이 완성돼요.' : '일정과 준비 항목을 추가하면 진행 상황이 여기에 보여요.'}</p></section>
      <InfoBlock title="다가오는 일정" action="전체 일정"><EmptyInline text="아직 등록된 일정이 없어요." icon={<CalendarDays size={20} />} /></InfoBlock>
      <InfoBlock title="예약" action="준비 보기"><EmptyInline text="항공·숙소·티켓 예약을 연결해보세요." icon={<Ticket size={20} />} /></InfoBlock>
      <InfoBlock title="예산"><div className="budget-row"><div><small>현재 지출</small><strong>{won(expenseSummary.spent)}</strong></div><div><small>예산</small><strong>{expenseSummary.budget > 0 ? won(expenseSummary.budget) : '미설정'}</strong></div></div></InfoBlock>
      <InfoBlock title="여행 메모"><p className="muted">여행에서 기억해둘 내용을 자유롭게 적는 영역이 들어갈 예정이에요.</p></InfoBlock>
    </>
  )
}


function actualRecordsForItem(item) {
  const records = []
  const seen = new Set()
  const push = (record) => {
    if (!record?.id || seen.has(record.id) || !record.actual_start_at) return
    seen.add(record.id)
    records.push(record)
  }
  push(item)
  for (const record of item?.linked_actuals || []) {
    push(record)
    for (const child of record?.group_children || []) push(child)
  }
  for (const record of item?.group_children || []) push(record)
  return records.sort((a, b) => new Date(a.actual_start_at) - new Date(b.actual_start_at))
}

function actualRangeForItem(item) {
  const records = actualRecordsForItem(item)
  if (!records.length) return { start: null, end: null, records: [] }
  const start = records.reduce((min, record) => !min || new Date(record.actual_start_at) < new Date(min) ? record.actual_start_at : min, null)
  const endCandidates = records.map((record) => record.actual_end_at || record.actual_start_at).filter(Boolean)
  const end = endCandidates.reduce((max, value) => !max || new Date(value) > new Date(max) ? value : max, null)
  return { start, end, records }
}

function scheduleDisplayTitle(item) {
  return item?.is_visit_group && item?.group_title?.trim() ? item.group_title.trim() : item?.title || ''
}

function isBriefActualVisit(item) {
  if (!isTimelineActualItem(item) || item?.is_visit_group || item?.start_at || !item?.actual_start_at || !item?.actual_end_at) return false
  const durationMs = new Date(item.actual_end_at) - new Date(item.actual_start_at)
  return Number.isFinite(durationMs) && durationMs >= 0 && durationMs < 10_000
}


function linkDisplayMode(item) {
  if (item?.linked_plan_id && item?.linked_plan?.link_display_mode) return item.linked_plan.link_display_mode
  return item?.link_display_mode || 'plan'
}

function shouldShowScheduleRoot(item) {
  if (!item) return false
  if (item.group_parent_id) return false
  const mode = linkDisplayMode(item)
  if (item.linked_plan_id) return mode === 'actual' || mode === 'both'
  if ((item.linked_actuals || []).length > 0) return mode === 'plan' || mode === 'both'
  return true
}

function buildBriefVisitClusters(briefItems, rootItems) {
  const sorted = [...briefItems].sort((a, b) => new Date(a.actual_start_at) - new Date(b.actual_start_at))
  const rawClusters = []
  const MAX_GAP_MS = 10 * 60 * 1000
  for (const item of sorted) {
    const previousCluster = rawClusters[rawClusters.length - 1]
    const previousItem = previousCluster?.items?.[previousCluster.items.length - 1]
    const gap = previousItem ? new Date(item.actual_start_at) - new Date(previousItem.actual_start_at) : Infinity
    if (!previousCluster || gap > MAX_GAP_MS) rawClusters.push({ items: [item] })
    else previousCluster.items.push(item)
  }

  return rawClusters.map((cluster, index) => {
    const clusterStart = new Date(cluster.items[0].actual_start_at).getTime()
    const clusterEnd = new Date(cluster.items[cluster.items.length - 1].actual_start_at).getTime()
    const representative = rootItems
      .filter((candidate) => candidate.actual_start_at && !isBriefActualVisit(candidate) && !candidate.linked_plan_id && !candidate.group_parent_id)
      .map((candidate) => {
        const start = new Date(candidate.actual_start_at).getTime()
        const end = new Date(candidate.actual_end_at || candidate.actual_start_at).getTime()
        const overlaps = clusterStart <= end + 5 * 60 * 1000 && clusterEnd >= start - 5 * 60 * 1000
        const distance = overlaps ? 0 : Math.min(Math.abs(clusterStart - end), Math.abs(start - clusterEnd))
        return { candidate, overlaps, distance }
      })
      .filter((entry) => entry.overlaps || entry.distance <= 10 * 60 * 1000)
      .sort((a, b) => Number(b.overlaps) - Number(a.overlaps) || a.distance - b.distance)[0]?.candidate || null

    const groupableIds = representative
      ? [representative.id, ...cluster.items.map((item) => item.id)]
      : cluster.items.map((item) => item.id)
    return {
      key: `${cluster.items[0].actual_start_at || index}:${cluster.items.map((item) => item.id).join(',')}`,
      items: cluster.items,
      representative,
      groupableIds: [...new Set(groupableIds)],
    }
  })
}

function summarizePlannedTravel(items = []) {
  const rows = items.filter((item) => item?.category === 'transport' && !isTimelineActualItem(item) && !item?.group_parent_id && !['cancelled','skipped'].includes(item?.status))
  const byTransport = new Map()
  let totalMinutes = 0
  let timedCount = 0
  for (const item of rows) {
    const minutes = Number(item.travel_minutes || 0)
    if (Number.isFinite(minutes) && minutes > 0) { totalMinutes += minutes; timedCount += 1 }
    const key = item.transport_type || 'other'
    const current = byTransport.get(key) || { transportType: key, minutes: 0, count: 0 }
    current.minutes += Number.isFinite(minutes) && minutes > 0 ? minutes : 0
    current.count += 1
    byTransport.set(key, current)
  }
  return {
    segmentCount: rows.length,
    timedSegmentCount: timedCount,
    totalMinutes,
    byTransport: [...byTransport.values()].sort((a, b) => (b.minutes - a.minutes) || (b.count - a.count)),
  }
}

function timelineTransportLabel(value) {
  const key = String(value || '').trim().toUpperCase()
  const labels = {
    WALKING: '도보', RUNNING: '도보', CYCLING: '자전거', ON_BICYCLE: '자전거',
    IN_PASSENGER_VEHICLE: '자동차', IN_VEHICLE: '자동차', DRIVING: '자동차',
    IN_TAXI: '택시', TAXI: '택시', IN_BUS: '버스', BUS: '버스',
    IN_SUBWAY: '지하철', SUBWAY: '지하철', IN_TRAIN: '기차', TRAIN: '기차',
    IN_TRAM: '트램', IN_FERRY: '페리', FLYING: '비행기', AIRPLANE: '비행기',
    MOTORCYCLING: '오토바이', ROUTE: '이동', OTHER: '기타',
  }
  if (labels[key]) return labels[key]
  if (!key) return '이동'
  return String(value).replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (match) => match.toUpperCase())
}

function formatTravelDistance(meters) {
  const value = Number(meters || 0)
  if (!Number.isFinite(value) || value <= 0) return ''
  if (value < 1000) return `${Math.round(value)}m`
  const km = value / 1000
  return `${km >= 10 ? km.toFixed(0) : km.toFixed(1)}km`
}

function ScheduleTab({ trip, refreshKey = 0, readOnly = false, onSelectedDayChange, preferences, onPreferencesChange }) {
  const [days, setDays] = useState([])
  const [items, setItems] = useState([])
  const [accommodations, setAccommodations] = useState([])
  const [selectedDayId, setSelectedDayId] = useState(null)
  const [editingItem, setEditingItem] = useState(null)
  const [viewingItem, setViewingItem] = useState(null)
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const [dayMemo, setDayMemo] = useState('')
  const [savingMemo, setSavingMemo] = useState(false)
  const [showDayMap, setShowDayMap] = useState(false)
  const [showBriefActual, setShowBriefActual] = useState(false)
  const [linkingItem, setLinkingItem] = useState(null)
  const [grouping, setGrouping] = useState(null)
  const [candidateScraps, setCandidateScraps] = useState([])
  const [candidateBusyId, setCandidateBusyId] = useState(null)
  const [reactionBusyId, setReactionBusyId] = useState('')
  const [actualTravelSummary, setActualTravelSummary] = useState(null)
  const [loadingTravelSummary, setLoadingTravelSummary] = useState(false)

  const load = async (preferDayId) => {
    if (!isSupabaseConfigured || !trip.id || !trip.durationDays) return
    setLoadingSchedule(true)
    setScheduleError('')
    try {
      const result = await fetchSchedule(trip)
      setDays(result.days)
      setItems(result.items)
      setAccommodations(result.accommodations || [])
      const nextId = preferDayId && result.days.some((day) => day.id === preferDayId)
        ? preferDayId
        : selectedDayId && result.days.some((day) => day.id === selectedDayId)
          ? selectedDayId
          : result.days[0]?.id || null
      setSelectedDayId(nextId)
    } catch (error) {
      setScheduleError(error.message)
    } finally {
      setLoadingSchedule(false)
    }
  }

  useEffect(() => {
    load()
  }, [trip.id, trip.startDate, trip.endDate, trip.datePrecision, trip.durationDays, refreshKey])

  const selectedDay = days.find((day) => day.id === selectedDayId) || days[0]

  const loadCandidates = async (dayId = selectedDay?.id) => {
    if (!trip.id || !dayId) { setCandidateScraps([]); return }
    try {
      setCandidateScraps(await fetchScheduleCandidateScraps(trip.id, dayId))
    } catch (error) {
      setScheduleError(error.message)
    }
  }

  useEffect(() => {
    onSelectedDayChange?.(selectedDay?.id || null)
  }, [selectedDay?.id, onSelectedDayChange])

  useEffect(() => {
    loadCandidates(selectedDay?.id)
  }, [trip.id, selectedDay?.id, refreshKey])

  useEffect(() => {
    let alive = true
    if (!trip.id || !selectedDay?.trip_date) {
      setActualTravelSummary(null)
      setLoadingTravelSummary(false)
      return () => { alive = false }
    }
    setLoadingTravelSummary(true)
    fetchTimelineDayTravelSummary(trip.id, selectedDay.trip_date)
      .then((summary) => { if (alive) setActualTravelSummary(summary) })
      .catch(() => { if (alive) setActualTravelSummary(null) })
      .finally(() => { if (alive) setLoadingTravelSummary(false) })
    return () => { alive = false }
  }, [trip.id, selectedDay?.trip_date, refreshKey])

  const dayItems = items.filter((item) => item.trip_day_id === selectedDay?.id)
  const plannedTravelSummary = useMemo(() => summarizePlannedTravel(dayItems), [dayItems])
  const showPlannedTravelEstimate = preferences?.showPlannedTravelEstimate !== false
  const rootItems = dayItems.filter(shouldShowScheduleRoot)
  const timelineTime = (item) => item.start_at || actualRangeForItem(item).start || null
  const hasTimelineTime = (item) => Boolean(timelineTime(item))
  const byTimelineTime = (a, b) => {
    const aTime = timelineTime(a)
    const bTime = timelineTime(b)
    if (aTime && bTime) {
      const timeDiff = new Date(aTime) - new Date(bTime)
      if (timeDiff) return timeDiff
    }
    return (a.sort_order ?? 0) - (b.sort_order ?? 0)
  }
  const scheduledItems = rootItems
    .filter((item) => hasTimelineTime(item) && !isBriefActualVisit(item))
    .sort(byTimelineTime)
  const briefActualItems = rootItems
    .filter(isBriefActualVisit)
    .sort(byTimelineTime)
  const briefVisitClusters = buildBriefVisitClusters(briefActualItems, rootItems)
  const unscheduledItems = rootItems
    .filter((item) => !hasTimelineTime(item))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const selectedDayLodgings = useMemo(() => {
    const dayDate = selectedDay?.trip_date
    if (!dayDate) return []
    return accommodations.map((reservation) => {
      const checkInDate = dateInZone(reservation.start_at, reservation.start_timezone || DEFAULT_TIMEZONE)
      const checkOutDate = dateInZone(reservation.end_at, reservation.end_timezone || reservation.start_timezone || DEFAULT_TIMEZONE)
      if (!checkInDate && !checkOutDate) return null
      const starts = checkInDate || checkOutDate
      const ends = checkOutDate || checkInDate
      if (dayDate < starts || dayDate > ends) return null
      let state = '숙박 중'
      if (checkInDate === checkOutDate && dayDate === checkInDate) state = '체크인 · 체크아웃'
      else if (dayDate === checkInDate) state = '오늘 체크인'
      else if (dayDate === checkOutDate) state = '오늘 체크아웃'
      return { ...reservation, checkInDate, checkOutDate, lodgingState: state }
    }).filter(Boolean)
  }, [accommodations, selectedDay?.trip_date])

  useEffect(() => {
    setDayMemo(selectedDay?.memo || '')
    setShowBriefActual(false)
  }, [selectedDay?.id, selectedDay?.memo])

  if (loadingSchedule && days.length === 0) {
    return (
      <div className="tab-loading-shell schedule-tab-loading">
        <span className="loading-pulse-dot" />
        <strong>일정을 정리하고 있어요</strong>
        <small>계획 시간과 실제 방문 시간을 함께 불러오는 중이에요.</small>
      </div>
    )
  }

  if (!trip.durationDays) {
    return (
      <div className="schedule-no-date">
        <CalendarDays size={32} />
        <strong>여행 기간을 먼저 정해주세요</strong>
        <p>날짜가 미정이어도 몇 박 며칠인지 정하면 DAY 1부터 미리 계획할 수 있어요.</p>
      </div>
    )
  }

  const promoteCandidate = async (scrap) => {
    if (!selectedDay) return
    setCandidateBusyId(scrap.id)
    setScheduleError('')
    try {
      await commitScrapToSchedule({ scrap, trip, day: selectedDay })
      await Promise.all([load(selectedDay.id), loadCandidates(selectedDay.id)])
    } catch (error) {
      setScheduleError(error.message)
    } finally {
      setCandidateBusyId(null)
    }
  }

  const releaseCandidate = async (scrap) => {
    setCandidateBusyId(scrap.id)
    setScheduleError('')
    try {
      await removeScrapScheduleCandidate(scrap.id)
      await loadCandidates(selectedDay?.id)
    } catch (error) {
      setScheduleError(error.message)
    } finally {
      setCandidateBusyId(null)
    }
  }

  const moveCandidate = async (scrap, nextDayId) => {
    if (!nextDayId || nextDayId === selectedDay?.id) return
    setCandidateBusyId(scrap.id)
    setScheduleError('')
    try {
      await setScrapScheduleCandidate({ scrapId: scrap.id, tripId: trip.id, dayId: nextDayId })
      await loadCandidates(selectedDay?.id)
    } catch (error) {
      setScheduleError(error.message)
    } finally {
      setCandidateBusyId(null)
    }
  }

  const toggleCandidateWish = async (scrap) => {
    setReactionBusyId(`wish:${scrap.id}`)
    setScheduleError('')
    try {
      await toggleScrapWish(scrap)
      await loadCandidates(selectedDay?.id)
    } catch (error) {
      setScheduleError(error.message)
    } finally {
      setReactionBusyId('')
    }
  }

  const voteOnItem = async (item, vote) => {
    setReactionBusyId(`vote:${item.id}`)
    setScheduleError('')
    try {
      await setItineraryVote(item.id, item.my_vote === vote ? null : vote)
      await load(selectedDay?.id)
    } catch (error) {
      setScheduleError(error.message)
    } finally {
      setReactionBusyId('')
    }
  }

  const saveMemo = async () => {
    if (!selectedDay) return
    setSavingMemo(true)
    try {
      await updateDayMemo(selectedDay.id, dayMemo)
      setDays((prev) => prev.map((day) => day.id === selectedDay.id ? { ...day, memo: dayMemo.trim() || null } : day))
    } catch (error) {
      setScheduleError(error.message)
    } finally {
      setSavingMemo(false)
    }
  }

  const moveUnscheduled = async (item, direction) => {
    try {
      await moveItineraryItem(unscheduledItems, item.id, direction)
      await load(selectedDay?.id)
    } catch (error) {
      setScheduleError(error.message)
    }
  }

  return (
    <>
      <div className="schedule-desktop-layout">
        <aside className="schedule-desktop-sidebar">
      <div className="day-selector">
        {days.map((day) => (
          <button
            key={day.id}
            className={selectedDay?.id === day.id ? 'active' : ''}
            onClick={() => setSelectedDayId(day.id)}
          >
            DAY {day.day_number}
          </button>
        ))}
      </div>

      <div className="day-heading">
        <div>
          <p className="eyebrow">DAY {selectedDay?.day_number || 1}</p>
          <h2>{selectedDay ? formatDayHeading(selectedDay.trip_date) : '불러오는 중'}</h2>
        </div>
      </div>

      <div className={`schedule-main-actions ${readOnly ? 'read-only' : ''}`}>
        {!readOnly && <button className="primary-wide" onClick={() => setEditingItem({ __new: true })}><Plus size={18} /> 일정 추가</button>}
        <button className="outline-btn schedule-route-action" onClick={() => setShowDayMap(true)}><MapPinned size={17} /> 오늘 동선</button>
        {!readOnly && <button className="secondary-wide" onClick={() => setGrouping({})}><Layers3 size={17} /> 방문 묶음</button>}
      </div>
        </aside>
        <div className="schedule-desktop-main">

      {scheduleError && <div className="schedule-alert">{scheduleError}</div>}
      {loadingSchedule && <div className="schedule-loading">일정을 불러오는 중…</div>}

      {selectedDayLodgings.length > 0 && (
        <section className="day-lodging-panel" aria-label="오늘의 숙소">
          <div className="day-lodging-heading"><span><BedDouble size={17} /></span><div><small>STAY</small><strong>오늘의 숙소</strong></div></div>
          <div className="day-lodging-list">
            {selectedDayLodgings.map((lodging) => (
              <div className="day-lodging-card" key={lodging.id}>
                <div><strong>{lodging.title}</strong><small>{lodging.provider || '숙소 예약'}</small></div>
                <span>{lodging.lodgingState}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {candidateScraps.length > 0 && (
        <section className="schedule-candidate-panel" aria-label="일정 후보">
          <div className="schedule-candidate-heading">
            <div><small>MAYBE</small><strong>DAY {selectedDay?.day_number} 일정 후보</strong><p>스크랩에서 아직 확정하지 않은 장소예요.</p></div>
            <span>{candidateScraps.length}</span>
          </div>
          <div className="schedule-candidate-list">
            {candidateScraps.map((scrap) => {
              const tags = getScrapTags(scrap)
              const place = scrap.trip_on_places
              const busy = candidateBusyId === scrap.id
              return (
                <article className="schedule-candidate-card" key={scrap.id}>
                  <div className="schedule-candidate-copy">
                    <div className="schedule-candidate-title"><span><MapPin size={15} /></span><strong>{scrap.title}</strong></div>
                    <small>{[place?.city, tags.slice(0, 2).join(' · ')].filter(Boolean).join(' · ') || '스크랩 장소'}</small>
                    <button type="button" className={`candidate-wish ${scrap.wished_by_me ? 'active' : ''}`} disabled={readOnly || reactionBusyId === `wish:${scrap.id}`} onClick={() => toggleCandidateWish(scrap)}><Heart size={13} fill={scrap.wished_by_me ? 'currentColor' : 'none'} /> 가고 싶어요 {scrap.wish_count || 0}</button>
                  </div>
                  {!readOnly && (
                    <div className="schedule-candidate-actions">
                      <select value={selectedDay?.id || ''} disabled={busy} onChange={(e) => moveCandidate(scrap, e.target.value)} aria-label={`${scrap.title} 후보 DAY 변경`}>
                        {days.map((day) => <option key={day.id} value={day.id}>DAY {day.day_number}</option>)}
                      </select>
                      <button className="candidate-release" disabled={busy} onClick={() => releaseCandidate(scrap)}>후보 해제</button>
                      <button className="candidate-promote" disabled={busy} onClick={() => promoteCandidate(scrap)}>{busy ? '처리 중…' : '일정에 넣기'}</button>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </section>
      )}

      {!loadingSchedule && scheduledItems.length === 0 && briefActualItems.length === 0 && unscheduledItems.length === 0 && (
        <div className="timeline-empty"><CalendarDays size={30} /><strong>아직 일정이 없어요</strong><p>시간을 정해도 되고, 시간 미정 상태로 먼저 담아도 돼요. 한 DAY에 여러 도시 일정도 자유롭게 넣을 수 있어요.</p></div>
      )}

      {scheduledItems.length > 0 && (
        <div className="schedule-timeline">
          {scheduledItems.map((item, index) => {
            const previousCity = scheduledItems[index - 1]?.city
            const showCity = item.city && item.city !== previousCity
            return (
              <React.Fragment key={item.id}>
                {showCity && <div className="city-divider"><MapPin size={14} /><span>{item.city}</span></div>}
                <ScheduleCard item={item} onClick={() => setViewingItem(item)} readOnly={readOnly} voteBusy={reactionBusyId === `vote:${item.id}`} onVote={(vote) => voteOnItem(item, vote)} />
              </React.Fragment>
            )
          })}
        </div>
      )}

      {briefActualItems.length > 0 && (
        <section className="brief-actual-section">
          <button className="brief-actual-toggle" onClick={() => setShowBriefActual((value) => !value)}>
            <div>
              <span>짧은 방문 묶음 후보</span>
              <small>Timeline이 짧게 기록한 장소를 비슷한 시간대끼리 모아봤어요. 필요하면 대표 장소를 정해 한 묶음으로 저장할 수 있어요.</small>
            </div>
            <span className="brief-actual-count">{briefVisitClusters.length}</span>
            {showBriefActual ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          </button>
          {showBriefActual && (
            <div className="brief-cluster-list">
              {briefVisitClusters.map((cluster) => {
                const first = cluster.items[0]
                const time = timeInZone(first.actual_start_at, first.actual_start_timezone || first.start_timezone || DEFAULT_TIMEZONE)
                const names = cluster.items.map((item) => item.title)
                const canGroup = cluster.groupableIds.length >= 2
                const representativeName = cluster.representative?.title || names[0]
                return (
                  <div className="brief-cluster-card" key={cluster.key}>
                    <div className="brief-cluster-head">
                      <time>{time}</time>
                      <span>{cluster.groupableIds.length}곳</span>
                    </div>
                    <strong>{cluster.representative ? `${representativeName} 주변` : '비슷한 시간대 방문'}</strong>
                    <p>{names.join(' · ')}</p>
                    <div className="brief-cluster-actions">
                      <button onClick={() => setViewingItem(first)}>기록 보기</button>
                      {canGroup && !readOnly && (
                        <button className="accent" onClick={() => setGrouping({
                          initialIds: cluster.groupableIds,
                          representativeId: cluster.representative?.id || cluster.groupableIds[0],
                          suggestedTitle: cluster.representative ? `${cluster.representative.title} 방문` : '',
                        })}><Layers3 size={14} /> 묶기</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      <section className="unscheduled-section">
        <div className="unscheduled-title"><div><span>시간 미정</span><small>시간이 정해지지 않은 일정은 여기에 모여요.</small></div>{!readOnly && <button onClick={() => setEditingItem({ __new: true, is_time_unscheduled: true })}><Plus size={17} /></button>}</div>
        {unscheduledItems.length === 0 ? (
          <div className="unscheduled-empty">아직 시간 미정 일정이 없어요.</div>
        ) : (
          <div className="unscheduled-list">
            {unscheduledItems.map((item, index) => (
              <div className="unscheduled-row" key={item.id}>
                <button className="unscheduled-main" onClick={() => setViewingItem(item)}>
                  <span className="unscheduled-dot" />
                  <span className="unscheduled-copy"><span className="unscheduled-name-row"><strong>{item.title}</strong><span className={`schedule-status ${item.status}`}>{statusLabels[item.status] || item.status}</span></span><small>{[item.city, categoryLabels[item.category] || item.category].filter(Boolean).join(' · ') || '상세 정보 없음'}</small></span>
                </button>
                <ScheduleVoteStrip item={item} compact readOnly={readOnly} busy={reactionBusyId === `vote:${item.id}`} onVote={(vote) => voteOnItem(item, vote)} />
                {!readOnly && <div className="order-buttons">
                  <button disabled={index === 0} onClick={() => moveUnscheduled(item, -1)} aria-label="위로"><ChevronUp size={16} /></button>
                  <button disabled={index === unscheduledItems.length - 1} onClick={() => moveUnscheduled(item, 1)} aria-label="아래로"><ChevronDown size={16} /></button>
                </div>}
              </div>
            ))}
          </div>
        )}
      </section>

      {(plannedTravelSummary.segmentCount > 0 || actualTravelSummary?.segmentCount > 0 || loadingTravelSummary) && (
        <section className="day-travel-summary day-travel-summary-near-memo" aria-label="오늘 이동 요약">
          <div className="day-travel-summary-head">
            <div><small>MOVE</small><strong>오늘 이동 요약</strong></div>
            <div className="day-travel-summary-actions">
              <button type="button" className={`travel-plan-visibility ${showPlannedTravelEstimate ? 'active' : ''}`} onClick={() => onPreferencesChange?.({ showPlannedTravelEstimate: !showPlannedTravelEstimate })} aria-pressed={showPlannedTravelEstimate}>
                {showPlannedTravelEstimate ? <Eye size={13} /> : <EyeOff size={13} />} 계획시간 {showPlannedTravelEstimate ? '숨기기' : '보기'}
              </button>
              <button type="button" onClick={() => setShowDayMap(true)}><MapPinned size={14} /> 동선 보기</button>
            </div>
          </div>
          <div className={`day-travel-summary-grid ${showPlannedTravelEstimate ? '' : 'planned-hidden'}`}>
            {showPlannedTravelEstimate && (
              <article className="day-travel-summary-card planned">
                <div className="day-travel-summary-card-head"><span>계획</span><small>{plannedTravelSummary.segmentCount ? `${plannedTravelSummary.segmentCount}구간` : '이동 일정 없음'}</small></div>
                <strong>{plannedTravelSummary.totalMinutes ? `약 ${formatTravelDuration(plannedTravelSummary.totalMinutes)}` : plannedTravelSummary.segmentCount ? '시간 미입력' : '—'}</strong>
                {plannedTravelSummary.segmentCount > 0 && <p>{plannedTravelSummary.timedSegmentCount}/{plannedTravelSummary.segmentCount}구간 이동시간 입력됨</p>}
                {plannedTravelSummary.byTransport.length > 0 && <div className="day-travel-chips">{plannedTravelSummary.byTransport.map((row) => <span key={row.transportType}>{transportLabels[row.transportType] || '기타'}{row.minutes ? ` ${formatTravelDuration(row.minutes)}` : ` ${row.count}구간`}</span>)}</div>}
              </article>
            )}
            <article className="day-travel-summary-card actual">
              <div className="day-travel-summary-card-head"><span>실제</span><small>{actualTravelSummary?.segmentCount ? `${actualTravelSummary.segmentCount}구간` : selectedDay?.trip_date ? 'Timeline 기준' : '날짜 확정 후'}</small></div>
              {loadingTravelSummary ? <strong className="travel-summary-loading">불러오는 중…</strong> : <strong>{actualTravelSummary?.totalMinutes ? formatTravelDuration(actualTravelSummary.totalMinutes) : actualTravelSummary?.segmentCount ? '시간 정보 없음' : '—'}</strong>}
              {!loadingTravelSummary && actualTravelSummary?.distanceMeters > 0 && <p>총 이동거리 {formatTravelDistance(actualTravelSummary.distanceMeters)}</p>}
              {!loadingTravelSummary && actualTravelSummary?.byTransport?.length > 0 && <div className="day-travel-chips">{actualTravelSummary.byTransport.map((row) => <span key={row.transportType}>{timelineTransportLabel(row.transportType)}{row.minutes ? ` ${formatTravelDuration(row.minutes)}` : ''}{row.distanceMeters ? ` · ${formatTravelDistance(row.distanceMeters)}` : ''}</span>)}</div>}
            </article>
          </div>
        </section>
      )}

      <InfoBlock title={`DAY ${selectedDay?.day_number || 1} 메모`}>
        <textarea className="day-memo-input" value={dayMemo} onChange={(e) => setDayMemo(e.target.value)} placeholder="날씨, 이동 팁, 그날의 계획을 자유롭게 적어보세요." readOnly={readOnly} />
        {!readOnly && <button className="memo-save-btn" onClick={saveMemo} disabled={savingMemo}><Save size={15} /> {savingMemo ? '저장 중…' : '메모 저장'}</button>}
      </InfoBlock>
        </div>
      </div>

      {!readOnly && editingItem && selectedDay && (
        <ItineraryEditorModal
          trip={trip}
          day={selectedDay}
          item={editingItem.__new ? null : editingItem}
          siblings={dayItems}
          allItems={items}
          days={days}
          defaultUnscheduled={Boolean(editingItem.is_time_unscheduled)}
          onClose={() => setEditingItem(null)}
          onSaved={async () => {
            setEditingItem(null)
            await load(selectedDay.id)
          }}
        />
      )}

      {viewingItem && selectedDay && (
        <ItineraryDetailModal
          key={viewingItem.id}
          item={viewingItem}
          day={selectedDay}
          onClose={() => setViewingItem(null)}
          onEdit={() => {
            setEditingItem(viewingItem)
            setViewingItem(null)
          }}
          onLink={() => {
            setLinkingItem(viewingItem)
            setViewingItem(null)
          }}
          onEditGroup={() => {
            setGrouping({
              initialIds: [viewingItem.id, ...(viewingItem.group_children || []).map((child) => child.id)],
              representativeId: viewingItem.id,
              suggestedTitle: viewingItem.group_title || viewingItem.title,
              existingParentId: viewingItem.id,
            })
            setViewingItem(null)
          }}
          onOpenRelated={(related) => setViewingItem(related)}
          onDissolveGroup={async () => {
            await dissolveVisitGroup(viewingItem.id)
            setViewingItem(null)
            await load(selectedDay.id)
          }}
          onChanged={async () => {
            setViewingItem(null)
            await load(selectedDay.id)
          }}
          readOnly={readOnly}
        />
      )}

      {!readOnly && linkingItem && selectedDay && (
        <ItineraryLinkModal
          item={linkingItem}
          day={selectedDay}
          dayItems={dayItems}
          allItems={items}
          days={days}
          onClose={() => setLinkingItem(null)}
          onSaved={async () => {
            setLinkingItem(null)
            await load(selectedDay.id)
          }}
        />
      )}

      {!readOnly && grouping && selectedDay && (
        <VisitGroupModal
          day={selectedDay}
          dayItems={dayItems}
          initialIds={grouping.initialIds || []}
          representativeId={grouping.representativeId || ''}
          suggestedTitle={grouping.suggestedTitle || ''}
          existingParentId={grouping.existingParentId || ''}
          onClose={() => setGrouping(null)}
          onSaved={async () => {
            setGrouping(null)
            await load(selectedDay.id)
          }}
        />
      )}

      {showDayMap && selectedDay && (
        <DayMapSheet
          day={selectedDay}
          items={scheduledItems.length ? scheduledItems : unscheduledItems}
          tripId={trip.id}
          plannedTravelSummary={plannedTravelSummary}
          showPlannedTravelEstimate={showPlannedTravelEstimate}
          onClose={() => setShowDayMap(false)}
        />
      )}
    </>
  )
}

function formatDayHeading(dateString) {
  if (!dateString) return '날짜 미정'
  const date = new Date(`${dateString}T00:00:00`)
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return `${date.getMonth() + 1}월 ${date.getDate()}일 · ${weekdays[date.getDay()]}요일`
}

const categoryLabels = {
  place: '장소', food: '식사', cafe: '카페', shopping: '쇼핑', transport: '이동', accommodation: '숙소', activity: '관광·체험', other: '기타',
}
const transportLabels = {
  walk: '도보', subway: '지하철', bus: '버스', train: '기차', taxi: '택시', car: '자동차', flight: '비행기', other: '기타',
}
const statusLabels = { planned: '예정', completed: '완료', skipped: '미방문', cancelled: '취소' }

function formatTravelDuration(totalMinutes) {
  const total = Number(totalMinutes || 0)
  if (!Number.isFinite(total) || total <= 0) return ''
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours && minutes) return `${hours}시간 ${minutes}분`
  if (hours) return `${hours}시간`
  return `${minutes}분`
}

function transportRouteLabel(item) {
  if (item?.category !== 'transport') return ''
  const origin = item.origin_place?.name
  const destination = item.destination_place?.name
  if (origin && destination) return `${origin} → ${destination}`
  return origin || destination || ''
}

function ScheduleCard({ item, onClick, onVote, readOnly = false, voteBusy = false }) {
  const [groupExpanded, setGroupExpanded] = useState(false)
  const hasPlannedTime = Boolean(item.start_at && !item.is_time_unscheduled)
  const actualRange = actualRangeForItem(item)
  const hasActualTime = Boolean(actualRange.start)
  const actualRecord = isTimelineActualItem(item)
  const useActualTimeline = actualRecord && hasActualTime
  const actualOnly = useActualTimeline || (!hasPlannedTime && hasActualTime)
  const startSource = useActualTimeline ? actualRange.start : (actualOnly ? actualRange.start : item.start_at)
  const endSource = useActualTimeline ? actualRange.end : (actualOnly ? actualRange.end : item.end_at)
  const startZone = actualOnly
    ? (actualRange.records[0]?.actual_start_timezone || item.actual_start_timezone || item.start_timezone || DEFAULT_TIMEZONE)
    : (item.start_timezone || DEFAULT_TIMEZONE)
  const lastActual = actualRange.records[actualRange.records.length - 1]
  const endZone = actualOnly
    ? (lastActual?.actual_end_timezone || lastActual?.end_timezone || item.actual_end_timezone || item.end_timezone || startZone)
    : (item.end_timezone || item.start_timezone || DEFAULT_TIMEZONE)
  const start = startSource ? timeInZone(startSource, startZone) : ''
  const end = endSource ? timeInZone(endSource, endZone) : ''
  const actualStart = !actualRecord && hasPlannedTime && hasActualTime
    ? timeInZone(actualRange.start, actualRange.records[0]?.actual_start_timezone || item.start_timezone || DEFAULT_TIMEZONE)
    : ''
  const actualEnd = !actualRecord && hasPlannedTime && actualRange.end
    ? timeInZone(actualRange.end, lastActual?.actual_end_timezone || lastActual?.end_timezone || item.end_timezone || item.start_timezone || DEFAULT_TIMEZONE)
    : ''
  const duration = formatTravelDuration(item.travel_minutes)
  const routeLabel = transportRouteLabel(item)
  const groupChildren = item.group_children || []
  const linkedActuals = item.linked_actuals || []
  const groupCount = item.is_visit_group ? groupChildren.length + 1 : 0
  const linkedCount = linkedActuals.length
  const linkMode = linkDisplayMode(item)
  const showPlanSummary = !isTimelineActualItem(item) && linkedCount > 0 && (linkMode === 'plan' || linkMode === 'both')
  const showActualPlanSummary = isTimelineActualItem(item) && item.linked_plan && (linkMode === 'actual' || linkMode === 'both')
  const linkedVisitCount = linkedActuals.reduce((sum, actual) => sum + (actual.is_visit_group ? (actual.group_children?.length || 0) + 1 : 1), 0)
  const summaryRecords = item.is_visit_group
    ? groupChildren
    : showPlanSummary ? linkedActuals.flatMap((actual) => actual.is_visit_group ? [actual, ...(actual.group_children || [])] : [actual]) : []
  const summaryNames = summaryRecords.map((entry) => entry.title).filter(Boolean)
  const title = scheduleDisplayTitle(item)
  const groupedRecords = item.is_visit_group ? [item, ...groupChildren] : []

  const activate = (event) => {
    if (event?.target?.closest?.('button')) return
    onClick?.()
  }

  return (
    <div
      className={`schedule-card status-${item.status} category-${item.category || 'other'} ${actualOnly ? 'actual-only' : ''} ${item.is_visit_group ? 'visit-group' : ''} ${item.linked_plan_id ? 'linked-actual-card' : ''}`}
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget && event.target?.closest?.('button')) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick?.()
        }
      }}
    >
      <div className={`schedule-time ${actualOnly ? 'actual' : ''}`}><strong>{start || '—'}</strong>{end && <small>{end}</small>}</div>
      <div className="schedule-line"><span /></div>
      <div className="schedule-card-copy">
        <div className="schedule-card-top">
          <strong>{title}</strong>
          <span className="schedule-card-badges">
            {!item.is_visit_group && showPlanSummary && <span className="schedule-link-chip"><Link2 size={11} /> 실제 {linkedVisitCount}{linkedVisitCount > 1 ? '곳' : ''}</span>}
            {showActualPlanSummary && <span className="schedule-link-chip"><Link2 size={11} /> 예정 1개</span>}
            {actualOnly && <span className="schedule-actual-chip">실제</span>}
            <span className={`schedule-status ${item.status}`}>{statusLabels[item.status] || item.status}</span>
          </span>
        </div>
        <small>{[categoryLabels[item.category] || item.category, item.city].filter(Boolean).join(' · ') || '일정'}</small>
        {item.is_visit_group && (
          <div className="schedule-group-control-row">
            <button type="button" className={`schedule-group-chip ${groupExpanded ? 'expanded' : ''}`} onClick={(event) => { event.stopPropagation(); setGroupExpanded((value) => !value) }}>
              <Layers3 size={10} /> 묶음 {groupCount}곳 {groupExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
            {!groupExpanded && summaryNames.length > 0 && <span className="schedule-group-inline-summary">{summaryNames.slice(0, 2).join(' · ')}{summaryNames.length > 2 ? ` 외 ${summaryNames.length - 2}` : ''}</span>}
          </div>
        )}
        {actualStart && <div className="schedule-actual-line"><Check size={12} /> 실제 {actualStart}{actualEnd ? `–${actualEnd}` : ''}</div>}
        {!item.is_visit_group && summaryNames.length > 0 && <div className="schedule-linked-summary">{summaryNames.slice(0, 3).join(' · ')}{summaryNames.length > 3 ? ` 외 ${summaryNames.length - 3}곳` : ''}</div>}
        {showActualPlanSummary && <div className="schedule-linked-summary">예정 일정 · {scheduleDisplayTitle(item.linked_plan)}</div>}
        {item.is_visit_group && groupExpanded && (
          <div className="schedule-group-expanded" onClick={(event) => event.stopPropagation()}>
            {groupedRecords.map((record, index) => {
              const recordTime = record.actual_start_at ? timeInZone(record.actual_start_at, record.actual_start_timezone || record.start_timezone || DEFAULT_TIMEZONE) : '—'
              return <div className="schedule-group-expanded-row" key={record.id}><time>{recordTime}</time><span><strong>{record.title}</strong><small>{index === 0 ? '대표 장소' : (record.city || '방문 장소')}</small></span></div>
            })}
            <button type="button" className="schedule-group-collapse" onClick={(event) => { event.stopPropagation(); setGroupExpanded(false) }}><ChevronUp size={11} /> 접기</button>
          </div>
        )}
        {routeLabel && routeLabel !== item.title && <div className="schedule-route-label"><MapPin size={12} /> {routeLabel}</div>}
        {(item.transport_type || duration) && <em><Navigation size={13} /> {transportLabels[item.transport_type] || item.transport_type || '이동'}{duration ? ` · 약 ${duration}` : ''}</em>}
        {item.rating && <div className="schedule-rating"><Star size={13} fill="currentColor" /> {Number(item.rating).toFixed(1)}</div>}
        <ScheduleVoteStrip item={item} onVote={onVote} readOnly={readOnly} busy={voteBusy} />
      </div>
      <ChevronRight size={17} />
    </div>
  )
}

const itineraryVoteOptions = [
  { key: 'go', label: '가자', Icon: CheckCircle2 },
  { key: 'maybe', label: '보류', Icon: CircleHelp },
  { key: 'skip', label: '패스', Icon: XCircle },
]

function ScheduleVoteStrip({ item, onVote, readOnly = false, busy = false, compact = false }) {
  if (!item || isTimelineActualItem(item) || item.linked_plan_id) return null
  const counts = item.vote_counts || { go: 0, maybe: 0, skip: 0 }
  return (
    <div className={`schedule-vote-strip ${compact ? 'compact' : ''}`} onClick={(event) => event.stopPropagation()}>
      {itineraryVoteOptions.map(({ key, label, Icon }) => (
        <button
          type="button"
          key={key}
          className={item.my_vote === key ? 'active' : ''}
          disabled={readOnly || busy}
          onClick={(event) => { event.stopPropagation(); onVote?.(key) }}
          title={readOnly ? '보기 전용 여행에서는 투표할 수 없어요.' : `${label} 투표`}
        >
          <Icon size={12} /> <span>{label}</span><em>{counts[key] || 0}</em>
        </button>
      ))}
    </div>
  )
}

const timezoneOptions = [
  ['Asia/Seoul', '서울 · KST'],
  ['Asia/Tokyo', '도쿄 · JST'],
  ['Europe/London', '런던'],
  ['Europe/Paris', '파리'],
  ['Europe/Rome', '로마'],
  ['America/New_York', '뉴욕'],
  ['America/Los_Angeles', 'LA'],
  ['Pacific/Honolulu', '하와이'],
]

function existingPlaceOptionsFromItems(allItems = [], days = [], currentItemId = '') {
  const dayById = new Map((days || []).map((entry) => [entry.id, entry]))
  const dayNumber = (entry) => dayById.get(entry.trip_day_id)?.day_number ?? 999
  const timeValue = (entry) => entry.start_at || entry.actual_start_at || ''
  const ordered = [...(allItems || [])]
    .filter((entry) => entry.id !== currentItemId)
    .sort((a, b) => {
      const dayDiff = dayNumber(a) - dayNumber(b)
      if (dayDiff) return dayDiff
      const aTime = timeValue(a)
      const bTime = timeValue(b)
      if (aTime && bTime) {
        const diff = new Date(aTime) - new Date(bTime)
        if (diff) return diff
      } else if (aTime) return -1
      else if (bTime) return 1
      return (a.sort_order ?? 0) - (b.sort_order ?? 0)
    })

  const options = []
  const seen = new Set()
  const push = (entry, row, role = 'place') => {
    if (!row?.id) return
    const key = row.id
    if (seen.has(key)) return
    seen.add(key)
    const day = dayById.get(entry.trip_day_id)
    const sourceTime = entry.start_at || entry.actual_start_at
    const zone = entry.start_timezone || entry.actual_start_timezone || DEFAULT_TIMEZONE
    options.push({
      key,
      label: role === 'place' ? scheduleDisplayTitle(entry) || row.name : row.name,
      place: { ...placeFromRow(row), selectionLabel: role === 'place' ? scheduleDisplayTitle(entry) || row.name : row.name },
      dayNumber: day?.day_number || null,
      time: sourceTime ? timeInZone(sourceTime, zone) : '',
      role,
    })
  }

  for (const entry of ordered) {
    if (entry.category === 'transport') {
      push(entry, entry.origin_place, 'origin')
      push(entry, entry.destination_place, 'destination')
    } else {
      push(entry, entry.trip_on_places, 'place')
    }
  }
  return options
}

function ExistingPlaceSelect({ label, options, onSelect }) {
  const [value, setValue] = useState('')
  if (!options.length) return null
  return (
    <label className="existing-place-select">{label}<span className="optional">현재 일정 순서</span>
      <select value={value} onChange={(event) => {
        const next = event.target.value
        setValue(next)
        const option = options.find((entry) => entry.key === next)
        if (option) onSelect(option.place)
        window.setTimeout(() => setValue(''), 0)
      }}>
        <option value="">등록된 장소에서 선택</option>
        {options.map((option) => <option key={option.key} value={option.key}>{`${option.dayNumber ? `DAY ${option.dayNumber}` : 'DAY 미정'}${option.time ? ` · ${option.time}` : ''} · ${option.label}`}</option>)}
      </select>
    </label>
  )
}

function ItineraryEditorModal({ trip, day, item, siblings = [], allItems = siblings, days = [day], defaultUnscheduled = false, onClose, onSaved }) {
  const initialTravelMinutes = Number(item?.travel_minutes || 0)
  const editingActualRecord = isTimelineActualItem(item)
  const dayDatePending = !day?.trip_date
  const [title, setTitle] = useState(item?.title || '')
  const [category, setCategory] = useState(item?.category || 'place')
  const [city, setCity] = useState(item?.city || '')
  const [mapPlace, setMapPlace] = useState(() => placeFromRow(item?.trip_on_places))
  const [originPlace, setOriginPlace] = useState(() => placeFromRow(item?.origin_place))
  const [destinationPlace, setDestinationPlace] = useState(() => placeFromRow(item?.destination_place))
  const [isTimeUnscheduled, setIsTimeUnscheduled] = useState(dayDatePending ? true : (item ? item.is_time_unscheduled : defaultUnscheduled))
  const [timezone, setTimezone] = useState(item?.start_timezone || DEFAULT_TIMEZONE)
  const [endTimezone, setEndTimezone] = useState(item?.end_timezone || item?.start_timezone || DEFAULT_TIMEZONE)
  const [startTime, setStartTime] = useState(item?.start_at ? timeInZone(item.start_at, item.start_timezone || DEFAULT_TIMEZONE) : '')
  const [endTime, setEndTime] = useState(item?.end_at ? timeInZone(item.end_at, item.end_timezone || item.start_timezone || DEFAULT_TIMEZONE) : '')
  const [actualStartTime, setActualStartTime] = useState(item?.actual_start_at ? timeInZone(item.actual_start_at, item.actual_start_timezone || item.start_timezone || DEFAULT_TIMEZONE) : '')
  const [actualEndTime, setActualEndTime] = useState(item?.actual_end_at ? timeInZone(item.actual_end_at, item.actual_end_timezone || item.end_timezone || DEFAULT_TIMEZONE) : '')
  const actualStartDate = item?.actual_start_at ? dateInZone(item.actual_start_at, item.actual_start_timezone || item.start_timezone || DEFAULT_TIMEZONE) : day.trip_date
  const actualEndDate = item?.actual_end_at ? dateInZone(item.actual_end_at, item.actual_end_timezone || item.end_timezone || DEFAULT_TIMEZONE) : day.trip_date
  const [transportType, setTransportType] = useState(item?.transport_type || '')
  const [travelHours, setTravelHours] = useState(initialTravelMinutes >= 60 ? String(Math.floor(initialTravelMinutes / 60)) : '')
  const [travelMinutePart, setTravelMinutePart] = useState(initialTravelMinutes % 60 ? String(initialTravelMinutes % 60) : (initialTravelMinutes > 0 && initialTravelMinutes < 60 ? String(initialTravelMinutes) : ''))
  const [expectedCost, setExpectedCost] = useState(item?.expected_cost || '')
  const [expectedCurrency, setExpectedCurrency] = useState(item?.expected_currency || 'KRW')
  const [memo, setMemo] = useState(item?.memo || '')
  const [rating, setRating] = useState(item?.rating ? String(item.rating) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const titleManuallySet = useRef(Boolean(item?.title))
  const originManuallySet = useRef(Boolean(item?.origin_place))
  const destinationManuallySet = useRef(Boolean(item?.destination_place))
  const existingPlaceOptions = useMemo(() => existingPlaceOptionsFromItems(allItems, days, item?.id), [allItems, days, item?.id])

  const inferredNeighbors = useMemo(() => {
    if (category !== 'transport') return { origin: null, destination: null }
    const timed = (siblings || [])
      .filter((candidate) => candidate.id !== item?.id && !candidate.is_time_unscheduled && candidate.start_at)
      .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))

    let previous = null
    let next = null
    if (startTime) {
      for (const candidate of timed) {
        const candidateTime = timeInZone(candidate.start_at, candidate.start_timezone || DEFAULT_TIMEZONE)
        if (!candidateTime) continue
        if (candidateTime <= startTime) previous = candidate
        else if (!next) { next = candidate; break }
      }
    } else {
      previous = timed[timed.length - 1] || null
    }

    const previousRow = previous?.category === 'transport'
      ? previous.destination_place || previous.trip_on_places || previous.origin_place
      : previous?.trip_on_places || previous?.destination_place || previous?.origin_place
    const nextRow = next?.category === 'transport'
      ? next.origin_place || next.trip_on_places || next.destination_place
      : next?.trip_on_places || next?.origin_place || next?.destination_place

    return { origin: placeFromRow(previousRow), destination: placeFromRow(nextRow) }
  }, [category, item, siblings, startTime])

  useEffect(() => {
    if (category !== 'transport') return
    if (!originManuallySet.current) setOriginPlace(inferredNeighbors.origin)
    if (!destinationManuallySet.current) setDestinationPlace(inferredNeighbors.destination)
  }, [category, item, inferredNeighbors])

  useEffect(() => {
    if (category !== 'transport' || titleManuallySet.current) return
    if (originPlace?.name && destinationPlace?.name) setTitle(`${originPlace.selectionLabel || originPlace.name} → ${destinationPlace.selectionLabel || destinationPlace.name}`)
    else setTitle('')
  }, [category, originPlace?.name, originPlace?.selectionLabel, destinationPlace?.name, destinationPlace?.selectionLabel])

  const initialSnapshot = JSON.stringify({
    title: item?.title || '', category: item?.category || 'place', city: item?.city || '',
    isTimeUnscheduled: dayDatePending ? true : (item ? item.is_time_unscheduled : defaultUnscheduled),
    timezone: item?.start_timezone || DEFAULT_TIMEZONE,
    endTimezone: item?.end_timezone || item?.start_timezone || DEFAULT_TIMEZONE,
    startTime: item?.start_at ? timeInZone(item.start_at, item.start_timezone || DEFAULT_TIMEZONE) : '',
    endTime: item?.end_at ? timeInZone(item.end_at, item.end_timezone || item.start_timezone || DEFAULT_TIMEZONE) : '',
    actualStartTime: item?.actual_start_at ? timeInZone(item.actual_start_at, item.actual_start_timezone || item.start_timezone || DEFAULT_TIMEZONE) : '',
    actualEndTime: item?.actual_end_at ? timeInZone(item.actual_end_at, item.actual_end_timezone || item.end_timezone || DEFAULT_TIMEZONE) : '',
    transportType: item?.transport_type || '', travelHours: initialTravelMinutes >= 60 ? String(Math.floor(initialTravelMinutes / 60)) : '',
    travelMinutePart: initialTravelMinutes % 60 ? String(initialTravelMinutes % 60) : (initialTravelMinutes > 0 && initialTravelMinutes < 60 ? String(initialTravelMinutes) : ''),
    expectedCost: item?.expected_cost || '', expectedCurrency: item?.expected_currency || 'KRW', memo: item?.memo || '', rating: item?.rating ? String(item.rating) : '',
    mapKey: item?.trip_on_places?.provider_place_id || item?.trip_on_places?.id || '',
    originKey: item?.origin_place?.provider_place_id || item?.origin_place?.id || '',
    destinationKey: item?.destination_place?.provider_place_id || item?.destination_place?.id || '',
  })
  const currentSnapshot = JSON.stringify({
    title, category, city, isTimeUnscheduled, timezone, endTimezone, startTime, endTime, actualStartTime, actualEndTime,
    transportType, travelHours, travelMinutePart, expectedCost, expectedCurrency, memo, rating,
    mapKey: mapPlace?.providerPlaceId || mapPlace?.dbId || '', originKey: originPlace?.providerPlaceId || originPlace?.dbId || '', destinationKey: destinationPlace?.providerPlaceId || destinationPlace?.dbId || '',
  })
  const requestClose = () => confirmSheetClose(initialSnapshot !== currentSnapshot, onClose)

  const minuteValue = travelMinutePart === '' ? 0 : Number(travelMinutePart)
  const hourValue = travelHours === '' ? 0 : Number(travelHours)
  const totalTravelMinutes = hourValue * 60 + minuteValue
  const autoTransportTitle = originPlace?.name && destinationPlace?.name ? `${originPlace.selectionLabel || originPlace.name} → ${destinationPlace.selectionLabel || destinationPlace.name}` : ''
  const effectiveTitle = title.trim() || (category === 'transport' ? autoTransportTitle : '')
  const canSave = Boolean(effectiveTitle) && (editingActualRecord || isTimeUnscheduled || Boolean(startTime))

  const save = async () => {
    if (!effectiveTitle) {
      setError(category === 'transport' ? '출발지와 도착지를 선택하거나 일정 이름을 입력해주세요.' : '일정 이름을 입력해주세요.')
      return
    }
    if (!editingActualRecord && !isTimeUnscheduled && !startTime) {
      setError('시간을 정한 일정은 시작 시간을 입력해주세요.')
      return
    }
    if (minuteValue < 0 || minuteValue > 59 || hourValue < 0) {
      setError('이동시간의 분은 0~59 사이로 입력해주세요.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await saveItineraryItem({
        trip,
        day,
        draft: {
          id: item?.id,
          title: effectiveTitle, category, city, place: mapPlace, originPlace, destinationPlace, isTimeUnscheduled,
          timezone, endTimezone, startTime, endTime,
          actualStartTime, actualEndTime, actualStartDate, actualEndDate,
          transportType, travelMinutes: totalTravelMinutes || '', expectedCost, expectedCurrency,
          memo, rating, status: item?.status || 'planned',
        },
      })
      await onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SheetBackdrop onRequestClose={requestClose}>
      <div className="create-sheet itinerary-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={requestClose}>취소</button><span>{editingActualRecord ? '실제 방문 수정' : item ? '일정 수정' : '일정 추가'}</span><div /></div>
        <div className="sheet-body itinerary-form">
          <p className="eyebrow">DAY {day.day_number}{day.trip_date ? ` · ${day.trip_date}` : ''}</p>
          <h2>{editingActualRecord ? '실제 방문을 다듬어볼까요?' : item ? '일정을 수정할까요?' : '어떤 일정을 넣을까요?'}</h2>
          {editingActualRecord && <div className="actual-source-note"><Check size={15} /><span><strong>Google Timeline에서 가져온 실제 기록</strong><small>여기서 이름·장소·실제시간·메모를 수정해도 원본 Timeline 파일은 바뀌지 않아요.</small></span></div>}

          <label>일정 이름 <span className="optional">{category === 'transport' ? '출발·도착지 선택 시 자동 입력' : ''}</span><input value={title} onChange={(e) => { titleManuallySet.current = true; setTitle(e.target.value) }} placeholder={category === 'transport' ? '예: 서울역 → 묵호역' : '예: 우메다 스카이빌딩'} /></label>
          <div className="form-two">
            <label>종류<select value={category} onChange={(e) => { setCategory(e.target.value); if (e.target.value !== 'transport' && !item) { originManuallySet.current = false; destinationManuallySet.current = false } }}>{Object.entries(categoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label>도시 <span className="optional">선택</span><input value={city} onChange={(e) => setCity(e.target.value)} placeholder="예: 오사카" /></label>
          </div>

          {category === 'transport' ? (
            <div className="transport-place-fields">
              <ExistingPlaceSelect label="출발지 · 기존 장소" options={existingPlaceOptions} onSelect={(value) => { originManuallySet.current = true; setOriginPlace(value); if (value.timezone) setTimezone(value.timezone) }} />
              <PlaceSearchField
                value={originPlace}
                onChange={(value) => { originManuallySet.current = true; setOriginPlace(value) }}
                onApply={(result) => {
                  if (result.timezone) setTimezone(result.timezone)
                }}
                label="출발지"
                placeholder="예: 서울역"
                contextText={`${trip.destinations.join(' ')} ${city}`}
              />
              <div className="transport-route-arrow"><Navigation size={16} /><span>출발 → 도착</span></div>
              <ExistingPlaceSelect label="도착지 · 기존 장소" options={existingPlaceOptions} onSelect={(value) => { destinationManuallySet.current = true; setDestinationPlace(value); if (!city.trim() && value.city) setCity(value.city); if (value.timezone) setEndTimezone(value.timezone) }} />
              <PlaceSearchField
                value={destinationPlace}
                onChange={(value) => { destinationManuallySet.current = true; setDestinationPlace(value) }}
                onApply={(result) => {
                  if (!city.trim() && result.city) setCity(result.city)
                  if (result.timezone) setEndTimezone(result.timezone)
                }}
                label="도착지"
                placeholder="예: 묵호역"
                contextText={`${trip.destinations.join(' ')} ${city}`}
              />
              <small className="transport-autofill-note">앞뒤 일정에 좌표가 연결된 장소가 있으면 시간 순서를 기준으로 출발지·도착지를 자동 제안해요. 자동 입력된 값은 언제든 바꿀 수 있어요.</small>
            </div>
          ) : (
            <PlaceSearchField
              value={mapPlace}
              onChange={setMapPlace}
              onApply={(result) => {
                if (!title.trim()) setTitle(result.name || '')
                if (result.city) setCity(result.city)
              }}
              label="장소 연결"
              placeholder="예: Umeda Sky Building"
              contextText={`${trip.destinations.join(' ')} ${city}`}
            />
          )}

          {dayDatePending && <div className="actual-source-note"><CalendarDays size={15} /><span><strong>아직 여행 날짜가 미정이에요</strong><small>DAY별 장소와 메모는 먼저 짤 수 있어요. 정확한 날짜를 정하면 시간도 입력할 수 있어요.</small></span></div>}
          <label className="checkbox-row"><input type="checkbox" checked={isTimeUnscheduled} disabled={dayDatePending} onChange={(e) => setIsTimeUnscheduled(e.target.checked)} /> 아직 시간을 정하지 않았어요</label>

          {!dayDatePending && !isTimeUnscheduled && (
            <>
              <div className="form-two">
                <label>시작 시간<input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label>
                <label>종료 시간 <span className="optional">선택</span><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></label>
              </div>
              <div className="form-two">
                <label>시작 시간대<select value={timezone} onChange={(e) => { setTimezone(e.target.value); if (!item?.end_timezone) setEndTimezone(e.target.value) }}>{timezoneOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                <label>종료 시간대<select value={endTimezone} onChange={(e) => setEndTimezone(e.target.value)}>{timezoneOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              </div>
            </>
          )}

          <label>이동수단 <span className="optional">선택</span><select value={transportType} onChange={(e) => setTransportType(e.target.value)}><option value="">없음</option>{Object.entries(transportLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <div className="travel-duration-block">
            <span className="travel-duration-title">이동시간 <em>선택</em></span>
            <div className="travel-duration-inputs">
              <label><input type="number" inputMode="numeric" min="0" value={travelHours} onChange={(e) => setTravelHours(e.target.value)} placeholder="2" /><span>시간</span></label>
              <label><input type="number" inputMode="numeric" min="0" max="59" value={travelMinutePart} onChange={(e) => setTravelMinutePart(e.target.value)} placeholder="25" /><span>분</span></label>
            </div>
            {(hourValue > 0 || minuteValue > 0) && <small>표시: 약 {formatTravelDuration(totalTravelMinutes)}</small>}
          </div>

          <div className="form-two">
            <label>예상 비용 <span className="optional">선택</span><input type="number" min="0" value={expectedCost} onChange={(e) => setExpectedCost(e.target.value)} placeholder="1500" /></label>
            <label>통화<select value={expectedCurrency} onChange={(e) => setExpectedCurrency(e.target.value)}><option>KRW</option><option>JPY</option><option>USD</option><option>EUR</option><option>GBP</option></select></label>
          </div>

          {!dayDatePending && <div className="actual-time-box">
            <strong>실제 시간 <span className="optional">선택</span></strong>
            <small>여행 중이나 여행 후에 실제 방문 시간을 남길 수 있어요.</small>
            <div className="form-two">
              <label>실제 시작<input type="time" value={actualStartTime} onChange={(e) => setActualStartTime(e.target.value)} /></label>
              <label>실제 종료<input type="time" value={actualEndTime} onChange={(e) => setActualEndTime(e.target.value)} /></label>
            </div>
          </div>}

          <label>메모 <span className="optional">선택</span><textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예약 팁, 볼 것, 먹을 것 등을 적어두세요." /></label>

          <RatingSlider value={rating} onChange={setRating} />

          {error && <div className="schedule-alert">{error}</div>}
          <button className="sheet-primary" disabled={!canSave || saving} onClick={save}>{saving ? '저장 중…' : editingActualRecord ? '실제 기록 저장' : item ? '수정 저장' : '일정 추가'}</button>
        </div>
      </div>
    </SheetBackdrop>
  )
}

function ItineraryDetailModal({ item, day, onClose, onEdit, onLink, onEditGroup, onDissolveGroup, onOpenRelated, onChanged, readOnly = false }) {
  const [working, setWorking] = useState(false)
  const [showMiniMap, setShowMiniMap] = useState(false)
  const actualRecord = isTimelineActualItem(item)
  const linkedActuals = item.linked_actuals || []
  const groupChildren = item.group_children || []
  const actualRange = actualRangeForItem(item)
  const hasPlannedTime = Boolean(item.start_at && !item.is_time_unscheduled)
  const start = hasPlannedTime ? timeInZone(item.start_at, item.start_timezone || DEFAULT_TIMEZONE) : '시간 미정'
  const end = hasPlannedTime && item.end_at ? timeInZone(item.end_at, item.end_timezone || item.start_timezone || DEFAULT_TIMEZONE) : ''
  const actualStart = actualRange.start ? timeInZone(actualRange.start, actualRange.records[0]?.actual_start_timezone || item.actual_start_timezone || item.start_timezone || DEFAULT_TIMEZONE) : ''
  const lastActualRecord = actualRange.records[actualRange.records.length - 1]
  const actualEnd = actualRange.end ? timeInZone(actualRange.end, lastActualRecord?.actual_end_timezone || lastActualRecord?.end_timezone || item.actual_end_timezone || item.end_timezone || DEFAULT_TIMEZONE) : ''
  const duration = formatTravelDuration(item.travel_minutes)
  const routePoints = [item.origin_place, item.destination_place]
    .filter((place) => place?.latitude != null && place?.longitude != null)
    .map((place) => ({ id: place.id, ...placeFromRow(place) }))

  const changeStatus = async (status) => {
    setWorking(true)
    try {
      await updateItineraryStatus(item.id, status)
      await onChanged()
    } finally { setWorking(false) }
  }

  const remove = async () => {
    if (!window.confirm('이 일정을 삭제할까요?')) return
    setWorking(true)
    try {
      await deleteItineraryItem(item.id)
      await onChanged()
    } finally { setWorking(false) }
  }

  return (
    <SheetBackdrop onRequestClose={onClose}>
      <div className="create-sheet itinerary-detail-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={onClose}>닫기</button><span>{actualRecord ? '실제 방문 상세' : '일정 상세'}</span>{readOnly ? <div /> : <button className="detail-edit-head" onClick={onEdit}><Pencil size={14} /> {actualRecord ? '실제 수정' : '수정'}</button>}</div>
        <div className="sheet-body">
          <div className="detail-status-line">
            <span className={`schedule-status ${item.status}`}>{statusLabels[item.status]}</span>
            {actualRecord && <span className="detail-source-chip actual">실제 · Timeline</span>}
            {!actualRecord && <span className="detail-source-chip planned">예정</span>}
            <small>DAY {day.day_number}{day.trip_date ? ` · ${day.trip_date}` : ''}</small>
          </div>
          <h2 className="itinerary-detail-title">{scheduleDisplayTitle(item)}</h2>

          {item.category === 'transport' && (item.origin_place || item.destination_place) && (
            <div className="transport-route-detail">
              <div className="transport-stop"><span className="route-dot start" /><div><small>출발지</small><strong>{item.origin_place?.name || '미입력'}</strong>{item.origin_place && <span>{item.origin_place.address || [item.origin_place.country, item.origin_place.city].filter(Boolean).join(' · ')}</span>}</div></div>
              <div className="transport-route-line" />
              <div className="transport-stop"><span className="route-dot end" /><div><small>도착지</small><strong>{item.destination_place?.name || '미입력'}</strong>{item.destination_place && <span>{item.destination_place.address || [item.destination_place.country, item.destination_place.city].filter(Boolean).join(' · ')}</span>}</div></div>
              {routePoints.length > 0 && <button type="button" onClick={() => setShowMiniMap((value) => !value)}>{showMiniMap ? '지도 접기' : '지도 보기'}</button>}
              {showMiniMap && routePoints.length > 0 && <div className="itinerary-mini-map"><MapCanvas className="mini-map-canvas" points={routePoints} connectPoints={routePoints.length > 1} /></div>}
            </div>
          )}

          {item.category !== 'transport' && item.trip_on_places && (
            <div className="itinerary-place-detail">
              <div><MapPin size={17} /><span><strong>{actualRecord ? scheduleDisplayTitle(item) : item.trip_on_places.name}</strong><small>{item.trip_on_places.address || [item.trip_on_places.country, item.trip_on_places.city].filter(Boolean).join(' · ')}</small></span></div>
              {item.trip_on_places.latitude != null && item.trip_on_places.longitude != null && <button onClick={() => setShowMiniMap((value) => !value)}>{showMiniMap ? '지도 접기' : '지도 보기'}</button>}
              {showMiniMap && item.trip_on_places.latitude != null && item.trip_on_places.longitude != null && (() => { const mappedPlace = placeFromRow(item.trip_on_places); return <div className="itinerary-mini-map"><MapCanvas className="mini-map-canvas" points={[{ id: item.trip_on_places.id, ...mappedPlace }]} /><button className="mini-map-external" onClick={() => window.open(externalMapUrl(mappedPlace), '_blank', 'noopener,noreferrer')}><MapPinned size={15} /> {externalMapLabel(mappedPlace)}</button></div> })()}
            </div>
          )}
          <p className="itinerary-detail-meta">{[item.city, categoryLabels[item.category] || item.category].filter(Boolean).join(' · ')}</p>

          <div className="detail-facts">
            <div><Clock size={18} /><span><small>예정 시간</small><strong>{start}{end ? ` — ${end}` : ''}</strong>{!item.is_time_unscheduled && <em>{item.start_timezone}</em>}</span></div>
            {(actualStart || actualEnd) && <div><Check size={18} /><span><small>실제 시간</small><strong>{actualStart || '—'}{actualEnd ? ` — ${actualEnd}` : ''}</strong></span></div>}
            {(item.transport_type || duration) && <div><Navigation size={18} /><span><small>이동</small><strong>{transportLabels[item.transport_type] || '이동'}{duration ? ` · 약 ${duration}` : ''}</strong></span></div>}
            {item.expected_cost != null && <div><WalletCards size={18} /><span><small>예상 비용</small><strong>{Number(item.expected_cost).toLocaleString()} {item.expected_currency || ''}</strong></span></div>}
            {item.rating && <div><Star size={18} fill="currentColor" /><span><small>별점</small><strong>{Number(item.rating).toFixed(1)} / 5.0</strong></span></div>}
          </div>

          {item.memo && <div className="itinerary-memo"><small>메모</small><p>{item.memo}</p></div>}

          {item.linked_plan && (
            <div className="schedule-relation-card">
              <span className="relation-icon"><Link2 size={16} /></span>
              <div><small>연결된 예정 일정</small><strong>{scheduleDisplayTitle(item.linked_plan)}</strong></div>
            </div>
          )}

          {linkedActuals.length > 0 && (
            <div className="schedule-related-block">
              <div className="schedule-related-head"><div><small>연결된 실제 기록</small><strong>{linkedActuals.length}개</strong></div><Link2 size={16} /></div>
              <div className="schedule-related-list">
                {linkedActuals.map((actual) => (
                  <button type="button" key={actual.id} onClick={() => onOpenRelated?.(actual)}><time>{timeInZone(actual.actual_start_at, actual.actual_start_timezone || actual.start_timezone || DEFAULT_TIMEZONE)}</time><span><strong>{actual.title}</strong><small>{actual.city || 'Timeline 실제 방문'}</small></span><ChevronRight size={14} /></button>
                ))}
              </div>
            </div>
          )}

          {item.is_visit_group && (
            <div className="schedule-related-block visit-group-detail">
              <div className="schedule-related-head"><div><small>방문 묶음</small><strong>대표 포함 {groupChildren.length + 1}곳</strong></div><Layers3 size={16} /></div>
              <div className="schedule-related-list">
                <div className="representative"><time>대표</time><span><strong>{item.title}</strong><small>{item.trip_on_places?.name || item.city || '대표 장소'}</small></span></div>
                {groupChildren.map((child) => (
                  <button type="button" key={child.id} onClick={() => onOpenRelated?.(child)}><time>{timeInZone(child.actual_start_at, child.actual_start_timezone || child.start_timezone || DEFAULT_TIMEZONE)}</time><span><strong>{child.title}</strong><small>{child.city || '세부 방문'}</small></span><ChevronRight size={14} /></button>
                ))}
              </div>
            </div>
          )}

          {!readOnly && <>
            <div className="relation-actions">
              <button onClick={onLink}><Link2 size={15} /> {actualRecord ? (item.linked_plan_id ? '예정 연결 변경' : '예정 일정 연결') : (linkedActuals.length ? '실제 연결 수정' : '실제 기록 연결')}</button>
              {item.is_visit_group && <button onClick={onEditGroup}><Layers3 size={15} /> 묶음 수정</button>}
              {item.is_visit_group && <button className="muted-danger" onClick={onDissolveGroup}><Unlink size={15} /> 묶음 해제</button>}
            </div>

            <div className="status-actions">
              <button disabled={working} className={item.status === 'completed' ? 'active' : ''} onClick={() => changeStatus('completed')}>완료</button>
              <button disabled={working} className={item.status === 'skipped' ? 'active' : ''} onClick={() => changeStatus('skipped')}>미방문</button>
              <button disabled={working} className={item.status === 'cancelled' ? 'active' : ''} onClick={() => changeStatus('cancelled')}>취소</button>
              <button disabled={working} className={item.status === 'planned' ? 'active' : ''} onClick={() => changeStatus('planned')}>예정</button>
            </div>

            <div className="detail-bottom-actions"><button className="danger-text" onClick={remove} disabled={working}><Trash2 size={16} /> 삭제</button><button className="sheet-primary" onClick={onEdit}><Pencil size={16} /> {actualRecord ? '실제 기록 수정' : '예정 일정 수정'}</button></div>
          </>}
        </div>
      </div>
    </SheetBackdrop>
  )
}

function ItineraryLinkModal({ item, day, dayItems, allItems = dayItems, days = [day], onClose, onSaved }) {
  const actualMode = isTimelineActualItem(item)
  const [selectedPlanId, setSelectedPlanId] = useState(item.linked_plan_id || '')
  const [selectedActualIds, setSelectedActualIds] = useState(() => new Set((item.linked_actuals || []).map((actual) => actual.id)))
  const [displayMode, setDisplayMode] = useState(linkDisplayMode(item))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const dayById = useMemo(() => new Map((days || []).map((entry) => [entry.id, entry])), [days])
  const dayNumber = (candidate) => dayById.get(candidate.trip_day_id)?.day_number ?? 999
  const effectiveTime = (candidate) => candidate.start_at || actualRangeForItem(candidate).start || candidate.actual_start_at || ''
  const candidateSort = (a, b) => {
    const dayDiff = dayNumber(a) - dayNumber(b)
    if (dayDiff) return dayDiff
    const aTime = effectiveTime(a)
    const bTime = effectiveTime(b)
    if (aTime && bTime) {
      const timeDiff = new Date(aTime) - new Date(bTime)
      if (timeDiff) return timeDiff
    } else if (aTime) return -1
    else if (bTime) return 1
    return (a.sort_order ?? 0) - (b.sort_order ?? 0)
  }
  const contextLabel = (candidate) => {
    const candidateDay = dayById.get(candidate.trip_day_id)
    const dayLabel = candidateDay ? `DAY ${candidateDay.day_number}` : 'DAY 미정'
    const timeSource = effectiveTime(candidate)
    const zone = candidate.start_timezone || candidate.actual_start_timezone || DEFAULT_TIMEZONE
    const timeLabel = timeSource ? timeInZone(timeSource, zone) : '시간 미정'
    return `${dayLabel} · ${timeLabel}`
  }

  // Use the whole trip rather than only the currently selected DAY.
  // This also keeps a connection editable if a record was accidentally assigned to another DAY.
  const plans = (allItems || [])
    .filter((candidate) => candidate.id !== item.id && !isTimelineActualItem(candidate) && !candidate.group_parent_id)
    .sort(candidateSort)
  const actuals = (allItems || [])
    .filter((candidate) => candidate.id !== item.id && isTimelineActualItem(candidate) && candidate.actual_start_at && !candidate.group_parent_id)
    .sort(candidateSort)

  const toggleActual = (id) => {
    setSelectedActualIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      if (actualMode) await linkActualToPlan(item.id, selectedPlanId || null, selectedPlanId ? displayMode : null)
      else await replacePlanActualLinks(item.id, [...selectedActualIds], displayMode)
      await onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SheetBackdrop onRequestClose={onClose}>
      <div className="create-sheet schedule-link-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={onClose}>취소</button><span>{actualMode ? '예정 일정 연결' : '실제 기록 연결'}</span><div /></div>
        <div className="sheet-body">
          <p className="eyebrow">DAY {day.day_number}{day.trip_date ? ` · ${day.trip_date}` : ''}</p>
          <h2>{actualMode ? '이 실제 방문은 어떤 계획이었나요?' : '실제로 다녀온 기록을 연결할까요?'}</h2>
          <p className="relation-help">연결 후보는 여행 전체 일정에서 DAY → 시간순으로 보여줘요. 연결하면 계획과 실제를 이어서 볼 수 있고, 아래에서 어떤 쪽 카드에 더 강조해서 보여줄지도 선택할 수 있어요.</p>

          <div className="relation-target-card"><span><Link2 size={17} /></span><div><small>{actualMode ? '실제 기록' : '예정 일정'}</small><strong>{scheduleDisplayTitle(item)}</strong></div></div>


          <div className="relation-display-mode">
            <div className="relation-display-mode-head"><small>표시 방식</small><span>시간축에 어떤 카드를 남길지 선택</span></div>
            <div className="relation-display-segmented" role="radiogroup" aria-label="연결 표시 방식">
              <label className={displayMode === 'plan' ? 'selected' : ''}><input type="radio" name="display-mode" checked={displayMode === 'plan'} onChange={() => setDisplayMode('plan')} /><span>예정 중심</span></label>
              <label className={displayMode === 'actual' ? 'selected' : ''}><input type="radio" name="display-mode" checked={displayMode === 'actual'} onChange={() => setDisplayMode('actual')} /><span>실제 중심</span></label>
              <label className={displayMode === 'both' ? 'selected' : ''}><input type="radio" name="display-mode" checked={displayMode === 'both'} onChange={() => setDisplayMode('both')} /><span>둘 다</span></label>
            </div>
          </div>

          {actualMode ? (
            <div className="relation-choice-list single">
              <label className={!selectedPlanId ? 'selected' : ''}><input type="radio" name="plan-link" value="" checked={!selectedPlanId} onChange={() => setSelectedPlanId('')} /><span><strong>연결하지 않음</strong><small>실제 기록을 독립적으로 표시해요.</small></span></label>
              {plans.length === 0 ? <div className="relation-empty">연결할 예정 일정이 아직 없어요.</div> : plans.map((plan) => {
                return <label key={plan.id} className={selectedPlanId === plan.id ? 'selected' : ''}><input type="radio" name="plan-link" checked={selectedPlanId === plan.id} onChange={() => setSelectedPlanId(plan.id)} /><time>{contextLabel(plan)}</time><span><strong>{scheduleDisplayTitle(plan)}</strong><small>{[categoryLabels[plan.category] || plan.category, plan.city].filter(Boolean).join(' · ') || '예정 일정'}</small></span></label>
              })}
            </div>
          ) : (
            <div className="relation-choice-list">
              {actuals.length === 0 ? <div className="relation-empty">연결할 실제 방문 기록이 아직 없어요.</div> : actuals.map((actual) => {
                const checked = selectedActualIds.has(actual.id)
                const linkedElsewhere = actual.linked_plan_id && actual.linked_plan_id !== item.id
                return <label key={actual.id} className={checked ? 'selected' : ''}><input type="checkbox" checked={checked} onChange={() => toggleActual(actual.id)} /><time>{contextLabel(actual)}</time><span><strong>{scheduleDisplayTitle(actual)}</strong><small>{linkedElsewhere ? '다른 예정 일정에 연결됨 · 선택하면 이 일정으로 옮겨와요.' : actual.city || 'Timeline 실제 방문'}</small></span></label>
              })}
            </div>
          )}

          {error && <div className="schedule-alert">{error}</div>}
          <button className="sheet-primary" disabled={saving} onClick={save}>{saving ? '연결 저장 중…' : '연결 저장'}</button>
        </div>
      </div>
    </SheetBackdrop>
  )
}

function VisitGroupModal({ day, dayItems, initialIds = [], representativeId: initialRepresentativeId = '', suggestedTitle = '', existingParentId = '', onClose, onSaved }) {
  const initialSet = useMemo(() => new Set(initialIds), [initialIds.join('|')])
  const [selectedIds, setSelectedIds] = useState(() => new Set(initialIds))
  const [representativeId, setRepresentativeId] = useState(initialRepresentativeId || initialIds[0] || '')
  const [title, setTitle] = useState(suggestedTitle || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const candidates = dayItems
    .filter((candidate) => isTimelineActualItem(candidate) && candidate.actual_start_at && candidate.category !== 'transport')
    .filter((candidate) => !candidate.group_parent_id || initialSet.has(candidate.id))
    .filter((candidate) => !candidate.is_visit_group || candidate.id === existingParentId || initialSet.has(candidate.id))
    .sort((a, b) => new Date(a.actual_start_at) - new Date(b.actual_start_at))

  const toggle = (id) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
        if (representativeId === id) setRepresentativeId('')
      } else {
        next.add(id)
        if (!representativeId) setRepresentativeId(id)
      }
      return next
    })
  }

  const save = async () => {
    if (selectedIds.size < 2) { setError('두 곳 이상을 선택해주세요.'); return }
    if (!representativeId || !selectedIds.has(representativeId)) { setError('대표 장소를 선택해주세요.'); return }
    setSaving(true)
    setError('')
    try {
      if (existingParentId && existingParentId !== representativeId) await dissolveVisitGroup(existingParentId)
      await saveVisitGroup({
        parentId: representativeId,
        childIds: [...selectedIds].filter((id) => id !== representativeId),
        title: title.trim(),
      })
      await onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const representative = candidates.find((candidate) => candidate.id === representativeId)

  return (
    <SheetBackdrop onRequestClose={onClose}>
      <div className="create-sheet visit-group-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={onClose}>취소</button><span>{existingParentId ? '방문 묶음 수정' : '방문 묶음 만들기'}</span><div /></div>
        <div className="sheet-body">
          <p className="eyebrow">DAY {day.day_number}{day.trip_date ? ` · ${day.trip_date}` : ''}</p>
          <h2>같이 돌아본 장소를 한 묶음으로</h2>
          <p className="relation-help">시장·소품샵 투어처럼 가까운 시간대의 방문을 대표 장소 하나 아래에 모을 수 있어요. 각 세부 방문 기록은 삭제되지 않아요.</p>

          <label>묶음 이름 <span className="optional">선택</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={representative ? `${representative.title} 방문` : '예: 소품샵 투어'} /></label>

          <div className="visit-group-guide"><span><Layers3 size={16} /></span><div><strong>{selectedIds.size}곳 선택됨</strong><small>체크한 장소 중 하나를 대표 장소로 골라주세요.</small></div></div>

          <div className="visit-group-choice-list">
            {candidates.length === 0 ? <div className="relation-empty">묶을 수 있는 실제 방문 기록이 없어요.</div> : candidates.map((candidate) => {
              const selected = selectedIds.has(candidate.id)
              const representative = representativeId === candidate.id
              const time = timeInZone(candidate.actual_start_at, candidate.actual_start_timezone || candidate.start_timezone || DEFAULT_TIMEZONE)
              return (
                <div className={`visit-group-choice ${selected ? 'selected' : ''}`} key={candidate.id}>
                  <label><input type="checkbox" checked={selected} onChange={() => toggle(candidate.id)} /><time>{time}</time><span><strong>{candidate.title}</strong><small>{candidate.city || 'Timeline 실제 방문'}</small></span></label>
                  <button type="button" disabled={!selected} className={representative ? 'representative' : ''} onClick={() => setRepresentativeId(candidate.id)}>{representative ? '대표 장소' : '대표로'}</button>
                </div>
              )
            })}
          </div>

          {error && <div className="schedule-alert">{error}</div>}
          <button className="sheet-primary" disabled={saving || selectedIds.size < 2 || !representativeId} onClick={save}>{saving ? '묶는 중…' : existingParentId ? '묶음 저장' : '방문 묶음 만들기'}</button>
        </div>
      </div>
    </SheetBackdrop>
  )
}

function FeatureRow({ icon, title, description }) {
  return <button className="feature-row"><span className="feature-icon">{icon}</span><span><strong>{title}</strong><small>{description}</small></span><ChevronRight size={18} /></button>
}
function InfoBlock({ title, action, children }) { return <section className="info-block"><div className="info-head"><h3>{title}</h3>{action && <button>{action} <ChevronRight size={15} /></button>}</div>{children}</section> }
function EmptyInline({ icon, text }) { return <div className="empty-inline">{icon}<span>{text}</span></div> }
function SectionTitle({ title, count }) { return <div className="section-title"><h2>{title}</h2>{typeof count === 'number' && <span>{count}</span>}</div> }
function MiniStat({ label, value, suffix = '', icon }) { return <div className="mini-stat"><span className="mini-icon">{icon}</span><small>{label}</small><strong>{value}{suffix}</strong></div> }
function EmptyCard({ title, description, action, onClick, disabled = false }) { return <div className="empty-card"><div className="empty-art"><MapPin size={27} /></div><strong>{title}</strong><p>{description}</p><button onClick={onClick} disabled={disabled}>{action}</button></div> }

function DesktopNav({ tab, setTab }) {
  const items = [['home', '홈', Home], ['trips', '여행', CalendarDays], ['scrap', '스크랩', Paperclip], ['my', 'MY', CircleUserRound]]
  return <header className="desktop-global-nav"><div className="brand">TRIP:<span>ON</span></div><nav>{items.map(([key, label, Icon]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}><Icon size={17} /><span>{label}</span></button>)}</nav></header>
}

function BottomNav({ tab, setTab }) {
  const items = [['home', '홈', Home], ['trips', '여행', CalendarDays], ['scrap', '스크랩', Paperclip], ['my', 'MY', CircleUserRound]]
  return <nav className="bottom-nav">{items.map(([key, label, Icon]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}><Icon size={21} /><span>{label}</span></button>)}</nav>
}

function hsvToHex(h, s, v) {
  h = ((Number(h) % 360) + 360) % 360
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0, g = 0, b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const hex = [r, g, b].map((n) => Math.round((n + m) * 255).toString(16).padStart(2, '0')).join('')
  return `#${hex.toUpperCase()}`
}

function hexToHsv(hex) {
  const clean = String(hex || '#DCEEFF').replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6)
    else if (max === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }
  if (h < 0) h += 360
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

function VisualColorPicker({ value, onChange }) {
  const areaRef = useRef(null)
  const initial = hexToHsv(value)
  const [hue, setHue] = useState(initial.h)
  const [saturation, setSaturation] = useState(initial.s)
  const [brightness, setBrightness] = useState(initial.v)

  useEffect(() => {
    const next = hexToHsv(value)
    setHue(next.h)
    setSaturation(next.s)
    setBrightness(next.v)
  }, [value])

  const pick = (event) => {
    const rect = areaRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left))
    const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top))
    const nextS = x / rect.width
    const nextV = 1 - y / rect.height
    setSaturation(nextS)
    setBrightness(nextV)
    onChange(hsvToHex(hue, nextS, nextV))
  }

  const changeHue = (next) => {
    const h = Number(next)
    setHue(h)
    onChange(hsvToHex(h, saturation, brightness))
  }

  return (
    <div className="visual-color-picker">
      <div
        ref={areaRef}
        className="color-area"
        style={{ backgroundColor: `hsl(${hue}, 100%, 50%)` }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); pick(e) }}
        onPointerMove={(e) => { if (e.buttons) pick(e) }}
      >
        <span className="color-cursor" style={{ left: `${saturation * 100}%`, top: `${(1 - brightness) * 100}%`, backgroundColor: value }} />
      </div>
      <input className="hue-slider" type="range" min="0" max="360" value={Math.round(hue)} onChange={(e) => changeHue(e.target.value)} aria-label="색상 계열 선택" />
      <div className="selected-color-row"><span style={{ backgroundColor: value }} /><div><strong>선택한 색상</strong><small>색상판을 눌러 원하는 톤을 직접 골라보세요.</small></div></div>
    </div>
  )
}

function CoverPicker({ value, onChange }) {
  return (
    <div className="cover-picker">
      <div className="palette-heading">
        <div><strong>추천 색상</strong><small>TRIP:ON 화면과 어울리는 밝은 톤이에요.</small></div>
        <span>{coverPalette.length} COLORS</span>
      </div>
      <div className="cover-grid">
        {coverPalette.map((item) => {
          const selected = value.toLowerCase() === item.value.toLowerCase()
          return <button type="button" key={item.value} aria-label={item.name} className={`cover-option ${selected ? 'selected' : ''}`} style={{ backgroundColor: item.value }} onClick={() => onChange(item.value)}>{selected && <Check size={17} strokeWidth={3} />}</button>
        })}
      </div>
      <div className="custom-color-card visual-custom-card">
        <div className="custom-color-copy"><strong>직접 고르기</strong><small>코드를 몰라도 괜찮아요. 색상판에서 바로 선택할 수 있어요.</small></div>
        <VisualColorPicker value={value} onChange={onChange} />
      </div>
    </div>
  )
}


function CoverEditorModal({ trip, onClose, onSaveColor, onUploadPhoto, onRemovePhoto }) {
  const normalized = normalizeTrip(trip)
  const initialColor = normalized.coverColor
  const [coverColor, setCoverColor] = useState(initialColor)
  const [saving, setSaving] = useState(false)
  const [photoWorking, setPhotoWorking] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const requestClose = () => confirmSheetClose(coverColor !== initialColor, onClose)

  const submit = async () => {
    setSaving(true)
    try {
      await onSaveColor(coverColor)
    } finally {
      setSaving(false)
    }
  }

  const uploadPhoto = async (file) => {
    if (!file) return
    setPhotoWorking(true)
    setPhotoError('')
    try {
      await onUploadPhoto(file)
    } catch (error) {
      setPhotoError(error.message)
    } finally {
      setPhotoWorking(false)
    }
  }

  const removePhoto = async () => {
    setPhotoWorking(true)
    setPhotoError('')
    try {
      await onRemovePhoto()
    } catch (error) {
      setPhotoError(error.message)
    } finally {
      setPhotoWorking(false)
    }
  }

  const previewTrip = { ...normalized, coverColor }

  return (
    <SheetBackdrop onRequestClose={requestClose}>
      <div className="create-sheet color-sheet cover-editor-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={requestClose}>취소</button><span>여행 커버</span><div /></div>
        <div className="sheet-body">
          <p className="eyebrow">TRIP COVER</p>
          <h2>여행의 표지를 꾸며볼까요?</h2>
          <p className="muted color-help">사진을 올리면 커버 사진이 우선 보이고, 사진을 지우면 선택한 색상으로 돌아와요.</p>
          <div className="color-preview cover-preview" style={coverStyle(previewTrip)}>
            <span>{trip.startDate ? getDday(trip) || 'TRIP:ON' : tripDateLabel(trip)}</span>
            <strong>{trip.title}</strong>
            <small>{trip.destinations.join(' · ') || '여행지 미정'}</small>
          </div>

          <section className="cover-photo-section">
            <div className="palette-heading"><div><strong>커버 사진</strong><small>기기에서 사진 한 장을 골라 여행 표지로 사용할 수 있어요.</small></div></div>
            <div className="cover-photo-actions">
              <label className={`cover-photo-picker ${photoWorking ? 'disabled' : ''}`}>
                <ImagePlus size={18} />
                <span>{photoWorking ? '처리 중…' : normalized.coverImageUrl ? '사진 바꾸기' : '사진 추가'}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" disabled={photoWorking} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; uploadPhoto(file) }} />
              </label>
              {normalized.coverImageUrl && <button type="button" className="cover-photo-remove" onClick={removePhoto} disabled={photoWorking}><Trash2 size={16} /> 사진 제거</button>}
            </div>
            <small className="cover-photo-note">사진은 선택하면 바로 저장돼요. HEIC/HEIF는 자동으로 JPG로 변환하고, 저장 파일은 12MB 이하만 사용할 수 있어요.</small>
            {photoError && <div className="schedule-alert">{photoError}</div>}
          </section>

          <CoverPicker value={coverColor} onChange={setCoverColor} />
          <button className="sheet-primary" onClick={submit} disabled={saving}>{saving ? '저장 중…' : '커버 저장'}</button>
        </div>
      </div>
    </SheetBackdrop>
  )
}

function exactDurationDays(startDate, endDate) {
  if (!startDate || !endDate || startDate > endDate) return null
  return Math.max(1, Math.round((new Date(`${endDate}T00:00:00Z`) - new Date(`${startDate}T00:00:00Z`)) / 86400000) + 1)
}

function DatePlanningFields({ datePrecision, setDatePrecision, startDate, setStartDate, endDate, setEndDate, approxYear, setApproxYear, approxMonth, setApproxMonth, durationDays, setDurationDays }) {
  const precisionOptions = [
    ['exact', '정확한 날짜'], ['month', '월까지'], ['year', '연도만'], ['tbd', '미정'],
  ]
  const approxMonthValue = approxYear && approxMonth ? `${approxYear}-${String(approxMonth).padStart(2, '0')}` : ''
  const duration = Number(durationDays || 0)
  const durationText = duration > 0 ? (duration === 1 ? '당일치기' : `${duration - 1}박 ${duration}일`) : '아직 기간 미정'
  return (
    <div className="trip-date-planner">
      <label>여행 날짜</label>
      <div className="date-precision-segmented" role="group" aria-label="여행 날짜 정확도">
        {precisionOptions.map(([key, label]) => <button type="button" key={key} className={datePrecision === key ? 'active' : ''} onClick={() => setDatePrecision(key)}>{label}</button>)}
      </div>
      {datePrecision === 'exact' && (
        <div className="date-grid">
          <label>출발일<input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (endDate && e.target.value > endDate) setEndDate('') }} /></label>
          <label>귀국일<input type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
        </div>
      )}
      {datePrecision === 'month' && <label>대략적인 달<input type="month" value={approxMonthValue} onChange={(e) => { const [year, month] = e.target.value.split('-').map(Number); setApproxYear(year || ''); setApproxMonth(month || '') }} /></label>}
      {datePrecision === 'year' && <label>대략적인 연도<input type="number" min="2000" max="2100" inputMode="numeric" value={approxYear || ''} onChange={(e) => setApproxYear(e.target.value ? Number(e.target.value) : '')} placeholder="예: 2027" /></label>}
      {datePrecision !== 'exact' && (
        <label>몇 박 며칠 <span className="optional">선택</span>
          <div className="duration-input-row"><input type="number" min="1" max="60" inputMode="numeric" value={durationDays || ''} onChange={(e) => setDurationDays(e.target.value ? Math.max(1, Math.min(60, Number(e.target.value))) : '')} placeholder="예: 4" /><span>{durationText}</span></div>
          <small className="field-help">날짜를 정하지 않아도 기간을 입력하면 DAY 1부터 미리 일정을 짤 수 있어요.</small>
        </label>
      )}
      {datePrecision === 'exact' && startDate && endDate && <div className="duration-preview">{durationLabel({ durationDays: exactDurationDays(startDate, endDate) })}</div>}
    </div>
  )
}

function TripDestinationField({ value, onChange, onRemove, first = false }) {
  const parsed = parseKoreaDestination(value)
  const [mode, setMode] = useState(() => parsed ? 'korea' : String(value || '').trim() ? 'manual' : 'korea')
  const [manualDraft, setManualDraft] = useState(() => parsed ? '' : String(value || ''))
  const [dongOptions, setDongOptions] = useState([])
  const [dongLoading, setDongLoading] = useState(false)
  const [dongError, setDongError] = useState('')
  const sido = parsed?.sido || ''
  const sgg = parsed?.sgg || ''
  const dong = parsed?.dong || ''

  useEffect(() => {
    const nextParsed = parseKoreaDestination(value)
    if (String(value || '').trim()) {
      setMode(nextParsed ? 'korea' : 'manual')
      if (!nextParsed) setManualDraft(String(value || ''))
    }
  }, [value])

  useEffect(() => {
    setDongOptions([])
    setDongError('')
  }, [sido, sgg])

  const switchMode = (nextMode) => {
    setMode(nextMode)
    setDongOptions([])
    setDongError('')
    if (nextMode === 'korea' && !parseKoreaDestination(value)) {
      setManualDraft(String(value || ''))
      onChange('')
    } else if (nextMode === 'manual') {
      const nextManual = manualDraft || String(value || '')
      setManualDraft(nextManual)
      onChange(nextManual)
    }
  }

  const changeSido = (nextSido) => {
    onChange(buildKoreaDestination({ sido: nextSido }))
  }

  const changeSgg = (nextSgg) => {
    onChange(buildKoreaDestination({ sido, sgg: nextSgg }))
  }

  const changeDong = (nextDong) => {
    onChange(buildKoreaDestination({ sido, sgg, dong: nextDong }))
  }

  const loadDong = async () => {
    if (!sido || !sgg) return
    setDongLoading(true)
    setDongError('')
    try {
      const rows = await loadKoreaDongOptions(sido, sgg)
      setDongOptions(rows)
      if (!rows.length) setDongError('선택 가능한 세부 지역을 찾지 못했어요. 시·군·구까지만 저장해도 괜찮아요.')
    } catch (error) {
      setDongError(error.message || '세부 지역을 불러오지 못했어요.')
    } finally {
      setDongLoading(false)
    }
  }

  return (
    <div className="destination-field-card">
      <div className="destination-field-head">
        <div className="destination-mode-toggle" role="group" aria-label="여행지 입력 방식">
          <button type="button" className={mode === 'korea' ? 'active' : ''} onClick={() => switchMode('korea')}>대한민국에서 선택</button>
          <button type="button" className={mode === 'manual' ? 'active' : ''} onClick={() => switchMode('manual')}>직접 입력</button>
        </div>
        {!first && <button type="button" className="destination-remove" onClick={onRemove} aria-label="여행지 삭제">×</button>}
      </div>

      {mode === 'manual' ? (
        <div className="destination-input"><MapPin size={18} /><input value={value} onChange={(e) => { setManualDraft(e.target.value); onChange(e.target.value) }} placeholder={first ? '예: 일본 도쿄, 미국 LA' : '추가 여행지'} /></div>
      ) : (
        <div className="destination-korea-picker">
          <div className="destination-select-grid">
            <label><span>시·도</span><select value={sido} onChange={(e) => changeSido(e.target.value)}><option value="">선택</option>{koreaSidoOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
            <label><span>시·군·구 <em>선택</em></span><select value={sgg} disabled={!sido} onChange={(e) => changeSgg(e.target.value)}><option value="">선택 안 함</option>{koreaSggOptions(sido).map((name) => <option key={name} value={name}>{formatKoreaSggName(name)}</option>)}</select></label>
          </div>
          {sido && sgg && (
            <div className="destination-dong-row">
              {dongOptions.length > 0 ? (
                <label><span>읍·면·동 <em>선택</em></span><select value={dong} onChange={(e) => changeDong(e.target.value)}><option value="">선택 안 함</option>{dongOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
              ) : (
                <button type="button" className="destination-load-dong" disabled={dongLoading} onClick={loadDong}>{dongLoading ? '세부 지역 불러오는 중…' : '읍·면·동까지 선택하기 (선택)'}</button>
              )}
              {dongError && <small className="destination-dong-error">{dongError}</small>}
            </div>
          )}
          <p className="destination-picker-preview">{value || (sido ? `대한민국 ${sido}` : '시·도까지만 선택해도 저장할 수 있어요.')}</p>
        </div>
      )}
    </div>
  )
}

function TripEditorModal({ initialTrip, onClose, onSave }) {
  const editing = Boolean(initialTrip)
  const source = initialTrip ? normalizeTrip(initialTrip) : null
  const [step, setStep] = useState(1)
  const [title, setTitle] = useState(source?.title || '')
  const [destinations, setDestinations] = useState(source?.destinations?.length ? source.destinations : [''])
  const [datePrecision, setDatePrecision] = useState(source?.datePrecision || 'exact')
  const [startDate, setStartDate] = useState(source?.startDate || '')
  const [endDate, setEndDate] = useState(source?.endDate || '')
  const [approxYear, setApproxYear] = useState(source?.approxYear || '')
  const [approxMonth, setApproxMonth] = useState(source?.approxMonth || '')
  const [durationDays, setDurationDays] = useState(source?.durationDays || '')
  const [companionsText, setCompanionsText] = useState(source?.companions?.join(', ') || '')
  const [coverColor, setCoverColor] = useState(source?.coverColor || coverPalette[0].value)
  const [tagline, setTagline] = useState(source?.tagline || '')

  const initialSnapshot = JSON.stringify({
    title: source?.title || '', destinations: source?.destinations?.length ? source.destinations : [''],
    datePrecision: source?.datePrecision || 'exact', startDate: source?.startDate || '', endDate: source?.endDate || '',
    approxYear: source?.approxYear || '', approxMonth: source?.approxMonth || '', durationDays: source?.durationDays || '',
    companionsText: source?.companions?.join(', ') || '', coverColor: source?.coverColor || coverPalette[0].value, tagline: source?.tagline || '',
  })
  const currentSnapshot = JSON.stringify({ title, destinations, datePrecision, startDate, endDate, approxYear, approxMonth, durationDays, companionsText, coverColor, tagline })
  const requestClose = () => confirmSheetClose(initialSnapshot !== currentSnapshot, onClose)

  const cleanDestinations = destinations.map((x) => x.trim()).filter(Boolean)
  const dateValid = datePrecision === 'exact'
    ? Boolean(startDate && endDate && startDate <= endDate)
    : datePrecision === 'month'
      ? Boolean(approxYear && approxMonth)
      : datePrecision === 'year'
        ? Boolean(approxYear)
        : true
  const canNext = title.trim() && cleanDestinations.length > 0 && dateValid

  const submit = () => {
    const exactDays = datePrecision === 'exact' ? exactDurationDays(startDate, endDate) : null
    onSave({
      ...(source || {}),
      title: title.trim(),
      destinations: cleanDestinations,
      datePrecision,
      startDate: datePrecision === 'exact' ? startDate : null,
      endDate: datePrecision === 'exact' ? endDate : null,
      approxYear: datePrecision === 'month' || datePrecision === 'year' ? Number(approxYear) || null : null,
      approxMonth: datePrecision === 'month' ? Number(approxMonth) || null : null,
      durationDays: exactDays || (durationDays ? Number(durationDays) : null),
      companions: companionsText.split(',').map((x) => x.trim()).filter(Boolean),
      coverColor,
      tagline: tagline.trim(),
    })
  }

  return (
    <SheetBackdrop onRequestClose={requestClose}>
      <div className="create-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={requestClose}>취소</button><span>{editing ? '여행 수정' : `${step} / 3`}</span><div /></div>
        {step === 1 && (
          <div className="sheet-body">
            <p className="eyebrow">{editing ? 'EDIT TRIP' : 'NEW TRIP'}</p><h2>어디로 떠날까요?</h2>
            <label>여행 이름<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 2028 미국" /></label>
            <label>여행지</label>
            <div className="destination-fields">
              {destinations.map((dest, i) => (
                <TripDestinationField
                  key={i}
                  value={dest}
                  first={i === 0}
                  onChange={(value) => setDestinations((prev) => prev.map((x, idx) => idx === i ? value : x))}
                  onRemove={() => setDestinations((prev) => prev.filter((_, idx) => idx !== i))}
                />
              ))}
            </div>
            <button type="button" className="text-btn destination-add-btn" onClick={() => setDestinations((prev) => [...prev, ''])}><Plus size={16} /> 여행지 추가</button>
            <DatePlanningFields {...{ datePrecision, setDatePrecision, startDate, setStartDate, endDate, setEndDate, approxYear, setApproxYear, approxMonth, setApproxMonth, durationDays, setDurationDays }} />
            <button className="sheet-primary" disabled={!canNext} onClick={() => setStep(2)}>다음</button>
          </div>
        )}
        {step === 2 && (
          <div className="sheet-body">
            <p className="eyebrow">TRAVEL TOGETHER</p><h2>누구와 함께 가나요?</h2><p className="muted">나중에 공동 지출을 정산할 때 사용할 수 있어요. 혼자라면 비워두면 돼요.</p>
            <label>동행인 이름<input value={companionsText} onChange={(e) => setCompanionsText(e.target.value)} placeholder="예: 찬희, 태현" /></label>
            <div className="sheet-actions"><button className="sheet-secondary" onClick={() => setStep(1)}>이전</button><button className="sheet-primary" onClick={() => setStep(3)}>다음</button></div>
          </div>
        )}
        {step === 3 && (
          <div className="sheet-body">
            <p className="eyebrow">TRIP COLOR</p><h2>여행의 색을 골라주세요</h2><p className="muted color-help">사진 대신 여행마다 원하는 단색을 사용할 수 있어요. 밝은 기본색에서 고르거나 색상판에서 원하는 톤을 직접 골라도 돼요.</p>
            <CoverPicker value={coverColor} onChange={setCoverColor} />
            <label>한줄 설명 <span className="optional">선택</span><input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="예: 맛있는 거 먹고 푹 쉬는 여행" /></label>
            <div className="sheet-actions"><button className="sheet-secondary" onClick={() => setStep(2)}>이전</button><button className="sheet-primary" onClick={submit}>{editing ? '수정 저장' : '여행 만들기'}</button></div>
          </div>
        )}
      </div>
    </SheetBackdrop>
  )
}

function DuplicateTripModal({ trip, onClose, onDuplicate }) {
  const source = normalizeTrip(trip)
  const [title, setTitle] = useState(`${source.title} 복사본`)
  const [datePrecision, setDatePrecision] = useState(source.datePrecision || 'tbd')
  const [startDate, setStartDate] = useState(source.startDate || '')
  const [endDate, setEndDate] = useState(source.endDate || '')
  const [approxYear, setApproxYear] = useState(source.approxYear || '')
  const [approxMonth, setApproxMonth] = useState(source.approxMonth || '')
  const [durationDays, setDurationDays] = useState(source.durationDays || '')
  const [copyPrep, setCopyPrep] = useState(true)
  const [copySchedule, setCopySchedule] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const dateValid = datePrecision === 'exact' ? Boolean(startDate && endDate && startDate <= endDate) : datePrecision === 'month' ? Boolean(approxYear && approxMonth) : datePrecision === 'year' ? Boolean(approxYear) : true

  const submit = async () => {
    if (!title.trim() || !dateValid) return
    setWorking(true); setError('')
    try {
      await onDuplicate({
        title: title.trim(), datePrecision,
        startDate: datePrecision === 'exact' ? startDate : null,
        endDate: datePrecision === 'exact' ? endDate : null,
        approxYear: datePrecision === 'month' || datePrecision === 'year' ? Number(approxYear) || null : null,
        approxMonth: datePrecision === 'month' ? Number(approxMonth) || null : null,
        durationDays: datePrecision === 'exact' ? exactDurationDays(startDate, endDate) : (durationDays ? Number(durationDays) : null),
      }, { copyPrep, copySchedule })
    } catch (e) { setError(e.message); setWorking(false) }
  }

  return (
    <SheetBackdrop onRequestClose={working ? () => {} : onClose}>
      <div className="create-sheet duplicate-trip-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={onClose} disabled={working}>취소</button><span>여행 복제</span><div /></div>
        <div className="sheet-body">
          <p className="eyebrow">DUPLICATE TRIP</p><h2>이 여행을 새 초안으로 복제할까요?</h2>
          <p className="muted">사진·지출·실제 방문 기록은 복제하지 않아요. 일정은 선택하면 장소와 메모만 가져오고 시간은 미정으로 초기화해요.</p>
          <label>새 여행 이름<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <DatePlanningFields {...{ datePrecision, setDatePrecision, startDate, setStartDate, endDate, setEndDate, approxYear, setApproxYear, approxMonth, setApproxMonth, durationDays, setDurationDays }} />
          <div className="duplicate-options">
            <label className="checkbox-row"><input type="checkbox" checked={copyPrep} onChange={(e) => setCopyPrep(e.target.checked)} /> 준비물·체크리스트 복제</label>
            <label className="checkbox-row"><input type="checkbox" checked={copySchedule} onChange={(e) => setCopySchedule(e.target.checked)} /> 일정 초안도 복제</label>
          </div>
          {error && <div className="schedule-alert">{error}</div>}
          <button className="sheet-primary" disabled={working || !title.trim() || !dateValid} onClick={submit}>{working ? '복제하는 중…' : '새 여행 만들기'}</button>
        </div>
      </div>
    </SheetBackdrop>
  )
}

export default App
