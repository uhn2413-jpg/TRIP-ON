import { supabase } from './supabase'
import { DEFAULT_TIMEZONE, zonedLocalToIso } from './schedule'
import { saveRecord, uploadRecordFiles } from './records'

export const expenseCategoryLabels = {
  accommodation: '숙박',
  transport: '교통',
  food: '식비',
  cafe: '카페',
  sightseeing: '관광',
  shopping: '쇼핑',
  other: '기타',
}

export const currencyOptions = ['KRW', 'JPY', 'USD', 'EUR', 'GBP', 'CNY', 'TWD', 'THB', 'VND', 'SGD', 'HKD', 'AUD', 'CAD', 'CHF', 'CZK']

function localDateTimeToIso(date, time, timezone) {
  if (!date) return null
  return zonedLocalToIso(date, time || '12:00', timezone || DEFAULT_TIMEZONE)
}

export async function fetchExpenseData(tripId) {
  const [budgetRes, membersRes, daysRes, itineraryRes, receiptsRes, expensesRes] = await Promise.all([
    supabase
      .from('trip_on_budgets')
      .select('id, amount_krw, updated_at')
      .eq('trip_id', tripId)
      .maybeSingle(),
    supabase
      .from('trip_on_trip_members')
      .select('id, name, is_me, created_at')
      .eq('trip_id', tripId)
      .order('is_me', { ascending: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('trip_on_trip_days')
      .select('id, day_number, trip_date')
      .eq('trip_id', tripId)
      .order('day_number', { ascending: true }),
    supabase
      .from('trip_on_itinerary_items')
      .select('id, trip_day_id, title, city, start_at, start_timezone, is_time_unscheduled, sort_order')
      .eq('trip_id', tripId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('trip_on_records')
      .select('id, trip_day_id, itinerary_item_id, title, recorded_at, place_name, city')
      .eq('trip_id', tripId)
      .eq('type', 'receipt')
      .order('created_at', { ascending: false }),
    supabase
      .from('trip_on_expenses')
      .select(`
        id, trip_day_id, itinerary_item_id, place_id, place_name, receipt_record_id,
        payer_member_id, title, category, amount, currency, krw_amount, is_shared,
        spent_at, spent_timezone, memo, created_at, updated_at,
        trip_on_expense_shares ( id, member_id, share_amount, is_settled, created_at )
      `)
      .eq('trip_id', tripId)
      .order('spent_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
  ])

  for (const result of [budgetRes, membersRes, daysRes, itineraryRes, receiptsRes, expensesRes]) {
    if (result.error) throw result.error
  }

  const members = membersRes.data || []
  const memberMap = new Map(members.map((member) => [member.id, member]))
  const days = daysRes.data || []
  const dayMap = new Map(days.map((day) => [day.id, day]))
  const itinerary = itineraryRes.data || []
  const itineraryMap = new Map(itinerary.map((item) => [item.id, item]))
  const receipts = receiptsRes.data || []
  const receiptMap = new Map(receipts.map((item) => [item.id, item]))

  const expenses = (expensesRes.data || []).map((expense) => ({
    ...expense,
    payer: memberMap.get(expense.payer_member_id) || null,
    day: dayMap.get(expense.trip_day_id) || null,
    itinerary_item: itineraryMap.get(expense.itinerary_item_id) || null,
    receipt_record: receiptMap.get(expense.receipt_record_id) || null,
    shares: (expense.trip_on_expense_shares || []).map((share) => ({
      ...share,
      member: memberMap.get(share.member_id) || null,
    })),
  }))

  return {
    budget: budgetRes.data || null,
    members,
    days,
    itinerary,
    receipts,
    expenses,
  }
}

export async function saveBudget(tripId, amountKrw) {
  const amount = Number(amountKrw || 0)
  if (!Number.isFinite(amount) || amount < 0) throw new Error('예산 금액을 확인해주세요.')
  const { data, error } = await supabase
    .from('trip_on_budgets')
    .upsert({ trip_id: tripId, amount_krw: amount, updated_at: new Date().toISOString() }, { onConflict: 'trip_id' })
    .select('id, amount_krw, updated_at')
    .single()
  if (error) throw error
  return data
}

function getBaseKrw(draft) {
  const amount = Number(draft.amount || 0)
  if (draft.currency === 'KRW') return draft.krwAmount ? Number(draft.krwAmount) : amount
  return draft.krwAmount ? Number(draft.krwAmount) : null
}

export async function saveExpense({ tripId, draft, receiptFiles = [] }) {
  const amount = Number(draft.amount)
  if (!draft.title?.trim()) throw new Error('지출 이름을 입력해주세요.')
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('금액을 입력해주세요.')
  if (!draft.payerMemberId) throw new Error('결제자를 선택해주세요.')

  const participantIds = Array.from(new Set(draft.participantIds || [])).filter(Boolean)
  const baseKrw = getBaseKrw(draft)
  if (draft.isShared && participantIds.length === 0) throw new Error('공동 지출에 참여한 사람을 한 명 이상 선택해주세요.')
  if (draft.isShared && draft.currency !== 'KRW' && !(baseKrw > 0)) {
    throw new Error('공동 정산을 위해 원화 환산 금액을 입력해주세요.')
  }

  const payload = {
    trip_id: tripId,
    trip_day_id: draft.tripDayId || null,
    itinerary_item_id: draft.itineraryItemId || null,
    place_name: draft.placeName?.trim() || null,
    receipt_record_id: draft.receiptRecordId || null,
    payer_member_id: draft.payerMemberId,
    title: draft.title.trim(),
    category: draft.category || 'other',
    amount,
    currency: draft.currency || 'KRW',
    krw_amount: baseKrw,
    is_shared: Boolean(draft.isShared),
    spent_at: localDateTimeToIso(draft.spentDate, draft.spentTime, draft.timezone),
    spent_timezone: draft.timezone || DEFAULT_TIMEZONE,
    memo: draft.memo?.trim() || null,
    updated_at: new Date().toISOString(),
  }

  let expense
  if (draft.id) {
    const { data, error } = await supabase
      .from('trip_on_expenses')
      .update(payload)
      .eq('id', draft.id)
      .select('*')
      .single()
    if (error) throw error
    expense = data
  } else {
    const { data, error } = await supabase
      .from('trip_on_expenses')
      .insert(payload)
      .select('*')
      .single()
    if (error) throw error
    expense = data
  }

  const { error: clearError } = await supabase
    .from('trip_on_expense_shares')
    .delete()
    .eq('expense_id', expense.id)
  if (clearError) throw clearError

  if (draft.isShared && participantIds.length) {
    const splitTotal = baseKrw ?? amount
    const equal = Math.round((splitTotal / participantIds.length) * 100) / 100
    const rows = participantIds.map((memberId, index) => {
      const usedBefore = equal * index
      const share = index === participantIds.length - 1
        ? Math.round((splitTotal - usedBefore) * 100) / 100
        : equal
      return { expense_id: expense.id, member_id: memberId, share_amount: share, is_settled: false }
    })
    const { error: shareError } = await supabase.from('trip_on_expense_shares').insert(rows)
    if (shareError) throw shareError
  }

  let receiptRecordId = draft.receiptRecordId || null
  if (receiptFiles.length) {
    if (!receiptRecordId) {
      const receipt = await saveRecord({
        tripId,
        draft: {
          type: 'receipt',
          title: `${draft.title.trim()} 영수증`,
          tripDayId: draft.tripDayId || '',
          itineraryItemId: draft.itineraryItemId || '',
          recordDate: draft.spentDate || '',
          recordTime: draft.spentTime || '',
          timezone: draft.timezone || DEFAULT_TIMEZONE,
          placeName: draft.placeName || '',
          city: draft.city || '',
          memo: '',
          rating: '',
        },
      })
      receiptRecordId = receipt.id
    }
    await uploadRecordFiles({ tripId, recordId: receiptRecordId, files: receiptFiles })
    const { error: linkError } = await supabase
      .from('trip_on_expenses')
      .update({ receipt_record_id: receiptRecordId, updated_at: new Date().toISOString() })
      .eq('id', expense.id)
    if (linkError) throw linkError
  }

  return { ...expense, receipt_record_id: receiptRecordId }
}

export async function deleteExpense(id) {
  const { error } = await supabase.from('trip_on_expenses').delete().eq('id', id)
  if (error) throw error
}

export async function setSettlementComplete(tripId, settled) {
  const { data: expenses, error: expenseError } = await supabase
    .from('trip_on_expenses')
    .select('id')
    .eq('trip_id', tripId)
    .eq('is_shared', true)
  if (expenseError) throw expenseError
  const ids = (expenses || []).map((item) => item.id)
  if (!ids.length) return
  const { error } = await supabase
    .from('trip_on_expense_shares')
    .update({ is_settled: Boolean(settled) })
    .in('expense_id', ids)
  if (error) throw error
}

export function expenseKrw(expense) {
  const amount = Number(expense.amount || 0)
  if (expense.krw_amount != null) return Number(expense.krw_amount)
  if (expense.currency === 'KRW') return amount
  return null
}

export function calculateSettlement({ members, expenses }) {
  const memberMap = new Map((members || []).map((member) => [member.id, member]))
  const paid = new Map((members || []).map((member) => [member.id, 0]))
  const owed = new Map((members || []).map((member) => [member.id, 0]))
  let excluded = 0
  let unsettledExpenseCount = 0

  for (const expense of expenses || []) {
    if (!expense.is_shared) continue
    const shares = expense.shares || expense.trip_on_expense_shares || []
    if (!shares.length || shares.every((share) => share.is_settled)) continue
    const base = expenseKrw(expense)
    if (!(base >= 0)) {
      excluded += 1
      continue
    }
    unsettledExpenseCount += 1
    if (expense.payer_member_id && paid.has(expense.payer_member_id)) {
      paid.set(expense.payer_member_id, paid.get(expense.payer_member_id) + base)
    }
    for (const share of shares) {
      if (!owed.has(share.member_id)) continue
      owed.set(share.member_id, owed.get(share.member_id) + Number(share.share_amount || 0))
    }
  }

  const balances = (members || []).map((member) => ({
    member,
    paid: paid.get(member.id) || 0,
    owed: owed.get(member.id) || 0,
    balance: (paid.get(member.id) || 0) - (owed.get(member.id) || 0),
  }))

  const creditors = balances.filter((item) => item.balance > 0.5).map((item) => ({ ...item })).sort((a, b) => b.balance - a.balance)
  const debtors = balances.filter((item) => item.balance < -0.5).map((item) => ({ ...item })).sort((a, b) => a.balance - b.balance)
  const transfers = []
  let ci = 0
  let di = 0
  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci]
    const debtor = debtors[di]
    const amount = Math.min(creditor.balance, -debtor.balance)
    if (amount > 0.5) {
      transfers.push({ from: debtor.member, to: creditor.member, amount: Math.round(amount) })
      creditor.balance -= amount
      debtor.balance += amount
    }
    if (creditor.balance <= 0.5) ci += 1
    if (debtor.balance >= -0.5) di += 1
  }

  return { balances, transfers, excluded, unsettledExpenseCount, memberMap }
}
