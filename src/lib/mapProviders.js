const KOREA_NAMES = ['대한민국', '한국', 'south korea', 'republic of korea', 'korea, republic of', 'kr']

export function isKoreaCoordinate(latitude, longitude) {
  const lat = Number(latitude)
  const lng = Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  return lat >= 32.5 && lat <= 39.8 && lng >= 123.5 && lng <= 132.2
}

export function isKoreanPlace(place) {
  if (!place) return false
  const code = String(place.countryCode || place.country_code || '').trim().toUpperCase()
  if (code === 'KR' || code === 'KOR') return true
  const country = String(place.country || '').trim().toLowerCase()
  if (KOREA_NAMES.some((name) => country === name || country.includes(name))) return true
  return isKoreaCoordinate(place.latitude, place.longitude)
}

export function allVisualsAreKorean(points = [], pathSegments = []) {
  const coords = []
  for (const point of points || []) {
    if (point?.latitude != null && point?.longitude != null) coords.push(point)
  }
  for (const segment of pathSegments || []) {
    for (const point of segment?.points || []) {
      if (point?.latitude != null && point?.longitude != null) coords.push(point)
    }
  }
  return coords.length > 0 && coords.every((point) => isKoreanPlace(point))
}

export function looksLikeKoreanContext(text = '') {
  const value = String(text || '').toLowerCase()
  if (!value.trim()) return false
  const tokens = [
    '대한민국', '한국', '서울', '부산', '인천', '대구', '대전', '광주', '울산', '세종', '제주',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '충청', '전라', '경상',
    '수원', '성남', '용인', '고양', '화성', '김포', '파주', '안양', '부천', '안산', '평택',
    '춘천', '강릉', '속초', '원주', '청주', '천안', '아산', '전주', '군산', '여수', '순천',
    '포항', '경주', '구미', '창원', '진주', '통영', '거제', 'jeju', 'seoul', 'busan', 'incheon',
    'daegu', 'daejeon', 'gwangju', 'ulsan', 'suwon', 'gyeongju', 'gangneung', 'korea',
  ]
  return tokens.some((token) => value.includes(token))
}

export function kakaoMapLink(place) {
  if (place?.provider === 'kakao' && place?.mapUrl) return place.mapUrl
  if (place?.providerPlaceId && place?.provider === 'kakao') {
    return `https://map.kakao.com/link/map/${encodeURIComponent(place.providerPlaceId)}`
  }
  if (place?.latitude != null && place?.longitude != null) {
    const name = String(place?.name || '장소').trim() || '장소'
    return `https://map.kakao.com/link/map/${encodeURIComponent(name)},${Number(place.latitude)},${Number(place.longitude)}`
  }
  const query = [place?.name, place?.address].filter(Boolean).join(' ')
  return query ? `https://map.kakao.com/?q=${encodeURIComponent(query)}` : ''
}

export function googleMapLink(place) {
  if (place?.provider === 'google' && place?.mapUrl) return place.mapUrl
  if (place?.latitude != null && place?.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.latitude},${place.longitude}`)}`
  }
  const query = [place?.name, place?.address].filter(Boolean).join(' ')
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : ''
}

export function externalMapProvider(place) {
  return isKoreanPlace(place) ? 'kakao' : 'google'
}

export function externalMapUrl(place) {
  return externalMapProvider(place) === 'kakao' ? kakaoMapLink(place) : googleMapLink(place)
}

export function externalMapLabel(place) {
  return externalMapProvider(place) === 'kakao' ? '카카오맵에서 보기' : 'Google 지도에서 보기'
}
