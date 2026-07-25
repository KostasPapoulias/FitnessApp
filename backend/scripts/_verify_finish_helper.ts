/**
 * Invokes the real finishSession controller with a minimal req/res pair, so the
 * verification exercises the shipped code path rather than a copy of its maths.
 */
import { PrismaClient } from '@prisma/client'
import { finishSession } from '../src/controllers/workout.controller'

export async function finishViaController(
  _prisma: PrismaClient,
  userId: string,
  sessionId: string,
  duration: number
): Promise<any> {
  return new Promise((resolve, reject) => {
    const req: any = { params: { id: sessionId }, body: { duration }, userId }
    const res: any = {
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this },
      json(payload: any) {
        if (payload?.success) resolve(payload.data)
        else reject(new Error(`controller returned ${this.statusCode}: ${payload?.error}`))
        return this
      },
    }
    finishSession(req, res).catch(reject)
  })
}
