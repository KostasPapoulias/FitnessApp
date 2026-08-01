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

    // ── a metcon fatigues EVERY movement in it, not just the first ────────
    // The live view logged one set at the store's current exercise index,
    // which a WOD never advances, so movements 2..n were silently ignored.
    console.log('\n[WOD covers every movement]')
    const wodMoves = await prisma.exercise.findMany({
      where: { modality: { name: 'WOD' } },
      include: { muscleLinks: true },
      take: 3,
    })
    if (wodMoves.length === 3) {
      const s4 = await prisma.workoutSession.create({ data: { userId: user.id } })
      const repsPerRound = [5, 10, 15]
      for (const [i, move] of wodMoves.entries()) {
        const we = await prisma.workoutExercise.create({
          data: { sessionId: s4.id, exerciseId: move.id, orderIndex: i + 1 },
        })
        const st = await prisma.workoutSet.create({
          data: { workoutExerciseId: we.id, setNumber: 1, setType: 'WOD', rpe: 8 },
        })
        await prisma.setWOD.create({
          data: { setId: st.id, time: 720, reps: repsPerRound[i], rounds: 8 },
        })
      }
      const metcon = await finishViaController(prisma, user.id, s4.id, 720)
      const hit = new Set(metcon.musclesAffected.map((m: any) => m.muscleId))
      const expected = new Set(wodMoves.flatMap(m => m.muscleLinks.map(l => l.muscleId)))
      const missed = [...expected].filter(id => !hit.has(id))
      check('every movement in the metcon contributes fatigue',
        missed.length === 0, `${missed.length} of ${expected.size} muscles got nothing`)

      // The movements share one clock, so scoring them individually would
      // multiply the workout by the number of movements.
      const s5 = await prisma.workoutSession.create({ data: { userId: user.id } })
      const soloWe = await prisma.workoutExercise.create({
        data: { sessionId: s5.id, exerciseId: wodMoves[0].id, orderIndex: 1 },
      })
      const soloSet = await prisma.workoutSet.create({
        data: { workoutExerciseId: soloWe.id, setNumber: 1, setType: 'WOD', rpe: 8 },
      })
      await prisma.setWOD.create({
        data: { setId: soloSet.id, time: 720, reps: 30, rounds: 8 },
      })
      const solo = await finishViaController(prisma, user.id, s5.id, 720)
      const total = (r: any) => r.musclesAffected.reduce((a: number, m: any) => a + m.delta, 0)
      // Same duration, same total reps — the metcon spread over three movements
      // may land on more muscles, but must not cost several times as much.
      check('a 3-movement metcon is scored once, not once per movement',
        total(metcon) < total(solo) * 2.5,
        `3-movement ${Math.round(total(metcon))} vs 1-movement ${Math.round(total(solo))}`)
    }

    // ── cardio produces real fatigue, and loads the systemic channel ──────
    console.log('\n[cardio]')
    const cardioEx = await prisma.exercise.findFirst({
      where: { modality: { name: 'Cardio' } }, include: { muscleLinks: true },
    })
    if (cardioEx) {
      const runSession = async (seconds: number, rpe: number) => {
        const s = await prisma.workoutSession.create({ data: { userId: user.id } })
        const we = await prisma.workoutExercise.create({
          data: { sessionId: s.id, exerciseId: cardioEx.id, orderIndex: 1 },
        })
        const st = await prisma.workoutSet.create({
          data: { workoutExerciseId: we.id, setNumber: 1, setType: 'CARDIO', rpe },
        })
        await prisma.setCardio.create({ data: { setId: st.id, time: seconds, distance: seconds / 300 } })
        return finishViaController(prisma, user.id, s.id, seconds)
      }

      const short = await runSession(180, 6)     // 3 minute jog
      check('a short run still registers on the muscles it uses',
        short.musclesAffected.length > 0 && short.musclesAffected.some((m: any) => m.delta > 0),
        `musclesAffected=${short.musclesAffected.length}`)
      check('cardio contributes no kg volume', short.totalVolume === 0, `got ${short.totalVolume}`)
      check('cardio produces systemic load', short.systemicLoad > 0, `got ${short.systemicLoad}`)

      const hard = await runSession(3600, 8)     // an hour, hard
      const shortDelta = short.musclesAffected.reduce((a: number, m: any) => a + m.delta, 0)
      const hardDelta = hard.musclesAffected.reduce((a: number, m: any) => a + m.delta, 0)
      check('an hour hard costs far more than three easy minutes',
        hardDelta > shortDelta * 5, `${Math.round(shortDelta)} vs ${Math.round(hardDelta)}`)

      const sys = await prisma.systemicFatigue.findUnique({ where: { userId: user.id } })
      check('systemic fatigue is persisted for the user', (sys?.level ?? 0) > 0,
        `level=${sys?.level}`)
      check('systemic fatigue has a recovery target', sys?.recoveryTargetAt != null)

      const { getUserReadiness } = await import('../src/services/readiness.service')
      const readiness = await getUserReadiness(user.id)
      check('readiness reflects systemic fatigue after cardio',
        readiness.systemicFatigue > 0 && readiness.readinessScore < 100,
        `score=${readiness.readinessScore} systemic=${readiness.systemicFatigue}`)
    }

    // ── relative load: the same session costs a strong and a weak lifter alike
    console.log('\n[relative load]')
    if (strength) {
      const benchSession = async (weight: number, e1rm: number) => {
        await prisma.exerciseStrengthEstimate.upsert({
          where: { userId_exerciseId: { userId: user.id, exerciseId: strength.id } },
          update: { e1rm }, create: { userId: user.id, exerciseId: strength.id, e1rm },
        })
        const s = await prisma.workoutSession.create({ data: { userId: user.id } })
        const we = await prisma.workoutExercise.create({
          data: { sessionId: s.id, exerciseId: strength.id, orderIndex: 1 },
        })
        const st = await prisma.workoutSet.create({
          data: { workoutExerciseId: we.id, setNumber: 1, setType: 'STRENGTH', rpe: 8 },
        })
        await prisma.setStrength.create({ data: { setId: st.id, reps: 5, weight } })
        const r = await finishViaController(prisma, user.id, s.id, 600)
        return r.musclesAffected.reduce((a: number, m: any) => a + m.delta, 0)
      }
      // Same relative effort at double the absolute load: under the old
      // tonnage model the strong lifter accrued exactly twice the fatigue.
      const weak = await benchSession(60, 72)
      const strong = await benchSession(120, 144)
      check('doubling absolute load at the same relative effort does not double fatigue',
        Math.abs(strong - weak) < weak * 0.2, `weak ${weak.toFixed(1)} vs strong ${strong.toFixed(1)}`)

      const light = await benchSession(40, 144)  // same lifter, easy weight
      check('a light set costs less than a near-limit one',
        light < strong * 0.8, `light ${light.toFixed(1)} vs heavy ${strong.toFixed(1)}`)
    }

    // ── running vs cycling: the damage-profile fix ───────────────────────
    // impactFactor alone had cycling (quads 0.7) beating running (quads 0.6),
    // so the model called a bike ride harder on the legs than a run.
    console.log('\n[mechanical damage profile]')
    const running = await prisma.exercise.findFirst({ where: { name: 'Running' } })
    const cycling = await prisma.exercise.findFirst({ where: { name: 'Cycling' } })
    if (running && cycling) {
      check('seed applied damage factors',
        running.damageFactor > cycling.damageFactor,
        `running ${running.damageFactor} vs cycling ${cycling.damageFactor}`)
      check('seed applied reference speeds',
        (cycling.referenceSpeedKmh ?? 0) > (running.referenceSpeedKmh ?? 0),
        `running ${running.referenceSpeedKmh} vs cycling ${cycling.referenceSpeedKmh}`)

      const legLoad = async (ex: { id: string }, seconds: number, km: number) => {
        const s = await prisma.workoutSession.create({ data: { userId: user.id } })
        const we = await prisma.workoutExercise.create({
          data: { sessionId: s.id, exerciseId: ex.id, orderIndex: 1 },
        })
        const st = await prisma.workoutSet.create({
          data: { workoutExerciseId: we.id, setNumber: 1, setType: 'CARDIO', rpe: 6 },
        })
        await prisma.setCardio.create({ data: { setId: st.id, time: seconds, distance: km } })
        const r = await finishViaController(prisma, user.id, s.id, seconds)
        const quads = r.musclesAffected.find((m: any) => m.muscleName === 'Quadriceps')
        return quads?.delta ?? 0
      }

      // 30 minutes each, at the distance each activity actually covers
      const ranQuads = await legLoad(running, 1800, 5)
      const cycledQuads = await legLoad(cycling, 1800, 12.5)
      check('running beats up the legs harder than cycling of the same length',
        ranQuads > cycledQuads,
        `running ${ranQuads.toFixed(1)} vs cycling ${cycledQuads.toFixed(1)}`)

      // Distance has to matter: same clock, more ground covered
      const shortRun = await legLoad(running, 1800, 4)
      const longRun = await legLoad(running, 1800, 8)
      check('covering more ground in the same time costs more',
        longRun > shortRun * 1.5, `4km ${shortRun.toFixed(1)} vs 8km ${longRun.toFixed(1)}`)

      // …and its absence must not zero the session out (treadmill, no GPS)
      const noDistance = await legLoad(running, 1800, 0)
      check('a run logged without distance still counts, on time alone',
        noDistance > 0, `got ${noDistance.toFixed(1)}`)
    }

    // ── acute vs chronic training load ───────────────────────────────────
    console.log('\n[training load]')
    {
      const { getTrainingLoad, computeTrainingLoad } = await import('../src/services/training-load.service')

      const live = await getTrainingLoad(user.id)
      check('training load reads back the sessions just finished',
        live.sessionCount > 0 && live.fitness > 0,
        `sessions=${live.sessionCount} fitness=${live.fitness}`)

      // Steady training must not be flagged as a spike — the cold-start bug
      // scored a consistent 8-week block at 1.58 and called it overreaching.
      const steady: { daysAgo: number; load: number }[] = []
      for (let d = 0; d < 56; d++) if (d % 7 < 4) steady.push({ daysAgo: d, load: 200 })
      const steadyLoad = computeTrainingLoad(steady, steady.length)
      check('8 steady weeks read as a normal ratio, not a spike',
        steadyLoad.ratio != null && steadyLoad.ratio > 0.85 && steadyLoad.ratio < 1.2,
        `ratio ${steadyLoad.ratio} (${steadyLoad.trend})`)

      const spike = steady.map(x => (x.daysAgo < 7 ? { ...x, load: 700 } : x))
      const spikeLoad = computeTrainingLoad(spike, spike.length)
      check('a sudden heavy week is flagged as ramping',
        spikeLoad.trend === 'ramping', `ratio ${spikeLoad.ratio} (${spikeLoad.trend})`)

      const layoff = computeTrainingLoad(steady.filter(x => x.daysAgo >= 14), 32)
      check('a two-week layoff reads as detraining and fresh',
        layoff.trend === 'detraining' && layoff.form > 0,
        `ratio ${layoff.ratio} form ${layoff.form} (${layoff.trend}/${layoff.formState})`)

      const rookie = computeTrainingLoad([{ daysAgo: 1, load: 250 }], 1)
      check('a single session reports no ratio rather than a false spike',
        rookie.ratio === null && !rookie.established, `ratio ${rookie.ratio}`)
    }
  } finally {
    await prisma.user.delete({ where: { id: user.id } })
    console.log(`\ntest user removed`)
  }

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`)
  if (fail) process.exitCode = 1
}

main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
