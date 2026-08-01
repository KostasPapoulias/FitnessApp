import { Router } from 'express'
import {
  getNotificationHistory,
  getNotificationPreferences,
  putNotificationPreferences,
} from '../controllers/notification.controller'
import { verifyToken } from '../middleware/auth.middleware'

const router = Router()

router.use(verifyToken)

/**
 * @route GET /api/notifications/preferences
 * @protected
 * @returns the caller's notification opt-ins (all false until they choose)
 */
router.get('/preferences', getNotificationPreferences)

/**
 * @route PUT /api/notifications/preferences
 * @protected
 * @returns updated preferences; only fields present in the body change
 */
router.put('/preferences', putNotificationPreferences)

/**
 * @route GET /api/notifications/history
 * @protected
 * @returns recent notifications with what actually reached the device
 */
router.get('/history', getNotificationHistory)

export default router
