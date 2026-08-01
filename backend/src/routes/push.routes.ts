import { Router } from 'express'
import {
  getPublicKey,
  rotateSubscription,
  sendTestPush,
  subscribe,
  unsubscribe,
} from '../controllers/push.controller'
import { ackNotification } from '../controllers/notification.controller'
import { verifyToken } from '../middleware/auth.middleware'

const router = Router()

// ── public routes ──
// Both are reachable by the service worker, which has no auth token: it runs
// with no page behind it when iOS wakes it to rotate a subscription.

/**
 * @route GET /api/push/public-key
 * @public
 * @returns VAPID public key for pushManager.subscribe()
 */
router.get('/public-key', getPublicKey)

/**
 * @route POST /api/push/rotate
 * @public — authorised by possession of the previous endpoint
 * @returns moves an existing subscription onto its replacement endpoint
 */
router.post('/rotate', rotateSubscription)

/**
 * @route POST /api/push/ack
 * @public — authorised by the notification's UUID, which only that push carried
 * @returns records that a notification was displayed, tapped or dismissed
 */
router.post('/ack', ackNotification)

// ── authenticated routes ──
router.use(verifyToken)

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

/**
 * @route POST /api/push/test
 * @protected
 * @returns sends a real push to every device on the caller's account
 */
router.post('/test', sendTestPush)

export default router
