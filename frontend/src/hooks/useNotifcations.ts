import { LocalNotifications } from '@capacitor/local-notifications'
import { Capacitor } from '@capacitor/core'

export const useNotifications = () => {

  const requestPermission = async () => {
    if (!Capacitor.isNativePlatform()) return true // skip on web
    const { display } = await LocalNotifications.requestPermissions()
    return display === 'granted'
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
      // Web fallback — vibrate
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

  return {
    requestPermission,
    scheduleInactivityReminder,
    rescheduleAfterWorkout,
    notifyRestComplete
  }
}