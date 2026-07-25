/**
 * Repairs workout data corrupted by three now-fixed bugs:
 *
 *   1. Ghost sessions   — StrictMode double-mount started two sessions per
 *                         workout; the loser kept its exercises but got no sets.
 *   2. Duplicate sets   — re-logging a set appended a second row with the same
 *                         setNumber, double-counting volume and fatigue.
 *   3. Mis-typed sets   — mobility work was written as setType STRENGTH with the
 *                         hold seconds in `reps`, before completeSet became
 *                         modality-aware.
 *
 * DRY RUN by default. Pass --apply to actually write.
 *   npx tsx scripts/cleanup-workout-data.ts
 *   npx tsx scripts/cleanup-workout-data.ts --apply
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

// Ghost sessions are always older than this; anything newer may be a live workout
const MIN_AGE_MINUTES = 60

async function findGhostSessions() {
  const cutoff = new Date(Date.now() - MIN_AGE_MINUTES * 60 * 1000)
  const candidates = await prisma.workoutSession.findMany({
    where: { duration: null, dateTime: { lt: cutoff } },
    include: {
      workoutExercises: { include: { sets: true, exercise: true } },
      fatigueLogs: true,
    },
    orderBy: { dateTime: 'asc' },
  })
  // Only sessions that never recorded a single set, and never applied fatigue
  return candidates.filter(
    s => s.workoutExercises.every(we => we.sets.length === 0) && s.fatigueLogs.length === 0
  )
}

async function findDuplicateSets() {
  const groups = await prisma.$queryRawUnsafe<any[]>(`
    SELECT "workoutExerciseId", "setNumber"
    FROM "WorkoutSet"
    GROUP BY 1, 2 HAVING COUNT(*) > 1`)

  const toDelete: { id: string; why: string }[] = []
  for (const g of groups) {
    const rows = await prisma.workoutSet.findMany({
      where: { workoutExerciseId: g.workoutExerciseId, setNumber: g.setNumber },
      include: { strength: true, calisthenics: true, cardio: true, wod: true, mobility: true },
    })
    // Keep the most informative row: real work beats a zero/empty row. Ties fall
    // back to id order so the choice is deterministic.
    const score = (r: typeof rows[number]) => {
      const v =
        (r.strength ? r.strength.reps * Math.max(1, r.strength.weight) : 0) +
        (r.calisthenics ? r.calisthenics.reps + (r.calisthenics.time ?? 0) : 0) +
        (r.cardio ? (r.cardio.time ?? 0) + (r.cardio.distance ?? 0) : 0) +
        (r.wod ? r.wod.time ?? 0 : 0) +
        (r.mobility ? r.mobility.time ?? 0 : 0)
      return v
    }
    const sorted = rows.slice().sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))
    const keep = sorted[0]
    sorted.slice(1).forEach(r =>
      toDelete.push({ id: r.id, why: `dup of set#${g.setNumber} (kept ${keep.id.slice(0, 8)}, score ${score(keep)} vs ${score(r)})` })
    )
  }
  return toDelete
}

async function findMistypedMobilitySets() {
  // setType STRENGTH on an exercise whose modality is Mobility → hold seconds
  // were stored in strength.reps
  const rows = await prisma.workoutSet.findMany({
    where: {
      setType: 'STRENGTH',
      workoutExercise: { exercise: { modality: { name: 'Mobility' } } },
    },
    include: { strength: true, workoutExercise: { include: { exercise: true } } },
  })
  return rows
}

async function main() {
  console.log(`\n=== workout data cleanup — ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'} ===\n`)

  // ── 1. ghost sessions ────────────────────────────────────────────────────
  const ghosts = await findGhostSessions()
  console.log(`[1] Ghost sessions (unfinished, zero sets, no fatigue): ${ghosts.length}`)
  ghosts.forEach(s =>
    console.log(`    ${s.dateTime.toISOString()}  ${s.id.slice(0, 8)}  ` +
      `${s.workoutExercises.length} empty exercise(s): ` +
      `${s.workoutExercises.map(we => we.exercise.name).join(', ') || '—'}`)
  )

  // ── 2. duplicate sets ────────────────────────────────────────────────────
  const dupes = await findDuplicateSets()
  console.log(`\n[2] Duplicate set rows to remove: ${dupes.length}`)
  dupes.forEach(d => console.log(`    ${d.id.slice(0, 8)}  ${d.why}`))

  // ── 3. mis-typed mobility sets ───────────────────────────────────────────
  const mistyped = await findMistypedMobilitySets()
  console.log(`\n[3] Mobility sets mis-recorded as STRENGTH: ${mistyped.length}`)
  mistyped.forEach(r =>
    console.log(`    ${r.id.slice(0, 8)}  ${r.workoutExercise.exercise.name}  ` +
      `reps=${r.strength?.reps} → MOBILITY time=${r.strength?.reps}s`)
  )

  if (!APPLY) {
    console.log('\nDry run complete — nothing was written. Re-run with --apply to execute.\n')
    return
  }

  // ── writes ───────────────────────────────────────────────────────────────
  console.log('\nApplying…')

  const delSets = await prisma.workoutSet.deleteMany({
    where: { id: { in: dupes.map(d => d.id) } },
  })
  console.log(`  removed ${delSets.count} duplicate set rows`)

  // Cascades through WorkoutExercise
  const delSessions = await prisma.workoutSession.deleteMany({
    where: { id: { in: ghosts.map(s => s.id) } },
  })
  console.log(`  removed ${delSessions.count} ghost sessions`)

  let converted = 0
  for (const r of mistyped) {
    const seconds = r.strength?.reps ?? 0
    await prisma.$transaction(async tx => {
      await tx.setStrength.deleteMany({ where: { setId: r.id } })
      await tx.setMobility.create({ data: { setId: r.id, time: seconds } })
      await tx.workoutSet.update({ where: { id: r.id }, data: { setType: 'MOBILITY' } })
    })
    converted++
  }
  console.log(`  converted ${converted} mis-typed mobility sets`)

  console.log('\nDone.\n')
}

main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
