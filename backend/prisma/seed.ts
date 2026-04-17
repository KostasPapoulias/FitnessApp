import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create Modalities
  const strengthModality = await prisma.modality.upsert({
    where: { name: 'Strength' },
    update: {},
    create: { name: 'Strength' },
  });

  const calisthenicsModality = await prisma.modality.upsert({
    where: { name: 'Calisthenics' },
    update: {},
    create: { name: 'Calisthenics' },
  });

  const cardioModality = await prisma.modality.upsert({
    where: { name: 'Cardio' },
    update: {},
    create: { name: 'Cardio' },
  });

  const wodModality = await prisma.modality.upsert({
    where: { name: 'WOD' },
    update: {},
    create: { name: 'WOD' },
  });

  const mobilityModality = await prisma.modality.upsert({
    where: { name: 'Mobility' },
    update: {},
    create: { name: 'Mobility' },
  });

  // Create Exercise Categories
  const chestCategory = await prisma.exerciseCategory.upsert({
    where: { name: 'Chest' },
    update: {},
    create: { name: 'Chest' },
  });

  const backCategory = await prisma.exerciseCategory.upsert({
    where: { name: 'Back' },
    update: {},
    create: { name: 'Back' },
  });

  const legsCategory = await prisma.exerciseCategory.upsert({
    where: { name: 'Legs' },
    update: {},
    create: { name: 'Legs' },
  });

  const shouldersCategory = await prisma.exerciseCategory.upsert({
    where: { name: 'Shoulders' },
    update: {},
    create: { name: 'Shoulders' },
  });

  const armsCategory = await prisma.exerciseCategory.upsert({
    where: { name: 'Arms' },
    update: {},
    create: { name: 'Arms' },
  });

  const coreCategory = await prisma.exerciseCategory.upsert({
    where: { name: 'Core' },
    update: {},
    create: { name: 'Core' },
  });

  // Create Muscles
  const muscles = await Promise.all([
    prisma.muscle.upsert({
      where: { name: 'Chest' },
      update: {},
      create: { name: 'Chest' },
    }),
    prisma.muscle.upsert({
      where: { name: 'Back' },
      update: {},
      create: { name: 'Back' },
    }),
    prisma.muscle.upsert({
      where: { name: 'Quadriceps' },
      update: {},
      create: { name: 'Quadriceps' },
    }),
    prisma.muscle.upsert({
      where: { name: 'Hamstrings' },
      update: {},
      create: { name: 'Hamstrings' },
    }),
    prisma.muscle.upsert({
      where: { name: 'Glutes' },
      update: {},
      create: { name: 'Glutes' },
    }),
    prisma.muscle.upsert({
      where: { name: 'Shoulders' },
      update: {},
      create: { name: 'Shoulders' },
    }),
    prisma.muscle.upsert({
      where: { name: 'Biceps' },
      update: {},
      create: { name: 'Biceps' },
    }),
    prisma.muscle.upsert({
      where: { name: 'Triceps' },
      update: {},
      create: { name: 'Triceps' },
    }),
    prisma.muscle.upsert({
      where: { name: 'Forearms' },
      update: {},
      create: { name: 'Forearms' },
    }),
    prisma.muscle.upsert({
      where: { name: 'Abs' },
      update: {},
      create: { name: 'Abs' },
    }),
    prisma.muscle.upsert({
      where: { name: 'Calves' },
      update: {},
      create: { name: 'Calves' },
    }),
    prisma.muscle.upsert({
      where: { name: 'Lats' },
      update: {},
      create: { name: 'Lats' },
    }),
    prisma.muscle.upsert({
      where: { name: 'Traps' },
      update: {},
      create: { name: 'Traps' },
    }),
    prisma.muscle.upsert({
      where: { name: 'Obliques' },
      update: {},
      create: { name: 'Obliques' },
    }),
    prisma.muscle.upsert({
      where: { name: 'Lower Back' },
      update: {},
      create: { name: 'Lower Back' },
    }),
  ]);

  // Create Equipment
  const dumbbell = await prisma.equipment.upsert({
    where: { name: 'Dumbbell' },
    update: {},
    create: { name: 'Dumbbell', description: 'Free weight for strength training' },
  });

  const barbell = await prisma.equipment.upsert({
    where: { name: 'Barbell' },
    update: {},
    create: { name: 'Barbell', description: 'Long bar with weight plates' },
  });

  const kettlebell = await prisma.equipment.upsert({
    where: { name: 'Kettlebell' },
    update: {},
    create: { name: 'Kettlebell', description: 'Cannonball weight with handle' },
  });

  const bodyweight = await prisma.equipment.upsert({
    where: { name: 'Bodyweight' },
    update: {},
    create: { name: 'Bodyweight', description: 'No equipment needed' },
  });

  const treadmill = await prisma.equipment.upsert({
    where: { name: 'Treadmill' },
    update: {},
    create: { name: 'Treadmill', description: 'Running machine' },
  });

  // Create Exercises (20 total)
  const exercises = [
    // Strength - Chest
    {
      name: 'Bench Press',
      modalityId: strengthModality.id,
      description: 'Barbell chest press',
      categories: [chestCategory.id],
      equipment: [barbell.id],
      muscles: [{ muscleId: muscles[0].id, impactFactor: 1.0 }],
    },
    {
      name: 'Dumbbell Flyes',
      modalityId: strengthModality.id,
      description: 'Dumbbell chest flyes',
      categories: [chestCategory.id],
      equipment: [dumbbell.id],
      muscles: [{ muscleId: muscles[0].id, impactFactor: 0.9 }],
    },
    // Back
    {
      name: 'Deadlifts',
      modalityId: strengthModality.id,
      description: 'Barbell deadlifts',
      categories: [backCategory.id],
      equipment: [barbell.id],
      muscles: [
        { muscleId: muscles[1].id, impactFactor: 1.0 },
        { muscleId: muscles[4].id, impactFactor: 0.8 },
        { muscleId: muscles[14].id, impactFactor: 0.7 },
      ],
    },
    {
      name: 'Pull-ups',
      modalityId: calisthenicsModality.id,
      description: 'Bodyweight pull-ups',
      categories: [backCategory.id],
      equipment: [bodyweight.id],
      muscles: [
        { muscleId: muscles[1].id, impactFactor: 0.95 },
        { muscleId: muscles[6].id, impactFactor: 0.8 },
      ],
    },
    // Legs
    {
      name: 'Squats',
      modalityId: strengthModality.id,
      description: 'Barbell back squats',
      categories: [legsCategory.id],
      equipment: [barbell.id],
      muscles: [
        { muscleId: muscles[2].id, impactFactor: 1.0 },
        { muscleId: muscles[3].id, impactFactor: 0.8 },
        { muscleId: muscles[4].id, impactFactor: 0.85 },
      ],
    },
    {
      name: 'Leg Press',
      modalityId: strengthModality.id,
      description: 'Machine leg press',
      categories: [legsCategory.id],
      equipment: [],
      muscles: [
        { muscleId: muscles[2].id, impactFactor: 0.95 },
        { muscleId: muscles[4].id, impactFactor: 0.8 },
      ],
    },
    {
      name: 'Lunges',
      modalityId: calisthenicsModality.id,
      description: 'Walking lunges',
      categories: [legsCategory.id],
      equipment: [dumbbell.id],
      muscles: [
        { muscleId: muscles[2].id, impactFactor: 0.9 },
        { muscleId: muscles[3].id, impactFactor: 0.85 },
        { muscleId: muscles[4].id, impactFactor: 0.8 },
      ],
    },
    // Shoulders
    {
      name: 'Shoulder Press',
      modalityId: strengthModality.id,
      description: 'Barbell or dumbbell shoulder press',
      categories: [shouldersCategory.id],
      equipment: [barbell.id, dumbbell.id],
      muscles: [
        { muscleId: muscles[5].id, impactFactor: 1.0 },
        { muscleId: muscles[7].id, impactFactor: 0.6 },
      ],
    },
    {
      name: 'Lateral Raises',
      modalityId: strengthModality.id,
      description: 'Dumbbell lateral raises',
      categories: [shouldersCategory.id],
      equipment: [dumbbell.id],
      muscles: [{ muscleId: muscles[5].id, impactFactor: 0.95 }],
    },
    // Arms
    {
      name: 'Barbell Curls',
      modalityId: strengthModality.id,
      description: 'Barbell bicep curls',
      categories: [armsCategory.id],
      equipment: [barbell.id],
      muscles: [{ muscleId: muscles[6].id, impactFactor: 1.0 }],
    },
    {
      name: 'Tricep Dips',
      modalityId: calisthenicsModality.id,
      description: 'Bodyweight tricep dips',
      categories: [armsCategory.id],
      equipment: [bodyweight.id],
      muscles: [{ muscleId: muscles[7].id, impactFactor: 1.0 }],
    },
    // Core
    {
      name: 'Planks',
      modalityId: calisthenicsModality.id,
      description: 'Bodyweight plank hold',
      categories: [coreCategory.id],
      equipment: [bodyweight.id],
      muscles: [
        { muscleId: muscles[9].id, impactFactor: 0.9 },
        { muscleId: muscles[13].id, impactFactor: 0.7 },
      ],
    },
    {
      name: 'Russian Twists',
      modalityId: calisthenicsModality.id,
      description: 'Core rotation exercise',
      categories: [coreCategory.id],
      equipment: [bodyweight.id],
      muscles: [
        { muscleId: muscles[9].id, impactFactor: 0.8 },
        { muscleId: muscles[13].id, impactFactor: 0.9 },
      ],
    },
    // Cardio
    {
      name: 'Running',
      modalityId: cardioModality.id,
      description: 'Treadmill running',
      categories: [],
      equipment: [treadmill.id],
      muscles: [
        { muscleId: muscles[2].id, impactFactor: 0.6 },
        { muscleId: muscles[3].id, impactFactor: 0.6 },
        { muscleId: muscles[4].id, impactFactor: 0.5 },
        { muscleId: muscles[10].id, impactFactor: 0.6 },
      ],
    },
    {
      name: 'Cycling',
      modalityId: cardioModality.id,
      description: 'Stationary bike cardio',
      categories: [],
      equipment: [],
      muscles: [
        { muscleId: muscles[2].id, impactFactor: 0.7 },
        { muscleId: muscles[3].id, impactFactor: 0.5 },
        { muscleId: muscles[4].id, impactFactor: 0.6 },
      ],
    },
    // WOD
    {
      name: 'Burpees',
      modalityId: wodModality.id,
      description: 'Full body explosive movement',
      categories: [],
      equipment: [bodyweight.id],
      muscles: [
        { muscleId: muscles[0].id, impactFactor: 0.7 },
        { muscleId: muscles[2].id, impactFactor: 0.8 },
        { muscleId: muscles[4].id, impactFactor: 0.8 },
      ],
    },
    // Mobility
    {
      name: 'Cat-Cow Stretch',
      modalityId: mobilityModality.id,
      description: 'Dynamic spinal mobility',
      categories: [],
      equipment: [bodyweight.id],
      muscles: [
        { muscleId: muscles[1].id, impactFactor: 0.5 },
        { muscleId: muscles[14].id, impactFactor: 0.4 },
      ],
    },
    {
      name: 'Foam Rolling',
      modalityId: mobilityModality.id,
      description: 'Self-myofascial release',
      categories: [],
      equipment: [],
      muscles: [],
    },
    {
      name: 'Stretching Routine',
      modalityId: mobilityModality.id,
      description: 'Static full body stretching',
      categories: [],
      equipment: [bodyweight.id],
      muscles: [],
    },
  ];

  // Create exercises with relationships
  for (const exerciseData of exercises) {
    const exercise = await prisma.exercise.upsert({
      where: { name: exerciseData.name },
      update: {},
      create: {
        name: exerciseData.name,
        modalityId: exerciseData.modalityId,
        description: exerciseData.description,
      },
    });

    // Add category relationships
    for (const categoryId of exerciseData.categories) {
      await prisma.exerciseCategoryMap.upsert({
        where: {
          exerciseId_categoryId: {
            exerciseId: exercise.id,
            categoryId: categoryId,
          },
        },
        update: {},
        create: {
          exerciseId: exercise.id,
          categoryId: categoryId,
        },
      });
    }

    // Add muscle relationships
    for (const muscleLink of exerciseData.muscles) {
      await prisma.muscleExercise.upsert({
        where: {
          muscleId_exerciseId: {
            muscleId: muscleLink.muscleId,
            exerciseId: exercise.id,
          },
        },
        update: { impactFactor: muscleLink.impactFactor },
        create: {
          muscleId: muscleLink.muscleId,
          exerciseId: exercise.id,
          impactFactor: muscleLink.impactFactor,
        },
      });
    }

    // Add equipment relationships
    for (const equipmentId of exerciseData.equipment) {
      await prisma.equipmentExercise.upsert({
        where: {
          equipmentId_exerciseId: {
            equipmentId: equipmentId,
            exerciseId: exercise.id,
          },
        },
        update: {},
        create: {
          equipmentId: equipmentId,
          exerciseId: exercise.id,
        },
      });
    }
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
