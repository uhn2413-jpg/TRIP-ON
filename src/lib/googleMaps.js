import { externalMapUrl } from './mapProviders'

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
let loaderPromise = null

export function isGoogleMapsConfigured() {
  return Boolean(GOOGLE_MAPS_KEY)
}

export function loadGoogleMaps() {
  if (typeof window === 'undefined') return Promise.reject(new Error('브라우저에서만 지도를 불러올 수 있어요.'))
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps)
  if (loaderPromise) return loaderPromise
  if (!GOOGLE_MAPS_KEY) return Promise.reject(new Error('Google Maps API 키가 아직 연결되지 않았어요.'))

  loaderPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-trip-on-google-maps="true"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google.maps), { once: true })
      existing.addEventListener('error', () => reject(new Error('Google Maps를 불러오지 못했어요.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.dataset.tripOnGoogleMaps = 'true'
    script.async = true
    script.defer = true
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_KEY)}&loading=async&libraries=places&v=weekly&language=ko`
    script.onload = () => resolve(window.google.maps)
    script.onerror = () => reject(new Error('Google Maps를 불러오지 못했어요. API 키와 허용 도메인을 확인해주세요.'))
    document.head.appendChild(script)
  })

  return loaderPromise
}

function latLngValue(location) {
  if (!location) return { latitude: null, longitude: null }
  const latitude = typeof location.lat === 'function' ? location.lat() : location.lat
  const longitude = typeof location.lng === 'function' ? location.lng() : location.lng
  return {
    latitude: Number.isFinite(Number(latitude)) ? Number(latitude) : null,
    longitude: Number.isFinite(Number(longitude)) ? Number(longitude) : null,
  }
}

function componentValue(components, types, short = false) {
  const wanted = Array.isArray(types) ? types : [types]
  const found = (components || []).find((component) => wanted.some((type) => component.types?.includes(type)))
  return found ? (short ? found.shortText : found.longText) || '' : ''
}

export async function searchGooglePlaces(query) {
  const trimmed = String(query || '').trim()
  if (!trimmed) return []
  await loadGoogleMaps()
  const { Place } = await window.google.maps.importLibrary('places')
  const { places = [] } = await Place.searchByText({
    textQuery: trimmed,
    fields: ['id', 'displayName', 'formattedAddress', 'location', 'googleMapsURI'],
  })
  return places.slice(0, 5).map((place) => ({
    provider: 'google',
    providerPlaceId: place.id || '',
    name: place.displayName || trimmed,
    address: place.formattedAddress || '',
    mapUrl: place.googleMapsURI || '',
    ...latLngValue(place.location),
  }))
}

export async function fetchGooglePlaceDetails(result) {
  if (!result?.providerPlaceId) return result
  await loadGoogleMaps()
  const { Place } = await window.google.maps.importLibrary('places')
  const place = new Place({ id: result.providerPlaceId })
  await place.fetchFields({
    fields: ['displayName', 'formattedAddress', 'location', 'googleMapsURI', 'addressComponents'],
  })
  const components = place.addressComponents || []
  const city = componentValue(components, ['locality', 'postal_town', 'administrative_area_level_2', 'administrative_area_level_1'])
  const country = componentValue(components, 'country')
  const countryCode = componentValue(components, 'country', true)
  return {
    ...result,
    provider: 'google',
    providerPlaceId: place.id || result.providerPlaceId,
    name: place.displayName || result.name,
    address: place.formattedAddress || result.address,
    mapUrl: place.googleMapsURI || result.mapUrl,
    city,
    country,
    countryCode,
    ...latLngValue(place.location),
  }
}

// 기존 컴포넌트들이 이 함수명을 사용하고 있어서 이름은 유지한다.
// 국내 좌표는 카카오맵, 해외 좌표는 Google 지도로 여는 공통 링크를 돌려준다.
export function googleMapsSearchUrl(place) {
  return externalMapUrl(place)
}
