import { Router } from 'express';
import {
  createExercise, getCategories, getModalities, getExerciseById, getExercises,
} from '../controllers/exercise.controller';
import { optionalAuth, verifyToken } from '../middleware/auth.middleware';

const router = Router();

router.use(optionalAuth);

/**
 * @route GET /api/exercises
 * @public
 * @returns list of all exercises
 */
router.get('/', getExercises);

/**
 * @route POST /api/exercises
 * @protected
 * @returns the created custom exercise, shaped like a GET / row
 *
 * The only write in this router, so it carries `verifyToken` rather than the
 * `optionalAuth` the reads share — a custom exercise has an owner by
 * definition, and an anonymous caller has no `userId` to be one.
 */
router.post('/', verifyToken, createExercise);

/**
 * @route GET /api/exercises/categories
 * @public
 * @returns exercise categories
 */
router.get('/categories', getCategories);

/**
 * @route GET /api/exercises/modalities
 * @public
 * @returns exercise modalities
 */
router.get('/modalities', getModalities);

/**
 * @route GET /api/exercises/:id
 * @public
 * @returns single exercise detail
 */
router.get('/:id', getExerciseById);

export default router;
