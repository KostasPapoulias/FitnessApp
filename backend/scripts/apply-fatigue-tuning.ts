/**
 * Applies the fatigue-model tuning tables — muscle recovery half-lives, and
 * per-exercise damage factors and reference speeds.
 *
 *   npx tsx scripts/apply-fatigue-tuning.ts
 *
 * The full seed does the same thing, but as several hundred sequential
 * round trips, which a remote database will drop halfway through (P1017). This
 * does it in a handful of bulk statements and retries on a dropped connection,
 * so it can be re-run safely at any time after tuning the tables.
 *
 * Without these values every exercise sits at damageFactor 1.0 with no
 * reference speed, which silently reverts the model to treating a bike ride as
 * harder on the legs than a run.
 */
import 'dotenv/config'
import { Prisma, PrismaClient } from '@prisma/client'
import {
  MODALITY_DAMAGE,
  MUSCLE_HALF_LIVES,
  DAMAGE_OVERRIDES,
  REFERENCE_SPEED_KMH,
} from '../prisma/fatigue-tuning'

const prisma = new PrismaClient()

// The proxy in front of a hosted database drops idle-ish connections without
// warning; every statement here is idempotent, so retrying is always safe.
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      lastError = err
      const retryable = ['P1001', 'P1017', 'P1008'].includes(err?.code)
      if (!retryable || attempt === attempts) break
      const waitMs = 500 * attempt
      console.log(`  ${label}: ${err.code}, retrying in ${waitMs}ms (${attempt}/${attempts - 1})`)
      await new Promise(r => setTimeout(r, waitMs))
      // Force a fresh connection rather than reusing the dead one
      await prisma.$disconnect().catch(() => {})
    }
  }
  throw lastError
}

async function main() {
  console.log('Applying fatigue tuning...\n')

  // ── muscle recovery half-lives ────────────────────────────────────────
  const muscleRows = MUSCLE_HALF_LIVES.map(
    ([name, hours]) => Prisma.sql`(${name}, ${hours}::double precision)`
  )
  const muscles = await withRetry('muscles', () => prisma.$executeRaw`
    UPDATE "Muscle" AS m
    SET "recoveryHalfLifeHours" = v.hours
    FROM (VALUES ${Prisma.join(muscleRows)}) AS v(name, hours)
    WHERE m.name = v.name
  `)
  console.log(`  recovery half-lives: ${muscles} muscles`)

  // ── damage factor, by modality first ──────────────────────────────────
  for (const [modality, damage] of Object.entries(MODALITY_DAMAGE)) {
    const n = await withRetry(`damage/${modality}`, () => prisma.$executeRaw`
      UPDATE "Exercise" AS e
      SET "damageFactor" = ${damage}::double precision
      FROM "Modality" AS m
      WHERE e."modalityId" = m.id AND m.name = ${modality}
    `)
    console.log(`  damage ${String(damage).padEnd(4)} → ${String(n).padStart(3)} ${modality} exercises`)
  }

  // ── then the per-exercise overrides ───────────────────────────────────
  const damageRows = Object.entries(DAMAGE_OVERRIDES).map(
    ([name, damage]) => Prisma.sql`(${name}, ${damage}::double precision)`
  )
  const overrides = await withRetry('damage overrides', () => prisma.$executeRaw`
    UPDATE "Exercise" AS e
    SET "damageFactor" = v.damage
    FROM (VALUES ${Prisma.join(damageRows)}) AS v(name, damage)
    WHERE e.name = v.name
  `)
  console.log(`  damage overrides: ${overrides} of ${damageRows.length} matched`)

  // ── reference speeds ──────────────────────────────────────────────────
  // Cleared first so removing an entry from the table actually takes effect.
  await withRetry('clear speeds', () => prisma.$executeRaw`
    UPDATE "Exercise" SET "referenceSpeedKmh" = NULL WHERE "referenceSpeedKmh" IS NOT NULL
  `)
  const speedRows = Object.entries(REFERENCE_SPEED_KMH).map(
    ([name, kmh]) => Prisma.sql`(${name}, ${kmh}::double precision)`
  )
  const speeds = await withRetry('speeds', () => prisma.$executeRaw`
    UPDATE "Exercise" AS e
    SET "referenceSpeedKmh" = v.kmh
    FROM (VALUES ${Prisma.join(speedRows)}) AS v(name, kmh)
    WHERE e.name = v.name
  `)
  console.log(`  reference speeds: ${speeds} of ${speedRows.length} matched`)

  // ── report ────────────────────────────────────────────────────────────
  const sample = await withRetry('verify', () => prisma.exercise.findMany({
    where: { name: { in: ['Running', 'Cycling', 'Swimming', 'Romanian Deadlift', 'Leg Press', 'Box Jumps'] } },
    select: { name: true, damageFactor: true, referenceSpeedKmh: true },
    orderBy: { name: 'asc' },
  }))
  console.log('\n  applied:')
  for (const e of sample) {
    console.log(`    ${e.name.padEnd(20)} damage ${String(e.damageFactor).padEnd(5)} speed ${e.referenceSpeedKmh ?? '—'}`)
  }

  const run = sample.find(e => e.name === 'Running')
  const bike = sample.find(e => e.name === 'Cycling')
  if (run && bike && run.damageFactor <= bike.damageFactor) {
    throw new Error('running must carry a higher damage factor than cycling')
  }
  console.log('\nDone.')
}

main()
  .catch(e => { console.error('\nFAILED:', e.message ?? e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
