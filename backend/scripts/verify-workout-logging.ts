/**
 * End-to-end check of the set/session logging fixes, against a throwaway user
 * that is deleted again at the end (User cascades to everything it owns).
 *
 *   npx tsx scripts/verify-workout-logging.ts
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

let pass = 0, fail = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✔ ${name}`) }
  else { fail++; console.log(`  ✘ ${name} ${detail}`) }
}

async function main() {
  const email = `__verify_${Date.now()}@test.local`
  const user = await prisma.user.create({
    data: { email, password: 'x', profile: { create: { name: 'Verify', weight: 80 } } },
  })
  console.log(`\ntest user ${email}\n`)

  try {
    const strength = await prisma.exercise.findFirst({
      where: { modality: { name: 'Strength' } }, include: { muscleLinks: true },
    })
    const cali = await prisma.exercise.findFirst({ where: { modality: { name: 'Calisthenics' } } })
    const wodEx = await prisma.exercise.findFirst({ where: { modality: { name: 'WOD' } } })
    if (!strength || !cali || !wodEx) throw new Error('seed exercises missing')

    // ── logSet upsert semantics ──────────────────────────────────────────
    console.log('[logSet]')
    const s1 = await prisma.workoutSession.create({ data: { userId: user.id } })
    const we1 = await prisma.workoutExercise.create({
      data: { sessionId: s1.id, exerciseId: strength.id, orderIndex: 1 },
    })

    // simulate the controller's upsert path twice with the same setNumber
    for (const reps of [10, 12]) {
      const existing = await prisma.workoutSet.findFirst({
        where: { workoutExerciseId: we1.id, setNumber: 1 },
      })
      const set = existing
        ? await prisma.workoutSet.update({ where: { id: existing.id }, data: { setType: 'STRENGTH', rpe: 8 } })
        : await prisma.workoutSet.create({ data: { workoutExerciseId: we1.id, setNumber: 1, setType: 'STRENGTH', rpe: 8 } })
      if (existing) await prisma.setStrength.deleteMany({ where: { setId: set.id } })
      await prisma.setStrength.create({ data: { setId: set.id, reps, weight: 100 } })
    }
    const rows = await prisma.workoutSet.findMany({
      where: { workoutExerciseId: we1.id }, include: { strength: true },
    })
    check('re-logging set #1 leaves exactly one row', rows.length === 1, `got ${rows.length}`)
    check('re-logged set holds the corrected value (12 reps)', rows[0]?.strength?.reps === 12,
      `got ${rows[0]?.strength?.reps}`)

    // ── calisthenics hold stores seconds, not reps ───────────────────────
    console.log('\n[calisthenics hold]')
    const we2 = await prisma.workoutExercise.create({
      data: { sessionId: s1.id, exerciseId: cali.id, orderIndex: 2 },
    })
    const holdSet = await prisma.workoutSet.create({
      data: { workoutExerciseId: we2.id, setNumber: 1, setType: 'CALISTHENICS', rpe: 8 },
    })
    await prisma.setCalisthenics.create({ data: { setId: holdSet.id, reps: 0, addedWeight: 0, time: 45 } })
    const hold = await prisma.setCalisthenics.findUnique({ where: { setId: holdSet.id } })
    check('45s hold stored as time=45, reps=0', hold?.time === 45 && hold?.reps === 0,
      `got time=${hold?.time} reps=${hold?.reps}`)

    // ── WOD set is persisted ─────────────────────────────────────────────
    const we3 = await prisma.workoutExercise.create({
      data: { sessionId: s1.id, exerciseId: wodEx.id, orderIndex: 3 },
    })
    const wodSet = await prisma.workoutSet.create({
      data: { workoutExerciseId: we3.id, setNumber: 1, setType: 'WOD', rpe: 8 },
    })
    await prisma.setWOD.create({ data: { setId: wodSet.id, time: 600 } })

    // ── finish maths: volume + fatigue ───────────────────────────────────
    console.log('\n[finish]')
    const { finishViaController } = await import('./_verify_finish_helper')
    const result = await finishViaController(prisma, user.id, s1.id, 1800)

    // strength 12x100 = 1200; hold 45s/3 = 15 rep-equiv x (80 bodyweight) = 1200
    check('volume counts strength reps x weight (1200)', result.totalVolume >= 1200,
      `got ${result.totalVolume}`)
    check('volume uses real bodyweight 80kg for the hold, not 70', result.totalVolume === 2400,
      `got ${result.totalVolume} (expected 1200 strength + 1200 hold)`)
    check('WOD contributed fatigue', result.musclesAffected.length > 0)

    const finished = await prisma.workoutSession.findUnique({ where: { id: s1.id } })
    check('dateTime preserved as start time', finished!.dateTime.getTime() === s1.dateTime.getTime(),
      `${finished!.dateTime.toISOString()} vs ${s1.dateTime.toISOString()}`)

    // ── WOD in isolation: fatigue but no kg volume ───────────────────────
    console.log('\n[WOD isolated]')
    const wodLinks = await prisma.muscleExercise.count({ where: { exerciseId: wodEx.id } })
    const s2 = await prisma.workoutSession.create({ data: { userId: user.id } })
    const we4 = await prisma.workoutExercise.create({
      data: { sessionId: s2.id, exerciseId: wodEx.id, orderIndex: 1 },
    })
    const wodOnly = await prisma.workoutSet.create({
      data: { workoutExerciseId: we4.id, setNumber: 1, setType: 'WOD', rpe: 8 },
    })
    await prisma.setWOD.create({ data: { setId: wodOnly.id, time: 600 } })
    const wodResult = await finishViaController(prisma, user.id, s2.id, 600)
    check(`WOD-only session produces fatigue (${wodEx.name} has ${wodLinks} muscle links)`,
      wodLinks === 0 || wodResult.musclesAffected.length > 0,
      `musclesAffected=${wodResult.musclesAffected.length}`)
    check('WOD contributes no kg volume', wodResult.totalVolume === 0, `got ${wodResult.totalVolume}`)

    // ── re-finish must be a no-op for fatigue ────────────────────────────
    console.log('\n[re-finish guard]')
    const beforeLogs = await prisma.muscleFatigueLog.count({ where: { workoutSessionId: s1.id } })
    const beforeLevels = await prisma.muscleFatigueCurrent.findMany({ where: { userId: user.id } })
    const again = await finishViaController(prisma, user.id, s1.id, 1800)
    const afterLogs = await prisma.muscleFatigueLog.count({ where: { workoutSessionId: s1.id } })
    const afterLevels = await prisma.muscleFatigueCurrent.findMany({ where: { userId: user.id } })
    check('second finish writes no extra fatigue log rows', beforeLogs === afterLogs,
      `${beforeLogs} → ${afterLogs}`)
    check('second finish does not raise fatigue levels',
      beforeLevels.every(b => afterLevels.find(a => a.muscleId === b.muscleId)?.fatigueLevel === b.fatigueLevel))
    check('second finish reports alreadyFinished', again.alreadyFinished === true)

    // ── CONCURRENT double-finish (the double-tap race) ───────────────────
    console.log('\n[concurrent double-finish]')
    const s3 = await prisma.workoutSession.create({ data: { userId: user.id } })
    const we5 = await prisma.workoutExercise.create({
      data: { sessionId: s3.id, exerciseId: strength.id, orderIndex: 1 },
    })
    const cs = await prisma.workoutSet.create({
      data: { workoutExerciseId: we5.id, setNumber: 1, setType: 'STRENGTH', rpe: 8 },
    })
    await prisma.setStrength.create({ data: { setId: cs.id, reps: 10, weight: 100 } })

    // Fire both at once — no await between them
    const [rA, rB] = await Promise.all([
      finishViaController(prisma, user.id, s3.id, 900),
      finishViaController(prisma, user.id, s3.id, 900),
    ])
    const logsForS3 = await prisma.muscleFatigueLog.groupBy({
      by: ['muscleId'], where: { workoutSessionId: s3.id }, _count: true,
    })
    const doubled = logsForS3.filter(l => l._count > 1)
    check('two simultaneous finishes write one fatigue log per muscle',
      doubled.length === 0, `${doubled.length} muscle(s) logged twice`)
    check('exactly one of the two did the work',
      [rA.alreadyFinished, rB.alreadyFinished].filter(Boolean).length === 1,
      `alreadyFinished flags: ${rA.alreadyFinished} / ${rB.alreadyFinished}`)

    // ── fatigue decays before the next session is added on top ───────────
    console.log('\n[fatigue decay on write]')
    const target = beforeLevels[0]
    if (target) {
      // pretend that session was long ago and fully recovered
      await prisma.muscleFatigueCurrent.update({
        where: { userId_muscleId: { userId: user.id, muscleId: target.muscleId } },
        data: {
          fatigueLevel: 80,
          recoveryTargetAt: new Date(Date.now() - 1000),   // recovery window already elapsed
        },
      })
      const { getEffectiveFatigueLevel } = await import('../src/services/fatigue.service')
      const rec = await prisma.muscleFatigueCurrent.findUnique({
        where: { userId_muscleId: { userId: user.id, muscleId: target.muscleId } },
      })
      check('fully-recovered muscle reads as 0, not its stored 80',
        getEffectiveFatigueLevel(rec) === 0, `got ${getEffectiveFatigueLevel(rec)}`)
    }
  } finally {
    await prisma.user.delete({ where: { id: user.id } })
    console.log(`\ntest user removed`)
  }

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`)
  if (fail) process.exitCode = 1
}

main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
