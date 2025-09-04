// Minimal service worker for offline shell caching
const CACHE = 'reader-lite-v1'
const ASSETS = [
  '/',
  '/manifest.webmanifest',
]

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE && caches.delete(k))))
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  // Network first for API; cache first for others
  if (request.url.includes('/api/fetch')) {
    e.respondWith(
      fetch(request).catch(() => caches.match(request))
    )
  } else {
    e.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(resp => {
        const copy = resp.clone()
        caches.open(CACHE).then(c => c.put(request, copy))
        return resp
      }))
    )
  }
})
