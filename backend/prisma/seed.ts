import { PrismaClient, Prisma } from '@prisma/client';
// Fatigue-model tuning lives in its own module so it can also be applied
// without running the whole seed — see scripts/apply-fatigue-tuning.ts.
import {
  MUSCLE_HALF_LIVES,
  DAMAGE_OVERRIDES,
  LOAD_FACTORS,
  REFERENCE_SPEED_KMH,
  damageFor,
  referenceSpeedFor,
  loadFactorFor,
} from './fatigue-tuning';
// The catalogue itself — content, edited far more often than this file.
import {
  MODALITIES,
  CATEGORIES,
  EQUIPMENT,
  EXERCISES,
  RENAMES,
} from './exercise-catalogue';

const prisma = new PrismaClient();

// ── batching ───────────────────────────────────────────────────────────────
// The dev database is remote, so a round trip costs ~290 ms. The catalogue is
// past 160 exercises with roughly 800 links between them; one statement each,
// sent one at a time, is around ten minutes of pure network latency and a
// connection the proxy will drop long before the end (P1017).
//
// So: read in bulk, write in bulk, and send the unavoidable per-row updates as
// array transactions, which Prisma pipelines into a single request.
const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const runBatched = async (
  ops: Prisma.PrismaPromise<unknown>[],
  size = 50,
): Promise<void> => {
  for (const batch of chunk(ops, size)) await prisma.$transaction(batch);
};

// ── validation ─────────────────────────────────────────────────────────────
// Every one of these has a silent failure mode. A muscle name that does not
// exist means the link is never created and the movement quietly stops feeding
// the fatigue model; a tuning key that matches nothing leaves the exercise on
// its modality default. Both look exactly like working software.
const validateCatalogue = (): void => {
  const problems: string[] = [];
  const muscleNames = new Set(MUSCLE_HALF_LIVES.map(([name]) => name));
  const seen = new Set<string>();

  for (const ex of EXERCISES) {
    if (seen.has(ex.name)) problems.push(`duplicate exercise: ${ex.name}`);
    seen.add(ex.name);

    if (!MODALITIES.includes(ex.modality)) {
      problems.push(`${ex.name}: unknown modality "${ex.modality}"`);
    }
    if (!ex.description?.trim()) {
      problems.push(`${ex.name}: no description`);
    }
    if (ex.muscles.length === 0) {
      problems.push(`${ex.name}: no muscle links — it would log no fatigue at all`);
    }
    for (const [muscle, impact] of ex.muscles) {
      if (!muscleNames.has(muscle)) problems.push(`${ex.name}: unknown muscle "${muscle}"`);
      if (impact <= 0 || impact > 1) problems.push(`${ex.name}: impactFactor ${impact} for ${muscle} is outside 0–1`);
    }
    for (const category of ex.categories ?? []) {
      if (!CATEGORIES.includes(category)) problems.push(`${ex.name}: unknown category "${category}"`);
    }
    for (const item of ex.equipment ?? []) {
      if (!EQUIPMENT.includes(item)) problems.push(`${ex.name}: unknown equipment "${item}"`);
    }
  }

  for (const [from, to] of RENAMES) {
    if (!seen.has(to)) problems.push(`rename ${from} → ${to}: "${to}" is not in the catalogue`);
    if (seen.has(from)) problems.push(`rename ${from} → ${to}: "${from}" is still in the catalogue`);
  }

  if (problems.length) {
    throw new Error(`Catalogue is inconsistent:\n  ${problems.join('\n  ')}`);
  }

  // Not fatal — a stray tuning key does no harm beyond doing nothing — but it
  // is almost always a rename that was only half applied, so say so loudly.
  const strays = [
    ...Object.keys(DAMAGE_OVERRIDES).map(name => ['damage', name] as const),
    ...Object.keys(LOAD_FACTORS).map(name => ['loadFactor', name] as const),
    ...Object.keys(REFERENCE_SPEED_KMH).map(name => ['referenceSpeed', name] as const),
  ].filter(([, name]) => !seen.has(name));

  for (const [table, name] of strays) {
    console.warn(`  ! ${table} tuning for "${name}" matches no exercise — it will never be applied`);
  }
};

// ── reference tables ───────────────────────────────────────────────────────
const seedReferenceTables = async () => {
  await runBatched([
    ...MODALITIES.map(name =>
      prisma.modality.upsert({ where: { name }, update: {}, create: { name } })),
    ...CATEGORIES.map(name =>
      prisma.exerciseCategory.upsert({ where: { name }, update: {}, create: { name } })),
    ...EQUIPMENT.map(name =>
      prisma.equipment.upsert({ where: { name }, update: {}, create: { name } })),
    // Recovery half-lives are re-applied on every seed run so tuning them
    // propagates without a migration.
    ...MUSCLE_HALF_LIVES.map(([name, recoveryHalfLifeHours]) =>
      prisma.muscle.upsert({
        where: { name },
        update: { recoveryHalfLifeHours },
        create: { name, recoveryHalfLifeHours },
      })),
  ]);

  const [modalities, categories, equipment, muscles] = await Promise.all([
    prisma.modality.findMany({ select: { id: true, name: true } }),
    prisma.exerciseCategory.findMany({ select: { id: true, name: true } }),
    prisma.equipment.findMany({ select: { id: true, name: true } }),
    prisma.muscle.findMany({ select: { id: true, name: true } }),
  ]);

  const byName = (rows: { id: string; name: string }[]) =>
    new Map(rows.map(r => [r.name, r.id]));

  return {
    modalities: byName(modalities),
    categories: byName(categories),
    equipment: byName(equipment),
    muscles: byName(muscles),
  };
};

// ── renames ────────────────────────────────────────────────────────────────
// An Exercise id is referenced by every logged set, strength estimate and
// template that ever used it. Renaming in place keeps all of that; adding the
// new name as a fresh row would orphan the athlete's history behind a name
// they can no longer find, and leave a duplicate in the list.
const applyRenames = async (): Promise<number> => {
  const names = RENAMES.flat();
  const rows = await prisma.exercise.findMany({
    where: { name: { in: names }, createdByUserId: null },
    select: { id: true, name: true },
  });
  const byName = new Map(rows.map(r => [r.name, r.id]));

  const renames = RENAMES
    // Only when the old name is there and the new one is not: a second run is
    // then a no-op, and a row someone created by hand is never overwritten.
    .filter(([from, to]) => byName.has(from) && !byName.has(to))
    .map(([from, to]) =>
      prisma.exercise.update({ where: { id: byName.get(from)! }, data: { name: to } }));

  await runBatched(renames);
  return renames.length;
};

// ── exercises ──────────────────────────────────────────────────────────────
const seedExercises = async (modalities: Map<string, string>) => {
  // Scoped to createdByUserId: null throughout. Exercise.name is unique in the
  // schema but has no index behind it in the database, so a user's own custom
  // exercise can legitimately share a name with a catalogue one — and a
  // findFirst that ignored the owner would rewrite theirs.
  const existing = await prisma.exercise.findMany({
    where: { name: { in: EXERCISES.map(e => e.name) }, createdByUserId: null },
    select: {
      id: true, name: true, modalityId: true, description: true,
      damageFactor: true, referenceSpeedKmh: true, loadFactor: true,
    },
  });
  const byName = new Map(existing.map(e => [e.name, e]));

  const desired = EXERCISES.map(ex => ({
    name: ex.name,
    modalityId: modalities.get(ex.modality)!,
    description: ex.description,
    damageFactor: damageFor(ex.name, ex.modality),
    referenceSpeedKmh: referenceSpeedFor(ex.name),
    loadFactor: loadFactorFor(ex.name),
  }));

  const missing = desired.filter(d => !byName.has(d.name));
  if (missing.length) await prisma.exercise.createMany({ data: missing });

  // Only the rows that actually differ, so a re-run of an unchanged catalogue
  // costs one read and nothing else.
  const changed = desired.filter(d => {
    const row = byName.get(d.name);
    if (!row) return false;
    return row.modalityId !== d.modalityId
      || row.description !== d.description
      || row.damageFactor !== d.damageFactor
      || row.referenceSpeedKmh !== d.referenceSpeedKmh
      || row.loadFactor !== d.loadFactor;
  });

  await runBatched(changed.map(d => prisma.exercise.update({
    where: { id: byName.get(d.name)!.id },
    data: {
      modalityId: d.modalityId,
      description: d.description,
      damageFactor: d.damageFactor,
      referenceSpeedKmh: d.referenceSpeedKmh,
      loadFactor: d.loadFactor,
    },
  })));

  const rows = await prisma.exercise.findMany({
    where: { name: { in: EXERCISES.map(e => e.name) }, createdByUserId: null },
    select: { id: true, name: true },
  });

  return {
    ids: new Map(rows.map(r => [r.name, r.id])),
    created: missing.length,
    updated: changed.length,
  };
};

// ── links ──────────────────────────────────────────────────────────────────
// Stale links are deleted, not just left behind. The seed is the authority on
// what a catalogue exercise needs, and it has to be able to take something
// away: 'Barbell Overhead Press' was tagged Barbell AND Dumbbell, which under
// canPerform's all-of rule meant it needed both, and no amount of upserting
// would have removed the wrong one.
const seedLinks = async (
  exerciseIds: Map<string, string>,
  ref: { categories: Map<string, string>; muscles: Map<string, string>; equipment: Map<string, string> },
) => {
  const managedIds = [...exerciseIds.values()];
  const key = (a: string, b: string) => `${a}::${b}`;

  const wantCategories = new Map<string, { exerciseId: string; categoryId: string }>();
  const wantMuscles = new Map<string, { muscleId: string; exerciseId: string; impactFactor: number }>();
  const wantEquipment = new Map<string, { equipmentId: string; exerciseId: string }>();

  for (const ex of EXERCISES) {
    const exerciseId = exerciseIds.get(ex.name)!;
    for (const name of ex.categories ?? []) {
      const categoryId = ref.categories.get(name)!;
      wantCategories.set(key(exerciseId, categoryId), { exerciseId, categoryId });
    }
    for (const [name, impactFactor] of ex.muscles) {
      const muscleId = ref.muscles.get(name)!;
      wantMuscles.set(key(exerciseId, muscleId), { muscleId, exerciseId, impactFactor });
    }
    for (const name of ex.equipment ?? []) {
      const equipmentId = ref.equipment.get(name)!;
      wantEquipment.set(key(exerciseId, equipmentId), { equipmentId, exerciseId });
    }
  }

  const [haveCategories, haveMuscles, haveEquipment] = await Promise.all([
    prisma.exerciseCategoryMap.findMany({ where: { exerciseId: { in: managedIds } } }),
    prisma.muscleExercise.findMany({ where: { exerciseId: { in: managedIds } } }),
    prisma.equipmentExercise.findMany({ where: { exerciseId: { in: managedIds } } }),
  ]);

  const staleCategories = haveCategories.filter(l => !wantCategories.has(key(l.exerciseId, l.categoryId)));
  const staleMuscles = haveMuscles.filter(l => !wantMuscles.has(key(l.exerciseId, l.muscleId)));
  const staleEquipment = haveEquipment.filter(l => !wantEquipment.has(key(l.exerciseId, l.equipmentId)));

  const haveCategoryKeys = new Set(haveCategories.map(l => key(l.exerciseId, l.categoryId)));
  const haveEquipmentKeys = new Set(haveEquipment.map(l => key(l.exerciseId, l.equipmentId)));
  // impactFactor is tuning, so an existing muscle link still has to be checked
  // rather than merely counted as present.
  const haveMuscleFactors = new Map(haveMuscles.map(l => [key(l.exerciseId, l.muscleId), l.impactFactor]));

  const newCategories = [...wantCategories.values()].filter(l => !haveCategoryKeys.has(key(l.exerciseId, l.categoryId)));
  const newEquipment = [...wantEquipment.values()].filter(l => !haveEquipmentKeys.has(key(l.exerciseId, l.equipmentId)));
  const newMuscles = [...wantMuscles.values()].filter(l => !haveMuscleFactors.has(key(l.exerciseId, l.muscleId)));
  const retunedMuscles = [...wantMuscles.values()].filter(l => {
    const current = haveMuscleFactors.get(key(l.exerciseId, l.muscleId));
    return current !== undefined && current !== l.impactFactor;
  });

  await Promise.all([
    newCategories.length ? prisma.exerciseCategoryMap.createMany({ data: newCategories }) : null,
    newMuscles.length ? prisma.muscleExercise.createMany({ data: newMuscles }) : null,
    newEquipment.length ? prisma.equipmentExercise.createMany({ data: newEquipment }) : null,
  ]);

  await runBatched(retunedMuscles.map(l => prisma.muscleExercise.update({
    where: { muscleId_exerciseId: { muscleId: l.muscleId, exerciseId: l.exerciseId } },
    data: { impactFactor: l.impactFactor },
  })));

  await Promise.all([
    staleCategories.length
      ? prisma.exerciseCategoryMap.deleteMany({
          where: { OR: staleCategories.map(({ exerciseId, categoryId }) => ({ exerciseId, categoryId })) },
        })
      : null,
    staleMuscles.length
      ? prisma.muscleExercise.deleteMany({
          where: { OR: staleMuscles.map(({ exerciseId, muscleId }) => ({ exerciseId, muscleId })) },
        })
      : null,
    staleEquipment.length
      ? prisma.equipmentExercise.deleteMany({
          where: { OR: staleEquipment.map(({ exerciseId, equipmentId }) => ({ exerciseId, equipmentId })) },
        })
      : null,
  ]);

  return {
    created: newCategories.length + newMuscles.length + newEquipment.length,
    retuned: retunedMuscles.length,
    removed: staleCategories.length + staleMuscles.length + staleEquipment.length,
  };
};

async function main() {
  console.log('Seeding database...');
  validateCatalogue();

  const ref = await seedReferenceTables();

  const renamed = await applyRenames();
  if (renamed) console.log(`  renamed ${renamed} exercise${renamed === 1 ? '' : 's'} in place`);

  const exercises = await seedExercises(ref.modalities);
  console.log(`  exercises: ${exercises.created} created, ${exercises.updated} updated, ${EXERCISES.length} total in the catalogue`);

  const links = await seedLinks(exercises.ids, ref);
  console.log(`  links: ${links.created} created, ${links.retuned} retuned, ${links.removed} removed`);

  // counts per modality for a quick sanity check
  const counts = await Promise.all(MODALITIES.map(async name => [
    name,
    await prisma.exercise.count({ where: { modality: { name }, createdByUserId: null } }),
  ] as const));
  for (const [name, count] of counts) console.log(`  ${name}: ${count} exercises`);

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
