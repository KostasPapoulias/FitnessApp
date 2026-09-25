/** Request shapes for the fatigue endpoints. */

import { z } from '../lib/validate'

/** A manual fatigue override, 0–100. */
export const overrideFatigueSchema = z.object({
  fatigueLevel: z.number().min(0).max(100),
})
