/**
 * Builds the demo account the supervisor logs into: one month of training,
 * finished today, with every derived table populated.
 *
 *   npx tsx scripts/seed-demo-account.ts
 *
 * Nothing here writes a fatigue number by hand. Sessions and sets are inserted,
 * then the production path recomputes everything from them:
 *
 *   rescoreSession          → session totals + MuscleFatigueLog, dated to the session
 *   recomputeStrengthEstimates → e1RM per exercise, from the sets
 *   recomputeUserFatigue    → replays the whole month's decay curve into
 *                             MuscleFatigueCurrent and SystemicFatigue
 *
 * So the body map, readiness, progress charts and training load the professor
 * sees are the model's real output on this history — not decoration. That is the
 * whole point: a seeded number that disagreed with its own sessions would
 * misrepresent exactly the thing the project claims to do.
 *
 * Re-runnable: the demo user is deleted first and cascades take the rest.
 */
import 'dotenv/config'
import bcrypt from 'bcrypt'
import prisma from '../src/lib/prisma'
import {
  recomputeStrengthEstimates,
  recomputeUserFatigue,
  rescoreSession,
} from '../src/services/fatigue-recompute.service'

const EMAIL = 'demo@somatrack.app'
const PASSWORD = 'Somatrack123'

/** An intermediate lifter, so suggestions and recovery rates sit mid-range. */
const PROFILE = {
  name: 'Alex Demo',
  weight: 80,
  height: 180,
  gender: 'male',
  fitnessLevel: 'intermediate',
  goal: 'hypertrophy',
  trainingDaysPerWeek: 4,
  experienceYears: 3,
  birthYear: 1998,
}

// ── exercises, by their catalogue names ───────────────────────────────────
// Verified against prisma/exercise-catalogue.ts. A missing one is a hard stop:
// silently dropping an exercise would leave a modality with no data and a blank
// screen in the demo.
const EX = {
  bench: 'Barbell Bench Press',
  row: 'Barbell Bent Over Row',
  press: 'Dumbbell Seated Shoulder Press',
  curl: 'Barbell Curl',
  squat: 'Barbell Full Squat',
  deadlift: 'Barbell Deadlift',
  rdl: 'Barbell Romanian Deadlift',
  pullup: 'Pull-Up',
  chinup: 'Chin-Up',
  dip: 'Chest Dip',
  plank: 'Weighted Front Plank',
  run: 'Run',
  hamstring: 'Hamstring Stretch',
  lat: 'Kneeling Lat Stretch',
  chest: 'Chest And Front Of Shoulder Stretch',
  triceps: 'Overhead Triceps Stretch',
  thruster: 'Barbell Thruster',
  burpee: 'Burpee',
  box: 'Box Jump',
} as const

/** Working weights at the start of the month, in kg. */
const BASE: Record<string, number> = {
  [EX.bench]: 60,
  [EX.row]: 50,
  [EX.press]: 22.5,
  [EX.curl]: 25,
  [EX.squat]: 80,
  [EX.deadlift]: 100,
  [EX.rdl]: 70,
}

/** Added per progression step (one step per week). */
const INC: Record<string, number> = {
  [EX.bench]: 2.5,
  [EX.row]: 2.5,
  [EX.press]: 1.25,
  [EX.curl]: 1.25,
  [EX.squat]: 5,
  [EX.deadlift]: 5,
  [EX.rdl]: 2.5,
}

type Kind = 'upper' | 'lower' | 'calisthenics' | 'cardio' | 'mobility' | 'wod'

/**
 * Days before today, newest first. 17 sessions across 28 days — between three
 * and five a week. Today is an upper session and legs were three days ago, so
 * the body map opens on a genuine mix of red, amber and recovered rather than
 * one flat colour.
 */
const PLAN: { daysAgo: number; kind: Kind }[] = [
  { daysAgo: 0, kind: 'upper' },
  { daysAgo: 2, kind: 'cardio' },
  { daysAgo: 3, kind: 'lower' },
  { daysAgo: 5, kind: 'calisthenics' },
  { daysAgo: 7, kind: 'upper' },
  { daysAgo: 9, kind: 'cardio' },
  { daysAgo: 10, kind: 'lower' },
  { daysAgo: 12, kind: 'mobility' },
  { daysAgo: 14, kind: 'upper' },
  { daysAgo: 16, kind: 'wod' },
  { daysAgo: 17, kind: 'lower' },
  { daysAgo: 19, kind: 'calisthenics' },
  { daysAgo: 21, kind: 'upper' },
  { daysAgo: 23, kind: 'cardio' },
  { daysAgo: 24, kind: 'lower' },
  { daysAgo: 26, kind: 'mobility' },
  { daysAgo: 28, kind: 'upper' },
]

// ── helpers ───────────────────────────────────────────────────────────────
const at = (daysAgo: number, hour = 18, minute = 30): Date => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, minute, 0, 0)
  return d
}

/** 0 for the oldest week, 4 for today — drives progressive overload. */
const step = (daysAgo: number) => Math.floor((28 - daysAgo) / 7)

const loadFor = (name: string, daysAgo: number) =>
  Math.round(((BASE[name] ?? 0) + step(daysAgo) * (INC[name] ?? 0)) * 4) / 4

type PlannedSet = {
  setType: 'STRENGTH' | 'CALISTHENICS' | 'CARDIO' | 'WOD' | 'MOBILITY'
  rpe: number
  restSeconds?: number
  strength?: { reps: number; weight: number }
  calisthenics?: { reps: number; addedWeight: number; time?: number | null }
  cardio?: { distance?: number | null; time?: number | null; reps?: number | null }
  wod?: { reps?: number | null; rounds?: number | null; time?: number | null; weight?: number | null }
  mobility?: { time: number }
}

/** Straight sets, RPE drifting up across the exercise as fatigue builds. */
const strengthSets = (name: string, daysAgo: number, count: number, reps: number): PlannedSet[] =>
  Array.from({ length: count }, (_, i) => ({
    setType: 'STRENGTH' as const,
    rpe: Math.min(9.5, 7 + i * 0.5),
    restSeconds: 120,
    strength: { reps: reps - (i > 1 ? 1 : 0), weight: loadFor(name, daysAgo) },
  }))

const bodyweightSets = (count: number, reps: number): PlannedSet[] =>
  Array.from({ length: count }, (_, i) => ({
    setType: 'CALISTHENICS' as const,
    rpe: Math.min(9.5, 7 + i * 0.5),
    restSeconds: 90,
    calisthenics: { reps: Math.max(4, reps - i), addedWeight: 0, time: null },
  }))

// ── session builders ──────────────────────────────────────────────────────
type Built = {
  notes: string
  durationSec: number
  exercises: { name: string; notes?: string; sets: PlannedSet[] }[]
}

const buildSession = (kind: Kind, daysAgo: number): Built => {
  const s = step(daysAgo)

  switch (kind) {
    case 'upper':
      return {
        notes: s >= 4 ? 'Best bench of the block — bar speed still good.' : 'Solid push session.',
        durationSec: 62 * 60,
        exercises: [
          {
            name: EX.bench,
            notes: s >= 4 ? 'Top set felt like a PR.' : undefined,
            sets: strengthSets(EX.bench, daysAgo, 4, 8),
          },
          { name: EX.row, sets: strengthSets(EX.row, daysAgo, 4, 10) },
          { name: EX.press, sets: strengthSets(EX.press, daysAgo, 3, 10) },
          { name: EX.curl, sets: strengthSets(EX.curl, daysAgo, 3, 12) },
        ],
      }

    case 'lower':
      return {
        notes: 'Legs. Depth consistent, no knee pain.',
        durationSec: 70 * 60,
        exercises: [
          { name: EX.squat, sets: strengthSets(EX.squat, daysAgo, 4, 6) },
          { name: EX.deadlift, sets: strengthSets(EX.deadlift, daysAgo, 3, 5) },
          { name: EX.rdl, sets: strengthSets(EX.rdl, daysAgo, 3, 10) },
        ],
      }

    case 'calisthenics':
      return {
        notes: 'Bodyweight day — strict form over reps.',
        durationSec: 45 * 60,
        exercises: [
          { name: EX.pullup, sets: bodyweightSets(4, 10) },
          { name: EX.chinup, sets: bodyweightSets(3, 8) },
          { name: EX.dip, sets: bodyweightSets(3, 12) },
          {
            name: EX.plank,
            sets: [45, 45, 40].map(time => ({
              setType: 'CALISTHENICS' as const,
              rpe: 7,
              restSeconds: 60,
              calisthenics: { reps: 0, addedWeight: 0, time },
            })),
          },
        ],
      }

    case 'cardio': {
      // Distance creeps up and pace improves across the month
      const km = 5 + s * 0.5
      const paceSecPerKm = 345 - s * 8
      return {
        notes: s >= 3 ? 'Felt easy at this pace now.' : 'Steady aerobic run.',
        durationSec: Math.round(km * paceSecPerKm),
        exercises: [
          {
            name: EX.run,
            sets: [{
              setType: 'CARDIO' as const,
              rpe: 6,
              // KILOMETRES. cardioHse compares this against the exercise's
              // referenceSpeedKmh, so metres here reads as a 5,000 km run and
              // the leg muscles come back at four figures of fatigue.
              cardio: { distance: Math.round(km * 100) / 100, time: Math.round(km * paceSecPerKm), reps: null },
            }],
          },
        ],
      }
    }

    case 'mobility':
      return {
        notes: 'Easy flow, hips and shoulders.',
        durationSec: 22 * 60,
        exercises: [EX.hamstring, EX.lat, EX.chest, EX.triceps].map(name => ({
          name,
          sets: [40, 40].map(time => ({
            setType: 'MOBILITY' as const,
            rpe: 4,
            mobility: { time },
          })),
        })),
      }

    case 'wod': {
      const rounds = 5
      const cap = 12 * 60
      return {
        notes: 'AMRAP 12 — five rounds plus change.',
        durationSec: cap,
        exercises: [
          {
            name: EX.thruster,
            sets: [{
              setType: 'WOD' as const, rpe: 9,
              wod: { reps: 10, rounds, time: cap, weight: 40 },
            }],
          },
          {
            name: EX.burpee,
            sets: [{
              setType: 'WOD' as const, rpe: 9,
              wod: { reps: 12, rounds, time: cap, weight: 0 },
            }],
          },
          {
            name: EX.box,
            sets: [{
              setType: 'WOD' as const, rpe: 9,
              wod: { reps: 15, rounds, time: cap, weight: 0 },
            }],
          },
        ],
      }
    }
  }
}

// ── main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nSeeding ${EMAIL}\n`)

  // 1. resolve every exercise up front, so a catalogue mismatch fails loudly
  const names = [...new Set(Object.values(EX))]
  const rows = await prisma.exercise.findMany({
    where: { name: { in: names as string[] } },
    select: { id: true, name: true },
  })
  const byName = new Map(rows.map(e => [e.name, e.id]))
  const missing = names.filter(n => !byName.has(n))
  if (missing.length) {
    throw new Error(
      `These exercises are not in the catalogue — run \`npx prisma db seed\` first, ` +
      `or fix the names in EX:\n  ${missing.join('\n  ')}`
    )
  }
  console.log(`  ✔ resolved ${byName.size} exercises`)

  // 2. a clean slate; cascades remove sessions, logs, fatigue, everything
  await prisma.user.deleteMany({ where: { email: EMAIL } })

  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      password: await bcrypt.hash(PASSWORD, 10),
      profile: {
        create: {
          name: PROFILE.name,
          weight: PROFILE.weight,
          height: PROFILE.height,
          gender: PROFILE.gender,
          fitnessLevel: PROFILE.fitnessLevel,
          goal: PROFILE.goal,
          trainingDaysPerWeek: PROFILE.trainingDaysPerWeek,
          experienceYears: PROFILE.experienceYears,
          birthDate: new Date(Date.UTC(PROFILE.birthYear, 3, 4)),
          // Set, so the app never sends the demo through onboarding
          onboardingCompletedAt: at(30),
          optionalStageDoneAt: at(30),
        },
      },
      settings: { create: { language: 'en', preferredUnit: 'metric', theme: 'dark' } },
      notificationPref: {
        create: {
          // Off by default: the professor should opt in from the UI and watch
          // the permission prompt, not inherit a subscription that isn't his
          pushEnabled: false,
          timezone: 'Europe/Athens',
        },
      },
    },
    select: { id: true },
  })
  const userId = user.id
  console.log(`  ✔ user + profile + settings`)

  // 3. kit and a constraint, so Training setup and the AI context aren't empty
  const equipment = await prisma.equipment.findMany({
    where: { name: { in: ['Barbell', 'Bench', 'Dumbbell', 'Pull-up Bar', 'Plyo Box', 'Kettlebell'] } },
    select: { id: true },
  })
  if (equipment.length) {
    await prisma.userEquipment.createMany({
      data: equipment.map(e => ({ userId, equipmentId: e.id })),
      skipDuplicates: true,
    })
  }

  const shoulder = await prisma.muscle.findFirst({
    where: { name: { contains: 'houlder' } },
    select: { id: true },
  })
  await prisma.userInjury.create({
    data: {
      userId,
      muscleId: shoulder?.id ?? null,
      label: 'Left shoulder — impingement, overhead work kept light',
      severity: 'caution',
      activeFrom: at(40),
    },
  })
  console.log(`  ✔ ${equipment.length} equipment items + 1 injury`)

  await prisma.favoriteExercise.createMany({
    data: [EX.bench, EX.squat, EX.pullup, EX.run].map(n => ({
      userId,
      exerciseId: byName.get(n)!,
    })),
    skipDuplicates: true,
  })

  // 4. the month of training
  const sessionIds: string[] = []
  const touchedExerciseIds = new Set<string>()

  for (const { daysAgo, kind } of [...PLAN].reverse()) {
    const built = buildSession(kind, daysAgo)
    // Today's session must already be over when the seed runs. At a fixed
    // 18:30 a morning run would date it in the future: readiness counts it at
    // once, but the progress chart's daily samples (which stop at "now") would
    // not, and the two screens would disagree.
    const when = daysAgo === 0
      ? new Date(Date.now() - built.durationSec * 1000 - 60 * 60 * 1000)
      : at(daysAgo, kind === 'cardio' ? 7 : 18, 30)

    const session = await prisma.workoutSession.create({
      data: {
        userId,
        dateTime: when,
        // Non-null marks it finished — rescoreSession skips open sessions
        duration: built.durationSec,
        notes: built.notes,
        workoutExercises: {
          create: built.exercises.map((ex, exIdx) => ({
            exerciseId: byName.get(ex.name)!,
            orderIndex: exIdx,
            notes: ex.notes ?? null,
            sets: {
              create: ex.sets.map((set, setIdx) => ({
                setNumber: setIdx + 1,
                setType: set.setType,
                rpe: set.rpe,
                restSeconds: set.restSeconds ?? null,
                ...(set.strength ? { strength: { create: set.strength } } : {}),
                ...(set.calisthenics
                  ? {
                      calisthenics: {
                        create: {
                          reps: set.calisthenics.reps,
                          addedWeight: set.calisthenics.addedWeight,
                          time: set.calisthenics.time ?? null,
                        },
                      },
                    }
                  : {}),
                ...(set.cardio
                  ? {
                      cardio: {
                        create: {
                          distance: set.cardio.distance ?? null,
                          time: set.cardio.time ?? null,
                          reps: set.cardio.reps ?? null,
                        },
                      },
                    }
                  : {}),
                ...(set.wod
                  ? {
                      wod: {
                        create: {
                          reps: set.wod.reps ?? null,
                          rounds: set.wod.rounds ?? null,
                          time: set.wod.time ?? null,
                          weight: set.wod.weight ?? null,
                          distance: null,
                        },
                      },
                    }
                  : {}),
                ...(set.mobility ? { mobility: { create: { time: set.mobility.time } } } : {}),
              })),
            },
          })),
        },
      },
      select: { id: true },
    })

    sessionIds.push(session.id)
    built.exercises.forEach(ex => touchedExerciseIds.add(byName.get(ex.name)!))
  }
  console.log(`  ✔ ${sessionIds.length} finished sessions across 28 days`)

  // 5. sleep, food and bodyweight — readiness reads sleep, the profile charts
  //    read the weight trend
  const sleep: { userId: string; sleepDate: Date; durationMin: number; sleepScore: number }[] = []
  const food: { userId: string; logDate: Date; proteinG: number; calories: number }[] = []
  for (let d = 29; d >= 0; d--) {
    // A believable wobble rather than a flat line, and a rough night mid-block
    const base = d === 11 ? 320 : 420 + ((d * 37) % 70) - 35
    sleep.push({
      userId,
      sleepDate: at(d, 7, 0),
      durationMin: base,
      sleepScore: Math.round(Math.min(95, Math.max(45, base / 5.2)) * 10) / 10,
    })
    if (d % 3 !== 1) {
      food.push({
        userId,
        logDate: at(d, 21, 0),
        proteinG: 150 + ((d * 13) % 40),
        calories: 2500 + ((d * 53) % 500),
      })
    }
  }
  await prisma.sleepLog.createMany({ data: sleep })
  await prisma.nutritionLog.createMany({ data: food })

  const weights = Array.from({ length: 9 }, (_, i) => {
    const daysAgo = 28 - i * 3.5
    return {
      userId,
      measuredAt: at(Math.round(daysAgo), 7, 15),
      type: 'WEIGHT' as const,
      value: Math.round((82 - i * 0.25) * 10) / 10,
    }
  })
  await prisma.biometric.createMany({
    data: [
      ...weights,
      { userId, measuredAt: at(1, 7, 10), type: 'HRV' as const, value: 62 },
      { userId, measuredAt: at(8, 7, 10), type: 'HRV' as const, value: 58 },
    ],
  })
  console.log(`  ✔ ${sleep.length} sleep logs, ${food.length} nutrition logs, ${weights.length + 2} biometrics`)

  // 6. saved plans, one on standby for a future date
  const tmplUpper = await prisma.workoutTemplate.create({
    data: {
      userId,
      name: 'Upper push A',
      notes: 'Bench focus, rows to balance it.',
      timesPerformed: 5,
      lastPerformedAt: at(0),
      createdAt: at(28),
      exercises: {
        create: [EX.bench, EX.row, EX.press, EX.curl].map((n, i) => ({
          exerciseId: byName.get(n)!,
          orderIndex: i,
          sets: {
            create: Array.from({ length: 3 }, (_, si) => ({
              setNumber: si + 1,
              reps: 8,
              weight: loadFor(n, 0),
              rpe: 8,
              restSeconds: 120,
            })),
          },
        })),
      },
    },
    select: { id: true },
  })

  await prisma.workoutTemplate.create({
    data: {
      userId,
      name: 'Lower strength B',
      notes: 'Squat and pull, heavy.',
      timesPerformed: 4,
      lastPerformedAt: at(3),
      createdAt: at(28),
      exercises: {
        create: [EX.squat, EX.deadlift, EX.rdl].map((n, i) => ({
          exerciseId: byName.get(n)!,
          orderIndex: i,
          sets: {
            create: Array.from({ length: 3 }, (_, si) => ({
              setNumber: si + 1,
              reps: 6,
              weight: loadFor(n, 0),
              rpe: 8,
              restSeconds: 150,
            })),
          },
        })),
      },
    },
  })

  const inTwoDays = at(-2, 18, 0)
  await prisma.scheduledWorkout.create({
    data: {
      userId,
      templateId: tmplUpper.id,
      scheduledFor: inTwoDays,
      reminderAt: new Date(inTwoDays.getTime() - 60 * 60 * 1000),
      status: 'standby',
    },
  })
  console.log(`  ✔ 2 saved plans + 1 scheduled session`)

  // 7. a short coach conversation, so the AI hub is not an empty shell
  const thread = await prisma.chatThread.create({
    data: { userId, createdAt: at(4, 19, 0) },
    select: { id: true },
  })
  await prisma.aIChat.createMany({
    data: [
      {
        threadId: thread.id, userId, sender: 'user', dateTime: at(4, 19, 0),
        messageText: 'My left shoulder has been grumbling. Should I still press overhead this week?',
      },
      {
        threadId: thread.id, userId, sender: 'assistant', dateTime: at(4, 19, 1),
        messageText:
          'Keep pressing, but take the load off it. Your shoulders are carrying the most ' +
          'fatigue of anything right now and you have flagged that side as a caution, so this ' +
          'week I would drop the seated press to around 15 kg for sets of 12 and stop two reps ' +
          'short of failure. Rows and curls can stay as they are — neither loads the joint in ' +
          'the position that bothers you.',
      },
    ],
  })
  console.log(`  ✔ 1 coach thread`)

  // 8. derive everything — this is the part that must not be faked
  console.log(`\n  Recomputing the model from that history…`)
  for (const id of sessionIds) await rescoreSession(userId, id)
  console.log(`  ✔ rescored ${sessionIds.length} sessions (totals + fatigue logs)`)

  await recomputeStrengthEstimates(userId, [...touchedExerciseIds])
  console.log(`  ✔ strength estimates for ${touchedExerciseIds.size} exercises`)

  await recomputeUserFatigue(userId)
  console.log(`  ✔ replayed the decay curve into current fatigue`)

  // 9. report what the professor will actually see
  const [muscles, systemic, estimates, sessionCount] = await Promise.all([
    prisma.muscleFatigueCurrent.findMany({
      where: { userId },
      orderBy: { fatigueLevel: 'desc' },
      take: 5,
      include: { muscle: { select: { name: true } } },
    }),
    prisma.systemicFatigue.findUnique({ where: { userId } }),
    prisma.exerciseStrengthEstimate.findMany({
      where: { userId },
      orderBy: { e1rm: 'desc' },
      take: 3,
      include: { exercise: { select: { name: true } } },
    }),
    prisma.workoutSession.count({ where: { userId } }),
  ])

  console.log(`\n── what the demo opens on ──`)
  console.log(`  sessions:        ${sessionCount}`)
  console.log(`  whole-body load: ${Math.round(systemic?.level ?? 0)}`)
  console.log(`  most fatigued:`)
  for (const m of muscles) {
    console.log(`    ${m.muscle.name.padEnd(18)} ${Math.round(m.fatigueLevel)}%`)
  }
  console.log(`  top estimates:`)
  for (const e of estimates) {
    console.log(`    ${e.exercise.name.padEnd(28)} ${Math.round(e.e1rm)} kg e1RM`)
  }
  console.log(`\n  ${EMAIL} / ${PASSWORD}\n`)
}

main()
  .catch(err => {
    console.error('\nSeed failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
