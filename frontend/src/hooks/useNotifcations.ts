import { LocalNotifications } from '@capacitor/local-notifications'
import { Capacitor } from '@capacitor/core'
import api from '../services/api'

// VAPID public key from the backend is base64url — PushManager needs a Uint8Array
const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

// Config the service worker cannot read for itself. sw.js is copied verbatim
// out of public/, so it never sees VITE_API_URL; it picks this up from Cache
// Storage when iOS wakes it to rotate a subscription, with no page running.
const CONFIG_CACHE = 'somatrack-push-config'
const CONFIG_KEY = '/__push-config'

const cachePushConfig = async () => {
  if (!('caches' in window)) return
  try {
    const cache = await caches.open(CONFIG_CACHE)
    await cache.put(
      CONFIG_KEY,
      new Response(JSON.stringify({ apiUrl: api.defaults.baseURL }), {
        headers: { 'Content-Type': 'application/json' }
      })
    )
  } catch {
    // Non-fatal: rotation falls back to the page-side repair on next launch
  }
}

export const useNotifications = () => {

  const canUseWebNotifications = () =>
    typeof window !== 'undefined' && 'Notification' in window

  const requestPermission = async () => {
    if (Capacitor.isNativePlatform()) {
      const { display } = await LocalNotifications.requestPermissions()
      return display === 'granted'
    }

    if (!canUseWebNotifications()) return false
    if (Notification.permission === 'granted') return true

    // iOS only honours this inside a user gesture, and only once — calling it
    // on app load burns the prompt. Keep it behind a tap.
    const permission = await Notification.requestPermission()
    return permission === 'granted'
  }

  /**
   * Show a notification on the web.
   *
   * Always via the service worker registration: `new Notification()` is not
   * supported in iOS Safari or in a home screen app — it throws "Illegal
   * constructor", which is why the old test button did nothing on iPhone.
   * The registration path works everywhere the constructor does, and on iOS too.
   */
  const showLocalNotification = async (title: string, body: string, tag = 'somatrack-local') => {
    if (!canUseWebNotifications() || Notification.permission !== 'granted') return false

    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready
      await registration.showNotification(title, { body, tag, renotify: true } as NotificationOptions)
      return true
    }

    new Notification(title, { body })
    return true
  }

  // Called when user logs in — schedules inactivity reminder
  const scheduleInactivityReminder = async (daysThreshold = 1) => {
    if (!Capacitor.isNativePlatform()) return

    await LocalNotifications.cancel({ notifications: [{ id: 1 }] })

    const triggerDate = new Date()
    triggerDate.setDate(triggerDate.getDate() + daysThreshold)

    await LocalNotifications.schedule({
      notifications: [{
        id: 1,
        title: '💪 Time to train, Kostas!',
        body: `You haven't logged a workout in ${daysThreshold} days. Your muscles are recovered and ready.`,
        schedule: { at: triggerDate },
        sound: undefined,
        smallIcon: 'ic_stat_icon',
        actionTypeId: '',
        extra: null
      }]
    })
  }

  // Called when workout finishes — cancels the reminder and reschedules
  const rescheduleAfterWorkout = async (daysThreshold = 1) => {
    await scheduleInactivityReminder(daysThreshold)
  }

  // Immediate notification — used for rest timer end
  const notifyRestComplete = async (nextSet: string) => {
    if (!Capacitor.isNativePlatform()) {
      await showLocalNotification('⏱️ Rest complete!', `Time for ${nextSet}`, 'somatrack-rest')

      // Web fallback vibration for devices that support it
      if ('vibrate' in navigator) navigator.vibrate([200, 100, 200])
      return
    }

    await LocalNotifications.schedule({
      notifications: [{
        id: 2,
        title: '⏱️ Rest complete!',
        body: `Time for ${nextSet}`,
        schedule: { at: new Date(Date.now() + 100) },
        sound: undefined,
        smallIcon: 'ic_stat_icon',
        actionTypeId: '',
        extra: null
      }]
    })
  }

  // Real Web Push subscription — required for iOS (Add to Home Screen) to deliver
  // notifications when the app isn't in the foreground, including the lock screen.
  // Must be called from a user gesture (e.g. a button tap) for iOS to allow the permission prompt.
  const subscribeToPush = async () => {
    if (Capacitor.isNativePlatform()) return false
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false

    await cachePushConfig()

    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    if (existing) {
      await api.post('/push/subscribe', existing.toJSON())
      return true
    }

    const { data } = await api.get('/push/public-key')
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey)
    })

    await api.post('/push/subscribe', subscription.toJSON())
    return true
  }

  // Unsubscribes both locally (browser) and server-side (so the backend stops pushing to it)
  const unsubscribeFromPush = async () => {
    if (Capacitor.isNativePlatform()) return false
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false

    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    if (!existing) return true

    const endpoint = existing.endpoint
    await existing.unsubscribe()
    await api.post('/push/unsubscribe', { endpoint })
    return true
  }

  // Reflects whether this device currently has an active push subscription.
  // Uses `ready` rather than `getRegistration()`: on a cold load the latter
  // resolves undefined before the worker activates, and the toggle then renders
  // Off on a device that is in fact subscribed.
  const isPushSubscribed = async () => {
    if (Capacitor.isNativePlatform()) return false
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false

    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    return Boolean(existing)
  }

  /**
   * Re-register this device's existing subscription with the server.
   *
   * The browser and the server can drift apart: the server prunes an endpoint
   * the moment it 410s, while the browser happily keeps handing back a
   * subscription object. Re-posting on launch is an idempotent upsert that
   * repairs that, and costs one request.
   */
  const ensurePushSubscription = async () => {
    if (Capacitor.isNativePlatform()) return false
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
    if (!canUseWebNotifications() || Notification.permission !== 'granted') return false

    try {
      const registration = await navigator.serviceWorker.ready
      const existing = await registration.pushManager.getSubscription()
      if (!existing) return false

      await cachePushConfig()
      await api.post('/push/subscribe', existing.toJSON())
      return true
    } catch {
      return false
    }
  }

  /**
   * Ask the SERVER to push to this account's devices.
   *
   * Deliberately not a local notification: the thing worth testing is delivery
   * while the app is closed and the phone is locked, and only a push that
   * travels through APNs exercises that path.
   */
  const sendTestPush = async () => {
    const { data } = await api.post('/push/test')
    return data
  }

  return {
    requestPermission,
    scheduleInactivityReminder,
    rescheduleAfterWorkout,
    notifyRestComplete,
    showLocalNotification,
    subscribeToPush,
    unsubscribeFromPush,
    isPushSubscribed,
    ensurePushSubscription,
    sendTestPush
  }
}
