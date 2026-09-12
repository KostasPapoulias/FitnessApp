import { writeFileSync } from 'fs'
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

/**
 * One-off: re-join routes shredded by the simplify-before-segment bug.
 *
 * Safe only because the evidence says so per run — joining the fragments end to
 * end recovers ~100% of the distance the run logged, which means no time was
 * ever missing, only points. A run with a REAL recording gap would come out
 * well short, and merging that one would draw a line the athlete never ran.
 *
 * Run with:  npx tsx repair-routes.ts <backup.json> [setId]
 * Nothing is written until the backup file exists on disk.
 */
const COVERAGE_MIN = 0.9

const R = 6371008.8
const rad = (d: number) => (d * Math.PI) / 180
const hav = (a: [number, number], b: [number, number]) => {
  const dLat = rad(b[1] - a[1])
  const dLng = rad(b[0] - a[0])
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2
  )))
}

const backupPath = process.argv[2]
const only = process.argv[3]

const main = async () => {
  if (!backupPath) throw new Error('usage: repair-routes.ts <backup.json> [setId]')

  const all = await prisma.runTrack.findMany({ orderBy: { startedAt: 'desc' } })
  writeFileSync(
    backupPath,
    JSON.stringify(all.map(t => ({ setId: t.setId, startedAt: t.startedAt, route: t.route, bounds: t.bounds })), null, 2)
  )
  console.log(`backed up ${all.length} routes -> ${backupPath}`)

  for (const t of all) {
    if (only && t.setId !== only) continue
    const day = t.startedAt.toISOString().slice(0, 10)
    const route = (t.route as unknown as [number, number][][]) ?? []
    if (route.length < 2) {
      console.log(`skip ${day} — ${route.length} segment(s), nothing to merge`)
      continue
    }

    const flat = route.flat()
    let joined = 0
    for (let i = 1; i < flat.length; i++) joined += hav(flat[i - 1], flat[i])
    const coverage = t.distanceM > 0 ? joined / t.distanceM : 0

    if (coverage < COVERAGE_MIN) {
      console.log(`skip ${day} — joins to only ${Math.round(coverage * 100)}% of ${Math.round(t.distanceM)}m, may be a real gap`)
      continue
    }

    await prisma.runTrack.update({ where: { setId: t.setId }, data: { route: [flat] } })
    console.log(`merged ${day} — ${route.length} segments -> 1, ${flat.length} points, ${Math.round(coverage * 100)}% coverage`)
  }
}

main().finally(() => prisma.$disconnect())
