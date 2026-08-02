import { Router } from 'express'
import {
  changePassword,
  getPinStatus,
  removePin,
  setPin,
  signOutEverywhere,
  verifyPin,
} from '../controllers/security.controller'
import { verifyToken } from '../middleware/auth.middleware'
import { pinLimiter } from '../middleware/rateLimit.middleware'

const router = Router()

router.use(verifyToken)

/**
 * @route GET /api/security/pin
 * @protected
 * @returns whether a PIN is set and whether entry is locked out
 */
router.get('/pin', getPinStatus)

/**
 * @route PUT /api/security/pin
 * @protected
 * @returns sets or changes the PIN; changing requires the old PIN or password
 */
router.put('/pin', setPin)

/**
 * @route DELETE /api/security/pin
 * @protected
 * @returns removes the PIN; requires the PIN or password
 */
router.delete('/pin', removePin)

/**
 * @route POST /api/security/pin/verify
 * @protected
 * @returns unlocks the app. Rate limited on top of the per-account lockout,
 *          since the account counter alone can be reset by re-registering.
 */
router.post('/pin/verify', pinLimiter, verifyPin)

/**
 * @route POST /api/security/sign-out-everywhere
 * @protected
 * @returns revokes every token on the account, including the caller's
 */
router.post('/sign-out-everywhere', signOutEverywhere)

/**
 * @route PUT /api/security/password
 * @protected
 * @returns changes the password and revokes all existing sessions
 */
router.put('/password', changePassword)

export default router
