import React, { useMemo, useState } from 'react'
import { Check, MapPin, Search, X } from 'lucide-react'
import { fetchGooglePlaceDetails, isGoogleMapsConfigured, searchGooglePlaces } from '../lib/googleMaps'

export default function PlaceSearchField({ value, onChange, onApply, label = '장소 검색', placeholder = '예: 에펠탑, Louvre Museum' }) {
  const [query, setQuery] = useState(value?.name || '')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selecting, setSelecting] = useState('')
  const [error, setError] = useState('')
  const configured = isGoogleMapsConfigured()
  const selected = useMemo(() => value?.providerPlaceId || value?.dbId ? value : null, [value])

  const search = async () => {
    const text = query.trim()
    if (!text || !configured) return
    setSearching(true)
    setError('')
    try {
      setResults(await searchGooglePlaces(text))
    } catch (e) {
      setError(e.message)
    } finally {
      setSearching(false)
    }
  }

  const select = async (result) => {
    setSelecting(result.providerPlaceId)
    setError('')
    try {
      const details = await fetchGooglePlaceDetails(result)
      onChange(details)
      onApply?.(details)
      setQuery(details.name || query)
      setResults([])
    } catch (e) {
      setError(e.message)
    } finally {
      setSelecting('')
    }
  }

  if (!configured) {
    return (
      <div className="place-search-box disabled">
        <div className="place-search-head"><span>{label}</span><small>Google Maps</small></div>
        <p>Google Maps API 키를 연결하면 장소를 검색해서 주소와 좌표를 자동으로 저장할 수 있어요.</p>
      </div>
    )
  }

  return (
    <div className="place-search-box">
      <div className="place-search-head"><span>{label}</span><small>Google Maps</small></div>
      {selected ? (
        <div className="selected-place-card">
          <MapPin size={18} />
          <div><strong>{value.name}</strong><small>{value.address || [value.country, value.city].filter(Boolean).join(' · ') || '좌표 연결됨'}</small></div>
          <button type="button" onClick={() => { onChange(null); setQuery('') }} aria-label="장소 연결 해제"><X size={17} /></button>
        </div>
      ) : (
        <>
          <div className="place-search-row">
            <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search() } }} placeholder={placeholder} />
            <button type="button" onClick={search} disabled={!query.trim() || searching}><Search size={16} /> {searching ? '검색 중' : '검색'}</button>
          </div>
          <small className="place-search-note">입력 중에는 검색하지 않고, 검색 버튼을 눌렀을 때만 요청해요.</small>
          {results.length > 0 && (
            <div className="place-search-results">
              {results.map((result) => (
                <button type="button" key={result.providerPlaceId} onClick={() => select(result)} disabled={Boolean(selecting)}>
                  <MapPin size={16} />
                  <span><strong>{result.name}</strong><small>{result.address || '주소 정보 없음'}</small></span>
                  {selecting === result.providerPlaceId ? <span className="place-result-loading">…</span> : <Check size={16} />}
                </button>
              ))}
              <small className="google-attribution">검색 결과 · Google Maps</small>
            </div>
          )}
        </>
      )}
      {error && <div className="schedule-alert">{error}</div>}
    </div>
  )
}
