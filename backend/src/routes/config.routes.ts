import { Router } from 'express'
import { getMapConfig } from '../controllers/config.controller'
import { verifyToken } from '../middleware/auth.middleware'

const router = Router()

router.use(verifyToken)

/**
 * @route GET /api/config/map
 * @protected — the key is public once tiles load, but there is no reason to
 *              hand it to anyone who has not signed in
 * @returns MapTiler style URL for the route map
 */
router.get('/map', getMapConfig)

export default router
