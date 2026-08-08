/**
 * Read-only dump of everything behind "why did I not get a notification":
 * who opted in, which devices are registered, and what the ledger says happened
 * to each notification — sent, displayed on the phone, or never delivered.
 *
 * Run with: npx tsx scripts/inspect-notifications.ts
 * Writes nothing. Points at whatever DATABASE_URL is in .env.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const main = async () => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  console.log('=== USERS ===')
  for (const u of users) console.log(u.createdAt.toISOString(), u.email, u.id)

  console.log('\n=== NOTIFICATION PREFERENCES ===')
  const prefs = await prisma.notificationPreference.findMany()
  for (const p of prefs) {
    const email = users.find(u => u.id === p.userId)?.email
    console.log(JSON.stringify({ email, ...p }, null, 1))
  }

  console.log('\n=== PUSH SUBSCRIPTIONS ===')
  const subs = await prisma.pushSubscription.findMany({
    select: { userId: true, endpoint: true, createdAt: true },
  })
  for (const s of subs) {
    console.log(
      users.find(u => u.id === s.userId)?.email,
      s.createdAt.toISOString(),
      s.endpoint.slice(0, 60) + '...'
    )
  }

  console.log('\n=== NOTIFICATIONS (last 21 days) ===')
  const since = new Date(Date.now() - 21 * 86400000)
  const notes = await prisma.notification.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
  })
  for (const n of notes) {
    console.log([
      n.createdAt.toISOString(),
      users.find(u => u.id === n.userId)?.email,
      n.type,
      n.tier,
      n.source,
      n.status,
      'planned=' + (n.plannedFor?.toISOString() ?? '-'),
      'sent=' + (n.sentAt?.toISOString() ?? '-'),
      'disp=' + (n.displayedAt?.toISOString() ?? '-'),
      'click=' + (n.clickedAt?.toISOString() ?? '-'),
      'fail=' + (n.failReason ?? '-'),
      JSON.stringify(n.title),
    ].join(' | '))
  }
  console.log('total notifications in window:', notes.length)

  console.log('\n=== AI USAGE (planner calls) ===')
  const usage = await prisma.aiUsageDaily.findMany({ orderBy: { day: 'desc' }, take: 15 })
  for (const u of usage) {
    console.log(u.day, users.find(x => x.id === u.userId)?.email, 'calls=' + u.calls, 'planner=' + u.plannerCalls)
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
