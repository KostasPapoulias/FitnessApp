import { Router } from 'express';
import {
  addFavorite, createExercise, getCategories, getModalities, getExerciseById,
  getExercises, removeFavorite,
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

/**
 * @route POST /api/exercises/:id/favorite
 * @route DELETE /api/exercises/:id/favorite
 * @protected
 * @returns { exerciseId, isFavorite }
 *
 * Explicit verbs rather than a toggle, so a retried request is idempotent.
 */
router.post('/:id/favorite', verifyToken, addFavorite);
router.delete('/:id/favorite', verifyToken, removeFavorite);

export default router;
