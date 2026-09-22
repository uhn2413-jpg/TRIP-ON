import React, { useEffect, useMemo, useState } from 'react'
import { Check, MapPin, Search, X } from 'lucide-react'
import { fetchGooglePlaceDetails, isGoogleMapsConfigured, searchGooglePlaces } from '../lib/googleMaps'
import { fetchKakaoPlaceDetails, isKakaoMapsConfigured, searchKakaoPlaces } from '../lib/kakaoMaps'
import { looksLikeKoreanContext } from '../lib/mapProviders'
import { getDefaultMapProvider } from '../lib/preferences'
import '../kakao-maps.css'

const providerLabels = { kakao: '카카오', google: 'Google' }

export default function PlaceSearchField({
  value,
  onChange,
  onApply,
  label = '장소 검색',
  placeholder = '예: 에펠탑, 성심당',
  contextText = '',
}) {
  const [query, setQuery] = useState(value?.name || '')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selecting, setSelecting] = useState('')
  const [error, setError] = useState('')
  const [providerMode, setProviderMode] = useState(() => ['kakao', 'google'].includes(value?.provider) ? value.provider : getDefaultMapProvider())
  const googleConfigured = isGoogleMapsConfigured()
  const kakaoConfigured = isKakaoMapsConfigured()
  const selected = useMemo(() => value?.providerPlaceId || value?.dbId ? value : null, [value])
  const cleanLabel = label.replace(/^Google\s*/i, '') || '장소 연결'

  useEffect(() => {
    if (providerMode === 'kakao' && !kakaoConfigured) setProviderMode(googleConfigured ? 'google' : 'auto')
    if (providerMode === 'google' && !googleConfigured) setProviderMode(kakaoConfigured ? 'kakao' : 'auto')
  }, [providerMode, googleConfigured, kakaoConfigured])

  const chooseAutoProvider = (text) => {
    if (looksLikeKoreanContext(`${contextText} ${text}`) && kakaoConfigured) return 'kakao'
    if (googleConfigured) return 'google'
    if (kakaoConfigured) return 'kakao'
    return ''
  }

  const runSearch = async (provider, text) => {
    if (provider === 'kakao') return searchKakaoPlaces(text)
    return searchGooglePlaces(text)
  }

  const search = async () => {
    const text = query.trim()
    if (!text || (!googleConfigured && !kakaoConfigured)) return
    setSearching(true)
    setError('')
    setResults([])
    try {
      let provider = providerMode === 'auto' ? chooseAutoProvider(text) : providerMode
      if (provider === 'kakao' && !kakaoConfigured) provider = googleConfigured ? 'google' : ''
      if (provider === 'google' && !googleConfigured) provider = kakaoConfigured ? 'kakao' : ''
      if (!provider) throw new Error('사용할 수 있는 지도 API가 아직 연결되지 않았어요.')

      let found = await runSearch(provider, text)
      if (!found.length && providerMode === 'auto') {
        const fallback = provider === 'kakao' ? 'google' : 'kakao'
        const fallbackReady = fallback === 'kakao' ? kakaoConfigured : googleConfigured
        if (fallbackReady) found = await runSearch(fallback, text)
      }
      setResults(found)
      if (!found.length) setError('검색 결과가 없어요. 지도 서비스를 바꾸거나 검색어를 조금 다르게 입력해보세요.')
    } catch (e) {
      setError(e.message)
    } finally {
      setSearching(false)
    }
  }

  const select = async (result) => {
    setSelecting(`${result.provider}:${result.providerPlaceId}`)
    setError('')
    try {
      const details = result.provider === 'kakao'
        ? await fetchKakaoPlaceDetails(result)
        : await fetchGooglePlaceDetails(result)
      onChange(details)
      onApply?.(details)
      setProviderMode(details.provider || 'auto')
      setQuery(details.name || query)
      setResults([])
    } catch (e) {
      setError(e.message)
    } finally {
      setSelecting('')
    }
  }

  if (!googleConfigured && !kakaoConfigured) {
    return (
      <div className="place-search-box disabled">
        <div className="place-search-head"><span>{cleanLabel}</span><small>지도 연결 필요</small></div>
        <p>Google Maps 또는 카카오맵 API 키를 연결하면 장소를 검색해서 주소와 좌표를 자동으로 저장할 수 있어요.</p>
      </div>
    )
  }

  return (
    <div className="place-search-box hybrid-place-search">
      <div className="place-search-head">
        <span>{cleanLabel}</span>
        <small>{selected ? `${providerLabels[value.provider] || '지도'} 연결됨` : '국내 카카오 · 해외 Google'}</small>
      </div>
      {selected ? (
        <div className="selected-place-card">
          <MapPin size={18} />
          <div><strong>{value.name}</strong><small>{value.address || [value.country, value.city].filter(Boolean).join(' · ') || '좌표 연결됨'}</small></div>
          <span className={`map-provider-chip ${value.provider || 'manual'}`}>{providerLabels[value.provider] || '직접'}</span>
          <button type="button" onClick={() => { onChange(null); setQuery(''); setResults([]); setProviderMode(getDefaultMapProvider()) }} aria-label="장소 연결 해제"><X size={17} /></button>
        </div>
      ) : (
        <>
          <div className="place-provider-toggle" role="group" aria-label="장소 검색 지도 선택">
            <button type="button" className={providerMode === 'auto' ? 'active' : ''} onClick={() => setProviderMode('auto')}>자동</button>
            <button type="button" className={providerMode === 'kakao' ? 'active' : ''} onClick={() => setProviderMode('kakao')} disabled={!kakaoConfigured}>카카오</button>
            <button type="button" className={providerMode === 'google' ? 'active' : ''} onClick={() => setProviderMode('google')} disabled={!googleConfigured}>Google</button>
          </div>
          <div className="place-search-row">
            <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search() } }} placeholder={placeholder} />
            <button type="button" onClick={search} disabled={!query.trim() || searching}><Search size={16} /> {searching ? '검색 중' : '검색'}</button>
          </div>
          <small className="place-search-note">자동은 국내 단서가 있으면 카카오, 그 외에는 Google을 우선해요. 검색은 버튼을 눌렀을 때만 요청해요.</small>
          {!kakaoConfigured && <small className="place-provider-help">카카오맵 키를 연결하면 국내 장소 검색과 국내 지도가 카카오맵으로 자동 전환돼요.</small>}
          {results.length > 0 && (
            <div className="place-search-results">
              {results.map((result) => {
                const key = `${result.provider}:${result.providerPlaceId}`
                return (
                  <button type="button" key={key} onClick={() => select(result)} disabled={Boolean(selecting)}>
                    <MapPin size={16} />
                    <span><strong>{result.name}</strong><small>{result.address || '주소 정보 없음'}</small></span>
                    <em className={`place-result-provider ${result.provider}`}>{providerLabels[result.provider]}</em>
                    {selecting === key ? <span className="place-result-loading">…</span> : <Check size={16} />}
                  </button>
                )
              })}
              <small className="google-attribution">검색 결과 · {providerLabels[results[0]?.provider] || '지도'}</small>
            </div>
          )}
        </>
      )}
      {error && <div className="schedule-alert">{error}</div>}
    </div>
  )
}
