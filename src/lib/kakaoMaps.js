const KAKAO_MAPS_KEY = import.meta.env.VITE_KAKAO_MAPS_JAVASCRIPT_KEY || ''
let loaderPromise = null

export function isKakaoMapsConfigured() {
  return Boolean(KAKAO_MAPS_KEY)
}

export function loadKakaoMaps() {
  if (typeof window === 'undefined') return Promise.reject(new Error('브라우저에서만 카카오맵을 불러올 수 있어요.'))
  if (window.kakao?.maps?.services) return Promise.resolve(window.kakao.maps)
  if (loaderPromise) return loaderPromise
  if (!KAKAO_MAPS_KEY) return Promise.reject(new Error('카카오맵 JavaScript 키가 아직 연결되지 않았어요.'))

  loaderPromise = new Promise((resolve, reject) => {
    const finish = () => {
      if (!window.kakao?.maps) {
        reject(new Error('카카오맵을 불러오지 못했어요. JavaScript 키와 허용 도메인을 확인해주세요.'))
        return
      }
      window.kakao.maps.load(() => resolve(window.kakao.maps))
    }

    const existing = document.querySelector('script[data-trip-on-kakao-maps="true"]')
    if (existing) {
      if (window.kakao?.maps) finish()
      else {
        existing.addEventListener('load', finish, { once: true })
        existing.addEventListener('error', () => reject(new Error('카카오맵을 불러오지 못했어요.')), { once: true })
      }
      return
    }

    const script = document.createElement('script')
    script.dataset.tripOnKakaoMaps = 'true'
    script.async = true
    script.defer = true
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KAKAO_MAPS_KEY)}&autoload=false&libraries=services`
    script.onload = finish
    script.onerror = () => reject(new Error('카카오맵을 불러오지 못했어요. JavaScript 키와 허용 도메인을 확인해주세요.'))
    document.head.appendChild(script)
  })

  return loaderPromise
}

function cleanCity(address = '') {
  const parts = String(address || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  const first = parts[0]
  const directCities = {
    서울특별시: '서울', 부산광역시: '부산', 인천광역시: '인천', 대구광역시: '대구',
    대전광역시: '대전', 광주광역시: '광주', 울산광역시: '울산', 세종특별자치시: '세종',
    제주특별자치도: '제주',
  }
  if (directCities[first]) return directCities[first]
  if (first.endsWith('도') && parts[1]) return parts[1].replace(/시$/, '')
  return first.replace(/(특별시|광역시|특별자치시|특별자치도|도)$/, '')
}

export async function searchKakaoPlaces(query) {
  const trimmed = String(query || '').trim()
  if (!trimmed) return []
  await loadKakaoMaps()

  return new Promise((resolve, reject) => {
    const places = new window.kakao.maps.services.Places()
    places.keywordSearch(trimmed, (data, status) => {
      const Status = window.kakao.maps.services.Status
      if (status === Status.ZERO_RESULT) {
        resolve([])
        return
      }
      if (status !== Status.OK) {
        reject(new Error('카카오맵 장소 검색에 실패했어요. 잠시 후 다시 시도해주세요.'))
        return
      }
      resolve((data || []).slice(0, 5).map((place) => {
        const address = place.road_address_name || place.address_name || ''
        return {
          provider: 'kakao',
          providerPlaceId: String(place.id || ''),
          name: place.place_name || trimmed,
          address,
          city: cleanCity(address),
          country: '대한민국',
          countryCode: 'KR',
          latitude: Number(place.y),
          longitude: Number(place.x),
          mapUrl: place.place_url || '',
          phone: place.phone || '',
          category: place.category_name || '',
          timezone: 'Asia/Seoul',
        }
      }))
    }, { size: 5 })
  })
}

export async function fetchKakaoPlaceDetails(result) {
  if (!result) return null
  return {
    ...result,
    provider: 'kakao',
    country: result.country || '대한민국',
    countryCode: result.countryCode || 'KR',
    city: result.city || cleanCity(result.address),
    timezone: result.timezone || 'Asia/Seoul',
  }
}
