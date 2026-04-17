import { Router } from 'express';
import { getCategories, getModalities, getExerciseById, getExercises } from '../controllers/exercise.controller';
import { optionalAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(optionalAuth);

/**
 * @route GET /api/exercises
 * @public
 * @returns list of all exercises
 */
router.get('/', getExercises);

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
