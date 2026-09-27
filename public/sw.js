const CACHE = 'tripon-shell-v3'

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    try { await cache.add('/') } catch { /* first install can continue even if preload fails */ }
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => key.startsWith('tripon-shell-') && key !== CACHE).map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE)
      try {
        const response = await fetch(request)
        if (response?.ok) await cache.put('/', response.clone())
        return response
      } catch {
        return (await cache.match(request)) || (await cache.match('/')) || Response.error()
      }
    })())
    return
  }

  const cacheable = ['script', 'style', 'font', 'image', 'manifest'].includes(request.destination)
  if (!cacheable) return
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    const cached = await cache.match(request)
    if (cached) return cached
    try {
      const response = await fetch(request)
      if (response?.ok) await cache.put(request, response.clone())
      return response
    } catch {
      return Response.error()
    }
  })())
})
