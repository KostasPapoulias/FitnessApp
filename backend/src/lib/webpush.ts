import webpush from 'web-push'

export const isPushConfigured = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)

if (isPushConfigured) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@somatrack.app',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
} else {
  console.warn('⚠️  VAPID keys not set — push notifications are disabled')
}

export default webpush
