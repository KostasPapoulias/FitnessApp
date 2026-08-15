import { Router } from 'express';
import { getProfile, updateProfile, logSleep, logNutrition, deleteAccount } from '../controllers/profile.controller';
import {
  getOnboardingOptions,
  getOnboardingState,
  completeOnboarding,
  setUserEquipment,
  setUserInjuries,
  dismissHint,
  resetHints,
} from '../controllers/onboarding.controller';
import { verifyToken } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyToken);

/**
 * @route GET /api/profile/onboarding/options
 * @protected
 * @returns equipment catalogue + muscle list for the optional stage
 */
router.get('/onboarding/options', getOnboardingOptions);

/**
 * @route GET /api/profile/onboarding/state
 * @protected
 * @returns gate status, optional-stage answers, dismissed coach-marks
 */
router.get('/onboarding/state', getOnboardingState);

/**
 * @route PUT /api/profile/onboarding
 * @protected
 * @returns profile with onboardingCompletedAt stamped
 */
router.put('/onboarding', completeOnboarding);

/**
 * @route PUT /api/profile/equipment
 * @protected
 * @returns the stored equipment id set
 */
router.put('/equipment', setUserEquipment);

/**
 * @route PUT /api/profile/injuries
 * @protected
 * @returns active injuries
 */
router.put('/injuries', setUserInjuries);

/**
 * @route POST /api/profile/hints/:hintKey
 * @protected
 * @returns the dismissed hint key
 */
router.post('/hints/:hintKey', dismissHint);

/**
 * @route DELETE /api/profile/hints
 * @protected
 * @returns confirmation the tour will replay
 */
router.delete('/hints', resetHints);

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
