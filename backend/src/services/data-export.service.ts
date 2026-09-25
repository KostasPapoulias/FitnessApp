// Everything the app holds about one athlete, as one JSON document. The client
// renders it into a report and embeds the JSON in it.
//
// Deliberately excluded: credentials (password/PIN hashes, reset tokens,
// tokenVersion), push subscription keys, and AI spend counters.

import prisma from '../lib/prisma'

export const EXPORT_FORMAT = 'somatrack-export'
/** Bumped when a field is renamed or removed. */
export const EXPORT_VERSION = 1

/** Body-map colour for a muscle's fatigue level; shared with the calendar day view. */
export const fatigueColor = (level: number): string =>
  level >= 70 ? '#EF4444' : level >= 35 ? '#FACC15' : '#4ADE80'

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

export const buildDataExport = async (userId: string) => {
  const [
    user, profile, settings, notificationPref, notificationTypePrefs,
    biometrics, sessions, strengthEstimates, muscleFatigue, systemicFatigue,
    sleep, nutrition, templates, scheduled, favorites, customExercises,
    chats, notifications, proposals,
  ] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, createdAt: true },
    }),
    prisma.userProfile.findUnique({
      where: { userId },
      include: {
        equipment: { include: { equipment: { select: { name: true } } } },
        injuries: { include: { muscle: { select: { name: true } } } },
      },
    }),
    prisma.settings.findUnique({
      where: { userId },
      select: {
        preferredUnit: true, notificationEnabled: true, inactivityDaysThreshold: true,
        theme: true, aiConsentEnabled: true, language: true,
        // Read only to report whether a PIN exists
        pinHash: true,
      },
    }),
    prisma.notificationPreference.findUnique({ where: { userId } }),
    prisma.notificationTypePref.findMany({ where: { userId } }),
    prisma.biometric.findMany({ where: { userId }, orderBy: { measuredAt: 'asc' } }),
    prisma.workoutSession.findMany({
      where: { userId },
      orderBy: { dateTime: 'asc' },
      include: {
        template: { select: { name: true } },
        workoutExercises: {
          orderBy: { orderIndex: 'asc' },
          include: {
            exercise: { select: { name: true, modality: { select: { name: true } } } },
            sets: {
              orderBy: { setNumber: 'asc' },
              include: {
                strength: true, calisthenics: true, cardio: true,
                wod: true, mobility: true, runTrack: true,
              },
            },
          },
        },
        fatigueLogs: {
          orderBy: { createdAt: 'asc' },
          include: { muscle: { select: { name: true } } },
        },
      },
    }),
    prisma.exerciseStrengthEstimate.findMany({
      where: { userId },
      include: { exercise: { select: { name: true } } },
      orderBy: { e1rm: 'desc' },
    }),
    prisma.muscleFatigueCurrent.findMany({
      where: { userId },
      include: { muscle: { select: { name: true } } },
    }),
    prisma.systemicFatigue.findUnique({ where: { userId } }),
    prisma.sleepLog.findMany({ where: { userId }, orderBy: { sleepDate: 'asc' } }),
    prisma.nutritionLog.findMany({ where: { userId }, orderBy: { logDate: 'asc' } }),
    prisma.workoutTemplate.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: {
        exercises: {
          orderBy: { orderIndex: 'asc' },
          include: {
            exercise: { select: { name: true } },
            sets: { orderBy: { setNumber: 'asc' } },
          },
        },
      },
    }),
    prisma.scheduledWorkout.findMany({
      where: { userId },
      orderBy: { scheduledFor: 'asc' },
      include: { template: { select: { name: true } } },
    }),
    prisma.favoriteExercise.findMany({
      where: { userId },
      include: { exercise: { select: { name: true } } },
    }),
    prisma.exercise.findMany({
      where: { createdByUserId: userId },
      include: {
        modality: { select: { name: true } },
        muscleLinks: { include: { muscle: { select: { name: true } } } },
      },
    }),
    prisma.chatThread.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: { messages: { orderBy: { dateTime: 'asc' } } },
    }),
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.aiProposal.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
  ])

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    units: { weight: 'kg', distance: 'km', height: 'cm', duration: 'seconds' },

    account: { email: user.email, createdAt: iso(user.createdAt) },

    profile: profile && {
      name: profile.name,
      birthDate: iso(profile.birthDate),
      age: profile.age,
      weightKg: profile.weight,
      heightCm: profile.height,
      gender: profile.gender,
      phoneNumber: profile.phoneNumber,
      fitnessLevel: profile.fitnessLevel,
      goal: profile.goal,
      trainingDaysPerWeek: profile.trainingDaysPerWeek,
      experienceYears: profile.experienceYears,
      onboardingCompletedAt: iso(profile.onboardingCompletedAt),
    },
    equipment: profile?.equipment.map(e => e.equipment.name) ?? [],
    injuries: profile?.injuries.map(i => ({
      label: i.label,
      muscle: i.muscle?.name ?? null,
      severity: i.severity,
      activeFrom: iso(i.activeFrom),
      resolvedAt: iso(i.resolvedAt),
    })) ?? [],

    settings: settings && {
      preferredUnit: settings.preferredUnit,
      notificationEnabled: settings.notificationEnabled,
      inactivityDaysThreshold: settings.inactivityDaysThreshold,
      theme: settings.theme,
      aiConsentEnabled: settings.aiConsentEnabled,
      language: settings.language,
      pinLockEnabled: settings.pinHash != null,
    },
    notificationPreferences: notificationPref && {
      pushEnabled: notificationPref.pushEnabled,
      essentialEnabled: notificationPref.essentialEnabled,
      coachEnabled: notificationPref.coachEnabled,
      timezone: notificationPref.timezone,
      quietStartHour: notificationPref.quietStartHour,
      quietEndHour: notificationPref.quietEndHour,
      dailyCap: notificationPref.dailyCap,
      coachSuspendedAt: iso(notificationPref.coachSuspendedAt),
      types: notificationTypePrefs.map(p => ({ type: p.type, enabled: p.enabled })),
    },

    biometrics: biometrics.map(b => ({
      measuredAt: iso(b.measuredAt), type: b.type, value: b.value, source: b.source,
    })),

    sessions: sessions.map(s => {
      // The body map after this session: each muscle's last log from it
      const lastByMuscle = new Map<string, typeof s.fatigueLogs[number]>()
      for (const l of s.fatigueLogs) lastByMuscle.set(l.muscle.name, l)

      return {
        id: s.id,
        dateTime: iso(s.dateTime),
        // Unfinished sessions are included but flagged — they never reached the fatigue model
        finished: s.duration != null,
        durationSec: s.duration,
        avgRpe: s.avgRpe,
        totalVolumeKg: s.totalVolume,
        systemicLoad: s.systemicLoad,
        weatherCondition: s.weatherCondition,
        notes: s.notes,
        template: s.template?.name ?? null,
        fatigueSnapshot: [...lastByMuscle.values()].map(l => ({
          muscle: l.muscle.name,
          fatigueAfter: Math.round(l.fatigueLevelAfter * 10) / 10,
          delta: Math.round(l.delta * 10) / 10,
          color: fatigueColor(l.fatigueLevelAfter),
        })),
        exercises: s.workoutExercises.map(we => ({
          name: we.exercise.name,
          modality: we.exercise.modality.name,
          notes: we.notes,
          sets: we.sets.map(set => ({
            setNumber: set.setNumber,
            type: set.setType,
            rpe: set.rpe,
            restSeconds: set.restSeconds,
            strength: set.strength && { reps: set.strength.reps, weightKg: set.strength.weight },
            calisthenics: set.calisthenics && {
              reps: set.calisthenics.reps,
              addedWeightKg: set.calisthenics.addedWeight,
              timeSec: set.calisthenics.time,
            },
            cardio: set.cardio && {
              distanceKm: set.cardio.distance,
              timeSec: set.cardio.time,
              reps: set.cardio.reps,
            },
            wod: set.wod && {
              reps: set.wod.reps,
              rounds: set.wod.rounds,
              weightKg: set.wod.weight,
              distanceKm: set.wod.distance,
              timeSec: set.wod.time,
            },
            mobility: set.mobility && { timeSec: set.mobility.time },
            // The whole run, route included
            run: set.runTrack && {
              startedAt: iso(set.runTrack.startedAt),
              distanceM: set.runTrack.distanceM,
              durationSec: set.runTrack.durationSec,
              avgPaceSecPerKm: set.runTrack.avgPaceSec,
              elevationGainM: set.runTrack.elevationGainM,
              source: set.runTrack.source,
              splits: set.runTrack.splits,
              laps: set.runTrack.laps,
              bounds: set.runTrack.bounds,
              route: set.runTrack.route,
            },
          })),
        })),
      }
    }),

    strengthEstimates: strengthEstimates.map(e => ({
      exercise: e.exercise.name,
      e1rmKg: Math.round(e.e1rm * 10) / 10,
      updatedAt: iso(e.updatedAt),
    })),
    // Stored values plus the timestamps that define their decay curves
    currentFatigue: {
      muscles: muscleFatigue.map(m => ({
        muscle: m.muscle.name,
        level: m.fatigueLevel,
        updatedAt: iso(m.updatedAt),
        recoveryTargetAt: iso(m.recoveryTargetAt),
      })),
      systemic: systemicFatigue && {
        level: systemicFatigue.level,
        updatedAt: iso(systemicFatigue.updatedAt),
        recoveryTargetAt: iso(systemicFatigue.recoveryTargetAt),
      },
    },

    sleep: sleep.map(l => ({
      date: iso(l.sleepDate), durationMin: l.durationMin, score: l.sleepScore, notes: l.notes,
    })),
    nutrition: nutrition.map(l => ({
      date: iso(l.logDate), proteinG: l.proteinG, calories: l.calories, notes: l.notes,
    })),

    templates: templates.map(t => ({
      name: t.name,
      notes: t.notes,
      source: t.source,
      createdAt: iso(t.createdAt),
      archivedAt: iso(t.archivedAt),
      timesPerformed: t.timesPerformed,
      lastPerformedAt: iso(t.lastPerformedAt),
      exercises: t.exercises.map(te => ({
        name: te.exercise.name,
        notes: te.notes,
        sets: te.sets.map(ts => ({
          setNumber: ts.setNumber, reps: ts.reps, weightKg: ts.weight, rpe: ts.rpe,
          restSeconds: ts.restSeconds, distanceKm: ts.distance, timeSec: ts.time, rounds: ts.rounds,
        })),
      })),
    })),
    scheduledWorkouts: scheduled.map(s => ({
      template: s.template.name,
      scheduledFor: iso(s.scheduledFor),
      reminderAt: iso(s.reminderAt),
      status: s.status,
      completedAt: iso(s.completedAt),
      sessionId: s.sessionId,
    })),
    favoriteExercises: favorites.map(f => f.exercise.name),
    customExercises: customExercises.map(e => ({
      name: e.name,
      modality: e.modality.name,
      description: e.description,
      muscles: e.muscleLinks.map(m => ({ muscle: m.muscle.name, impact: m.impactFactor })),
    })),

    aiCoach: {
      threads: chats.map(c => ({
        startedAt: iso(c.createdAt),
        messages: c.messages.map(m => ({
          at: iso(m.dateTime), from: m.sender, text: m.messageText,
        })),
      })),
      proposals: proposals.map(p => ({
        kind: p.kind, status: p.status, payload: p.payload,
        createdAt: iso(p.createdAt), appliedAt: iso(p.appliedAt), expiresAt: iso(p.expiresAt),
      })),
    },

    notifications: notifications.map(n => ({
      type: n.type, title: n.title, body: n.body, status: n.status, tier: n.tier,
      createdAt: iso(n.createdAt), sentAt: iso(n.sentAt), displayedAt: iso(n.displayedAt),
      clickedAt: iso(n.clickedAt), dismissedAt: iso(n.dismissedAt),
    })),
  }
}

export type DataExport = Awaited<ReturnType<typeof buildDataExport>>
