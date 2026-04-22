import { Router } from 'express';
import { getCurrentFatigue, overrideFatigue } from '../controllers/fatigue.controller';
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
 * @route PUT /api/fatigue/:muscleId
 * @protected
 * @returns updated fatigue
 */
router.put('/:muscleId', overrideFatigue);


export default router;
