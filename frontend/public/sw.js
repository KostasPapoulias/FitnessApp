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

const CONFIG_CACHE = 'somatrack-push-config'
const CONFIG_KEY = '/__push-config'

self.addEventListener('install', () => {
  // Take over immediately rather than waiting for every tab to close, so a
  // deploy that fixes push doesn't sit behind an open home screen app.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// ── incoming push ──
// iOS revokes push permission for the whole app if a push arrives and nothing
// is displayed, so every path through this handler MUST end in a
// showNotification() — including the malformed-payload path.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (err) {
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
      data: { url: data.url || '/' }
    })
  )
})

// ── tap ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'

  // Focus the app if it is already open. openWindow() unconditionally would
  // spawn a second window and lose whatever workout was on screen.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client && target !== '/') client.navigate(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    })
  )
})

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

  } catch (err) {
    // Nothing useful to do from here — the page repairs the subscription on
    // next launch (ensurePushSubscription), this just shortens the outage.
  }
}

async function readConfig() {
  try {
    const cache = await caches.open(CONFIG_CACHE)
    const res = await cache.match(CONFIG_KEY)
    return res ? await res.json() : null
  } catch (err) {
    return null
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}
