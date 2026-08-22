/**
 * Checks the progress/history reads and the sleep readiness modifier, against a
 * throwaway user that is deleted again at the end (User cascades to everything
 * it owns).
 *
 *   npx tsx scripts/verify-progress-history.ts
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import {
  getExerciseE1rmSeries, getMuscleFatigueHistory, getStrengthProgress, getVolumeTrend,
} from '../src/services/progress.service'
import { getExerciseHistory, getHistoryPage } from '../src/services/workout-history.service'
import { getUserReadiness, computeReadinessScore } from '../src/services/readiness.service'
import { resolveSleepReadiness, sleepShiftFor } from '../src/services/sleep-readiness.service'

const prisma = new PrismaClient()

let pass = 0, fail = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✔ ${name}`) }
  else { fail++; console.log(`  ✘ ${name} ${detail}`) }
}

const DAY = 24 * 60 * 60 * 1000

async function main() {
  const email = `__verifyprog_${Date.now()}@test.local`
  const user = await prisma.user.create({
    data: { email, password: 'x', profile: { create: { name: 'Verify', weight: 80 } } },
  })
  console.log(`\ntest user ${email}\n`)

  try {
    // ── pure sleep calibration ───────────────────────────────────────────
    console.log('[sleep shift, pure]')
    check('7.5h at baseline quality is neutral', sleepShiftFor(450, 70) === 0, `got ${sleepShiftFor(450, 70)}`)
    check('5h is a penalty', sleepShiftFor(300, 70) < -4, `got ${sleepShiftFor(300, 70)}`)
    check('a short night is capped at -8', sleepShiftFor(120, 0) === -8, `got ${sleepShiftFor(120, 0)}`)
    check('a long night is capped at +8', sleepShiftFor(900, 100) <= 8, `got ${sleepShiftFor(900, 100)}`)
    check('lost sleep outweighs extra sleep',
      Math.abs(sleepShiftFor(330, 70)) > sleepShiftFor(570, 70),
      `${sleepShiftFor(330, 70)} vs +${sleepShiftFor(570, 70)}`)
    check('quality alone can move it', sleepShiftFor(450, 100) > 0 && sleepShiftFor(450, 0) < 0)
    check('a missing quality rating is not a penalty', sleepShiftFor(450, null) === 0,
      `got ${sleepShiftFor(450, null)}`)

    const now = new Date('2026-08-22T20:00:00Z')
    check('no log = not applied', resolveSleepReadiness(null, now).applied === false)
    check('a log from 3 days ago is stale',
      resolveSleepReadiness({ sleepDate: new Date('2026-08-19T00:00:00Z'), durationMin: 300, sleepScore: 50 }, now)
        .reason === 'stale')
    check('a stale log shifts nothing',
      resolveSleepReadiness({ sleepDate: new Date('2026-08-19T00:00:00Z'), durationMin: 300, sleepScore: 50 }, now)
        .adjustment === 0)
    check('a 25h duration is rejected as damage, not scored',
      resolveSleepReadiness({ sleepDate: now, durationMin: 1500, sleepScore: 50 }, now).applied === false)
    check('an untrained athlete who slept 4h is not 100% ready',
      computeReadinessScore([], undefined, 0, sleepShiftFor(240, 40)) < 100,
      `got ${computeReadinessScore([], undefined, 0, sleepShiftFor(240, 40))}`)
    check('an untrained athlete with no sleep log is 100%',
      computeReadinessScore([], undefined, 0, 0) === 100)

    // ── readiness reads the newest night ─────────────────────────────────
    console.log('\n[readiness with sleep]')
    const baseline = await getUserReadiness(user.id)
    check('fresh user with no sleep log reads 100', baseline.readinessScore === 100,
      `got ${baseline.readinessScore}`)
    check('and says why sleep did nothing', baseline.sleep.reason === 'none',
      `got ${baseline.sleep.reason}`)

    const todayUtc = new Date(Date.UTC(
      new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()
    ))
    await prisma.sleepLog.create({
      data: { userId: user.id, sleepDate: todayUtc, durationMin: 270, sleepScore: 40 },
    })
    const afterBadNight = await getUserReadiness(user.id)
    check('a 4.5h night drops readiness below 100', afterBadNight.readinessScore < 100,
      `got ${afterBadNight.readinessScore}`)
    check('and the API says by how much', afterBadNight.sleep.applied && afterBadNight.sleep.adjustment < 0,
      JSON.stringify(afterBadNight.sleep))
    check('the note names the hours slept', afterBadNight.sleepNote.includes('4.5h'),
      afterBadNight.sleepNote)

    // ── train, so there is history to read ───────────────────────────────
    console.log('\n[history + progress]')
    const strength = await prisma.exercise.findFirst({ where: { modality: { name: 'Strength' } } })
    const cardio = await prisma.exercise.findFirst({ where: { modality: { name: 'Cardio' } } })
    if (!strength || !cardio) throw new Error('seed exercises missing')

    const { finishViaController } = await import('./_verify_finish_helper')

    // Two strength sessions three weeks apart, the older one heavier, so the
    // e1RM series has to be able to go DOWN.
    const heavier = await prisma.workoutSession.create({
      data: { userId: user.id, dateTime: new Date(Date.now() - 21 * DAY) },
    })
    const weHeavy = await prisma.workoutExercise.create({
      data: { sessionId: heavier.id, exerciseId: strength.id, orderIndex: 1 },
    })
    const setHeavy = await prisma.workoutSet.create({
      data: { workoutExerciseId: weHeavy.id, setNumber: 1, setType: 'STRENGTH', rpe: 9 },
    })
    await prisma.setStrength.create({ data: { setId: setHeavy.id, reps: 5, weight: 120 } })
    await finishViaController(prisma, user.id, heavier.id, 3000)

    const lighter = await prisma.workoutSession.create({
      data: { userId: user.id, dateTime: new Date(Date.now() - 2 * DAY) },
    })
    const weLight = await prisma.workoutExercise.create({
      data: { sessionId: lighter.id, exerciseId: strength.id, orderIndex: 1 },
    })
    for (const n of [1, 2]) {
      const s = await prisma.workoutSet.create({
        data: { workoutExerciseId: weLight.id, setNumber: n, setType: 'STRENGTH', rpe: 7 },
      })
      await prisma.setStrength.create({ data: { setId: s.id, reps: 5, weight: 90 } })
    }
    const weRun = await prisma.workoutExercise.create({
      data: { sessionId: lighter.id, exerciseId: cardio.id, orderIndex: 2 },
    })
    const runSet = await prisma.workoutSet.create({
      data: { workoutExerciseId: weRun.id, setNumber: 1, setType: 'CARDIO', rpe: 6 },
    })
    await prisma.setCardio.create({ data: { setId: runSet.id, distance: 5.2, time: 1500 } })
    await finishViaController(prisma, user.id, lighter.id, 2400)

    // An abandoned session, which must not appear anywhere.
    const abandoned = await prisma.workoutSession.create({ data: { userId: user.id } })

    // history page
    const page = await getHistoryPage(user.id)
    check('history returns both finished sessions', page.sessions.length === 2,
      `got ${page.sessions.length}`)
    check('the abandoned session is excluded',
      !page.sessions.some(s => s.id === abandoned.id))
    check('newest first', page.sessions[0].id === lighter.id)
    check('cardio distance is summed onto the row', page.sessions[0].distanceKm === 5.2,
      `got ${page.sessions[0].distanceKm}`)
    check('set count covers every exercise', page.sessions[0].setCount === 3,
      `got ${page.sessions[0].setCount}`)
    check('both modalities are listed', page.sessions[0].modalities.length === 2,
      JSON.stringify(page.sessions[0].modalities))
    check('nextCursor is null on the last page', page.nextCursor === null)

    const paged = await getHistoryPage(user.id, { limit: 1 })
    check('limit=1 returns one row and a cursor',
      paged.sessions.length === 1 && paged.nextCursor != null)
    const second = await getHistoryPage(user.id, { limit: 1, cursor: paged.nextCursor! })
    check('the cursor page does not repeat the first row',
      second.sessions[0]?.id !== paged.sessions[0].id,
      `${second.sessions[0]?.id} vs ${paged.sessions[0].id}`)

    const cardioOnly = await getHistoryPage(user.id, { modality: 'Cardio' })
    check('modality filter keeps only sessions containing it',
      cardioOnly.sessions.length === 1 && cardioOnly.sessions[0].id === lighter.id,
      `got ${cardioOnly.sessions.length}`)

    // volume trend
    const volume = await getVolumeTrend(user.id)
    check('volume returns a full 12-week window', volume.weeks.length === 12,
      `got ${volume.weeks.length}`)
    check('weeks with no training are real zeros, not gaps',
      volume.weeks.some(w => w.sessions === 0))
    check('two active weeks', volume.activeWeeks === 2, `got ${volume.activeWeeks}`)
    check('this week is the last bucket',
      volume.thisWeek === volume.weeks[volume.weeks.length - 1])
    check('tonnage is counted', volume.weeks.reduce((a, w) => a + w.volumeKg, 0) > 0)
    check('load is counted', volume.weeks.reduce((a, w) => a + w.load, 0) > 0)
    check('sets are counted', volume.weeks.reduce((a, w) => a + w.sets, 0) === 4,
      `got ${volume.weeks.reduce((a, w) => a + w.sets, 0)}`)

    // strength list
    const strengthList = await getStrengthProgress(user.id)
    check('the exercise appears in the strength list', strengthList.length >= 1)
    const entry = strengthList.find(e => e.exerciseId === strength.id)!
    check('e1RM is the all-time best, not the latest', entry.e1rm > 120, `got ${entry.e1rm}`)
    check('session count counts sessions, not sets', entry.sessionCount === 2,
      `got ${entry.sessionCount}`)
    check('last performed is the recent session',
      entry.lastPerformedAt?.slice(0, 10) === lighter.dateTime.toISOString().slice(0, 10),
      `got ${entry.lastPerformedAt}`)

    // e1RM series
    const series = await getExerciseE1rmSeries(user.id, strength.id)
    check('one point per session, not per set', series.length === 2, `got ${series.length}`)
    check('the series is allowed to go down', series[1].e1rm < series[0].e1rm,
      `${series[0].e1rm} → ${series[1].e1rm}`)
    check('the first point is flagged as a PR', series[0].isPr === true)
    check('the lighter session is not a PR', series[1].isPr === false)
    check('the best set is reported with the point', series[0].bestSet?.weight === 120,
      JSON.stringify(series[0].bestSet))

    // muscle fatigue history
    const muscleHistory = await getMuscleFatigueHistory(user.id)
    check('muscles that were trained have a history', muscleHistory.length > 0)
    const first = muscleHistory[0]
    check('one sample per day across the window', first.points.length === 30,
      `got ${first.points.length}`)
    check('the window has a non-zero curve', first.points.some(p => p.level > 0))
    check('sessions inside the window are listed as hits', first.hits.length > 0)

    // Decay is asserted against a BACKDATED log written directly. `finishSession`
    // stamps MuscleFatigueLog at now() regardless of the session's dateTime, so
    // a session backdated by this script still logs its fatigue today — which is
    // correct for real use (you finish a session when you do it) and useless for
    // testing a curve.
    const older = await prisma.muscle.findFirst({
      where: { fatigueLogs: { none: { userId: user.id } } },
      select: { id: true, name: true },
    })
    if (older) {
      await prisma.muscleFatigueLog.create({
        data: {
          userId: user.id, muscleId: older.id, delta: 60, fatigueLevelAfter: 60,
          source: 'workout', createdAt: new Date(Date.now() - 10 * DAY),
        },
      })
      const decayed = (await getMuscleFatigueHistory(user.id))
        .find(m => m.muscleId === older.id)!
      const atHit = decayed.points[decayed.points.length - 11].level
      const nowLevel = decayed.points[decayed.points.length - 1].level
      check(`a 10-day-old hit on ${older.name} peaks then decays`,
        decayed.peakLevel > 0 && nowLevel < decayed.peakLevel,
        `peak ${decayed.peakLevel}, at hit ${atHit}, now ${nowLevel}`)
      check('and has cleared to zero by today', nowLevel === 0, `got ${nowLevel}`)
      check('the samples decrease monotonically after the hit',
        decayed.points.slice(-10).every((p, i, arr) => i === 0 || p.level <= arr[i - 1].level),
        JSON.stringify(decayed.points.slice(-10).map(p => p.level)))
    }
    check('untrained muscles are omitted, not drawn as flat zero',
      muscleHistory.every(m => m.hits.length > 0 || m.peakLevel > 0))

    const live = await getUserReadiness(user.id)
    const mapped = live.muscles.find(m => m.muscleId === first.muscleId)
    check("today's last sample matches what the body map shows",
      Math.abs((first.points[first.points.length - 1].level) - (mapped?.fatigueLevel ?? -1)) <= 1,
      `history ${first.points[first.points.length - 1].level} vs map ${mapped?.fatigueLevel}`)

    // per-exercise history
    const exHistory = await getExerciseHistory(user.id, strength.id)
    check('exercise history returns both sessions', exHistory.entries.length === 2,
      `got ${exHistory.entries.length}`)
    check('newest first', exHistory.entries[0].sessionId === lighter.id)
    check('sets are listed with weight and reps',
      exHistory.entries[0].sets[0].weight === 90 && exHistory.entries[0].sets[0].reps === 5,
      JSON.stringify(exHistory.entries[0].sets[0]))
    check('the top set is the heaviest of that session',
      exHistory.entries[1].topWeight === 120, `got ${exHistory.entries[1].topWeight}`)
    check('best e1RM matches the stored estimate',
      exHistory.bestE1rm === Math.round(entry.e1rm * 10) / 10,
      `${exHistory.bestE1rm} vs ${entry.e1rm}`)
    check('session count is not the truncated page length',
      exHistory.sessionCount === 2, `got ${exHistory.sessionCount}`)

    const runHistory = await getExerciseHistory(user.id, cardio.id)
    check('a cardio set reports distance, not a zero weight',
      runHistory.entries[0]?.sets[0]?.distanceKm === 5.2 && runHistory.entries[0]?.sets[0]?.weight === null,
      JSON.stringify(runHistory.entries[0]?.sets[0]))
    check('cardio has no e1RM', runHistory.entries[0]?.e1rm === null,
      `got ${runHistory.entries[0]?.e1rm}`)

  } finally {
    await prisma.user.delete({ where: { id: user.id } })
    console.log(`\ncleaned up ${email}`)
    console.log(`\n${pass} passed, ${fail} failed\n`)
    await prisma.$disconnect()
    if (fail > 0) process.exitCode = 1
  }
}

main()
