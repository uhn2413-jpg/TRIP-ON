import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  CircleUserRound,
  ClipboardCheck,
  Cloud,
  Database,
  FileText,
  Home,
  LogIn,
  LogOut,
  MapPin,
  MapPinned,
  MoreHorizontal,
  NotebookTabs,
  Paperclip,
  Palette,
  Plus,
  ReceiptText,
  Settings,
  Sparkles,
  Star,
  Ticket,
  UploadCloud,
  WalletCards,
  Clock,
  Navigation,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Save,
} from 'lucide-react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { createTripRecord, fetchTrips, updateTripRecord } from './lib/trips'
import PrepTab from './components/PrepTab'
import RecordTab from './components/RecordTab'
import RatingSlider from './components/RatingSlider'
import {
  DEFAULT_TIMEZONE,
  deleteItineraryItem,
  fetchSchedule,
  moveItineraryItem,
  saveItineraryItem,
  timeInZone,
  updateDayMemo,
  updateItineraryStatus,
} from './lib/schedule'

const LOCAL_KEY = 'tripon:v0.4:trips'
const LEGACY_KEYS = ['tripon:v0.3:trips', 'tripon:v0.2:trips', 'tripon:v0.1:trips']
const SCRAP_KEY = 'tripon:v0.1:scraps'

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

const normalizeTrip = (trip) => ({
  ...trip,
  destinations: Array.isArray(trip.destinations) ? trip.destinations : [],
  companions: Array.isArray(trip.companions) ? trip.companions : [],
  coverColor: trip.coverColor || legacyCoverMap[trip.cover] || coverPalette[0].value,
})

const loadLocalTrips = () => {
  for (const key of [LOCAL_KEY, ...LEGACY_KEYS]) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key))
      if (Array.isArray(parsed) && parsed.length) return parsed.map(normalizeTrip)
    } catch { /* ignore */ }
  }
  return []
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

const getTripState = (trip) => {
  if (trip.cancelled) return 'cancelled'
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
  const backgroundColor = normalizeTrip(trip).coverColor
  return { backgroundColor, color: getTextColor(backgroundColor) }
}

function App() {
  const remoteMode = isSupabaseConfigured
  const [tab, setTab] = useState('home')
  const [trips, setTrips] = useState(() => remoteMode ? [] : loadLocalTrips())
  const [scraps] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SCRAP_KEY)) || [] } catch { return [] }
  })
  const [selectedTripId, setSelectedTripId] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editingTrip, setEditingTrip] = useState(null)
  const [colorEditingTrip, setColorEditingTrip] = useState(null)
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(!remoteMode)
  const [loading, setLoading] = useState(remoteMode)
  const [message, setMessage] = useState('')

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
    if (!remoteMode) {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(trips))
      return
    }
    if (!session) {
      setTrips([])
      setLoading(false)
      return
    }
    setLoading(true)
    fetchTrips()
      .then(setTrips)
      .catch((error) => setMessage(`여행을 불러오지 못했어요: ${error.message}`))
      .finally(() => setLoading(false))
  }, [remoteMode, session])

  const selectedTrip = trips.find((t) => t.id === selectedTripId)

  const saveTrip = async (draft) => {
    try {
      setMessage('')
      if (remoteMode) {
        const saved = draft.id
          ? await updateTripRecord(draft)
          : await createTripRecord(draft, session.user.id)
        setTrips((prev) => draft.id
          ? prev.map((item) => item.id === saved.id ? saved : item)
          : [saved, ...prev])
        setSelectedTripId(saved.id)
      } else {
        const saved = { ...draft, id: draft.id || createId(), createdAt: draft.createdAt || new Date().toISOString() }
        setTrips((prev) => draft.id
          ? prev.map((item) => item.id === saved.id ? saved : item)
          : [saved, ...prev])
        setSelectedTripId(saved.id)
      }
      setShowCreate(false)
      setEditingTrip(null)
    } catch (error) {
      setMessage(`저장하지 못했어요: ${error.message}`)
    }
  }

  const importLocalTrips = async () => {
    if (!remoteMode || !session) return
    const locals = loadLocalTrips()
    if (!locals.length) {
      setMessage('가져올 로컬 여행이 없어요.')
      return
    }
    try {
      setLoading(true)
      const imported = []
      for (const trip of locals) {
        const copy = { ...trip, id: undefined, createdAt: undefined }
        imported.push(await createTripRecord(copy, session.user.id))
      }
      setTrips((prev) => [...imported, ...prev])
      setMessage(`${imported.length}개의 로컬 여행을 Supabase로 가져왔어요.`)
    } catch (error) {
      setMessage(`가져오기 중 문제가 생겼어요: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  if (remoteMode && !authReady) return <LoadingScreen text="로그인 상태를 확인하고 있어요" />
  if (remoteMode && !session) return <AuthScreen message={message} setMessage={setMessage} />
  if (loading && trips.length === 0) return <LoadingScreen text="여행을 불러오고 있어요" />

  if (selectedTrip) {
    return (
      <>
        <TripDetail
          trip={selectedTrip}
          onBack={() => setSelectedTripId(null)}
          onEdit={() => setEditingTrip(selectedTrip)}
          onColorEdit={() => setColorEditingTrip(selectedTrip)}
        />
        {editingTrip && (
          <TripEditorModal
            initialTrip={editingTrip}
            onClose={() => setEditingTrip(null)}
            onSave={saveTrip}
          />
        )}
        {colorEditingTrip && (
          <ColorEditorModal
            trip={colorEditingTrip}
            onClose={() => setColorEditingTrip(null)}
            onSave={async (coverColor) => {
              await saveTrip({ ...colorEditingTrip, coverColor })
              setColorEditingTrip(null)
            }}
          />
        )}
        {message && <Toast message={message} onClose={() => setMessage('')} />}
      </>
    )
  }

  return (
    <div className="app-shell">
      <main className="page">
        {tab === 'home' && <HomeScreen trips={trips} onOpenTrip={setSelectedTripId} onCreate={() => setShowCreate(true)} />}
        {tab === 'trips' && <TripsScreen trips={trips} onOpenTrip={setSelectedTripId} onCreate={() => setShowCreate(true)} />}
        {tab === 'scrap' && <ScrapScreen scraps={scraps} trips={trips} />}
        {tab === 'my' && (
          <MyScreen
            trips={trips}
            remoteMode={remoteMode}
            user={session?.user}
            onSignOut={() => supabase?.auth.signOut()}
            onImportLocal={importLocalTrips}
          />
        )}
      </main>
      <BottomNav tab={tab} setTab={setTab} />

      {showCreate && <TripEditorModal onClose={() => setShowCreate(false)} onSave={saveTrip} />}
      {message && <Toast message={message} onClose={() => setMessage('')} />}
    </div>
  )
}

function AuthScreen({ message, setMessage }) {
  const [signingIn, setSigningIn] = useState(false)
  const login = async () => {
    setMessage('')
    setSigningIn(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
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
  return <button className="toast" onClick={onClose}>{message}</button>
}

function BrandHeader({ compact = false }) {
  return (
    <header className={`brand-header ${compact ? 'compact' : ''}`}>
      <div className="brand">TRIP:<span>ON</span></div>
      {!compact && <button className="icon-btn" aria-label="알림"><Sparkles size={20} /></button>}
    </header>
  )
}

function HomeScreen({ trips, onOpenTrip, onCreate }) {
  const ordered = useMemo(() => [...trips].sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999')), [trips])
  const ongoing = ordered.find((t) => getTripState(t) === 'ongoing')
  const upcoming = ordered.find((t) => ['upcoming', 'planning'].includes(getTripState(t)))
  const focus = ongoing || upcoming
  const recent = [...trips].filter((t) => getTripState(t) === 'past').sort((a, b) => (b.endDate || '').localeCompare(a.endDate || ''))[0]

  return (
    <>
      <BrandHeader />
      <section className="hero-copy">
        <p className="eyebrow">YOUR TRAVEL DASHBOARD</p>
        <h1>{ongoing ? '여행 중이에요.' : focus ? '다음 여행을 준비해볼까요?' : '다음 여행을 켜볼까요?'}</h1>
      </section>
      {focus ? <TripFocusCard trip={focus} onOpen={() => onOpenTrip(focus.id)} /> : <EmptyCard title="아직 등록된 여행이 없어요" description="여행 이름과 여행지만 정해도 바로 시작할 수 있어요." action="새 여행 만들기" onClick={onCreate} />}
      {focus && (
        <section className="section-block">
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
        <section className="section-block">
          <SectionTitle title="최근 여행" />
          <button className="recent-trip" onClick={() => onOpenTrip(recent.id)}>
            <div><span className="tiny-label">지난 여행</span><strong>{recent.title}</strong><p>{recent.destinations.join(' · ')}</p></div>
            <ChevronRight size={20} />
          </button>
        </section>
      )}
      <button className="primary-wide" onClick={onCreate}><Plus size={18} /> 새 여행 만들기</button>
    </>
  )
}

function TripFocusCard({ trip, onOpen }) {
  const state = getTripState(trip)
  const dday = getDday(trip)
  let badge = '날짜 미정'
  if (state === 'ongoing') badge = 'TRIP:ON'
  else if (dday) badge = dday
  return (
    <button className="focus-card" style={coverStyle(trip)} onClick={onOpen}>
      <div className="focus-topline"><span className="status-pill">{badge}</span><ChevronRight size={22} /></div>
      <div className="focus-bottom"><p>{trip.destinations.join(' · ') || '여행지 미정'}</p><h2>{trip.title}</h2><span>{trip.startDate ? `${formatDate(trip.startDate)} — ${formatDate(trip.endDate)} · ${nightsAndDays(trip.startDate, trip.endDate)}` : '아직 날짜를 정하지 않았어요'}</span></div>
    </button>
  )
}

function TripsScreen({ trips, onOpenTrip, onCreate }) {
  const [mode, setMode] = useState('list')
  const groups = {
    ongoing: trips.filter((t) => getTripState(t) === 'ongoing'),
    upcoming: trips.filter((t) => ['upcoming', 'planning'].includes(getTripState(t))),
    past: trips.filter((t) => getTripState(t) === 'past'),
  }
  return (
    <>
      <BrandHeader compact />
      <div className="page-title-row"><div><p className="eyebrow">ALL TRIPS</p><h1>여행</h1></div><button className="round-plus" onClick={onCreate}><Plus size={22} /></button></div>
      <div className="segmented"><button className={mode === 'list' ? 'active' : ''} onClick={() => setMode('list')}>목록</button><button className={mode === 'map' ? 'active' : ''} onClick={() => setMode('map')}>지도</button></div>
      {mode === 'map' ? (
        <div className="map-placeholder"><MapPinned size={36} /><strong>여행 지도</strong><p>일정과 장소 기능을 붙인 뒤, 여행 기록을 지도에서도 모아볼 수 있게 할 예정이에요.</p></div>
      ) : trips.length === 0 ? (
        <EmptyCard title="여행 기록이 아직 없어요" description="첫 여행을 만들면 준비 중·여행 중·지난 여행으로 자동 분류돼요." action="첫 여행 만들기" onClick={onCreate} />
      ) : (
        <div className="trip-groups"><TripGroup title="여행 중" trips={groups.ongoing} onOpenTrip={onOpenTrip} /><TripGroup title="준비 중" trips={groups.upcoming} onOpenTrip={onOpenTrip} /><TripGroup title="지난 여행" trips={groups.past} onOpenTrip={onOpenTrip} /></div>
      )}
    </>
  )
}

function TripGroup({ title, trips, onOpenTrip }) {
  if (!trips.length) return null
  return (
    <section className="section-block">
      <SectionTitle title={title} count={trips.length} />
      <div className="stack-list">
        {trips.map((trip) => (
          <button key={trip.id} className="trip-row" onClick={() => onOpenTrip(trip.id)}>
            <div className="trip-thumb" style={{ backgroundColor: normalizeTrip(trip).coverColor }} />
            <div className="trip-row-copy"><strong>{trip.title}</strong><span>{trip.destinations.join(' · ') || '여행지 미정'}</span><small>{trip.startDate ? `${formatDate(trip.startDate)} - ${formatDate(trip.endDate)} · ${nightsAndDays(trip.startDate, trip.endDate)}` : '날짜 미정'}</small></div>
            <ChevronRight size={19} />
          </button>
        ))}
      </div>
    </section>
  )
}

function ScrapScreen({ scraps, trips }) {
  const [filter, setFilter] = useState('전체')
  const filters = ['전체', '장소', '예약', '링크·메모']
  return (
    <>
      <BrandHeader compact />
      <section className="hero-copy small"><p className="eyebrow">COLLECT FOR LATER</p><h1>스크랩</h1><p>여행을 준비하면서 발견한 장소와 자료를 모아두는 공간이에요.</p></section>
      <div className="chip-row">{filters.map((item) => <button key={item} className={filter === item ? 'chip active' : 'chip'} onClick={() => setFilter(item)}>{item}</button>)}</div>
      {scraps.length === 0 && <EmptyCard title="아직 스크랩이 없어요" description={trips.length ? '장소·예약 후보·링크를 저장하면 특정 여행과 연결할 수 있어요.' : '여행을 만들기 전에도 가고 싶은 곳을 자유롭게 모아둘 수 있어요.'} action="스크랩 추가는 다음 단계에서" disabled />}
    </>
  )
}

function MyScreen({ trips, remoteMode, user, onSignOut, onImportLocal }) {
  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || '나의 여행'
  const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture
  const past = trips.filter((t) => getTripState(t) === 'past').length
  const localCount = loadLocalTrips().length
  return (
    <>
      <BrandHeader compact />
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
          <button><Settings size={19} /> 앱 설정 <ChevronRight size={18} /></button>
          <button><FileText size={19} /> 데이터 관리 <ChevronRight size={18} /></button>
          {remoteMode && <button onClick={onSignOut}><LogOut size={19} /> 로그아웃 <ChevronRight size={18} /></button>}
        </div>
      </section>
    </>
  )
}

function TripDetail({ trip, onBack, onEdit, onColorEdit }) {
  const [active, setActive] = useState('overview')
  const state = getTripState(trip)
  const dday = getDday(trip)
  const tabs = [['overview', '개요'], ['schedule', '일정'], ['prep', '준비'], ['record', '기록'], ['expense', '지출']]
  return (
    <div className="app-shell detail-shell">
      <main className="page detail-page">
        <div className="trip-hero" style={coverStyle(trip)}>
          <button className="hero-back" onClick={onBack}><ArrowLeft size={21} /></button>
          <div className="hero-actions">
            <button className="hero-color" onClick={onColorEdit} aria-label="여행 색상 수정"><Palette size={17} /><span>색상</span></button>
            <button className="hero-more" onClick={onEdit} aria-label="여행 정보 수정"><MoreHorizontal size={22} /></button>
          </div>
          <div className="trip-hero-copy">
            <span className="status-pill">{state === 'ongoing' ? 'TRIP:ON' : dday || (state === 'past' ? '여행 완료' : '날짜 미정')}</span>
            <h1>{trip.title}</h1>
            <p>{trip.destinations.join(' · ') || '여행지 미정'}</p>
            <small>{trip.startDate ? `${trip.startDate} — ${trip.endDate} · ${nightsAndDays(trip.startDate, trip.endDate)}` : '아직 날짜를 정하지 않았어요'}</small>
            {trip.companions?.length > 0 && <small>👥 {['나', ...trip.companions].join(' · ')}</small>}
            {trip.tagline && <em>{trip.tagline}</em>}
          </div>
        </div>
        <div className="detail-tabs">{tabs.map(([key, label]) => <button key={key} className={active === key ? 'active' : ''} onClick={() => setActive(key)}>{label}</button>)}</div>
        <div className="detail-content">
          {active === 'overview' && <OverviewTab trip={trip} />}
          {active === 'schedule' && <ScheduleTab trip={trip} />}
          {active === 'prep' && <PrepTab trip={trip} />}
          {active === 'record' && <RecordTab trip={trip} />}
          {active === 'expense' && <ExpenseTab />}
        </div>
      </main>
    </div>
  )
}

function OverviewTab({ trip }) {
  const state = getTripState(trip)
  return (
    <>
      <section className="summary-banner"><span>{state === 'past' ? '여행 요약' : state === 'ongoing' ? '오늘의 여행' : '여행 준비'}</span><strong>{state === 'past' ? nightsAndDays(trip.startDate, trip.endDate) : state === 'ongoing' ? 'TRIP:ON' : '0 / 0 완료'}</strong><p>{state === 'past' ? '사진과 기록을 채우면 이곳에 여행 요약이 완성돼요.' : '일정과 준비 항목을 추가하면 진행 상황이 여기에 보여요.'}</p></section>
      <InfoBlock title="다가오는 일정" action="전체 일정"><EmptyInline text="아직 등록된 일정이 없어요." icon={<CalendarDays size={20} />} /></InfoBlock>
      <InfoBlock title="예약" action="준비 보기"><EmptyInline text="항공·숙소·티켓 예약을 연결해보세요." icon={<Ticket size={20} />} /></InfoBlock>
      <InfoBlock title="예산"><div className="budget-row"><div><small>현재 지출</small><strong>₩0</strong></div><div><small>예산</small><strong>미설정</strong></div></div></InfoBlock>
      <InfoBlock title="여행 메모"><p className="muted">여행에서 기억해둘 내용을 자유롭게 적는 영역이 들어갈 예정이에요.</p></InfoBlock>
    </>
  )
}

function ScheduleTab({ trip }) {
  const [days, setDays] = useState([])
  const [items, setItems] = useState([])
  const [selectedDayId, setSelectedDayId] = useState(null)
  const [editingItem, setEditingItem] = useState(null)
  const [viewingItem, setViewingItem] = useState(null)
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const [dayMemo, setDayMemo] = useState('')
  const [savingMemo, setSavingMemo] = useState(false)

  const load = async (preferDayId) => {
    if (!isSupabaseConfigured || !trip.startDate || !trip.endDate) return
    setLoadingSchedule(true)
    setScheduleError('')
    try {
      const result = await fetchSchedule(trip)
      setDays(result.days)
      setItems(result.items)
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
  }, [trip.id, trip.startDate, trip.endDate])

  const selectedDay = days.find((day) => day.id === selectedDayId) || days[0]
  const dayItems = items.filter((item) => item.trip_day_id === selectedDay?.id)
  const scheduledItems = dayItems
    .filter((item) => !item.is_time_unscheduled)
    .sort((a, b) => {
      if (a.start_at && b.start_at) return new Date(a.start_at) - new Date(b.start_at)
      return (a.sort_order ?? 0) - (b.sort_order ?? 0)
    })
  const unscheduledItems = dayItems
    .filter((item) => item.is_time_unscheduled)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  useEffect(() => {
    setDayMemo(selectedDay?.memo || '')
  }, [selectedDay?.id, selectedDay?.memo])

  if (!trip.startDate || !trip.endDate) {
    return (
      <div className="schedule-no-date">
        <CalendarDays size={32} />
        <strong>여행 날짜를 먼저 정해주세요</strong>
        <p>날짜가 정해지면 DAY 1부터 마지막 날까지 자동으로 만들어져요.</p>
      </div>
    )
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
        <button className="outline-btn" onClick={() => setScheduleError('오늘 동선 지도는 장소 좌표 연결 단계에서 붙일게요.')}><MapPinned size={17} /> 오늘 동선</button>
      </div>

      <button className="primary-wide" onClick={() => setEditingItem({ __new: true })}><Plus size={18} /> 일정 추가</button>

      {scheduleError && <div className="schedule-alert">{scheduleError}</div>}
      {loadingSchedule && <div className="schedule-loading">일정을 불러오는 중…</div>}

      {!loadingSchedule && scheduledItems.length === 0 && unscheduledItems.length === 0 && (
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
                <ScheduleCard item={item} onClick={() => setViewingItem(item)} />
              </React.Fragment>
            )
          })}
        </div>
      )}

      <section className="unscheduled-section">
        <div className="unscheduled-title"><div><span>시간 미정</span><small>시간이 정해지지 않은 일정은 여기에 모여요.</small></div><button onClick={() => setEditingItem({ __new: true, is_time_unscheduled: true })}><Plus size={17} /></button></div>
        {unscheduledItems.length === 0 ? (
          <div className="unscheduled-empty">아직 시간 미정 일정이 없어요.</div>
        ) : (
          <div className="unscheduled-list">
            {unscheduledItems.map((item, index) => (
              <div className="unscheduled-row" key={item.id}>
                <button className="unscheduled-main" onClick={() => setViewingItem(item)}>
                  <span className="unscheduled-dot" />
                  <span><strong>{item.title}</strong><small>{[item.city, item.category].filter(Boolean).join(' · ') || '상세 정보 없음'}</small></span>
                </button>
                <div className="order-buttons">
                  <button disabled={index === 0} onClick={() => moveUnscheduled(item, -1)} aria-label="위로"><ChevronUp size={16} /></button>
                  <button disabled={index === unscheduledItems.length - 1} onClick={() => moveUnscheduled(item, 1)} aria-label="아래로"><ChevronDown size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <InfoBlock title={`DAY ${selectedDay?.day_number || 1} 메모`}>
        <textarea className="day-memo-input" value={dayMemo} onChange={(e) => setDayMemo(e.target.value)} placeholder="날씨, 이동 팁, 그날의 계획을 자유롭게 적어보세요." />
        <button className="memo-save-btn" onClick={saveMemo} disabled={savingMemo}><Save size={15} /> {savingMemo ? '저장 중…' : '메모 저장'}</button>
      </InfoBlock>

      {editingItem && selectedDay && (
        <ItineraryEditorModal
          trip={trip}
          day={selectedDay}
          item={editingItem.__new ? null : editingItem}
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
          item={viewingItem}
          day={selectedDay}
          onClose={() => setViewingItem(null)}
          onEdit={() => {
            setEditingItem(viewingItem)
            setViewingItem(null)
          }}
          onChanged={async () => {
            setViewingItem(null)
            await load(selectedDay.id)
          }}
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

function ScheduleCard({ item, onClick }) {
  const start = item.start_at ? timeInZone(item.start_at, item.start_timezone || DEFAULT_TIMEZONE) : ''
  const end = item.end_at ? timeInZone(item.end_at, item.end_timezone || item.start_timezone || DEFAULT_TIMEZONE) : ''
  return (
    <button className={`schedule-card status-${item.status}`} onClick={onClick}>
      <div className="schedule-time"><strong>{start || '—'}</strong>{end && <small>{end}</small>}</div>
      <div className="schedule-line"><span /></div>
      <div className="schedule-card-copy">
        <div className="schedule-card-top"><strong>{item.title}</strong><span className={`schedule-status ${item.status}`}>{statusLabels[item.status] || item.status}</span></div>
        <small>{[categoryLabels[item.category] || item.category, item.city].filter(Boolean).join(' · ') || '일정'}</small>
        {(item.transport_type || item.travel_minutes) && <em><Navigation size={13} /> {transportLabels[item.transport_type] || item.transport_type || '이동'}{item.travel_minutes ? ` · 약 ${item.travel_minutes}분` : ''}</em>}
        {item.rating && <div className="schedule-rating"><Star size={13} fill="currentColor" /> {Number(item.rating).toFixed(1)}</div>}
      </div>
      <ChevronRight size={17} />
    </button>
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

function ItineraryEditorModal({ trip, day, item, defaultUnscheduled = false, onClose, onSaved }) {
  const [title, setTitle] = useState(item?.title || '')
  const [category, setCategory] = useState(item?.category || 'place')
  const [city, setCity] = useState(item?.city || '')
  const [isTimeUnscheduled, setIsTimeUnscheduled] = useState(item ? item.is_time_unscheduled : defaultUnscheduled)
  const [timezone, setTimezone] = useState(item?.start_timezone || DEFAULT_TIMEZONE)
  const [endTimezone, setEndTimezone] = useState(item?.end_timezone || item?.start_timezone || DEFAULT_TIMEZONE)
  const [startTime, setStartTime] = useState(item?.start_at ? timeInZone(item.start_at, item.start_timezone || DEFAULT_TIMEZONE) : '')
  const [endTime, setEndTime] = useState(item?.end_at ? timeInZone(item.end_at, item.end_timezone || item.start_timezone || DEFAULT_TIMEZONE) : '')
  const [actualStartTime, setActualStartTime] = useState(item?.actual_start_at ? timeInZone(item.actual_start_at, item.actual_start_timezone || item.start_timezone || DEFAULT_TIMEZONE) : '')
  const [actualEndTime, setActualEndTime] = useState(item?.actual_end_at ? timeInZone(item.actual_end_at, item.actual_end_timezone || item.end_timezone || DEFAULT_TIMEZONE) : '')
  const [transportType, setTransportType] = useState(item?.transport_type || '')
  const [travelMinutes, setTravelMinutes] = useState(item?.travel_minutes || '')
  const [expectedCost, setExpectedCost] = useState(item?.expected_cost || '')
  const [expectedCurrency, setExpectedCurrency] = useState(item?.expected_currency || 'KRW')
  const [memo, setMemo] = useState(item?.memo || '')
  const [rating, setRating] = useState(item?.rating ? String(item.rating) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    if (!title.trim()) return
    if (!isTimeUnscheduled && !startTime) {
      setError('시간을 정한 일정은 시작 시간을 입력해주세요.')
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
          title, category, city, isTimeUnscheduled,
          timezone, endTimezone, startTime, endTime,
          actualStartTime, actualEndTime,
          transportType, travelMinutes, expectedCost, expectedCurrency,
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
    <div className="modal-backdrop">
      <div className="create-sheet itinerary-sheet">
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={onClose}>취소</button><span>{item ? '일정 수정' : '일정 추가'}</span><div /></div>
        <div className="sheet-body itinerary-form">
          <p className="eyebrow">DAY {day.day_number} · {day.trip_date}</p>
          <h2>{item ? '일정을 수정할까요?' : '어떤 일정을 넣을까요?'}</h2>

          <label>일정 이름<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 우메다 스카이빌딩" /></label>
          <div className="form-two">
            <label>종류<select value={category} onChange={(e) => setCategory(e.target.value)}>{Object.entries(categoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label>도시 <span className="optional">선택</span><input value={city} onChange={(e) => setCity(e.target.value)} placeholder="예: 오사카" /></label>
          </div>

          <label className="checkbox-row"><input type="checkbox" checked={isTimeUnscheduled} onChange={(e) => setIsTimeUnscheduled(e.target.checked)} /> 아직 시간을 정하지 않았어요</label>

          {!isTimeUnscheduled && (
            <>
              <div className="form-two">
                <label>시작 시간<input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label>
                <label>종료 시간 <span className="optional">선택</span><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></label>
              </div>
              <div className="form-two">
                <label>시작 도시 시간대<select value={timezone} onChange={(e) => { setTimezone(e.target.value); if (!item?.end_timezone) setEndTimezone(e.target.value) }}>{timezoneOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                <label>종료 도시 시간대<select value={endTimezone} onChange={(e) => setEndTimezone(e.target.value)}>{timezoneOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              </div>
            </>
          )}

          <div className="form-two">
            <label>이동수단 <span className="optional">선택</span><select value={transportType} onChange={(e) => setTransportType(e.target.value)}><option value="">없음</option>{Object.entries(transportLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label>이동시간 <span className="optional">분</span><input type="number" min="0" value={travelMinutes} onChange={(e) => setTravelMinutes(e.target.value)} placeholder="25" /></label>
          </div>

          <div className="form-two">
            <label>예상 비용 <span className="optional">선택</span><input type="number" min="0" value={expectedCost} onChange={(e) => setExpectedCost(e.target.value)} placeholder="1500" /></label>
            <label>통화<select value={expectedCurrency} onChange={(e) => setExpectedCurrency(e.target.value)}><option>KRW</option><option>JPY</option><option>USD</option><option>EUR</option><option>GBP</option></select></label>
          </div>

          <div className="actual-time-box">
            <strong>실제 시간 <span className="optional">선택</span></strong>
            <small>여행 중이나 여행 후에 실제 방문 시간을 남길 수 있어요.</small>
            <div className="form-two">
              <label>실제 시작<input type="time" value={actualStartTime} onChange={(e) => setActualStartTime(e.target.value)} /></label>
              <label>실제 종료<input type="time" value={actualEndTime} onChange={(e) => setActualEndTime(e.target.value)} /></label>
            </div>
          </div>

          <label>메모 <span className="optional">선택</span><textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예약 팁, 볼 것, 먹을 것 등을 적어두세요." /></label>

          <RatingSlider value={rating} onChange={setRating} />

          {error && <div className="schedule-alert">{error}</div>}
          <button className="sheet-primary" disabled={!title.trim() || saving} onClick={save}>{saving ? '저장 중…' : item ? '수정 저장' : '일정 추가'}</button>
        </div>
      </div>
    </div>
  )
}

function ItineraryDetailModal({ item, day, onClose, onEdit, onChanged }) {
  const [working, setWorking] = useState(false)
  const start = item.is_time_unscheduled ? '시간 미정' : timeInZone(item.start_at, item.start_timezone || DEFAULT_TIMEZONE)
  const end = item.end_at ? timeInZone(item.end_at, item.end_timezone || item.start_timezone || DEFAULT_TIMEZONE) : ''
  const actualStart = item.actual_start_at ? timeInZone(item.actual_start_at, item.actual_start_timezone || item.start_timezone || DEFAULT_TIMEZONE) : ''
  const actualEnd = item.actual_end_at ? timeInZone(item.actual_end_at, item.actual_end_timezone || item.end_timezone || DEFAULT_TIMEZONE) : ''

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
    <div className="modal-backdrop">
      <div className="create-sheet itinerary-detail-sheet">
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={onClose}>닫기</button><span>일정 상세</span><button onClick={onEdit}><Pencil size={17} /></button></div>
        <div className="sheet-body">
          <div className="detail-status-line"><span className={`schedule-status ${item.status}`}>{statusLabels[item.status]}</span><small>DAY {day.day_number} · {day.trip_date}</small></div>
          <h2 className="itinerary-detail-title">{item.title}</h2>
          <p className="itinerary-detail-meta">{[item.city, categoryLabels[item.category] || item.category].filter(Boolean).join(' · ')}</p>

          <div className="detail-facts">
            <div><Clock size={18} /><span><small>예정 시간</small><strong>{start}{end ? ` — ${end}` : ''}</strong>{!item.is_time_unscheduled && <em>{item.start_timezone}</em>}</span></div>
            {(actualStart || actualEnd) && <div><Check size={18} /><span><small>실제 시간</small><strong>{actualStart || '—'}{actualEnd ? ` — ${actualEnd}` : ''}</strong></span></div>}
            {(item.transport_type || item.travel_minutes) && <div><Navigation size={18} /><span><small>이동</small><strong>{transportLabels[item.transport_type] || '이동'}{item.travel_minutes ? ` · 약 ${item.travel_minutes}분` : ''}</strong></span></div>}
            {item.expected_cost != null && <div><WalletCards size={18} /><span><small>예상 비용</small><strong>{Number(item.expected_cost).toLocaleString()} {item.expected_currency || ''}</strong></span></div>}
            {item.rating && <div><Star size={18} fill="currentColor" /><span><small>별점</small><strong>{Number(item.rating).toFixed(1)} / 5.0</strong></span></div>}
          </div>

          {item.memo && <div className="itinerary-memo"><small>메모</small><p>{item.memo}</p></div>}

          <div className="status-actions">
            <button disabled={working} className={item.status === 'completed' ? 'active' : ''} onClick={() => changeStatus('completed')}>완료</button>
            <button disabled={working} className={item.status === 'skipped' ? 'active' : ''} onClick={() => changeStatus('skipped')}>미방문</button>
            <button disabled={working} className={item.status === 'cancelled' ? 'active' : ''} onClick={() => changeStatus('cancelled')}>취소</button>
            <button disabled={working} className={item.status === 'planned' ? 'active' : ''} onClick={() => changeStatus('planned')}>예정</button>
          </div>

          <div className="detail-bottom-actions"><button className="danger-text" onClick={remove} disabled={working}><Trash2 size={16} /> 삭제</button><button className="sheet-primary" onClick={onEdit}><Pencil size={16} /> 수정</button></div>
        </div>
      </div>
    </div>
  )
}

function ExpenseTab() {
  return (
    <><div className="expense-summary"><div><small>총 예산</small><strong>미설정</strong></div><div><small>현재 지출</small><strong>₩0</strong></div><div><small>남은 예산</small><strong>—</strong></div></div><button className="primary-wide"><Plus size={18} /> 지출 추가</button><InfoBlock title="지출 내역"><EmptyInline text="아직 등록된 지출이 없어요." icon={<ReceiptText size={20} />} /></InfoBlock><InfoBlock title="공동 정산"><p className="muted">동행인과 공동 지출을 기록하면 마지막에 정산 결과를 계산할 수 있어요.</p></InfoBlock></>
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


function ColorEditorModal({ trip, onClose, onSave }) {
  const [coverColor, setCoverColor] = useState(normalizeTrip(trip).coverColor)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    try {
      await onSave(coverColor)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="create-sheet color-sheet">
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={onClose}>취소</button><span>여행 색상</span><div /></div>
        <div className="sheet-body">
          <p className="eyebrow">TRIP COLOR</p>
          <h2>배경색을 바꿔볼까요?</h2>
          <p className="muted color-help">추천 색상에서 고르거나 아래 색상판을 눌러 원하는 톤을 직접 만들 수 있어요.</p>
          <div className="color-preview" style={{ backgroundColor: coverColor, color: getTextColor(coverColor) }}>
            <span>{trip.startDate ? getDday(trip) || 'TRIP:ON' : '날짜 미정'}</span>
            <strong>{trip.title}</strong>
            <small>{trip.destinations.join(' · ') || '여행지 미정'}</small>
          </div>
          <CoverPicker value={coverColor} onChange={setCoverColor} />
          <button className="sheet-primary" onClick={submit} disabled={saving}>{saving ? '저장 중…' : '색상 저장'}</button>
        </div>
      </div>
    </div>
  )
}

function TripEditorModal({ initialTrip, onClose, onSave }) {
  const editing = Boolean(initialTrip)
  const source = initialTrip ? normalizeTrip(initialTrip) : null
  const [step, setStep] = useState(1)
  const [title, setTitle] = useState(source?.title || '')
  const [destinations, setDestinations] = useState(source?.destinations?.length ? source.destinations : [''])
  const [dateTbd, setDateTbd] = useState(source ? !source.startDate : false)
  const [startDate, setStartDate] = useState(source?.startDate || '')
  const [endDate, setEndDate] = useState(source?.endDate || '')
  const [companionsText, setCompanionsText] = useState(source?.companions?.join(', ') || '')
  const [coverColor, setCoverColor] = useState(source?.coverColor || coverPalette[0].value)
  const [tagline, setTagline] = useState(source?.tagline || '')

  const cleanDestinations = destinations.map((x) => x.trim()).filter(Boolean)
  const canNext = title.trim() && cleanDestinations.length > 0 && (dateTbd || (startDate && endDate && startDate <= endDate))

  const submit = () => onSave({
    ...(source || {}),
    title: title.trim(),
    destinations: cleanDestinations,
    startDate: dateTbd ? null : startDate,
    endDate: dateTbd ? null : endDate,
    companions: companionsText.split(',').map((x) => x.trim()).filter(Boolean),
    coverColor,
    tagline: tagline.trim(),
  })

  return (
    <div className="modal-backdrop">
      <div className="create-sheet">
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={onClose}>취소</button><span>{editing ? '여행 수정' : `${step} / 3`}</span><div /></div>
        {step === 1 && (
          <div className="sheet-body">
            <p className="eyebrow">{editing ? 'EDIT TRIP' : 'NEW TRIP'}</p><h2>어디로 떠날까요?</h2>
            <label>여행 이름<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 2028 미국" /></label>
            <label>여행지</label>
            {destinations.map((dest, i) => (
              <div className="destination-input" key={i}><MapPin size={18} /><input value={dest} onChange={(e) => setDestinations((prev) => prev.map((x, idx) => idx === i ? e.target.value : x))} placeholder={i === 0 ? '예: 미국 LA' : '추가 여행지'} />{i > 0 && <button type="button" onClick={() => setDestinations((prev) => prev.filter((_, idx) => idx !== i))}>×</button>}</div>
            ))}
            <button type="button" className="text-btn" onClick={() => setDestinations((prev) => [...prev, ''])}><Plus size={16} /> 여행지 추가</button>
            <label className="checkbox-row"><input type="checkbox" checked={dateTbd} onChange={(e) => setDateTbd(e.target.checked)} /> 아직 날짜를 정하지 않았어요</label>
            {!dateTbd && <div className="date-grid"><label>출발일<input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (endDate && e.target.value > endDate) setEndDate('') }} /></label><label>귀국일<input type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label></div>}
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
    </div>
  )
}

export default App
