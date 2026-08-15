import { PrismaClient } from '@prisma/client';
// Fatigue-model tuning lives in its own module so it can also be applied
// without running the whole seed — see scripts/apply-fatigue-tuning.ts.
import {
  MUSCLE_HALF_LIVES,
  damageFor,
  referenceSpeedFor,
  loadFactorFor,
} from './fatigue-tuning';

const prisma = new PrismaClient();

// ── reference data ─────────────────────────────────────────────────────────
const MODALITIES = ['Strength', 'Calisthenics', 'Cardio', 'WOD', 'Mobility'];
const CATEGORIES = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];
const EQUIPMENT = [
  'Dumbbell', 'Barbell', 'Kettlebell', 'Bodyweight', 'Treadmill', 'Cable Machine',
  'Machine', 'Pull-up Bar', 'Bench', 'Resistance Band', 'Foam Roller', 'Rower',
  'Bike', 'Jump Rope', 'Yoga Mat', 'Plyo Box', 'Medicine Ball', 'EZ Bar', 'Dip Bars',
];

// muscle impact tuple: [muscleName, impactFactor]
type M = [string, number];
interface Ex {
  name: string;
  modality: string;
  description?: string;
  categories?: string[];
  equipment?: string[];
  muscles: M[];
}

// ── exercise catalogue ─────────────────────────────────────────────────────
const EXERCISES: Ex[] = [
  // ══════════════ STRENGTH ══════════════
  // Chest
  { name: 'Bench Press', modality: 'Strength', description: 'Barbell flat bench chest press', categories: ['Chest'], equipment: ['Barbell', 'Bench'], muscles: [['Chest', 1.0], ['Triceps', 0.6], ['Shoulders', 0.5]] },
  { name: 'Incline Bench Press', modality: 'Strength', description: 'Barbell incline press for upper chest', categories: ['Chest'], equipment: ['Barbell', 'Bench'], muscles: [['Chest', 0.95], ['Shoulders', 0.6], ['Triceps', 0.5]] },
  { name: 'Dumbbell Bench Press', modality: 'Strength', description: 'Dumbbell flat bench press', categories: ['Chest'], equipment: ['Dumbbell', 'Bench'], muscles: [['Chest', 0.95], ['Triceps', 0.55]] },
  { name: 'Dumbbell Flyes', modality: 'Strength', description: 'Dumbbell chest flyes', categories: ['Chest'], equipment: ['Dumbbell', 'Bench'], muscles: [['Chest', 0.9]] },
  { name: 'Cable Crossover', modality: 'Strength', description: 'Cable chest fly', categories: ['Chest'], equipment: ['Cable Machine'], muscles: [['Chest', 0.85], ['Shoulders', 0.3]] },
  { name: 'Machine Chest Press', modality: 'Strength', description: 'Seated machine chest press', categories: ['Chest'], equipment: ['Machine'], muscles: [['Chest', 0.9], ['Triceps', 0.5]] },
  // Back
  { name: 'Deadlifts', modality: 'Strength', description: 'Conventional barbell deadlift', categories: ['Back'], equipment: ['Barbell'], muscles: [['Back', 1.0], ['Glutes', 0.8], ['Hamstrings', 0.8], ['Lower Back', 0.9], ['Traps', 0.6]] },
  { name: 'Barbell Row', modality: 'Strength', description: 'Bent-over barbell row', categories: ['Back'], equipment: ['Barbell'], muscles: [['Lats', 0.9], ['Back', 0.85], ['Biceps', 0.5]] },
  { name: 'Bent-Over Dumbbell Row', modality: 'Strength', description: 'Single/double dumbbell row', categories: ['Back'], equipment: ['Dumbbell'], muscles: [['Lats', 0.85], ['Back', 0.8], ['Biceps', 0.5]] },
  { name: 'Lat Pulldown', modality: 'Strength', description: 'Cable lat pulldown', categories: ['Back'], equipment: ['Cable Machine'], muscles: [['Lats', 0.95], ['Biceps', 0.5]] },
  { name: 'Seated Cable Row', modality: 'Strength', description: 'Seated row to the waist', categories: ['Back'], equipment: ['Cable Machine'], muscles: [['Back', 0.85], ['Lats', 0.8], ['Biceps', 0.45]] },
  { name: 'T-Bar Row', modality: 'Strength', description: 'Chest-supported T-bar row', categories: ['Back'], equipment: ['Barbell', 'Machine'], muscles: [['Back', 0.9], ['Lats', 0.85], ['Traps', 0.5]] },
  // Legs
  { name: 'Squats', modality: 'Strength', description: 'Barbell back squat', categories: ['Legs'], equipment: ['Barbell'], muscles: [['Quadriceps', 1.0], ['Glutes', 0.85], ['Hamstrings', 0.7]] },
  { name: 'Leg Press', modality: 'Strength', description: 'Machine leg press', categories: ['Legs'], equipment: ['Machine'], muscles: [['Quadriceps', 0.95], ['Glutes', 0.7]] },
  { name: 'Romanian Deadlift', modality: 'Strength', description: 'Hip-hinge for hamstrings', categories: ['Legs'], equipment: ['Barbell'], muscles: [['Hamstrings', 1.0], ['Glutes', 0.8], ['Lower Back', 0.6]] },
  { name: 'Leg Extension', modality: 'Strength', description: 'Machine knee extension', categories: ['Legs'], equipment: ['Machine'], muscles: [['Quadriceps', 0.9]] },
  { name: 'Leg Curl', modality: 'Strength', description: 'Machine hamstring curl', categories: ['Legs'], equipment: ['Machine'], muscles: [['Hamstrings', 0.9]] },
  { name: 'Bulgarian Split Squat', modality: 'Strength', description: 'Rear-foot-elevated split squat', categories: ['Legs'], equipment: ['Dumbbell'], muscles: [['Quadriceps', 0.9], ['Glutes', 0.85], ['Hamstrings', 0.5]] },
  { name: 'Standing Calf Raise', modality: 'Strength', description: 'Loaded calf raise', categories: ['Legs'], equipment: ['Machine'], muscles: [['Calves', 1.0]] },
  // Shoulders
  { name: 'Shoulder Press', modality: 'Strength', description: 'Overhead barbell/dumbbell press', categories: ['Shoulders'], equipment: ['Barbell', 'Dumbbell'], muscles: [['Shoulders', 1.0], ['Triceps', 0.6]] },
  { name: 'Lateral Raises', modality: 'Strength', description: 'Dumbbell lateral raise', categories: ['Shoulders'], equipment: ['Dumbbell'], muscles: [['Shoulders', 0.95]] },
  { name: 'Arnold Press', modality: 'Strength', description: 'Rotating dumbbell overhead press', categories: ['Shoulders'], equipment: ['Dumbbell'], muscles: [['Shoulders', 0.95], ['Triceps', 0.5]] },
  { name: 'Front Raise', modality: 'Strength', description: 'Dumbbell front raise', categories: ['Shoulders'], equipment: ['Dumbbell'], muscles: [['Shoulders', 0.85]] },
  { name: 'Rear Delt Fly', modality: 'Strength', description: 'Reverse dumbbell fly', categories: ['Shoulders'], equipment: ['Dumbbell'], muscles: [['Shoulders', 0.8], ['Traps', 0.4]] },
  { name: 'Upright Row', modality: 'Strength', description: 'Barbell upright row', categories: ['Shoulders'], equipment: ['Barbell'], muscles: [['Shoulders', 0.85], ['Traps', 0.6]] },
  // Arms
  { name: 'Barbell Curls', modality: 'Strength', description: 'Barbell biceps curl', categories: ['Arms'], equipment: ['Barbell'], muscles: [['Biceps', 1.0], ['Forearms', 0.4]] },
  { name: 'Hammer Curls', modality: 'Strength', description: 'Neutral-grip dumbbell curl', categories: ['Arms'], equipment: ['Dumbbell'], muscles: [['Biceps', 0.9], ['Forearms', 0.6]] },
  { name: 'Preacher Curl', modality: 'Strength', description: 'Preacher bench biceps curl', categories: ['Arms'], equipment: ['EZ Bar', 'Bench'], muscles: [['Biceps', 0.95]] },
  { name: 'Tricep Pushdown', modality: 'Strength', description: 'Cable triceps pushdown', categories: ['Arms'], equipment: ['Cable Machine'], muscles: [['Triceps', 0.95]] },
  { name: 'Skull Crushers', modality: 'Strength', description: 'Lying triceps extension', categories: ['Arms'], equipment: ['EZ Bar', 'Bench'], muscles: [['Triceps', 0.95]] },
  { name: 'Cable Curl', modality: 'Strength', description: 'Standing cable biceps curl', categories: ['Arms'], equipment: ['Cable Machine'], muscles: [['Biceps', 0.9]] },
  // Core (strength)
  { name: 'Cable Crunch', modality: 'Strength', description: 'Kneeling cable crunch', categories: ['Core'], equipment: ['Cable Machine'], muscles: [['Abs', 0.95]] },
  { name: 'Weighted Decline Sit-up', modality: 'Strength', description: 'Decline bench weighted sit-up', categories: ['Core'], equipment: ['Bench', 'Medicine Ball'], muscles: [['Abs', 0.9], ['Obliques', 0.5]] },
  { name: 'Ab Wheel Rollout', modality: 'Strength', description: 'Ab wheel rollout', categories: ['Core'], equipment: ['Machine'], muscles: [['Abs', 0.95], ['Obliques', 0.4]] },

  // ══════════════ CALISTHENICS ══════════════ (compound; browse by modality)
  { name: 'Pull-ups', modality: 'Calisthenics', description: 'Bodyweight pull-up', categories: ['Back'], equipment: ['Pull-up Bar'], muscles: [['Lats', 0.95], ['Back', 0.8], ['Biceps', 0.7]] },
  { name: 'Chin-ups', modality: 'Calisthenics', description: 'Supinated-grip pull-up', categories: ['Back'], equipment: ['Pull-up Bar'], muscles: [['Lats', 0.9], ['Biceps', 0.8]] },
  { name: 'Push-ups', modality: 'Calisthenics', description: 'Standard bodyweight push-up', categories: ['Chest'], equipment: ['Bodyweight'], muscles: [['Chest', 0.85], ['Triceps', 0.6], ['Shoulders', 0.5]] },
  { name: 'Diamond Push-ups', modality: 'Calisthenics', description: 'Close-grip push-up', categories: ['Arms'], equipment: ['Bodyweight'], muscles: [['Triceps', 0.85], ['Chest', 0.6]] },
  { name: 'Pike Push-ups', modality: 'Calisthenics', description: 'Shoulder-focused push-up', categories: ['Shoulders'], equipment: ['Bodyweight'], muscles: [['Shoulders', 0.85], ['Triceps', 0.6]] },
  { name: 'Tricep Dips', modality: 'Calisthenics', description: 'Parallel-bar dips', categories: ['Arms'], equipment: ['Dip Bars'], muscles: [['Triceps', 0.9], ['Chest', 0.6], ['Shoulders', 0.4]] },
  { name: 'Muscle-up', modality: 'Calisthenics', description: 'Pull-up transitioning to dip', categories: ['Back'], equipment: ['Pull-up Bar'], muscles: [['Lats', 0.9], ['Triceps', 0.7], ['Chest', 0.6]] },
  { name: 'Inverted Row', modality: 'Calisthenics', description: 'Horizontal bodyweight row', categories: ['Back'], equipment: ['Barbell'], muscles: [['Back', 0.85], ['Lats', 0.7], ['Biceps', 0.5]] },
  { name: 'Bodyweight Squat', modality: 'Calisthenics', description: 'Air squat', categories: ['Legs'], equipment: ['Bodyweight'], muscles: [['Quadriceps', 0.8], ['Glutes', 0.7]] },
  { name: 'Pistol Squat', modality: 'Calisthenics', description: 'Single-leg squat', categories: ['Legs'], equipment: ['Bodyweight'], muscles: [['Quadriceps', 0.9], ['Glutes', 0.8]] },
  { name: 'Lunges', modality: 'Calisthenics', description: 'Walking lunges', categories: ['Legs'], equipment: ['Bodyweight'], muscles: [['Quadriceps', 0.85], ['Glutes', 0.8], ['Hamstrings', 0.6]] },
  { name: 'Nordic Curl', modality: 'Calisthenics', description: 'Eccentric hamstring curl', categories: ['Legs'], equipment: ['Bodyweight'], muscles: [['Hamstrings', 0.95], ['Glutes', 0.5]] },
  { name: 'Plank', modality: 'Calisthenics', description: 'Front plank hold', categories: ['Core'], equipment: ['Bodyweight'], muscles: [['Abs', 0.9], ['Obliques', 0.6]] },
  { name: 'Hollow Body Hold', modality: 'Calisthenics', description: 'Hollow position isometric', categories: ['Core'], equipment: ['Bodyweight'], muscles: [['Abs', 0.95]] },
  { name: 'Hanging Leg Raise', modality: 'Calisthenics', description: 'Hanging straight-leg raise', categories: ['Core'], equipment: ['Pull-up Bar'], muscles: [['Abs', 0.9], ['Obliques', 0.5]] },
  { name: 'L-Sit Hold', modality: 'Calisthenics', description: 'L-sit isometric hold', categories: ['Core'], equipment: ['Dip Bars'], muscles: [['Abs', 0.95], ['Quadriceps', 0.4]] },
  { name: 'Wall Sit', modality: 'Calisthenics', description: 'Isometric wall sit', categories: ['Legs'], equipment: ['Bodyweight'], muscles: [['Quadriceps', 0.9]] },
  { name: 'Russian Twists', modality: 'Calisthenics', description: 'Seated rotational core', categories: ['Core'], equipment: ['Bodyweight'], muscles: [['Obliques', 0.9], ['Abs', 0.7]] },

  // ══════════════ CARDIO ══════════════ (choose a type; plan a target)
  { name: 'Running', modality: 'Cardio', description: 'Outdoor or treadmill run', equipment: ['Treadmill'], muscles: [['Quadriceps', 0.6], ['Hamstrings', 0.6], ['Calves', 0.7], ['Glutes', 0.5]] },
  { name: 'Walking', modality: 'Cardio', description: 'Brisk walk', equipment: ['Bodyweight'], muscles: [['Calves', 0.4], ['Quadriceps', 0.3]] },
  { name: 'Cycling', modality: 'Cardio', description: 'Road or stationary bike', equipment: ['Bike'], muscles: [['Quadriceps', 0.7], ['Hamstrings', 0.5], ['Glutes', 0.6]] },
  { name: 'Swimming', modality: 'Cardio', description: 'Lap swimming', equipment: ['Bodyweight'], muscles: [['Back', 0.6], ['Shoulders', 0.6], ['Lats', 0.5]] },
  { name: 'Rowing', modality: 'Cardio', description: 'Indoor rowing erg', equipment: ['Rower'], muscles: [['Back', 0.6], ['Quadriceps', 0.5], ['Lats', 0.5]] },
  { name: 'Jump Rope', modality: 'Cardio', description: 'Skipping intervals', equipment: ['Jump Rope'], muscles: [['Calves', 0.7], ['Shoulders', 0.3]] },
  { name: 'Hiking', modality: 'Cardio', description: 'Trail / incline hike', equipment: ['Bodyweight'], muscles: [['Quadriceps', 0.6], ['Glutes', 0.6], ['Calves', 0.6]] },

  // ══════════════ MOBILITY ══════════════ (choose a flow)
  { name: 'Cat-Cow Stretch', modality: 'Mobility', description: 'Dynamic spinal flexion/extension', equipment: ['Yoga Mat'], muscles: [['Back', 0.4], ['Lower Back', 0.4]] },
  { name: 'Foam Rolling', modality: 'Mobility', description: 'Self-myofascial release', equipment: ['Foam Roller'], muscles: [['Quadriceps', 0.3], ['Back', 0.3]] },
  { name: "World's Greatest Stretch", modality: 'Mobility', description: 'Full-body dynamic lunge stretch', equipment: ['Yoga Mat'], muscles: [['Hamstrings', 0.4], ['Glutes', 0.4], ['Back', 0.3]] },
  { name: '90/90 Hip Switch', modality: 'Mobility', description: 'Seated hip internal/external rotation', equipment: ['Yoga Mat'], muscles: [['Glutes', 0.4]] },
  { name: 'Couch Stretch', modality: 'Mobility', description: 'Hip-flexor and quad stretch', equipment: ['Yoga Mat'], muscles: [['Quadriceps', 0.4], ['Glutes', 0.3]] },
  { name: 'Deep Squat Hold', modality: 'Mobility', description: 'Loaded/unloaded deep squat sit', equipment: ['Bodyweight'], muscles: [['Glutes', 0.4], ['Quadriceps', 0.4]] },
  { name: 'Thoracic Opener', modality: 'Mobility', description: 'Bench thoracic extension', equipment: ['Bench'], muscles: [['Back', 0.4], ['Shoulders', 0.3]] },
  { name: 'Hamstring Stretch', modality: 'Mobility', description: 'Static hamstring lengthening', equipment: ['Yoga Mat'], muscles: [['Hamstrings', 0.5]] },
  { name: 'Pigeon Pose', modality: 'Mobility', description: 'Glute and hip external rotation', equipment: ['Yoga Mat'], muscles: [['Glutes', 0.5]] },
  { name: 'Sun Salutation Flow', modality: 'Mobility', description: 'Full-body yoga vinyasa flow', equipment: ['Yoga Mat'], muscles: [['Back', 0.3], ['Hamstrings', 0.3], ['Shoulders', 0.3]] },

  // ══════════════ WOD ══════════════ (movements you plan into a metcon)
  { name: 'Burpees', modality: 'WOD', description: 'Full-body drop-and-jump', equipment: ['Bodyweight'], muscles: [['Chest', 0.6], ['Quadriceps', 0.7], ['Glutes', 0.7], ['Shoulders', 0.5]] },
  { name: 'Thrusters', modality: 'WOD', description: 'Front squat into overhead press', equipment: ['Barbell'], muscles: [['Quadriceps', 0.8], ['Shoulders', 0.7], ['Glutes', 0.6]] },
  { name: 'Wall Balls', modality: 'WOD', description: 'Squat and medicine-ball throw', equipment: ['Medicine Ball'], muscles: [['Quadriceps', 0.7], ['Shoulders', 0.6], ['Glutes', 0.6]] },
  { name: 'Box Jumps', modality: 'WOD', description: 'Explosive jump to a box', equipment: ['Plyo Box'], muscles: [['Quadriceps', 0.7], ['Glutes', 0.7], ['Calves', 0.6]] },
  { name: 'Kettlebell Swings', modality: 'WOD', description: 'Hip-hinge KB swing', equipment: ['Kettlebell'], muscles: [['Glutes', 0.8], ['Hamstrings', 0.7], ['Lower Back', 0.5]] },
  { name: 'Double Unders', modality: 'WOD', description: 'Two rope passes per jump', equipment: ['Jump Rope'], muscles: [['Calves', 0.7], ['Shoulders', 0.4]] },
  { name: 'Toes-to-Bar', modality: 'WOD', description: 'Hanging toes to the bar', equipment: ['Pull-up Bar'], muscles: [['Abs', 0.9], ['Lats', 0.5]] },
  { name: 'Clean and Jerk', modality: 'WOD', description: 'Olympic ground-to-overhead lift', equipment: ['Barbell'], muscles: [['Quadriceps', 0.7], ['Shoulders', 0.7], ['Traps', 0.6], ['Glutes', 0.6]] },
];

async function upsertByName<T extends { id: string }>(
  model: { upsert: (a: any) => Promise<T> },
  name: string,
  extraCreate: Record<string, unknown> = {},
): Promise<T> {
  return model.upsert({
    where: { name },
    update: {},
    create: { name, ...extraCreate },
  });
}

async function main() {
  console.log('Seeding database...');

  // reference tables
  const modalities: Record<string, { id: string }> = {};
  for (const n of MODALITIES) modalities[n] = await upsertByName(prisma.modality, n);

  const categories: Record<string, { id: string }> = {};
  for (const n of CATEGORIES) categories[n] = await upsertByName(prisma.exerciseCategory, n);

  // Recovery half-lives are re-applied on every seed run so tuning them here
  // propagates without a migration.
  const muscles: Record<string, { id: string }> = {};
  for (const [name, recoveryHalfLifeHours] of MUSCLE_HALF_LIVES) {
    muscles[name] = await prisma.muscle.upsert({
      where: { name },
      update: { recoveryHalfLifeHours },
      create: { name, recoveryHalfLifeHours },
    });
  }

  const equipment: Record<string, { id: string }> = {};
  for (const n of EQUIPMENT) equipment[n] = await upsertByName(prisma.equipment, n);

  // exercises + relationships
  // NB: Exercise's name-uniqueness (@@unique([name])) isn't guaranteed to exist
  // as a DB constraint, so we look up by name rather than upsert-on-conflict.
  for (const ex of EXERCISES) {
    const modalityId = modalities[ex.modality].id;
    // Re-applied on every seed run, so tuning the tables above propagates
    // without another migration.
    const damageFactor = damageFor(ex.name, ex.modality);
    const referenceSpeedKmh = referenceSpeedFor(ex.name);
    const loadFactor = loadFactorFor(ex.name);

    const existing = await prisma.exercise.findFirst({ where: { name: ex.name } });
    const exercise = existing
      ? await prisma.exercise.update({
          where: { id: existing.id },
          data: {
            modalityId,
            description: ex.description ?? null,
            damageFactor,
            referenceSpeedKmh,
            loadFactor,
          },
        })
      : await prisma.exercise.create({
          data: {
            name: ex.name,
            modalityId,
            description: ex.description ?? null,
            damageFactor,
            referenceSpeedKmh,
            loadFactor,
          },
        });

    for (const catName of ex.categories ?? []) {
      const categoryId = categories[catName].id;
      await prisma.exerciseCategoryMap.upsert({
        where: { exerciseId_categoryId: { exerciseId: exercise.id, categoryId } },
        update: {},
        create: { exerciseId: exercise.id, categoryId },
      });
    }

    for (const [muscleName, impactFactor] of ex.muscles) {
      const muscleId = muscles[muscleName].id;
      await prisma.muscleExercise.upsert({
        where: { muscleId_exerciseId: { muscleId, exerciseId: exercise.id } },
        update: { impactFactor },
        create: { muscleId, exerciseId: exercise.id, impactFactor },
      });
    }

    for (const eqName of ex.equipment ?? []) {
      const equipmentId = equipment[eqName].id;
      await prisma.equipmentExercise.upsert({
        where: { equipmentId_exerciseId: { equipmentId, exerciseId: exercise.id } },
        update: {},
        create: { equipmentId, exerciseId: exercise.id },
      });
    }
  }

  // counts per modality for a quick sanity check
  for (const n of MODALITIES) {
    const count = await prisma.exercise.count({ where: { modality: { name: n } } });
    console.log(`  ${n}: ${count} exercises`);
  }
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
