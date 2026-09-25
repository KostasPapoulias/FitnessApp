// SomaTrack service worker: push delivery and the offline app-shell cache.
// Copied verbatim by Vite (no bundling, no import.meta.env); config is read
// from Cache Storage, written by the page (see useNotifcations.ts). Short-lived
// on iOS, so it holds no state between events.

const CONFIG_CACHE = 'somatrack-push-config'
const CONFIG_KEY = '/__push-config'

// ── app shell cache ──
// Runtime caching, since this unbundled file can't see Vite's hashed filenames.
// Bump SHELL_CACHE to evict; `activate` deletes caches not in KEEP_CACHES.
const SHELL_CACHE = 'somatrack-shell-v1'
const KEEP_CACHES = [SHELL_CACHE, CONFIG_CACHE]

/** The SPA entry; every navigation falls back to it. */
const APP_SHELL = '/index.html'

self.addEventListener('install', (event) => {
  // Take over without waiting for open tabs to close
  self.skipWaiting()

  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll([APP_SHELL, '/logo-mark.png', '/manifest.json']))
      // A failed precache must not fail the install (it would also stop push)
      .catch(() => {})
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((names) =>
        Promise.all(names.filter((n) => !KEEP_CACHES.includes(n)).map((n) => caches.delete(n)))
      ),
    ])
  )
})

/**
 * Same-origin GETs only. /api/ is never cached: the fatigue model is
 * time-dependent, so stale data is worse than a failure.
 */
const isSameOriginGet = (request, url) =>
  request.method === 'GET' &&
  url.origin === self.location.origin &&
  !url.pathname.startsWith('/api/')

/**
 * Built assets only. The allowlist keeps `vite dev` modules (/src/, /@vite/…)
 * out of the cache, which would otherwise break HMR.
 */
const CACHEABLE_ROOT_FILES = [
  '/logo-mark.png',
  '/manifest.json',
  '/apple-touch-icon.png',
  '/favicon-32.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
]

/**
 * Exercise artwork (/exercises/ and /exercise-media/, proxied same-origin by
 * netlify.toml). Filenames carry the content id, so they never go stale.
 */
const isExerciseMedia = (url) =>
  url.pathname.startsWith('/exercises/') || url.pathname.startsWith('/exercise-media/')

const isBuiltAsset = (url) =>
  url.pathname.startsWith('/assets/') ||
  CACHEABLE_ROOT_FILES.includes(url.pathname) ||
  isExerciseMedia(url)

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (!isSameOriginGet(request, url)) return

  // Navigations: network first so a deploy lands on the next launch; cached shell offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put(APP_SHELL, copy)).catch(() => {})
          return response
        })
        .catch(() => caches.match(APP_SHELL).then((cached) => cached || Response.error()))
    )
    return
  }

  if (!isBuiltAsset(url)) return

  // Hashed assets: cache first — a new build means new filenames
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        // Only a real success; a cached 404 would be served forever
        if (response.ok && response.type === 'basic') {
          const copy = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
        }
        return response
      })
    })
  )
})

// ── incoming push ──
// iOS revokes push permission if a push shows nothing, so every path must end
// in showNotification(), including a malformed payload
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'SomaTrack', {
      body: data.body || 'Reminder',
      // Same tag replaces the previous notification; renotify still buzzes
      tag: data.tag || 'somatrack',
      renotify: true,
      data: { url: data.url || '/', nid: data.nid }
    })
      // Show first, then ack: a failed ack must never cost the notification
      .then(() => ack(data.nid, 'displayed'))
  )
})

// ── tap ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const info = event.notification.data || {}
  const target = info.url || '/'

  // Focus an open window rather than spawning a second one
  event.waitUntil(
    Promise.all([
      ack(info.nid, 'clicked'),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        for (const client of clients) {
          if ('focus' in client) {
            if ('navigate' in client && target !== '/') client.navigate(target)
            return client.focus()
          }
        }
        return self.clients.openWindow(target)
      })
    ])
  )
})

// ── dismissed ──
// Weak signal (iOS fires it inconsistently): history only, not the engagement backoff
self.addEventListener('notificationclose', (event) => {
  const info = event.notification.data || {}
  event.waitUntil(ack(info.nid, 'dismissed'))
})

/**
 * Report a notification's fate — web push's only delivery receipt. Needs the
 * network, so a missing ack means "unconfirmed", not "undelivered".
 */
async function ack(nid, event) {
  if (!nid) return
  try {
    const config = await readConfig()
    if (!config || !config.apiUrl) return

    await fetch(`${config.apiUrl}/push/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nid, event })
    })
  } catch {
    // Offline or killed early; nothing to recover
  }
}

// ── subscription rotation ──
// iOS replaces subscriptions silently; without this the old endpoint 410s and
// push dies while the UI still reads "On"
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(resubscribe(event))
})

async function resubscribe(event) {
  try {
    const config = await readConfig()
    if (!config || !config.apiUrl) return

    const oldEndpoint = event.oldSubscription && event.oldSubscription.endpoint
    if (!oldEndpoint) return

    // Prefer the old subscription's key; else the server's public key endpoint
    let applicationServerKey =
      event.oldSubscription.options && event.oldSubscription.options.applicationServerKey

    if (!applicationServerKey) {
      const res = await fetch(`${config.apiUrl}/push/public-key`)
      const body = await res.json()
      if (!body.publicKey) return
      applicationServerKey = urlBase64ToUint8Array(body.publicKey)
    }

    const subscription =
      event.newSubscription ||
      (await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      }))

    const json = subscription.toJSON()
    await fetch(`${config.apiUrl}/push/rotate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldEndpoint, endpoint: json.endpoint, keys: json.keys })
    })

  } catch {
    // The page repairs the subscription on next launch (ensurePushSubscription)
  }
}

async function readConfig() {
  try {
    const cache = await caches.open(CONFIG_CACHE)
    const res = await cache.match(CONFIG_KEY)
    return res ? await res.json() : null
  } catch {
    return null
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}
