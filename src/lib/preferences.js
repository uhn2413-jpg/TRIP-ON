const KEY = 'tripon:preferences:v1'

export const defaultPreferences = {
  mapProvider: 'auto',
  pageTransitions: true,
  theme: 'light',
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
  }
  localStorage.setItem(KEY, JSON.stringify(value))
  window.dispatchEvent(new CustomEvent('tripon:preferences-changed', { detail: value }))
  return value
}

export function getDefaultMapProvider() {
  return loadAppPreferences().mapProvider
}
