import { PrismaClient, Prisma } from '@prisma/client';
// Seeds the reference tables and the exercise catalogue; safe to re-run.
// Tuning also applies on its own via scripts/apply-fatigue-tuning.ts.
import {
  MUSCLE_HALF_LIVES,
  DAMAGE_OVERRIDES,
  LOAD_FACTORS,
  REFERENCE_SPEED_KMH,
  CARDIO_TRACKING,
  REFERENCE_CADENCE_RPM,
  REP_UNITS,
  damageFor,
  referenceSpeedFor,
  loadFactorFor,
  cardioTrackingFor,
  referenceCadenceFor,
  repUnitFor,
} from './fatigue-tuning';
// The catalogue content.
import {
  MODALITIES,
  CATEGORIES,
  EQUIPMENT,
  EXERCISES,
  RENAMES,
} from './exercise-catalogue';

const prisma = new PrismaClient();

// ── batching ───────────────────────────────────────────────────────────────
// The database is remote, so reads and writes are done in bulk, and per-row
// updates go as pipelined array transactions.
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
// Unknown muscle names or tuning keys fail silently, so they are checked here.
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

  // Not fatal, but usually a half-applied rename
  const strays = [
    ...Object.keys(DAMAGE_OVERRIDES).map(name => ['damage', name] as const),
    ...Object.keys(LOAD_FACTORS).map(name => ['loadFactor', name] as const),
    ...Object.keys(REFERENCE_SPEED_KMH).map(name => ['referenceSpeed', name] as const),
    ...Object.keys(CARDIO_TRACKING).map(name => ['cardioTracking', name] as const),
    ...Object.keys(REFERENCE_CADENCE_RPM).map(name => ['referenceCadence', name] as const),
    ...Object.keys(REP_UNITS).map(name => ['repUnit', name] as const),
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
    // Half-lives are re-applied every run, so tuning needs no migration
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
// Renamed in place so every set, estimate and template keeps its exercise id.
const applyRenames = async (): Promise<number> => {
  const names = RENAMES.flat();
  const rows = await prisma.exercise.findMany({
    where: { name: { in: names }, createdByUserId: null },
    select: { id: true, name: true },
  });
  const byName = new Map(rows.map(r => [r.name, r.id]));

  const renames = RENAMES
    // Only when the old name exists and the new one does not (idempotent)
    .filter(([from, to]) => byName.has(from) && !byName.has(to))
    .map(([from, to]) =>
      prisma.exercise.update({ where: { id: byName.get(from)! }, data: { name: to } }));

  await runBatched(renames);
  return renames.length;
};

// ── exercises ──────────────────────────────────────────────────────────────
const seedExercises = async (modalities: Map<string, string>) => {
  // Scoped to catalogue rows (createdByUserId null), so a user's custom
  // exercise with the same name is never touched
  const existing = await prisma.exercise.findMany({
    where: { name: { in: EXERCISES.map(e => e.name) }, createdByUserId: null },
    select: {
      id: true, name: true, modalityId: true, description: true,
      damageFactor: true, referenceSpeedKmh: true, loadFactor: true,
      cardioTracking: true, referenceCadenceRpm: true, repUnit: true,
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
    cardioTracking: cardioTrackingFor(ex.name),
    referenceCadenceRpm: referenceCadenceFor(ex.name),
    repUnit: repUnitFor(ex.name),
  }));

  const missing = desired.filter(d => !byName.has(d.name));
  if (missing.length) await prisma.exercise.createMany({ data: missing });

  // Only rows that differ, so an unchanged re-run writes nothing
  const changed = desired.filter(d => {
    const row = byName.get(d.name);
    if (!row) return false;
    return row.modalityId !== d.modalityId
      || row.description !== d.description
      || row.damageFactor !== d.damageFactor
      || row.referenceSpeedKmh !== d.referenceSpeedKmh
      || row.loadFactor !== d.loadFactor
      || row.cardioTracking !== d.cardioTracking
      || row.referenceCadenceRpm !== d.referenceCadenceRpm
      || row.repUnit !== d.repUnit;
  });

  await runBatched(changed.map(d => prisma.exercise.update({
    where: { id: byName.get(d.name)!.id },
    data: {
      modalityId: d.modalityId,
      description: d.description,
      damageFactor: d.damageFactor,
      referenceSpeedKmh: d.referenceSpeedKmh,
      loadFactor: d.loadFactor,
      cardioTracking: d.cardioTracking,
      referenceCadenceRpm: d.referenceCadenceRpm,
      repUnit: d.repUnit,
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

// ── media ──────────────────────────────────────────────────────────────────
// One Media row per exercise with artwork; both URLs derive from its media id.
// Rows the catalogue no longer wants are deleted.
const seedMedia = async (exerciseIds: Map<string, string>) => {
  const want = new Map<string, { thumbnailUrl: string; videoUrl: string }>();
  for (const ex of EXERCISES) {
    const id = exerciseIds.get(ex.name);
    if (!id || !ex.media) continue;
    // Relative URLs: the frontend serves thumbnails, and a Netlify proxy
    // forwards /exercise-media to the backend
    want.set(id, {
      thumbnailUrl: `/exercises/${ex.media}.jpg`,
      videoUrl: `/exercise-media/${ex.media}.gif`,
    });
  }

  const managedIds = [...exerciseIds.values()];
  const existing = await prisma.media.findMany({
    where: { exerciseId: { in: managedIds } },
    select: { id: true, exerciseId: true, thumbnailUrl: true, videoUrl: true },
  });

  const seen = new Set<string>();
  const stale: string[] = [];
  const updates: Prisma.PrismaPromise<unknown>[] = [];

  for (const row of existing) {
    const target = want.get(row.exerciseId);
    // Unwanted or duplicate rows are removed
    if (!target || seen.has(row.exerciseId)) { stale.push(row.id); continue; }
    seen.add(row.exerciseId);
    if (row.thumbnailUrl !== target.thumbnailUrl || row.videoUrl !== target.videoUrl) {
      updates.push(prisma.media.update({ where: { id: row.id }, data: target }));
    }
  }

  const created = [...want.entries()]
    .filter(([exerciseId]) => !seen.has(exerciseId))
    .map(([exerciseId, urls]) => ({ exerciseId, ...urls }));

  if (stale.length) await prisma.media.deleteMany({ where: { id: { in: stale } } });
  if (created.length) await prisma.media.createMany({ data: created });
  await runBatched(updates);

  return { created: created.length, updated: updates.length, removed: stale.length };
};

// ── links ──────────────────────────────────────────────────────────────────
// The catalogue is authoritative: stale muscle/category/equipment links are deleted.
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
  // impactFactor is tuning, so existing links are compared, not just counted
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

  const media = await seedMedia(exercises.ids);
  const withArt = EXERCISES.filter(e => e.media).length;
  console.log(`  media: ${media.created} created, ${media.updated} updated, ${media.removed} removed` +
    ` — ${withArt} of ${EXERCISES.length} exercises have artwork`);

  // Counts per modality, as a sanity check
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
