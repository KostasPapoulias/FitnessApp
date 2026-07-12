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

    const permission = await Notification.requestPermission()
    return permission === 'granted'
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
      if (canUseWebNotifications() && Notification.permission === 'granted') {
        new Notification('Rest complete!', {
          body: `Time for ${nextSet}`,
          icon: '/favicon.ico'
        })
      }

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

  // Recurring reminder — desktop/mobile web only, fired on an interval while the tab is open
  const notifyReminder = async (title = '💪 SomaTrack', body = 'Still here? Just checking in.') => {
    if (Capacitor.isNativePlatform()) return
    if (!canUseWebNotifications() || Notification.permission !== 'granted') return

    new Notification(title, { body, icon: '/favicon.ico' })
  }

  // Real Web Push subscription — required for iOS (Add to Home Screen) to deliver
  // notifications when the app isn't in the foreground, including the lock screen.
  // Must be called from a user gesture (e.g. a button tap) for iOS to allow the permission prompt.
  const subscribeToPush = async () => {
    if (Capacitor.isNativePlatform()) return false
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false

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

  // Reflects whether this device currently has an active push subscription
  const isPushSubscribed = async () => {
    if (Capacitor.isNativePlatform()) return false
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false

    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) return false

    const existing = await registration.pushManager.getSubscription()
    return Boolean(existing)
  }

  const testNotificationNow = async () => {
    const granted = await requestPermission()
    if (!granted) return false

    if (!Capacitor.isNativePlatform()) {
      if (canUseWebNotifications()) {
        new Notification('Somatrack test', {
          body: 'Notifications are working on this device/browser.',
          icon: '/favicon.ico'
        })
      }
      if ('vibrate' in navigator) navigator.vibrate([100, 60, 100])
      return true
    }

    await LocalNotifications.cancel({ notifications: [{ id: 9999 }] })
    await LocalNotifications.schedule({
      notifications: [{
        id: 9999,
        title: 'Somatrack test',
        body: 'Notifications are working on this device.',
        schedule: { at: new Date(Date.now() + 1000) },
        sound: undefined,
        smallIcon: 'ic_stat_icon',
        actionTypeId: '',
        extra: null
      }]
    })

    return true
  }

  return {
    requestPermission,
    scheduleInactivityReminder,
    rescheduleAfterWorkout,
    notifyRestComplete,
    notifyReminder,
    subscribeToPush,
    unsubscribeFromPush,
    isPushSubscribed,
    testNotificationNow
  }
}