import React, { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Eye, Link2, Link2Off, PencilLine, Share2, UserMinus, UsersRound } from 'lucide-react'
import SheetBackdrop from './SheetBackdrop'
import {
  buildInviteUrl,
  createTripInvite,
  deactivateTripInvite,
  fetchTripSharing,
  leaveSharedTrip,
  removeCollaborator,
  updateCollaboratorRole,
} from '../lib/sharing'

function roleLabel(role) {
  if (role === 'owner') return '소유자'
  if (role === 'viewer') return '보기만'
  return '편집 가능'
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const area = document.createElement('textarea')
  area.value = text
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  document.execCommand('copy')
  area.remove()
}

export default function ShareTripSheet({ trip, onClose, onLeft }) {
  const [data, setData] = useState({ role: trip.accessRole || 'viewer', collaborators: [], invites: [] })
  const [inviteRole, setInviteRole] = useState('editor')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState('')
  const [message, setMessage] = useState('')
  const owner = data.role === 'owner'

  const reload = async () => {
    setLoading(true)
    try {
      setData(await fetchTripSharing(trip.id))
      setMessage('')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [trip.id, trip.accessRole])

  const activeInvites = useMemo(() => (data.invites || []).filter((invite) => invite.is_active), [data.invites])

  const createLink = async () => {
    setWorking('create')
    try {
      const invite = await createTripInvite(trip.id, inviteRole)
      await copyText(invite.url)
      setMessage(`${roleLabel(inviteRole)} 초대 링크를 만들고 복사했어요.`)
      await reload()
    } catch (error) { setMessage(error.message) }
    finally { setWorking('') }
  }

  const copyInvite = async (invite) => {
    try {
      await copyText(buildInviteUrl(invite.token))
      setMessage('초대 링크를 복사했어요.')
    } catch (error) { setMessage(`링크를 복사하지 못했어요: ${error.message}`) }
  }

  const shareInvite = async (invite) => {
    const url = buildInviteUrl(invite.token)
    if (!navigator.share) return copyInvite(invite)
    try {
      await navigator.share({ title: `${trip.title} · TRIP:ON`, text: `${trip.title} 여행에 초대할게요.`, url })
    } catch (error) {
      if (error?.name !== 'AbortError') setMessage(`공유하지 못했어요: ${error.message}`)
    }
  }

  const deactivate = async (invite) => {
    if (!window.confirm('이 초대 링크를 더 이상 사용할 수 없게 할까요?')) return
    setWorking(invite.id)
    try { await deactivateTripInvite(invite.id); await reload(); setMessage('초대 링크를 닫았어요.') }
    catch (error) { setMessage(error.message) }
    finally { setWorking('') }
  }

  const changeRole = async (collaborator, role) => {
    setWorking(collaborator.id)
    try { await updateCollaboratorRole(collaborator.id, role); await reload() }
    catch (error) { setMessage(error.message) }
    finally { setWorking('') }
  }

  const remove = async (collaborator) => {
    if (!window.confirm(`${collaborator.user_email || '이 멤버'}의 공유 권한을 없앨까요?`)) return
    setWorking(collaborator.id)
    try { await removeCollaborator(collaborator.id); await reload() }
    catch (error) { setMessage(error.message) }
    finally { setWorking('') }
  }

  const leave = async () => {
    if (!window.confirm('이 공유 여행에서 나갈까요? 다시 들어오려면 새 초대 링크가 필요할 수 있어요.')) return
    setWorking('leave')
    try {
      await leaveSharedTrip(trip.id)
      onLeft?.()
      onClose?.()
    } catch (error) { setMessage(error.message); setWorking('') }
  }

  return (
    <SheetBackdrop onRequestClose={onClose}>
      <div className="share-trip-sheet" onPointerDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="share-trip-head">
          <div><small>SHARE TRIP</small><strong>{trip.title}</strong><span>{owner ? '함께 여행을 계획할 사람을 초대해보세요.' : `${roleLabel(data.role)} 권한으로 공유받은 여행이에요.`}</span></div>
          <button type="button" onClick={onClose}>닫기</button>
        </div>

        {loading ? <div className="share-trip-loading">공유 정보를 불러오는 중…</div> : <>
          {owner ? <>
            <section className="share-section">
              <div className="share-section-title"><div><strong>초대 링크 만들기</strong><small>링크를 받은 사람이 로그인하면 이 여행에 참여해요.</small></div></div>
              <div className="share-role-picker">
                <button className={inviteRole === 'editor' ? 'active' : ''} onClick={() => setInviteRole('editor')}><PencilLine size={17}/><span><strong>편집 가능</strong><small>일정·준비·기록·지출을 함께 수정</small></span>{inviteRole === 'editor' && <Check size={16}/>}</button>
                <button className={inviteRole === 'viewer' ? 'active' : ''} onClick={() => setInviteRole('viewer')}><Eye size={17}/><span><strong>보기만</strong><small>실시간 변경을 보지만 수정은 불가</small></span>{inviteRole === 'viewer' && <Check size={16}/>}</button>
              </div>
              <button className="share-create-link" disabled={!!working} onClick={createLink}><Link2 size={17}/>{working === 'create' ? '링크 만드는 중…' : '초대 링크 만들고 복사'}</button>
            </section>

            {!!activeInvites.length && <section className="share-section">
              <div className="share-section-title"><div><strong>사용 중인 링크</strong><small>원하지 않는 링크는 언제든 닫을 수 있어요.</small></div><span>{activeInvites.length}</span></div>
              <div className="share-invite-list">{activeInvites.map((invite) => <div className="share-invite-row" key={invite.id}>
                <span className={`share-role-badge ${invite.role}`}>{roleLabel(invite.role)}</span>
                <div><strong>{buildInviteUrl(invite.token).replace(/^https?:\/\//, '')}</strong><small>{new Date(invite.created_at).toLocaleDateString('ko-KR')} 생성</small></div>
                <button onClick={() => copyInvite(invite)} aria-label="초대 링크 복사"><Copy size={16}/></button>
                <button onClick={() => shareInvite(invite)} aria-label="초대 링크 공유"><Share2 size={16}/></button>
                <button onClick={() => deactivate(invite)} disabled={working === invite.id} aria-label="초대 링크 닫기"><Link2Off size={16}/></button>
              </div>)}</div>
            </section>}
          </> : null}

          <section className="share-section">
            <div className="share-section-title"><div><strong>함께 보는 사람</strong><small>수정 내용은 연결된 사람에게 실시간으로 반영돼요.</small></div><span>{(data.collaborators || []).length + 1}</span></div>
            <div className="share-member-list">
              <div className="share-member-row owner-row"><span className="share-member-avatar"><UsersRound size={17}/></span><div><strong>여행 소유자</strong><small>이 여행을 만든 사람</small></div><span className="share-role-badge owner">소유자</span></div>
              {(data.collaborators || []).map((member) => <div className="share-member-row" key={member.id}>
                <span className="share-member-avatar">{String(member.user_email || '?').slice(0,1).toUpperCase()}</span>
                <div><strong>{member.user_email || 'TRIP:ON 멤버'}</strong><small>{new Date(member.joined_at).toLocaleDateString('ko-KR')} 참여</small></div>
                {owner ? <select value={member.role} disabled={working === member.id} onChange={(event) => changeRole(member, event.target.value)}><option value="editor">편집 가능</option><option value="viewer">보기만</option></select> : <span className={`share-role-badge ${member.role}`}>{roleLabel(member.role)}</span>}
                {owner && <button className="share-member-remove" onClick={() => remove(member)} disabled={working === member.id} aria-label="공유 멤버 삭제"><UserMinus size={16}/></button>}
              </div>)}
            </div>
          </section>

          {!owner && <button className="share-leave" disabled={working === 'leave'} onClick={leave}>{working === 'leave' ? '나가는 중…' : '공유 여행에서 나가기'}</button>}
        </>}
        {message && <p className="share-message">{message}</p>}
      </div>
    </SheetBackdrop>
  )
}
