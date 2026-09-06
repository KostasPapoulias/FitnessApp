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

/**
 * @route POST /api/exercises/:id/favorite
 * @route DELETE /api/exercises/:id/favorite
 * @protected
 * @returns { exerciseId, isFavorite }
 *
 * `verifyToken` rather than the router's `optionalAuth`, for the same reason
 * the POST above carries it: a favourite belongs to somebody by definition,
 * and an anonymous caller has no `userId` to own one. Without this the writes
 * would land with `userId: undefined` and fail at the foreign key — a 500 for
 * what is really "sign in first".
 *
 * Two verbs on one path instead of a single toggle: the client already knows
 * which state the star is in, and an explicit verb means a retried request
 * lands on the state the user asked for rather than flipping it back.
 */
router.post('/:id/favorite', verifyToken, addFavorite);
router.delete('/:id/favorite', verifyToken, removeFavorite);

export default router;
