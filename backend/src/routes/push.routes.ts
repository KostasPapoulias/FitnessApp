import { Router } from 'express'
import { getPublicKey, subscribe, unsubscribe } from '../controllers/push.controller'
import { verifyToken } from '../middleware/auth.middleware'

const router = Router()

router.use(verifyToken)

/**
 * @route GET /api/push/public-key
 * @protected
 * @returns VAPID public key for pushManager.subscribe()
 */
router.get('/public-key', getPublicKey)

/**
 * @route POST /api/push/subscribe
 * @protected
 * @returns stores/updates the caller's push subscription
 */
router.post('/subscribe', subscribe)

/**
 * @route POST /api/push/unsubscribe
 * @protected
 * @returns removes the caller's push subscription
 */
router.post('/unsubscribe', unsubscribe)

export default router
