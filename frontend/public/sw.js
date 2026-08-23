// SomaTrack service worker.
//
// This file is what runs when the app is NOT running: swiped out of the app
// switcher, screen locked, or never opened since the phone booted. iOS wakes
// this worker when APNs delivers a push and kills it again seconds later, so
// everything here must be short-lived and hold no state between events.
//
// It lives in public/ and is copied verbatim by Vite — no bundling, no
// import.meta.env. Config it can't hardcode is left in Cache Storage by the
// page (see useNotifcations.ts) and read back below.
//
// Two jobs, and they are independent: push delivery (the original one), and the
// app-shell cache below that makes a cold launch instant and survives a gym
// with no signal.

const CONFIG_CACHE = 'somatrack-push-config'
const CONFIG_KEY = '/__push-config'

// ── app shell cache ────────────────────────────────────────────────────────
//
// Runtime caching rather than a precache manifest, because this file is copied
// verbatim and never bundled — it cannot see the content-hashed filenames Vite
// produces, and a hardcoded list would go stale on the first deploy. Assets are
// cached the first time they are fetched instead, which costs one online launch
// and then works offline indefinitely.
//
// Bump SHELL_CACHE to evict everything at once. `activate` deletes any cache
// that is not in the current set, so an old bundle's assets do not accumulate
// forever on a phone.
const SHELL_CACHE = 'somatrack-shell-v1'
const KEEP_CACHES = [SHELL_CACHE, CONFIG_CACHE]

/** The SPA entry. Every navigation falls back to this — Netlify rewrites all
 *  paths to it anyway, so one cached copy answers every route. */
const APP_SHELL = '/index.html'

self.addEventListener('install', (event) => {
  // Take over immediately rather than waiting for every tab to close, so a
  // deploy that fixes push doesn't sit behind an open home screen app.
  self.skipWaiting()

  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll([APP_SHELL, '/logo-mark.png', '/manifest.json']))
      // A failed precache must not fail the install. An offline install, or one
      // file 404ing after a rename, would otherwise leave the worker stuck in
      // `installing` and push would stop working too.
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
 * Which requests this worker will answer from cache at all.
 *
 * The API is excluded outright, and that is not a performance decision. Serving
 * a stale readiness score or a stale fatigue map would be actively wrong — the
 * whole model is time-dependent, and a cached body map showing yesterday's
 * recovery is worse than an honest failure. Writes are handled by the outbox in
 * `lib/setQueue.ts`, on the page side where there is state to reconcile.
 */
const isSameOriginGet = (request, url) =>
  request.method === 'GET' &&
  url.origin === self.location.origin &&
  !url.pathname.startsWith('/api/')

/**
 * Built assets only — never anything the dev server invents.
 *
 * This allowlist exists because the same worker runs against `vite dev`, which
 * serves modules from `/src/`, `/node_modules/` and `/@vite/` with cache-busting
 * query strings. Caching those first-wins would serve a stale module after
 * every edit and break HMR, and the failure would look like "my changes stopped
 * applying" rather than anything to do with a service worker.
 *
 * `/assets/` is where Vite writes its content-hashed output, and the handful of
 * root files below are the only other things a build emits.
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

const isBuiltAsset = (url) =>
  url.pathname.startsWith('/assets/') || CACHEABLE_ROOT_FILES.includes(url.pathname)

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (!isSameOriginGet(request, url)) return

  // Navigations: network first, so a deploy is picked up on the next launch
  // with a signal, and the cached shell answers when there is none. Cache-first
  // here would pin users to whatever build they first installed.
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

  // The hashed JS/CSS bundles, images, fonts, the map worker. Cache-first,
  // because a content-hashed filename can never change contents: a new build
  // produces new names, and the old ones are evicted by the version bump above
  // rather than by revalidation.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        // Only cache a real success. An opaque cross-origin response or a 404
        // stored here would be served forever.
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
// iOS revokes push permission for the whole app if a push arrives and nothing
// is displayed, so every path through this handler MUST end in a
// showNotification() — including the malformed-payload path.
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
      // Same tag ⇒ the new notification REPLACES the previous one instead of
      // adding a row. A once-a-minute reminder without this buries Notification
      // Center in an hour. renotify makes the replacement still buzz.
      tag: data.tag || 'somatrack',
      renotify: true,
      data: { url: data.url || '/', nid: data.nid }
    })
      // Show first, THEN report. A failed ack must never cost the user the
      // notification itself — and on iOS, not showing one revokes permission.
      .then(() => ack(data.nid, 'displayed'))
  )
})

// ── tap ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const info = event.notification.data || {}
  const target = info.url || '/'

  // Focus the app if it is already open. openWindow() unconditionally would
  // spawn a second window and lose whatever workout was on screen.
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
// Weak signal: iOS fires this inconsistently, so it informs the history screen
// but never feeds the engagement backoff.
self.addEventListener('notificationclose', (event) => {
  const info = event.notification.data || {}
  event.waitUntil(ack(info.nid, 'dismissed'))
})

/**
 * Report a notification's fate to the server.
 *
 * This is the only delivery receipt web push provides: a push service returning
 * 201 means it accepted the payload, not that any phone rendered it. Without
 * this the app cannot tell a working subscription from a ghost.
 *
 * Requires network at the moment of display, so a missing ack means "not
 * confirmed", never "definitely not delivered".
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
    // Offline, or the worker was killed early. Nothing to recover here.
  }
}

// ── subscription rotation ──
// iOS silently replaces a push subscription now and then (OS updates, long idle
// periods, reinstalls). Without this handler the old endpoint keeps 410-ing,
// the server prunes it, and push dies for good while the UI still reads "On" —
// the classic "it worked for a week then stopped" failure.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(resubscribe(event))
})

async function resubscribe(event) {
  try {
    const config = await readConfig()
    if (!config || !config.apiUrl) return

    const oldEndpoint = event.oldSubscription && event.oldSubscription.endpoint
    if (!oldEndpoint) return

    // Prefer the key the old subscription was created with; fall back to the
    // server, which serves it unauthenticated precisely for this moment.
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
    // Nothing useful to do from here — the page repairs the subscription on
    // next launch (ensurePushSubscription), this just shortens the outage.
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
