import { LocalNotifications } from '@capacitor/local-notifications'
import { Capacitor } from '@capacitor/core'

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
    testNotificationNow
  }
}