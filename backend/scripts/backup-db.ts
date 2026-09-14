/**
 * Snapshots every table to a timestamped JSON file.
 *
 *   npx tsx scripts/backup-db.ts                  → backups/<timestamp>/
 *   npx tsx scripts/backup-db.ts ./somewhere-else
 *
 * This is a DATA snapshot, not a pg_dump: no schema, no constraints, no
 * sequences. What it is for is the thing a seed can actually do to you —
 * renaming or replacing rows — and for that it is better than a pg_dump,
 * because it needs no PostgreSQL client installed and the output is readable.
 * For a genuine point-in-time restore use Railway's own backups or pg_dump;
 * both are described in EXERCISE-FINAL.md.
 *
 * Tables are read one at a time rather than in a Promise.all. The dev database
 * is remote and a fan-out of forty-odd concurrent reads is how the connection
 * proxy decides you are a runaway process (P1017) — the same reason seed.ts
 * batches its writes.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

/**
 * Every model in schema.prisma, as its Prisma client accessor.
 *
 * Listed rather than reflected: `Prisma.dmmf` would keep this in step
 * automatically, but silently — a model added to the schema and forgotten here
 * shows up as a missing file in the output, which is noticeable, whereas a
 * reflection bug shows up as a backup that was quietly incomplete.
 */
const MODELS = [
  'user', 'passwordResetToken', 'notificationPreference', 'notificationTypePref',
  'aiUsageDaily', 'pushSubscription', 'userProfile', 'userEquipment', 'userInjury',
  'settings', 'biometric', 'muscle', 'musclePath', 'modality', 'exerciseCategory',
  'exercise', 'favoriteExercise', 'muscleExercise', 'exerciseCategoryMap',
  'equipment', 'equipmentExercise', 'media', 'workoutSession', 'workoutExercise',
  'workoutSet', 'setStrength', 'setCalisthenics', 'setCardio', 'runTrack', 'setWOD',
  'setMobility', 'muscleFatigueCurrent', 'systemicFatigue', 'exerciseStrengthEstimate',
  'muscleFatigueLog', 'sleepLog', 'nutritionLog', 'chatThread', 'aIChat',
  'notification', 'workoutTemplate', 'templateExercise', 'templateSet',
  'scheduledWorkout', 'aiProposal',
] as const

const main = async () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const dir = path.resolve(process.argv[2] ?? path.join('backups', stamp))
  fs.mkdirSync(dir, { recursive: true })

  const counts: Record<string, number> = {}
  let total = 0
  let failed = 0

  for (const model of MODELS) {
    const client = (prisma as any)[model]
    if (!client?.findMany) {
      console.log(`  ${model.padEnd(28)} SKIPPED — no such model on the client`)
      failed++
      continue
    }
    try {
      const rows = await client.findMany()
      fs.writeFileSync(path.join(dir, `${model}.json`), JSON.stringify(rows, null, 2))
      counts[model] = rows.length
      total += rows.length
      if (rows.length) console.log(`  ${model.padEnd(28)} ${rows.length}`)
    } catch (err: any) {
      console.log(`  ${model.padEnd(28)} FAILED — ${err.message.split('\n')[0]}`)
      failed++
    }
  }

  fs.writeFileSync(path.join(dir, '_manifest.json'), JSON.stringify({
    takenAt: new Date().toISOString(),
    database: (process.env.DATABASE_URL ?? '').replace(/:[^:@]+@/, ':***@'),
    totalRows: total,
    counts,
  }, null, 2))

  console.log(`\n${total} rows across ${Object.keys(counts).length} tables → ${dir}`)
  if (failed) console.log(`${failed} table(s) could not be read — the snapshot is INCOMPLETE`)
  process.exitCode = failed ? 1 : 0
}

main()
  .catch(err => { console.error('backup failed:', err.message); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
