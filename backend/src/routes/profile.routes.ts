import { Router } from 'express';
import { getProfile, updateProfile, logSleep, logNutrition, deleteAccount } from '../controllers/profile.controller';
import { verifyToken } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyToken);

/**
 * @route GET /api/profile
 * @protected
 * @returns user profile with stats
 */
router.get('/', getProfile);

/**
 * @route PUT /api/profile
 * @protected
 * @returns updated profile
 */
router.put('/', updateProfile);

/**
 * @route POST /api/profile/sleep
 * @protected
 * @returns created sleep log
 */
router.post('/sleep', logSleep);

/**
 * @route POST /api/profile/nutrition
 * @protected
 * @returns created nutrition log
 */
router.post('/nutrition', logNutrition);

/**
 * @route DELETE /api/profile/account
 * @protected
 * @returns GDPR delete confirmation
 */
router.delete('/account', deleteAccount);

export default router;
