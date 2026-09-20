import React, { useEffect, useMemo, useState } from 'react'
import {
  Calculator,
  Check,
  ChevronRight,
  CircleDollarSign,
  Coins,
  MapPin,
  Pencil,
  Plus,
  ReceiptText,
  Trash2,
  Users,
  WalletCards,
  X,
} from 'lucide-react'
import SheetBackdrop, { confirmSheetClose } from './SheetBackdrop'
import { DEFAULT_TIMEZONE } from '../lib/schedule'
import { isoToRecordDateTime } from '../lib/records'
import {
  calculateSettlement,
  currencyOptions,
  deleteExpense,
  expenseCategoryLabels,
  expenseKrw,
  fetchExpenseData,
  saveBudget,
  saveExpense,
  setSettlementComplete,
} from '../lib/expenses'

const categoryIcons = {
  accommodation: '🏨',
  transport: '🚇',
  food: '🍽️',
  cafe: '☕',
  sightseeing: '🎟️',
  shopping: '🛍️',
  other: '·',
}

const currencySymbol = {
  KRW: '₩', JPY: '¥', USD: '$', EUR: '€', GBP: '£', CNY: '¥', TWD: 'NT$', THB: '฿', VND: '₫', SGD: 'S$', HKD: 'HK$', AUD: 'A$', CAD: 'C$', CHF: 'CHF', CZK: 'Kč',
}

const timezoneOptions = [
  ['Asia/Seoul', '서울 · KST'],
  ['Asia/Tokyo', '도쿄 · JST'],
  ['Europe/London', '런던'],
  ['Europe/Paris', '파리/프라하'],
  ['America/New_York', '뉴욕'],
  ['America/Los_Angeles', 'LA'],
  ['Australia/Sydney', '시드니'],
]

function won(value) {
  const number = Number(value || 0)
  return `₩${Math.round(number).toLocaleString('ko-KR')}`
}

function originalAmount(expense) {
  const amount = Number(expense.amount || 0).toLocaleString('ko-KR', { maximumFractionDigits: 2 })
  return `${currencySymbol[expense.currency] || `${expense.currency} `}${amount}`
}

function formatExpenseDate(expense) {
  if (!expense.spent_at) return expense.day ? `DAY ${expense.day.day_number}` : '날짜 미정'
  const local = isoToRecordDateTime(expense.spent_at, expense.spent_timezone || DEFAULT_TIMEZONE)
  return `${local.date || ''}${local.time ? ` · ${local.time}` : ''}`
}

function groupTitle(expense) {
  if (expense.day) return `DAY ${expense.day.day_number} · ${expense.day.trip_date}`
  if (expense.spent_at) return isoToRecordDateTime(expense.spent_at, expense.spent_timezone || DEFAULT_TIMEZONE).date || '기타'
  return '여행 전체'
}

export default function ExpenseTab({ trip }) {
  const [data, setData] = useState({ budget: null, members: [], days: [], itinerary: [], receipts: [], expenses: [] })
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [category, setCategory] = useState('all')
  const [editor, setEditor] = useState(null)
  const [viewer, setViewer] = useState(null)
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [settling, setSettling] = useState(false)

  const reload = async () => {
    setLoading(true)
    setMessage('')
    try {
      setData(await fetchExpenseData(trip.id))
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [trip.id])

  const totalKrw = useMemo(() => data.expenses.reduce((sum, expense) => {
    const value = expenseKrw(expense)
    return sum + (value == null ? 0 : value)
  }, 0), [data.expenses])
  const notConverted = data.expenses.filter((expense) => expense.currency !== 'KRW' && expenseKrw(expense) == null).length
  const budget = Number(data.budget?.amount_krw || 0)
  const remaining = budget > 0 ? budget - totalKrw : null
  const settlement = useMemo(() => calculateSettlement(data), [data])

  const filtered = category === 'all' ? data.expenses : data.expenses.filter((expense) => expense.category === category)
  const groups = useMemo(() => {
    const map = new Map()
    filtered.forEach((expense) => {
      const key = groupTitle(expense)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(expense)
    })
    return [...map.entries()]
  }, [filtered])

  const markSettlement = async (settled) => {
    setSettling(true)
    try {
      await setSettlementComplete(trip.id, settled)
      await reload()
    } catch (error) {
      setMessage(error.message)
    } finally { setSettling(false) }
  }

  return (
    <>
      <div className="expense-summary expense-summary-v08">
        <div><small>총 예산</small><strong>{budget > 0 ? won(budget) : '미설정'}</strong></div>
        <div><small>현재 지출</small><strong>{won(totalKrw)}</strong></div>
        <div><small>남은 예산</small><strong className={remaining != null && remaining < 0 ? 'negative' : ''}>{remaining == null ? '—' : won(remaining)}</strong></div>
      </div>
      <div className="expense-top-actions">
        <button className="outline-btn" onClick={() => setBudgetOpen(true)}><WalletCards size={17} /> 예산 설정</button>
        <button className="primary-wide compact" onClick={() => setEditor({ __new: true })}><Plus size={18} /> 지출 추가</button>
      </div>
      {notConverted > 0 && <div className="expense-note">외화 지출 {notConverted}건은 원화 환산 금액이 없어 현재 지출 합계에서 제외됐어요.</div>}
      {message && <div className="schedule-alert">{message}</div>}

      <div className="expense-filter-row">
        <button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>전체</button>
        {Object.entries(expenseCategoryLabels).map(([key, label]) => <button key={key} className={category === key ? 'active' : ''} onClick={() => setCategory(key)}>{label}</button>)}
      </div>

      {loading ? <div className="schedule-loading">지출을 불러오는 중…</div> : filtered.length === 0 ? (
        <div className="timeline-empty expense-empty"><ReceiptText size={30} /><strong>아직 지출이 없어요</strong><p>여행 전 예약금부터 현지에서 쓴 비용까지 기록할 수 있어요.</p></div>
      ) : (
        <div className="expense-groups">
          {groups.map(([label, rows]) => (
            <section className="expense-day-group" key={label}>
              <div className="expense-day-head"><strong>{label}</strong><small>{rows.length}건</small></div>
              <div className="expense-list">
                {rows.map((expense) => <ExpenseCard key={expense.id} expense={expense} onClick={() => setViewer(expense)} />)}
              </div>
            </section>
          ))}
        </div>
      )}

      <section className="settlement-card">
        <div className="settlement-heading">
          <div><span className="settlement-icon"><Calculator size={19} /></span><span><strong>공동 정산</strong><small>공동 지출을 원화 기준으로 자동 계산해요.</small></span></div>
          {settlement.unsettledExpenseCount > 0 && <span className="settlement-count">{settlement.unsettledExpenseCount}건</span>}
        </div>
        {settlement.excluded > 0 && <p className="settlement-warning">원화 환산 금액이 없는 공동 지출 {settlement.excluded}건은 정산에서 제외됐어요.</p>}
        {settlement.unsettledExpenseCount === 0 ? (
          <div className="settlement-empty"><Check size={18} /><span>현재 정산할 공동 지출이 없어요.</span></div>
        ) : (
          <>
            <div className="settlement-members">
              {settlement.balances.map(({ member, paid, owed, balance }) => (
                <div key={member.id}><strong>{member.name}</strong><small>결제 {won(paid)} · 부담 {won(owed)}</small><span className={balance >= 0 ? 'receive' : 'pay'}>{balance >= 0 ? `받을 돈 ${won(balance)}` : `보낼 돈 ${won(-balance)}`}</span></div>
              ))}
            </div>
            <div className="settlement-transfers">
              <strong>정산하면</strong>
              {settlement.transfers.length === 0 ? <p>서로 주고받을 금액이 없어요.</p> : settlement.transfers.map((transfer, index) => (
                <div className="settlement-transfer" key={`${transfer.from.id}-${transfer.to.id}-${index}`}><span>{transfer.from.name}</span><ChevronRight size={16} /><span>{transfer.to.name}</span><strong>{won(transfer.amount)}</strong></div>
              ))}
            </div>
            <button className="settlement-complete" disabled={settling} onClick={() => markSettlement(true)}><Check size={16} /> {settling ? '처리 중…' : '정산 완료 처리'}</button>
          </>
        )}
        {data.expenses.some((expense) => expense.is_shared && (expense.shares || []).some((share) => share.is_settled)) && (
          <button className="settlement-reopen" disabled={settling} onClick={() => markSettlement(false)}>정산 다시 열기</button>
        )}
      </section>

      {budgetOpen && <BudgetModal initial={budget} onClose={() => setBudgetOpen(false)} onSave={async (amount) => { await saveBudget(trip.id, amount); setBudgetOpen(false); await reload() }} />}
      {editor && <ExpenseEditorModal trip={trip} data={data} expense={editor.__new ? null : editor} onClose={() => setEditor(null)} onSaved={async () => { setEditor(null); await reload() }} />}
      {viewer && <ExpenseDetailModal expense={viewer} onClose={() => setViewer(null)} onEdit={() => { setEditor(viewer); setViewer(null) }} onDeleted={async () => { setViewer(null); await reload() }} />}
    </>
  )
}

function ExpenseCard({ expense, onClick }) {
  const krw = expenseKrw(expense)
  return (
    <button className="expense-card" onClick={onClick}>
      <span className="expense-category-icon">{categoryIcons[expense.category] || '·'}</span>
      <span className="expense-card-copy">
        <span className="expense-card-title"><strong>{expense.title}</strong><em>{originalAmount(expense)}</em></span>
        <small>{[expense.payer?.name ? `${expense.payer.name} 결제` : null, expense.is_shared ? `공동 · ${expense.shares?.length || 0}명` : '개인', expense.place_name].filter(Boolean).join(' · ')}</small>
        {expense.memo && <p>{expense.memo}</p>}
      </span>
      <span className="expense-card-side"><strong>{krw != null ? won(krw) : '환산 전'}</strong>{expense.receipt_record_id && <small><ReceiptText size={12} /> 영수증</small>}</span>
    </button>
  )
}

function BudgetModal({ initial, onClose, onSave }) {
  const [amount, setAmount] = useState(initial ? String(initial) : '')
  const [saving, setSaving] = useState(false)
  const dirty = String(initial || '') !== amount
  const requestClose = () => confirmSheetClose(dirty, onClose)
  return (
    <SheetBackdrop onRequestClose={requestClose}>
      <div className="create-sheet budget-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={requestClose}>취소</button><span>여행 예산</span><div /></div>
        <div className="sheet-body"><p className="eyebrow">TRIP BUDGET</p><h2>예산을 정해둘까요?</h2><p className="muted">전체 여행 예산은 원화 기준으로 관리해요.</p><label>총 예산<input inputMode="numeric" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="예: 900000" /></label><button className="sheet-primary" disabled={saving || amount === ''} onClick={async () => { setSaving(true); try { await onSave(amount) } finally { setSaving(false) } }}>{saving ? '저장 중…' : '예산 저장'}</button></div>
      </div>
    </SheetBackdrop>
  )
}

function ExpenseEditorModal({ trip, data, expense, onClose, onSaved }) {
  const local = expense?.spent_at ? isoToRecordDateTime(expense.spent_at, expense.spent_timezone || DEFAULT_TIMEZONE) : { date: '', time: '' }
  const defaultPayer = expense?.payer_member_id || data.members.find((member) => member.is_me)?.id || data.members[0]?.id || ''
  const initialParticipants = expense?.shares?.map((share) => share.member_id) || data.members.map((member) => member.id)
  const [title, setTitle] = useState(expense?.title || '')
  const [category, setCategory] = useState(expense?.category || 'food')
  const [amount, setAmount] = useState(expense?.amount != null ? String(expense.amount) : '')
  const [currency, setCurrency] = useState(expense?.currency || 'KRW')
  const [krwAmount, setKrwAmount] = useState(expense?.krw_amount != null ? String(expense.krw_amount) : '')
  const [payerMemberId, setPayerMemberId] = useState(defaultPayer)
  const [isShared, setIsShared] = useState(Boolean(expense?.is_shared))
  const [participantIds, setParticipantIds] = useState(initialParticipants)
  const [tripDayId, setTripDayId] = useState(expense?.trip_day_id || '')
  const [itineraryItemId, setItineraryItemId] = useState(expense?.itinerary_item_id || '')
  const [spentDate, setSpentDate] = useState(local.date || '')
  const [spentTime, setSpentTime] = useState(local.time || '')
  const [timezone, setTimezone] = useState(expense?.spent_timezone || DEFAULT_TIMEZONE)
  const [placeName, setPlaceName] = useState(expense?.place_name || '')
  const [memo, setMemo] = useState(expense?.memo || '')
  const [receiptRecordId, setReceiptRecordId] = useState(expense?.receipt_record_id || '')
  const [receiptFiles, setReceiptFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const itineraryForDay = data.itinerary.filter((item) => !tripDayId || item.trip_day_id === tripDayId)
  const initialSnapshot = JSON.stringify({
    title: expense?.title || '', category: expense?.category || 'food', amount: expense?.amount != null ? String(expense.amount) : '', currency: expense?.currency || 'KRW', krwAmount: expense?.krw_amount != null ? String(expense.krw_amount) : '', payerMemberId: defaultPayer, isShared: Boolean(expense?.is_shared), participantIds: initialParticipants.slice().sort(), tripDayId: expense?.trip_day_id || '', itineraryItemId: expense?.itinerary_item_id || '', spentDate: local.date || '', spentTime: local.time || '', timezone: expense?.spent_timezone || DEFAULT_TIMEZONE, placeName: expense?.place_name || '', memo: expense?.memo || '', receiptRecordId: expense?.receipt_record_id || '',
  })
  const currentSnapshot = JSON.stringify({ title, category, amount, currency, krwAmount, payerMemberId, isShared, participantIds: participantIds.slice().sort(), tripDayId, itineraryItemId, spentDate, spentTime, timezone, placeName, memo, receiptRecordId })
  const dirty = initialSnapshot !== currentSnapshot || receiptFiles.length > 0
  const requestClose = () => confirmSheetClose(dirty, onClose)

  const toggleParticipant = (id) => setParticipantIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id])
  const changeDay = (id) => {
    setTripDayId(id)
    setItineraryItemId('')
    const day = data.days.find((entry) => entry.id === id)
    if (day) setSpentDate(day.trip_date)
  }
  const changeItinerary = (id) => {
    setItineraryItemId(id)
    const item = data.itinerary.find((entry) => entry.id === id)
    if (!item) return
    if (item.trip_day_id) {
      setTripDayId(item.trip_day_id)
      const day = data.days.find((entry) => entry.id === item.trip_day_id)
      if (day) setSpentDate(day.trip_date)
    }
    if (!placeName) setPlaceName(item.title)
  }
  const save = async () => {
    setSaving(true); setError('')
    try {
      await saveExpense({
        tripId: trip.id,
        draft: { id: expense?.id, title, category, amount, currency, krwAmount, payerMemberId, isShared, participantIds, tripDayId, itineraryItemId, spentDate, spentTime, timezone, placeName, memo, receiptRecordId },
        receiptFiles,
      })
      await onSaved()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <SheetBackdrop onRequestClose={requestClose}>
      <div className="create-sheet expense-editor-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head"><button onClick={requestClose}>취소</button><span>{expense ? '지출 수정' : '지출 추가'}</span><div /></div>
        <div className="sheet-body expense-form">
          <p className="eyebrow">TRIP EXPENSE</p><h2>{expense ? '지출 내용을 다듬어볼까요?' : '무엇에 썼나요?'}</h2>
          <label>지출 이름<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 저녁 식사" /></label>
          <label>카테고리<select value={category} onChange={(e) => setCategory(e.target.value)}>{Object.entries(expenseCategoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <div className="form-two"><label>금액<input type="number" min="0" step="any" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="3600" /></label><label>통화<select value={currency} onChange={(e) => { setCurrency(e.target.value); if (e.target.value === 'KRW') setKrwAmount('') }}>{currencyOptions.map((item) => <option key={item}>{item}</option>)}</select></label></div>
          {currency !== 'KRW' && <label>원화 환산 금액 <span className="optional">{isShared ? '정산에 필요' : '선택'}</span><input type="number" min="0" inputMode="numeric" value={krwAmount} onChange={(e) => setKrwAmount(e.target.value)} placeholder="예: 34200" /></label>}
          <label>결제자<select value={payerMemberId} onChange={(e) => setPayerMemberId(e.target.value)}>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
          <label className="checkbox-row expense-shared-toggle"><input type="checkbox" checked={isShared} onChange={(e) => setIsShared(e.target.checked)} /><span><strong>공동 지출</strong><small>정산에 포함하고 참여자를 선택해요.</small></span></label>
          {isShared && <div className="participant-picker"><strong>참여자</strong><div>{data.members.map((member) => <button type="button" key={member.id} className={participantIds.includes(member.id) ? 'active' : ''} onClick={() => toggleParticipant(member.id)}><span>{participantIds.includes(member.id) && <Check size={13} />}</span>{member.name}</button>)}</div><small>선택한 사람끼리 원화 환산 금액을 똑같이 나눠요.</small></div>}
          <div className="form-two"><label>DAY <span className="optional">선택</span><select value={tripDayId} onChange={(e) => changeDay(e.target.value)}><option value="">여행 전체</option>{data.days.map((day) => <option key={day.id} value={day.id}>DAY {day.day_number} · {day.trip_date}</option>)}</select></label><label>일정 연결 <span className="optional">선택</span><select value={itineraryItemId} onChange={(e) => changeItinerary(e.target.value)}><option value="">연결 안 함</option>{itineraryForDay.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></div>
          <div className="form-two"><label>날짜 <span className="optional">선택</span><input type="date" value={spentDate} onChange={(e) => setSpentDate(e.target.value)} /></label><label>시간 <span className="optional">선택</span><input type="time" value={spentTime} onChange={(e) => setSpentTime(e.target.value)} /></label></div>
          <label>시간대<select value={timezone} onChange={(e) => setTimezone(e.target.value)}>{timezoneOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>장소 <span className="optional">선택</span><input value={placeName} onChange={(e) => setPlaceName(e.target.value)} placeholder="예: Café de Flore" /></label>
          <label>영수증 기록 연결 <span className="optional">선택</span><select value={receiptRecordId} onChange={(e) => setReceiptRecordId(e.target.value)}><option value="">연결 안 함</option>{data.receipts.map((record) => <option key={record.id} value={record.id}>{record.title || record.place_name || '영수증'}</option>)}</select></label>
          <div className="expense-receipt-upload"><div><strong>영수증 바로 첨부</strong><small>새 파일을 올리면 기록 탭에도 영수증 기록이 자동으로 생겨요.</small></div><label><Plus size={15} /> 파일 선택<input type="file" accept="image/*,.heic,.heif,application/pdf" multiple onChange={(e) => setReceiptFiles(Array.from(e.target.files || []))} /></label>{receiptFiles.length > 0 && <p>{receiptFiles.map((file) => file.name).join(' · ')}</p>}</div>
          <label>메모 <span className="optional">선택</span><textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="누가 뭘 먹었는지, 환율 메모 등을 적어두세요." /></label>
          {error && <div className="schedule-alert">{error}</div>}
          <button className="sheet-primary" disabled={saving || !title.trim() || !amount || !payerMemberId} onClick={save}>{saving ? '저장 중…' : expense ? '수정 저장' : '지출 저장'}</button>
        </div>
      </div>
    </SheetBackdrop>
  )
}

function ExpenseDetailModal({ expense, onClose, onEdit, onDeleted }) {
  const [working, setWorking] = useState(false)
  const krw = expenseKrw(expense)
  const remove = async () => {
    if (!window.confirm('이 지출을 삭제할까요? 연결된 영수증 기록은 기록 탭에 남아 있어요.')) return
    setWorking(true)
    try { await deleteExpense(expense.id); await onDeleted() } finally { setWorking(false) }
  }
  return (
    <SheetBackdrop onRequestClose={onClose}>
      <div className="create-sheet expense-detail-sheet" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" /><div className="sheet-head"><button onClick={onClose}>닫기</button><span>지출 상세</span><button onClick={onEdit}><Pencil size={17} /></button></div>
        <div className="sheet-body">
          <p className="eyebrow">{expenseCategoryLabels[expense.category]?.toUpperCase() || 'EXPENSE'}</p><h2>{expense.title}</h2><div className="expense-detail-amount"><strong>{originalAmount(expense)}</strong>{krw != null && expense.currency !== 'KRW' && <small>약 {won(krw)}</small>}</div>
          <div className="detail-facts expense-facts"><div><Coins size={18} /><span><small>결제자</small><strong>{expense.payer?.name || '미지정'}</strong></span></div><div><Users size={18} /><span><small>구분</small><strong>{expense.is_shared ? `공동 · ${(expense.shares || []).map((share) => share.member?.name).filter(Boolean).join(' · ')}` : '개인 지출'}</strong></span></div>{expense.place_name && <div><MapPin size={18} /><span><small>장소</small><strong>{expense.place_name}</strong></span></div>}<div><CircleDollarSign size={18} /><span><small>기록 시간</small><strong>{formatExpenseDate(expense)}</strong></span></div>{expense.receipt_record_id && <div><ReceiptText size={18} /><span><small>영수증</small><strong>기록 탭에 연결됨</strong></span></div>}</div>
          {expense.memo && <div className="itinerary-memo"><small>메모</small><p>{expense.memo}</p></div>}
          <div className="detail-bottom-actions"><button className="danger-text" disabled={working} onClick={remove}><Trash2 size={16} /> 삭제</button><button className="sheet-primary" onClick={onEdit}><Pencil size={16} /> 수정</button></div>
        </div>
      </div>
    </SheetBackdrop>
  )
}
