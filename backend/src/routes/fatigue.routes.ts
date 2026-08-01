import { Router } from 'express';
import { getCurrentFatigue, getTrainingLoadSummary, overrideFatigue } from '../controllers/fatigue.controller';
import { verifyToken } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyToken);

/**
 * @route GET /api/fatigue/current
 * @protected
 * @returns current muscle fatigue for user
 */
router.get('/current', getCurrentFatigue);

/**
 * @route GET /api/fatigue/load
 * @protected
 * @returns acute vs chronic training load (fitness / fatigue / form)
 *
 * Declared before the `/:muscleId` route below — as a GET it would not collide
 * today, but a future GET /:muscleId would swallow "load" as an id.
 */
router.get('/load', getTrainingLoadSummary);

/**
 * @route PUT /api/fatigue/:muscleId
 * @protected
 * @returns updated fatigue
 */
router.put('/:muscleId', overrideFatigue);


export default router;
