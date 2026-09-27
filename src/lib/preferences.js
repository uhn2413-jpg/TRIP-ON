const KEY = 'tripon:preferences:v1'

export const defaultPreferences = {
  mapProvider: 'auto',
  pageTransitions: true,
  theme: 'light',
  offlineAutoSync: true,
  offlineWifiOnlyAttachments: true,
  showPlannedTravelEstimate: true,
}

export function loadAppPreferences() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}')
    return {
      ...defaultPreferences,
      ...parsed,
      mapProvider: ['auto', 'kakao', 'google'].includes(parsed?.mapProvider) ? parsed.mapProvider : defaultPreferences.mapProvider,
      pageTransitions: parsed?.pageTransitions !== false,
      theme: ['light', 'system', 'dark'].includes(parsed?.theme) ? parsed.theme : defaultPreferences.theme,
      offlineAutoSync: parsed?.offlineAutoSync !== false,
      offlineWifiOnlyAttachments: parsed?.offlineWifiOnlyAttachments !== false,
      showPlannedTravelEstimate: parsed?.showPlannedTravelEstimate !== false,
    }
  } catch {
    return { ...defaultPreferences }
  }
}

export function saveAppPreferences(next) {
  const value = {
    ...defaultPreferences,
    ...next,
    mapProvider: ['auto', 'kakao', 'google'].includes(next?.mapProvider) ? next.mapProvider : defaultPreferences.mapProvider,
    pageTransitions: next?.pageTransitions !== false,
    theme: ['light', 'system', 'dark'].includes(next?.theme) ? next.theme : defaultPreferences.theme,
    offlineAutoSync: next?.offlineAutoSync !== false,
    offlineWifiOnlyAttachments: next?.offlineWifiOnlyAttachments !== false,
    showPlannedTravelEstimate: next?.showPlannedTravelEstimate !== false,
  }
  localStorage.setItem(KEY, JSON.stringify(value))
  window.dispatchEvent(new CustomEvent('tripon:preferences-changed', { detail: value }))
  return value
}

export function getDefaultMapProvider() {
  return loadAppPreferences().mapProvider
}
