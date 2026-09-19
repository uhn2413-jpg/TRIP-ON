import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  CircleUserRound,
  ClipboardCheck,
  FileText,
  Home,
  MapPin,
  MapPinned,
  NotebookTabs,
  Paperclip,
  Plus,
  ReceiptText,
  Search,
  Settings,
  Sparkles,
  Star,
  Ticket,
  WalletCards,
} from 'lucide-react'

const STORAGE_KEY = 'tripon:v0.1:trips'
const SCRAP_KEY = 'tripon:v0.1:scraps'

const coverOptions = [
  'cover-sand',
  'cover-sky',
  'cover-sage',
  'cover-lilac',
  'cover-sunset',
]

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

const createId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`

function App() {
  const [tab, setTab] = useState('home')
  const [trips, setTrips] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [] } catch { return [] }
  })
  const [scraps] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SCRAP_KEY)) || [] } catch { return [] }
  })
  const [selectedTripId, setSelectedTripId] = useState(null)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trips))
  }, [trips])

  const selectedTrip = trips.find((t) => t.id === selectedTripId)

  if (selectedTrip) {
    return (
      <TripDetail
        trip={selectedTrip}
        onBack={() => setSelectedTripId(null)}
      />
    )
  }

  return (
    <div className="app-shell">
      <main className="page">
        {tab === 'home' && (
          <HomeScreen
            trips={trips}
            onOpenTrip={setSelectedTripId}
            onCreate={() => setShowCreate(true)}
          />
        )}
        {tab === 'trips' && (
          <TripsScreen
            trips={trips}
            onOpenTrip={setSelectedTripId}
            onCreate={() => setShowCreate(true)}
          />
        )}
        {tab === 'scrap' && <ScrapScreen scraps={scraps} trips={trips} />}
        {tab === 'my' && <MyScreen trips={trips} />}
      </main>

      <BottomNav tab={tab} setTab={setTab} />

      {showCreate && (
        <CreateTripModal
          onClose={() => setShowCreate(false)}
          onCreate={(trip) => {
            setTrips((prev) => [trip, ...prev])
            setShowCreate(false)
            setSelectedTripId(trip.id)
          }}
        />
      )}
    </div>
  )
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
  const recent = [...trips].filter((t) => getTripState(t) === 'past').sort((a,b) => (b.endDate || '').localeCompare(a.endDate || ''))[0]

  return (
    <>
      <BrandHeader />
      <section className="hero-copy">
        <p className="eyebrow">YOUR TRAVEL DASHBOARD</p>
        <h1>{ongoing ? '여행 중이에요.' : focus ? '다음 여행을 준비해볼까요?' : '다음 여행을 켜볼까요?'}</h1>
      </section>

      {focus ? (
        <TripFocusCard trip={focus} onOpen={() => onOpenTrip(focus.id)} />
      ) : (
        <EmptyCard
          title="아직 등록된 여행이 없어요"
          description="여행 이름과 여행지만 정해도 바로 시작할 수 있어요."
          action="새 여행 만들기"
          onClick={onCreate}
        />
      )}

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
            <div>
              <span className="tiny-label">지난 여행</span>
              <strong>{recent.title}</strong>
              <p>{recent.destinations.join(' · ')}</p>
            </div>
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
    <button className={`focus-card ${trip.cover || 'cover-sand'}`} onClick={onOpen}>
      <div className="focus-topline">
        <span className="status-pill">{badge}</span>
        <ChevronRight size={22} />
      </div>
      <div className="focus-bottom">
        <p>{trip.destinations.join(' · ') || '여행지 미정'}</p>
        <h2>{trip.title}</h2>
        <span>{trip.startDate ? `${formatDate(trip.startDate)} — ${formatDate(trip.endDate)} · ${nightsAndDays(trip.startDate, trip.endDate)}` : '아직 날짜를 정하지 않았어요'}</span>
      </div>
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
      <div className="page-title-row">
        <div><p className="eyebrow">ALL TRIPS</p><h1>여행</h1></div>
        <button className="round-plus" onClick={onCreate}><Plus size={22} /></button>
      </div>
      <div className="segmented">
        <button className={mode === 'list' ? 'active' : ''} onClick={() => setMode('list')}>목록</button>
        <button className={mode === 'map' ? 'active' : ''} onClick={() => setMode('map')}>지도</button>
      </div>

      {mode === 'map' ? (
        <div className="map-placeholder">
          <MapPinned size={36} />
          <strong>여행 지도</strong>
          <p>다음 버전에서 여행에 등록한 장소를 지도에서 모아볼 수 있게 연결할 예정이에요.</p>
        </div>
      ) : trips.length === 0 ? (
        <EmptyCard title="여행 기록이 아직 없어요" description="첫 여행을 만들면 준비 중·여행 중·지난 여행으로 자동 분류돼요." action="첫 여행 만들기" onClick={onCreate} />
      ) : (
        <div className="trip-groups">
          <TripGroup title="여행 중" trips={groups.ongoing} onOpenTrip={onOpenTrip} />
          <TripGroup title="준비 중" trips={groups.upcoming} onOpenTrip={onOpenTrip} />
          <TripGroup title="지난 여행" trips={groups.past} onOpenTrip={onOpenTrip} />
        </div>
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
            <div className={`trip-thumb ${trip.cover || 'cover-sand'}`} />
            <div className="trip-row-copy">
              <strong>{trip.title}</strong>
              <span>{trip.destinations.join(' · ') || '여행지 미정'}</span>
              <small>{trip.startDate ? `${formatDate(trip.startDate)} - ${formatDate(trip.endDate)} · ${nightsAndDays(trip.startDate, trip.endDate)}` : '날짜 미정'}</small>
            </div>
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
      <section className="hero-copy small">
        <p className="eyebrow">COLLECT FOR LATER</p>
        <h1>스크랩</h1>
        <p>여행을 준비하면서 발견한 장소와 자료를 모아두는 공간이에요.</p>
      </section>
      <div className="chip-row">
        {filters.map((item) => <button key={item} className={filter === item ? 'chip active' : 'chip'} onClick={() => setFilter(item)}>{item}</button>)}
      </div>
      {scraps.length === 0 ? (
        <EmptyCard title="아직 스크랩이 없어요" description={trips.length ? '장소·예약 후보·링크를 저장하면 특정 여행과 연결할 수 있어요.' : '여행을 만들기 전에도 가고 싶은 곳을 자유롭게 모아둘 수 있어요.'} action="스크랩 추가는 다음 버전에서" disabled />
      ) : null}
    </>
  )
}

function MyScreen({ trips }) {
  const past = trips.filter((t) => getTripState(t) === 'past').length
  return (
    <>
      <BrandHeader compact />
      <section className="profile-card">
        <div className="profile-icon"><CircleUserRound size={32} /></div>
        <div><p className="eyebrow">MY TRIP:ON</p><h1>나의 여행</h1></div>
      </section>
      <div className="mini-grid">
        <MiniStat label="전체 여행" value={trips.length} suffix="회" icon={<NotebookTabs size={19} />} />
        <MiniStat label="지난 여행" value={past} suffix="회" icon={<MapPin size={19} />} />
      </div>
      <section className="section-block">
        <SectionTitle title="설정" />
        <div className="settings-list">
          <button><Settings size={19} /> 앱 설정 <ChevronRight size={18} /></button>
          <button><FileText size={19} /> 데이터 관리 <ChevronRight size={18} /></button>
        </div>
      </section>
    </>
  )
}

function TripDetail({ trip, onBack }) {
  const [active, setActive] = useState('overview')
  const state = getTripState(trip)
  const dday = getDday(trip)
  const tabs = [
    ['overview', '개요'],
    ['schedule', '일정'],
    ['prep', '준비'],
    ['record', '기록'],
    ['expense', '지출'],
  ]

  return (
    <div className="app-shell detail-shell">
      <main className="page detail-page">
        <div className={`trip-hero ${trip.cover || 'cover-sand'}`}>
          <button className="hero-back" onClick={onBack}><ArrowLeft size={21} /></button>
          <div className="trip-hero-copy">
            <span className="status-pill light">{state === 'ongoing' ? 'TRIP:ON' : dday || (state === 'past' ? '여행 완료' : '날짜 미정')}</span>
            <h1>{trip.title}</h1>
            <p>{trip.destinations.join(' · ') || '여행지 미정'}</p>
            <small>{trip.startDate ? `${trip.startDate} — ${trip.endDate} · ${nightsAndDays(trip.startDate, trip.endDate)}` : '아직 날짜를 정하지 않았어요'}</small>
            {trip.companions?.length > 0 && <small>👥 {['나', ...trip.companions].join(' · ')}</small>}
            {trip.tagline && <em>{trip.tagline}</em>}
          </div>
        </div>

        <div className="detail-tabs">
          {tabs.map(([key, label]) => <button key={key} className={active === key ? 'active' : ''} onClick={() => setActive(key)}>{label}</button>)}
        </div>

        <div className="detail-content">
          {active === 'overview' && <OverviewTab trip={trip} />}
          {active === 'schedule' && <ScheduleTab trip={trip} />}
          {active === 'prep' && <PrepTab />}
          {active === 'record' && <RecordTab />}
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
      <section className="summary-banner">
        <span>{state === 'past' ? '여행 요약' : state === 'ongoing' ? '오늘의 여행' : '여행 준비'}</span>
        <strong>{state === 'past' ? nightsAndDays(trip.startDate, trip.endDate) : state === 'ongoing' ? 'TRIP:ON' : '0 / 0 완료'}</strong>
        <p>{state === 'past' ? '사진과 기록을 채우면 이곳에 여행 요약이 완성돼요.' : '일정과 준비 항목을 추가하면 진행 상황이 여기에 보여요.'}</p>
      </section>
      <InfoBlock title="다가오는 일정" action="전체 일정">
        <EmptyInline text="아직 등록된 일정이 없어요." icon={<CalendarDays size={20} />} />
      </InfoBlock>
      <InfoBlock title="예약" action="준비 보기">
        <EmptyInline text="항공·숙소·티켓 예약을 연결해보세요." icon={<Ticket size={20} />} />
      </InfoBlock>
      <InfoBlock title="예산">
        <div className="budget-row"><div><small>현재 지출</small><strong>₩0</strong></div><div><small>예산</small><strong>미설정</strong></div></div>
      </InfoBlock>
      <InfoBlock title="여행 메모"><p className="muted">여행에서 기억해둘 내용을 자유롭게 적는 영역이 들어갈 예정이에요.</p></InfoBlock>
    </>
  )
}

function ScheduleTab({ trip }) {
  const hasDates = trip.startDate && trip.endDate
  return (
    <>
      <div className="day-selector">
        <button className="active">DAY 1</button>
        <button>DAY 2</button>
        <button>DAY 3</button>
      </div>
      <div className="day-heading">
        <div><p className="eyebrow">DAY 1</p><h2>{hasDates ? trip.startDate : '날짜 미정'}</h2></div>
        <button className="outline-btn"><MapPinned size={17} /> 오늘 동선</button>
      </div>
      <button className="primary-wide"><Plus size={18} /> 일정 추가</button>
      <div className="timeline-empty">
        <CalendarDays size={30} />
        <strong>아직 일정이 없어요</strong>
        <p>시간을 정해도 되고, 시간 미정 상태로 먼저 담아도 돼요.</p>
      </div>
      <div className="undecided-box">
        <div><span>시간 미정</span><small>드래그로 나중에 순서를 정할 수 있어요.</small></div>
        <button><Plus size={17} /></button>
      </div>
      <InfoBlock title="DAY 1 메모"><p className="muted">날씨, 이동 팁, 그날의 계획을 적어둘 수 있어요.</p></InfoBlock>
    </>
  )
}

function PrepTab() {
  return (
    <>
      <section className="summary-banner soft">
        <span>준비 현황</span><strong>0 / 0</strong><p>예약과 준비물을 추가하면 자동으로 계산돼요.</p>
      </section>
      <FeatureRow icon={<Ticket size={20} />} title="예약" description="항공·숙소·식당·입장권" />
      <FeatureRow icon={<Paperclip size={20} />} title="바우처 & 문서" description="QR·예약확인서·보험·eSIM" />
      <FeatureRow icon={<ClipboardCheck size={20} />} title="할 일" description="환전·보험·예약 등" />
      <FeatureRow icon={<Check size={20} />} title="준비물" description="여권·충전기·상비약 등" />
      <FeatureRow icon={<FileText size={20} />} title="여행 정보" description="환전·통신·비상연락처" />
    </>
  )
}

function RecordTab() {
  const [filter, setFilter] = useState('전체')
  return (
    <>
      <div className="chip-row">
        {['전체', '사진', '티켓', '영수증', '메모'].map((x) => <button className={filter === x ? 'chip active' : 'chip'} key={x} onClick={() => setFilter(x)}>{x}</button>)}
      </div>
      <button className="primary-wide"><Plus size={18} /> 기록 추가</button>
      <div className="record-empty">
        <NotebookTabs size={31} />
        <strong>여행의 흔적을 남겨보세요</strong>
        <p>사진은 일정에 연결하지 않아도 괜찮아요. 걷다가 찍은 하늘 사진도 그날의 기록으로 남길 수 있어요.</p>
        <div className="rating-demo"><span>선택 별점</span><Star size={17} fill="currentColor" /> 0.5 단위</div>
      </div>
    </>
  )
}

function ExpenseTab() {
  return (
    <>
      <div className="expense-summary">
        <div><small>총 예산</small><strong>미설정</strong></div>
        <div><small>현재 지출</small><strong>₩0</strong></div>
        <div><small>남은 예산</small><strong>—</strong></div>
      </div>
      <button className="primary-wide"><Plus size={18} /> 지출 추가</button>
      <InfoBlock title="지출 내역"><EmptyInline text="아직 등록된 지출이 없어요." icon={<ReceiptText size={20} />} /></InfoBlock>
      <InfoBlock title="공동 정산"><p className="muted">동행인과 공동 지출을 기록하면 마지막에 정산 결과를 계산할 수 있어요.</p></InfoBlock>
    </>
  )
}

function FeatureRow({ icon, title, description }) {
  return <button className="feature-row"><span className="feature-icon">{icon}</span><span><strong>{title}</strong><small>{description}</small></span><ChevronRight size={18} /></button>
}

function InfoBlock({ title, action, children }) {
  return (
    <section className="info-block">
      <div className="info-head"><h3>{title}</h3>{action && <button>{action} <ChevronRight size={15} /></button>}</div>
      {children}
    </section>
  )
}

function EmptyInline({ icon, text }) {
  return <div className="empty-inline">{icon}<span>{text}</span></div>
}

function SectionTitle({ title, count }) {
  return <div className="section-title"><h2>{title}</h2>{typeof count === 'number' && <span>{count}</span>}</div>
}

function MiniStat({ label, value, suffix = '', icon }) {
  return <div className="mini-stat"><span className="mini-icon">{icon}</span><small>{label}</small><strong>{value}{suffix}</strong></div>
}

function EmptyCard({ title, description, action, onClick, disabled = false }) {
  return (
    <div className="empty-card">
      <div className="empty-art"><MapPin size={27} /></div>
      <strong>{title}</strong>
      <p>{description}</p>
      <button onClick={onClick} disabled={disabled}>{action}</button>
    </div>
  )
}

function BottomNav({ tab, setTab }) {
  const items = [
    ['home', '홈', Home],
    ['trips', '여행', CalendarDays],
    ['scrap', '스크랩', Paperclip],
    ['my', 'MY', CircleUserRound],
  ]
  return (
    <nav className="bottom-nav">
      {items.map(([key, label, Icon]) => (
        <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}><Icon size={21} /><span>{label}</span></button>
      ))}
    </nav>
  )
}

function CreateTripModal({ onClose, onCreate }) {
  const [step, setStep] = useState(1)
  const [title, setTitle] = useState('')
  const [destinations, setDestinations] = useState([''])
  const [dateTbd, setDateTbd] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [companionsText, setCompanionsText] = useState('')
  const [cover, setCover] = useState(coverOptions[0])
  const [tagline, setTagline] = useState('')

  const cleanDestinations = destinations.map((x) => x.trim()).filter(Boolean)
  const canNext = title.trim() && cleanDestinations.length > 0 && (dateTbd || (startDate && endDate))

  const submit = () => {
    onCreate({
      id: createId(),
      title: title.trim(),
      destinations: cleanDestinations,
      startDate: dateTbd ? null : startDate,
      endDate: dateTbd ? null : endDate,
      companions: companionsText.split(',').map((x) => x.trim()).filter(Boolean),
      cover,
      tagline: tagline.trim(),
      createdAt: new Date().toISOString(),
    })
  }

  return (
    <div className="modal-backdrop">
      <div className="create-sheet">
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={onClose}>취소</button><span>{step} / 3</span><div /></div>

        {step === 1 && (
          <div className="sheet-body">
            <p className="eyebrow">NEW TRIP</p><h2>어디로 떠날까요?</h2>
            <label>여행 이름<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 2027 OSAKA" /></label>
            <label>여행지</label>
            {destinations.map((dest, i) => (
              <div className="destination-input" key={i}>
                <MapPin size={18} />
                <input value={dest} onChange={(e) => setDestinations((prev) => prev.map((x, idx) => idx === i ? e.target.value : x))} placeholder={i === 0 ? '예: 오사카' : '추가 여행지'} />
                {i > 0 && <button onClick={() => setDestinations((prev) => prev.filter((_, idx) => idx !== i))}>×</button>}
              </div>
            ))}
            <button className="text-btn" onClick={() => setDestinations((prev) => [...prev, ''])}><Plus size={16} /> 여행지 추가</button>
            <label className="checkbox-row"><input type="checkbox" checked={dateTbd} onChange={(e) => setDateTbd(e.target.checked)} /> 아직 날짜를 정하지 않았어요</label>
            {!dateTbd && <div className="date-grid"><label>출발일<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label><label>귀국일<input type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label></div>}
            <button className="sheet-primary" disabled={!canNext} onClick={() => setStep(2)}>다음</button>
          </div>
        )}

        {step === 2 && (
          <div className="sheet-body">
            <p className="eyebrow">TRAVEL TOGETHER</p><h2>누구와 함께 가나요?</h2>
            <p className="muted">나중에 공동 지출을 정산할 때 사용할 수 있어요. 혼자라면 비워두면 돼요.</p>
            <label>동행인 이름<input value={companionsText} onChange={(e) => setCompanionsText(e.target.value)} placeholder="예: 찬희, 태현" /></label>
            <div className="sheet-actions"><button className="sheet-secondary" onClick={() => setStep(1)}>이전</button><button className="sheet-primary" onClick={() => setStep(3)}>다음</button></div>
          </div>
        )}

        {step === 3 && (
          <div className="sheet-body">
            <p className="eyebrow">TRIP COVER</p><h2>여행 표지를 골라주세요</h2>
            <div className="cover-grid">
              {coverOptions.map((item) => <button key={item} className={`cover-option ${item} ${cover === item ? 'selected' : ''}`} onClick={() => setCover(item)}>{cover === item && <Check size={20} />}</button>)}
            </div>
            <label>한줄 설명 <span className="optional">선택</span><input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="예: 맛있는 거 먹고 푹 쉬는 여행" /></label>
            <div className="sheet-actions"><button className="sheet-secondary" onClick={() => setStep(2)}>이전</button><button className="sheet-primary" onClick={submit}>여행 만들기</button></div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
