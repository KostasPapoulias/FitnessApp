import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { reportClientError } from '../controllers/clientError.controller'
import { optionalAuth } from '../middleware/auth.middleware'

const router = Router()

/** Caps crash reports so a render loop on one phone cannot flood the logs. */
const clientErrorLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Accepted silently: the client can do nothing with a 429 here.
  message: { success: true },
})

/**
 * @route POST /api/client-errors
 * @access optional auth — launch-time crashes happen before a token is verified
 */
router.post('/', clientErrorLimiter, optionalAuth, reportClientError)

export default router
