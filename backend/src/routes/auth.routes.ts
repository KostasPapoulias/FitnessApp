import { Router } from 'express';
import { register, login, me } from '../controllers/auth.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';
//import prisma from '../lib/prisma';

const router = Router();

/**
 * @route POST /api/auth/register
 * @public
 * @body email, password, name
 * @returns user and JWT token
 */
router.post('/register', register);

/**
 * @route POST /api/auth/login
 * @public
 * @body email, password
 * @returns user and JWT token
 */
router.post('/login', login);

/**
 * @route GET /api/auth/me
 * @protected
 * @returns current user profile
 */
router.get('/me', verifyToken, me);

export default router;
