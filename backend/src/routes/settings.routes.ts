import { Router } from 'express'
import { getSettings, updateSettings } from '../controllers/settings.controller'
import { verifyToken } from '../middleware/auth.middleware'

const router = Router()

router.use(verifyToken)

/**
 * @route GET /api/settings
 * @protected
 * @returns the caller's settings row, created with defaults if absent
 */
router.get('/', getSettings)

/**
 * @route PUT /api/settings
 * @protected
 * @returns the updated settings row — accepts a partial patch
 */
router.put('/', updateSettings)

export default router
