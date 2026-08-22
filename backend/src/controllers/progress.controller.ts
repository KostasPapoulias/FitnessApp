import { Response } from 'express'
import { AuthRequest } from '../server'
import {
  getExerciseE1rmSeries,
  getMuscleFatigueHistory,
  getStrengthProgress,
  getVolumeTrend,
} from '../services/progress.service'
import { getExerciseHistory, getHistoryPage } from '../services/workout-history.service'

/**
 * GET /api/progress/summary?weeks=12&days=30
 *
 * Everything the progress screen needs for its first paint, in one request.
 *
 * Three separate endpoints would have been tidier, and would have cost three
 * sequential round trips to a database that is ~290ms away — the screen would
 * have taken most of a second to fill in section by section. These three reads
 * are independent, so they go out together.
 *
 * The per-exercise e1RM series is NOT here: it depends on which exercise the
 * athlete taps, and pre-fetching one for every exercise in the list would read
 * their whole training history to draw a single chart.
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
    console.error('getProgressSummary error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

/**
 * GET /api/progress/strength/:exerciseId
 *
 * One exercise's estimated strength over time. Recomputed from the sets, so it
 * can go down — see the service for why a monotonic best-so-far line would
 * defeat the purpose.
 */
export const getExerciseStrengthSeries = async (req: AuthRequest, res: Response) => {
  try {
    const points = await getExerciseE1rmSeries(req.userId!, req.params.exerciseId)
    res.json({ success: true, data: { exerciseId: req.params.exerciseId, points } })

  } catch (error) {
    console.error('getExerciseStrengthSeries error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

/**
 * GET /api/progress/history?cursor=&limit=&modality=
 *
 * The workout history list. Cursor-paged; `nextCursor` is null on the last page.
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
    console.error('getWorkoutHistory error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}

/**
 * GET /api/progress/exercises/:exerciseId/history?limit=10
 *
 * What this athlete has actually done with one movement. Scoped to `userId`
 * throughout — another athlete's sets are not history, they are a leak.
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
    console.error('getExerciseHistoryForUser error:', error)
    res.status(500).json({ success: false, error: 'Server error' })
  }
}
