import { Response } from 'express'
import { AuthRequest } from '../server'
import {
  getExerciseE1rmSeries,
  getMuscleFatigueHistory,
  getStrengthProgress,
  getVolumeTrend,
} from '../services/progress.service'
import { getExerciseHistory, getHistoryPage } from '../services/workout-history.service'
import { log } from '../lib/logger'

/**
 * GET /api/progress/summary?weeks=12&days=30
 * Volume trend, strength progress and muscle fatigue history for the progress
 * screen, fetched in parallel.
 */
export const getProgressSummary = async (req: AuthRequest, res: Response) => {
  try {
    const { weeks, days } = req.query

    const [volume, strength, muscles] = await Promise.all([
      getVolumeTrend(req.userId!, weeks ? Number(weeks) : undefined),
      getStrengthProgress(req.userId!),
      getMuscleFatigueHistory(req.userId!, days ? Number(days) : undefined),
    ])

    res.json({ success: true, data: { volume, strength, muscles } })

  } catch (error) {
    log.error('getProgressSummary failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

/**
 * GET /api/progress/strength/:exerciseId
 * One exercise's estimated 1RM over time, recomputed from its sets.
 */
export const getExerciseStrengthSeries = async (req: AuthRequest, res: Response) => {
  try {
    const points = await getExerciseE1rmSeries(req.userId!, req.params.exerciseId)
    res.json({ success: true, data: { exerciseId: req.params.exerciseId, points } })

  } catch (error) {
    log.error('getExerciseStrengthSeries failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

/**
 * GET /api/progress/history?cursor=&limit=&modality=
 * Cursor-paged workout history; `nextCursor` is null on the last page.
 */
export const getWorkoutHistory = async (req: AuthRequest, res: Response) => {
  try {
    const { cursor, limit, modality } = req.query

    const page = await getHistoryPage(req.userId!, {
      cursor: typeof cursor === 'string' && cursor.length > 0 ? cursor : undefined,
      limit: limit ? Number(limit) : undefined,
      modality: typeof modality === 'string' && modality.length > 0 ? modality : undefined,
    })

    res.json({ success: true, data: page })

  } catch (error) {
    log.error('getWorkoutHistory failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

/**
 * GET /api/progress/exercises/:exerciseId/history?limit=10
 * The athlete's own recent sets of one exercise.
 */
export const getExerciseHistoryForUser = async (req: AuthRequest, res: Response) => {
  try {
    const { limit } = req.query
    const history = await getExerciseHistory(
      req.userId!,
      req.params.exerciseId,
      limit ? Number(limit) : undefined
    )
    res.json({ success: true, data: history })

  } catch (error) {
    log.error('getExerciseHistoryForUser failed', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}
