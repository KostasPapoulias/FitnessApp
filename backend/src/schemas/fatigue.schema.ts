/**
 * Request shapes for the fatigue endpoints.
 */

import { z } from '../lib/validate'

/**
 * A manual fatigue override.
 *
 * The check this replaces was `if (fatigueLevel < 0 || fatigueLevel > 100)`,
 * which passes anything that is not a number at all: `undefined < 0` is false
 * and `undefined > 100` is false, so an absent field sailed through and reached
 * Prisma, and `'80' > 100` is false, so a string reached it too. Requiring the
 * type before the range is the whole point.
 */
export const overrideFatigueSchema = z.object({
  fatigueLevel: z.number().min(0).max(100),
})
