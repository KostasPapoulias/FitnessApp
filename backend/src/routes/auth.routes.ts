import { Router } from 'express';
import {
  register, login, me, forgotPassword, resetPassword,
} from '../controllers/auth.controller';
import { verifyToken } from '../middleware/auth.middleware';
import {
  authLimiter, registerLimiter, passwordResetLimiter,
} from '../middleware/rateLimit.middleware';
//import prisma from '../lib/prisma';

const router = Router();

/**
 * @route POST /api/auth/register
 * @public
 * @body email, password, name
 * @returns user and JWT token
 */
router.post('/register', registerLimiter, authLimiter, register);

/**
 * @route POST /api/auth/login
 * @public
 * @body email, password
 * @returns user and JWT token
 */
router.post('/login', authLimiter, login);

/**
 * @route GET /api/auth/me
 * @protected
 * @returns current user profile
 */
router.get('/me', verifyToken, me);

/**
 * @route POST /api/auth/forgot-password
 * @public
 * @body email
 * @returns the same acknowledgement whether or not the address is registered
 */
router.post('/forgot-password', passwordResetLimiter, forgotPassword);

/**
 * @route POST /api/auth/reset-password
 * @public
 * @body token, password
 * @returns confirmation — deliberately NOT a session
 *
 * Carries authLimiter as well: the token is unguessable, but an endpoint that
 * runs bcrypt on every call should not be free to hammer.
 */
router.post('/reset-password', passwordResetLimiter, authLimiter, resetPassword);

export default router;
