/** A crash reported by the frontend error boundary. Every field is bounded. */

import { z } from '../lib/validate'

export const clientErrorSchema = z.object({
  message: z.string().trim().min(1).max(500),
  name: z.string().trim().max(100).nullish(),
  stack: z.string().max(8000).nullish(),
  /** The route the user was on. */
  route: z.string().trim().max(200).nullish(),
  componentStack: z.string().max(4000).nullish(),
  /** Which error boundary caught it; 'root' means the launch gate itself. */
  boundary: z.string().trim().max(40).nullish(),
  appVersion: z.string().trim().max(60).nullish(),
})
