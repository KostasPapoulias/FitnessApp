import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { reportClientError } from '../controllers/clientError.controller'
import { optionalAuth } from '../middleware/auth.middleware'

const router = Router()

/**
 * Tighter than the global API limit and separate from it.
 *
 * A crash loop is the realistic failure here — a component that throws on every
 * render, remounted by a retry, reporting each time. Without a cap, one broken
 * deploy on one phone becomes thousands of identical reports.
 */
const clientErrorLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Silently accepted rather than refused: the client cannot do anything with
  // a 429 here, and its own screen is already showing the failure.
  message: { success: true },
})

/**
 * @route POST /api/client-errors
 * @access optional auth — a crash during launch happens BEFORE a token is
 *         known to be good, and those are the crashes most worth seeing. When a
 *         token is present the report is attributed to the user.
 */
router.post('/', clientErrorLimiter, optionalAuth, reportClientError)

export default router
