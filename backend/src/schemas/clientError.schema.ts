/**
 * A crash reported by the frontend error boundary.
 *
 * Every field is bounded because this endpoint is reachable without much
 * ceremony, and an unbounded string field on a logging endpoint is a way to
 * fill a log bill. A truncated stack is still a usable stack; a 2 MB one is a
 * denial-of-wallet.
 */

import { z } from '../lib/validate'

export const clientErrorSchema = z.object({
  message: z.string().trim().min(1).max(500),
  name: z.string().trim().max(100).nullish(),
  /** Roughly 40 frames — past that the useful part is long gone. */
  stack: z.string().max(8000).nullish(),
  /** The route the user was on. Usually the whole diagnosis. */
  route: z.string().trim().max(200).nullish(),
  /** React's own component stack, when the boundary has one. */
  componentStack: z.string().max(4000).nullish(),
  /**
   * Which boundary caught it. 'root' means the crash was in the launch gate
   * itself and no page-level boundary was reachable — a materially worse
   * failure than one page throwing, and worth being able to filter on.
   */
  boundary: z.string().trim().max(40).nullish(),
  appVersion: z.string().trim().max(60).nullish(),
})
