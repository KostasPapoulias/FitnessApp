/**
 * Applies the fatigue tuning tables (half-lives, damage factors, reference
 * speeds, load factors, cardio tracking) in a few bulk statements, retrying on
 * dropped connections. Safe to re-run.
 *
 *   npx tsx scripts/apply-fatigue-tuning.ts
 */
import 'dotenv/config'
import { Prisma, PrismaClient } from '@prisma/client'
import {
  MODALITY_DAMAGE,
  MUSCLE_HALF_LIVES,
  DAMAGE_OVERRIDES,
  REFERENCE_SPEED_KMH,
  CARDIO_TRACKING,
  REFERENCE_CADENCE_RPM,
  REP_UNITS,
  LOAD_FACTORS,
} from '../prisma/fatigue-tuning'

const prisma = new PrismaClient()

// Retries on a dropped connection; every statement is idempotent.
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
      // Force a fresh connection
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
      WHERE e."modalityId" = m.id AND m.name = ${modality} AND e."createdByUserId" IS NULL
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
    WHERE e.name = v.name AND e."createdByUserId" IS NULL
  `)
  console.log(`  damage overrides: ${overrides} of ${damageRows.length} matched`)

  // ── reference speeds ──────────────────────────────────────────────────
  // Cleared first, so removing a table entry takes effect
  await withRetry('clear speeds', () => prisma.$executeRaw`
    UPDATE "Exercise" SET "referenceSpeedKmh" = NULL
    WHERE "referenceSpeedKmh" IS NOT NULL AND "createdByUserId" IS NULL
  `)
  const speedRows = Object.entries(REFERENCE_SPEED_KMH).map(
    ([name, kmh]) => Prisma.sql`(${name}, ${kmh}::double precision)`
  )
  const speeds = await withRetry('speeds', () => prisma.$executeRaw`
    UPDATE "Exercise" AS e
    SET "referenceSpeedKmh" = v.kmh
    FROM (VALUES ${Prisma.join(speedRows)}) AS v(name, kmh)
    WHERE e.name = v.name AND e."createdByUserId" IS NULL
  `)
  console.log(`  reference speeds: ${speeds} of ${speedRows.length} matched`)

  // ── load factors ──────────────────────────────────────────────────────
  // Cleared first, same as the speeds
  await withRetry('clear load factors', () => prisma.$executeRaw`
    UPDATE "Exercise" SET "loadFactor" = NULL
    WHERE "loadFactor" IS NOT NULL AND "createdByUserId" IS NULL
  `)
  const loadRows = Object.entries(LOAD_FACTORS).map(
    ([name, factor]) => Prisma.sql`(${name}, ${factor}::double precision)`
  )
  const loads = await withRetry('load factors', () => prisma.$executeRaw`
    UPDATE "Exercise" AS e
    SET "loadFactor" = v.factor
    FROM (VALUES ${Prisma.join(loadRows)}) AS v(name, factor)
    WHERE e.name = v.name AND e."createdByUserId" IS NULL
  `)
  console.log(`  load factors: ${loads} of ${loadRows.length} matched`)

  // ── cardio tracking ───────────────────────────────────────────────────
  // Reset to 'gps' (the column is NOT NULL)
  await withRetry('clear tracking', () => prisma.$executeRaw`
    UPDATE "Exercise"
    SET "cardioTracking" = 'gps', "referenceCadenceRpm" = NULL, "repUnit" = NULL
    WHERE "createdByUserId" IS NULL
      AND ("cardioTracking" <> 'gps' OR "referenceCadenceRpm" IS NOT NULL OR "repUnit" IS NOT NULL)
  `)
  const trackingRows = Object.entries(CARDIO_TRACKING).map(
    ([name, mode]) => Prisma.sql`(${name}, ${mode}::text, ${REFERENCE_CADENCE_RPM[name] ?? null}::double precision, ${REP_UNITS[name] ?? null}::text)`
  )
  const tracking = await withRetry('tracking', () => prisma.$executeRaw`
    UPDATE "Exercise" AS e
    SET "cardioTracking" = v.mode,
        "referenceCadenceRpm" = v.rpm,
        "repUnit" = v.unit
    FROM (VALUES ${Prisma.join(trackingRows)}) AS v(name, mode, rpm, unit)
    WHERE e.name = v.name AND e."createdByUserId" IS NULL
  `)
  console.log(`  cardio tracking: ${tracking} of ${trackingRows.length} matched`)

  // ── report ────────────────────────────────────────────────────────────
  const sample = await withRetry('verify', () => prisma.exercise.findMany({
    where: {
      name: { in: ['Running', 'Cycling', 'Swimming', 'Romanian Deadlift', 'Leg Press', 'Box Jump'] },
      createdByUserId: null,
    },
    select: { name: true, damageFactor: true, referenceSpeedKmh: true, loadFactor: true },
    orderBy: { name: 'asc' },
  }))
  console.log('\n  applied:')
  for (const e of sample) {
    console.log(`    ${e.name.padEnd(20)} damage ${String(e.damageFactor).padEnd(5)} speed ${String(e.referenceSpeedKmh ?? '—').padEnd(5)} load ${e.loadFactor ?? '—'}`)
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
