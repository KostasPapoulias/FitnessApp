import { LocalNotifications } from '@capacitor/local-notifications'
import { Capacitor } from '@capacitor/core'
import api from '../services/api'

// VAPID public key is base64url; PushManager needs a Uint8Array
const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

// Config the service worker reads from Cache Storage (it cannot see VITE_API_URL).
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
    // Non-fatal: the page repairs the subscription on next launch
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

    // iOS allows this only inside a user gesture, once
    const permission = await Notification.requestPermission()
    return permission === 'granted'
  }

  /** Show a local notification via the service worker (`new Notification()` fails on iOS). */
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

  // Schedule the inactivity reminder
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

  // Reschedule the reminder after a workout
  const rescheduleAfterWorkout = async (daysThreshold = 1) => {
    await scheduleInactivityReminder(daysThreshold)
  }

  // Immediate notification when rest ends
  const notifyRestComplete = async (nextSet: string) => {
    if (!Capacitor.isNativePlatform()) {
      await showLocalNotification('⏱️ Rest complete!', `Time for ${nextSet}`, 'somatrack-rest')

      // Web vibration fallback
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

  // Web Push subscription (needed for delivery while the app is closed). Call from a user gesture.
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

  // Unsubscribe in the browser and on the server
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

  // Whether this device has an active subscription. Uses `ready`, which waits
  // for the worker on a cold load
  const isPushSubscribed = async () => {
    if (Capacitor.isNativePlatform()) return false
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false

    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    return Boolean(existing)
  }

  /** Re-post this device's subscription on launch (idempotent), in case the server pruned it. */
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

  /** Ask the server to push to this account's devices — tests real delivery. */
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
