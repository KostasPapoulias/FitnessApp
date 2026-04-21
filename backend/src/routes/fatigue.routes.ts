import { Router } from 'express';
import { getCurrentFatigue, updateFatigue, recalculateFatigue } from '../controllers/fatigue.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';

const router = Router();

router.use(verifyToken);

/**
 * @route GET /api/fatigue/current
 * @protected
 * @returns current muscle fatigue for user
 */
router.get('/current', getCurrentFatigue);

/**
 * @route PUT /api/fatigue/:muscleId
 * @protected
 * @returns updated fatigue
 */
router.put('/:muscleId', updateFatigue);

/**
 * @route POST /api/fatigue/recalculate
 * @protected
 * @returns recalculated fatigue with recovery
 */
router.post('/recalculate', recalculateFatigue);

export default router;
