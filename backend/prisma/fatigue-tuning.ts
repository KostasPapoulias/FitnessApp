// Tuning tables for the fatigue model, keyed by exercise name (matching
// exercise-catalogue.ts). Re-applied by the seed and by
// scripts/apply-fatigue-tuning.ts; the seed reports keys that match no exercise.

// Muscle → hours for its fatigue to halve (drives the recovery curve).
export const MUSCLE_HALF_LIVES: [string, number][] = [
  ['Chest', 15],
  ['Back', 16],
  ['Quadriceps', 17],
  ['Hamstrings', 18],
  ['Glutes', 17],
  ['Shoulders', 14],
  ['Biceps', 13],
  ['Triceps', 13],
  ['Forearms', 10],
  ['Abs', 12],
  ['Calves', 12],
  ['Lats', 16],
  ['Traps', 14],
  ['Obliques', 12],
  ['Lower Back', 20],
]

// Tissue damage per unit of work (normal barbell lift and a run = 1.0).
// Separate from impactFactor, which only says which muscles are involved.
export const MODALITY_DAMAGE: Record<string, number> = {
  Strength: 1.0,
  Calisthenics: 1.0,
  Cardio: 1.0,
  WOD: 1.0,
  Mobility: 0,      // restorative, not fatiguing
}

// Overrides only for: loaded stretch and heavy eccentrics (higher); guided or
// supported work (lower); isometrics and carries (much lower).
export const DAMAGE_OVERRIDES: Record<string, number> = {
  // ── Strength: hinges and heavy eccentrics ──────────────────────────────
  'Barbell Good Morning': 1.4,
  'Barbell Romanian Deadlift': 1.4,
  'Dumbbell Romanian Deadlift': 1.35,
  'Dumbbell Single Leg Deadlift': 1.3,
  'Barbell Deadlift': 1.3,
  'Barbell Sumo Deadlift': 1.25,
  'Trap Bar Deadlift': 1.2,
  'Barbell Rack Pull': 1.1,
  'Wheel Rollerout': 1.3,
  'Split Squats': 1.25,
  'Dumbbell Lunge': 1.25,
  'Barbell Lunge': 1.2,
  'Dumbbell Step-Up': 1.15,
  'Barbell Full Squat': 1.2,
  'Barbell Front Squat': 1.2,
  'Dumbbell Fly': 1.2,
  'Dumbbell Incline Curl': 1.2,          // biceps at full stretch
  'Dumbbell Decline Triceps Extension': 1.2,
  'Cable Overhead Triceps Extension (Rope Attachment)': 1.15,
  'Barbell Lying Triceps Extension Skull Crusher': 1.15,
  'Barbell Preacher Curl': 1.15,
  'Lever Seated Leg Curl': 1.2,                // hamstrings at a longer length
  'Lever Lying Leg Curl': 1.15,
  'Lever Standing Calf Raise': 1.15,
  'Smith Reverse Calf Raises': 1.15,
  'Lever Seated Calf Raise': 1.1,
  'Lever Back Extension': 1.15,
  'Weighted Bench Dip': 1.15,
  'Dumbbell Pullover': 1.15,
  'Dumbbell Incline Bench Press': 1.1,

  // ── Strength: supported, machine-guided or short-range ─────────────────
  'Sled 45в° Leg Press': 0.85,
  'Lever Seated Hip Abduction': 0.85,
  'Cable Rear Delt Row (Stirrups)': 0.85,
  'Dumbbell Kickback': 0.85,
  'Sled Hack Squat': 0.9,
  'Machine Inner Chest Press': 0.9,
  'Lever Seated Fly': 0.9,
  'Smith Bench Press': 0.9,
  'Cable Low Fly': 0.9,
  'Cable Seated Chest Press': 0.9,
  'Cable Pulldown': 0.9,
  'Cable Straight Arm Pulldown': 0.9,
  'Cable Seated Row': 0.9,
  'Lever Seated Row': 0.9,
  'Dumbbell Incline Row': 0.9,
  'Lever Shoulder Press': 0.9,
  'Smith Shoulder Press': 0.9,
  'Lever Lateral Raise': 0.9,
  'Lever Seated Reverse Fly': 0.9,
  'Lever Triceps Extension': 0.9,
  'Lever Seated Crunch': 0.9,
  'Cable Kickback': 0.9,
  'Dumbbell Reverse Wrist Curl': 0.9,
  'Smith Squat': 0.95,
  'Lever Preacher Curl': 0.95,
  'Barbell Decline Bench Press': 0.95,

  // ── Strength: braced, not moved ────────────────────────────────────────
  'Band Horizontal Pallof Press': 0.7,
  'Farmers Walk': 0.8,

  // ── Calisthenics ───────────────────────────────────────────────────────
  'Inverse Leg Curl (Bench Support)': 1.5,          // almost pure eccentric
  'Jump Squat': 1.35,
  'Kettlebell Pistol Squat': 1.2,
  'Walking Lunge': 1.2,
  'Muscle Up': 1.15,
  'Ring Dips': 1.15,
  'Archer Push Up': 1.1,
  'Decline Push-Up': 1.05,
  'Bench Dip (Knees Bent)': 1.05,
  'Inverted Row': 0.95,
  'Hanging Oblique Knee Raise': 0.9,
  'Glute Bridge March': 0.8,
  'Air Bike': 0.8,
  'Dead Bug': 0.6,
  // Isometric holds fatigue without much mechanical damage
  'Weighted Front Plank': 0.7,
  'Bodyweight Incline Side Plank': 0.7,
  'L-Sit On Floor': 0.7,

  // ── Cardio ─────────────────────────────────────────────────────────────
  // Weight-bearing, impact-heavy work damages legs more per minute than supported work.
  'Wind Sprints': 1.5,              // near-maximal speed, and where hamstrings tear
  'Jump Rope': 1.1,
  'Run': 1.0,
  'Walking On Stepmill': 0.7,
  'Walking': 0.5,                   // flat ground, no incline to push against
  'Walking On Incline Treadmill': 0.55,
  'Walk Elliptical Cross Trainer': 0.5,
  'Cycling': 0.45,
  'Cycle Cross Trainer': 0.45,

  // ── WOD ────────────────────────────────────────────────────────────────
  // Landings and explosive triple extension are hard on tissue.
  'Box Jump': 1.5,
  'Power Clean': 1.25,
  'Snatch Pull': 1.25,
  'Devil Press': 1.25,
  'Burpee': 1.2,
  'Clean and Jerk': 1.2,
  'Barbell Overhead Squat': 1.2,
  'Barbell Thruster': 1.15,
  'Wall Ball': 1.15,
  'Dumbbell One Arm Snatch': 1.15,
  'Kettlebell Double Snatch': 1.15,
  'Handstand Push-Up': 1.15,
  'Kettlebell Swing': 1.1,
  'Kettlebell Hang Clean': 1.1,
  'Double Under': 1.1,
  'Wall Walk': 1.1,
  // Concentric-only: no lowering phase, so far less tissue damage.
  'Battle Rope Waves': 0.8,
  'Sled Push': 0.8,

  // ── Imported: hinges, lunges and stretched positions ──
  'Barbell Straight Leg Deadlift': 1.4,   // stiff-legged, so the hamstrings take the whole range
  'Barbell Seated Good Morning': 1.3,   // no hip hinge to share the load — it is all spinal
  'Barbell Single Leg Deadlift': 1.3,
  'Dumbbell Deadlift': 1.25,
  'Barbell Lateral Lunge': 1.2,   // adductors under load at length
  'Barbell Rear Lunge': 1.2,
  'Dumbbell Decline Fly': 1.2,
  'Dumbbell Incline Fly': 1.2,
  'Dumbbell Incline Biceps Curl': 1.2,
  'Dumbbell Incline Hammer Curl': 1.2,
  'Dumbbell Incline Triceps Extension': 1.2,
  'Barbell Wide Squat': 1.15,
  'Barbell Step-Up': 1.15,
  'Barbell Lying Triceps Extension': 1.15,
  'Barbell Decline Close Grip To Skull Press': 1.15,
  'Barbell Lying Preacher Curl': 1.15,
  'Barbell Reverse Preacher Curl': 1.15,
  'Dumbbell Alternate Preacher Curl': 1.15,
  'Dumbbell Alternate Hammer Preacher Curl': 1.15,
  'Dumbbell Lying Single Extension': 1.15,
  'Dumbbell Standing Calf Raise': 1.15,
  'Barbell Seated Calf Raise': 1.1,
  'Barbell Jm Bench Press': 1.1,
  'Barbell Bench Front Squat': 1.1,
  'Dumbbell Incline Alternate Press': 1.1,
  'Dumbbell Incline Hammer Press': 1.1,
  'Dumbbell Incline Raise': 1.1,
  'Barbell Wide Bench Press': 1.05,
  'Dumbbell Incline Rear Lateral Raise': 1.05,

  // ── Imported: supported, guided or short-range ──
  'Barbell Rear Delt Row': 0.95,
  'Barbell Reverse Grip Bent Over Row': 0.95,
  'Cable Incline Fly': 0.95,
  'Barbell Glute Bridge': 0.9,   // short range and the floor stops it
  'Barbell Incline Row': 0.9,   // chest-supported
  'Barbell Reverse Wrist Curl': 0.9,
  'Cable Bench Press': 0.9,
  'Cable Incline Bench Press': 0.9,
  'Cable Reverse Crunch': 0.9,
  'Cable Underhand Pulldown': 0.9,
  'Dumbbell Decline Shrug': 0.9,
  'Dumbbell Incline Shrug': 0.9,
  'Dumbbell Incline Shoulder Raise': 0.9,
  'Lever Chest Press': 0.9,
  'Smith Shrug': 0.9,
  'Dumbbell One Arm Kickback': 0.85,
  'Lever Seated Hip Adduction': 0.85,

  // ── Imported: Calisthenics ──
  'Single Leg Squat (Pistol) Male': 1.2,
  'Chest Dip': 1.15,   // deep stretch at the bottom, and the whole bodyweight on it
  'Triceps Dip': 1.1,
  'Hyperextension': 1.1,   // spinal erectors through a full eccentric
  'Diamond Push-Up': 1.05,
  'Pike-To-Cobra Push-Up': 1.05,
  'Hanging Leg Raise': 0.95,
  'Decline Sit-Up': 0.9,
  'Sit-Up With Arms On Chest': 0.85,
  'Lying Leg Raise Flat Bench': 0.85,
  'Russian Twist': 0.8,
  'Crunch Floor': 0.7,   // a few inches of spinal flexion, and nothing lengthens

  // ── Imported: Cardio ──
  'Skater Hops': 1.2,   // lateral bounding — landings, and on one leg
  'Bear Crawl': 0.9,
  'High Knee Against Wall': 0.9,
  'Short Stride Run': 0.9,   // shorter stride, softer landings than Run
  'Mountain Climber': 0.85,
  'Stationary Bike Walk': 0.45,   // supported and with no eccentric, like the other bikes

  // ── Imported: WOD ──
  'Kettlebell Turkish Get Up (Squat Style)': 1.1,
  'Toes-to-Bar': 1.1,
}

// Typical speed (km/h), to turn distance into comparable work. Unlisted
// movements are scored on duration.
export const REFERENCE_SPEED_KMH: Record<string, number> = {
  'Wind Sprints': 20,
  'Cycling': 25,                    // outdoors, on the road
  'Cycle Cross Trainer': 25,
  'Stationary Bike Walk': 18,     // the console's "walk" programme, not a ride
  'Walk Elliptical Cross Trainer': 10,
  'Run': 10,
  'Short Stride Run': 8.5,        // deliberately shorter stride: recovery pace
  'Walking': 5,                     // outdoors, on the flat
  'Walking On Incline Treadmill': 5,
}

// What measures a cardio movement's work, which decides the run screen:
//   'gps'     measurable distance — map, route, live pace
//   'machine' distance the athlete sets, nothing to track
//   'reps'    no distance; the work is counted
// Independent of REFERENCE_SPEED_KMH.
export const CARDIO_TRACKING: Record<string, 'gps' | 'machine' | 'reps'> = {
  // Outdoors, and the phone can follow it.
  'Run': 'gps',
  'Short Stride Run': 'gps',
  'Wind Sprints': 'gps',
  'Walking': 'gps',
  'Cycling': 'gps',

  // Indoor and fixed: a pace, but nothing to follow.
  'Cycle Cross Trainer': 'machine',
  'Stationary Bike Walk': 'machine',
  'Walk Elliptical Cross Trainer': 'machine',
  'Walking On Incline Treadmill': 'machine',

  // No distance at any effort, so counted. Unlisted defaults to 'gps', so these must be listed.
  'Jump Rope': 'reps',
  'Walking On Stepmill': 'reps',
  'Mountain Climber': 'reps',
  'High Knee Against Wall': 'reps',
  'Skater Hops': 'reps',
  'Bear Crawl': 'reps',
}

// Counts per minute at a typical continuous effort. Working at exactly this
// cadence scores the same as duration alone; faster costs more, slower less.
export const REFERENCE_CADENCE_RPM: Record<string, number> = {
  // Single unders; doubles roughly halve the count per minute.
  'Jump Rope': 110,
  // Floors, as the console reports them.
  'Walking On Stepmill': 6,
  // Counted per limb touching down, which is how anyone says it out loud.
  'Mountain Climber': 90,
  'High Knee Against Wall': 100,
  'Skater Hops': 60,
  // Paces, not hands: a crawl is counted the way a carry is.
  'Bear Crawl': 40,
}

// What the count is called, on screen. Wording only.
export const REP_UNITS: Record<string, string> = {
  'Jump Rope': 'skips',
  'Walking On Stepmill': 'floors',
  'Mountain Climber': 'reps',
  'High Knee Against Wall': 'reps',
  'Skater Hops': 'hops',
  'Bear Crawl': 'paces',
}

// Working load for ~10 reps as a fraction of bodyweight, for a trained adult
// male reference. Working weights, not maxes. Dumbbell work is per dumbbell.
export const LOAD_FACTORS: Record<string, number> = {
  // ── Chest ──────────────────────────────────────────────────────────────
  'Barbell Decline Bench Press': 0.95,
  'Barbell Bench Press': 0.90,
  'Smith Bench Press': 0.85,
  'Machine Inner Chest Press': 0.80,
  'Barbell Incline Bench Press': 0.75,
  'Barbell Close-Grip Bench Press': 0.70,
  'Lever Seated Fly': 0.45,
  'Dumbbell Bench Press': 0.32,   // per hand
  'Dumbbell Incline Bench Press': 0.28, // per hand
  'Dumbbell Pullover': 0.28,      // one bell, both hands
  'Cable Seated Chest Press': 0.28,      // per side
  'Cable Low Fly': 0.22,        // per side
  'Weighted Bench Dip': 0.20,           // added load, not bodyweight
  'Dumbbell Fly': 0.16,           // per hand

  // ── Back ───────────────────────────────────────────────────────────────
  'Barbell Rack Pull': 1.60,              // partial range, so heavier than the pull
  'Trap Bar Deadlift': 1.35,
  'Barbell Deadlift': 1.30,
  'Barbell Sumo Deadlift': 1.25,
  'Barbell Shrug': 1.00,
  'Cable Pulldown': 0.75,
  'Lever Seated Row': 0.75,
  'Cable Seated Row': 0.75,
  'Barbell Bent Over Row': 0.70,
  'Lever T Bar Row': 0.65,
  'Barbell Pendlay Row': 0.65,
  'Dumbbell Shrug': 0.45,         // per hand
  'Dumbbell Bent Over Row': 0.35, // per hand
  'Cable Straight Arm Pulldown': 0.30,
  'Dumbbell Incline Row': 0.30, // per hand; no body english to help
  'Lever Back Extension': 0.20,         // held at the chest

  // ── Legs ───────────────────────────────────────────────────────────────
  'Sled 45в° Leg Press': 2.00,              // the whole sled, and it is not a squat
  'Sled Hack Squat': 1.50,             // sled again, plus the machine's own carriage
  'Barbell Full Squat': 1.05,
  'Smith Squat': 1.00,
  'Smith Reverse Calf Raises': 1.00,
  'Lever Standing Calf Raise': 0.90,
  'Barbell Romanian Deadlift': 0.85,
  'Barbell Front Squat': 0.80,
  'Lever Leg Extension': 0.55,
  'Lever Seated Hip Abduction': 0.55,
  'Lever Seated Leg Curl': 0.50,
  'Barbell Good Morning': 0.50,           // far lighter than it looks like it should be
  'Barbell Lunge': 0.50,
  'Lever Lying Leg Curl': 0.45,
  'Dumbbell Goblet Squat': 0.35,           // one bell at the chest
  'Dumbbell Romanian Deadlift': 0.35, // per hand
  'Split Squats': 0.25,  // per hand, one leg at a time
  'Dumbbell Single Leg Deadlift': 0.22, // per hand, balance-limited
  'Dumbbell Lunge': 0.22, // per hand
  'Dumbbell Step-Up': 0.20,       // per hand
  'Cable Kickback': 0.14,   // per leg
  'Lever Seated Calf Raise': 0.50,

  // ── Shoulders — where the old flat default was most absurd ─────────────
  'Dumbbell Push Press': 0.65,             // leg drive, so heavier than the strict press
  'Lever Shoulder Press': 0.55,
  'Smith Shoulder Press': 0.55,
  'Barbell Seated Overhead Press': 0.50,
  'Barbell Upright Row': 0.40,
  'Lever Lateral Raise': 0.30,
  'Lever Seated Reverse Fly': 0.30,
  'Dumbbell Seated Shoulder Press': 0.25, // per hand
  'Dumbbell Arnold Press': 0.22,            // per hand
  'Dumbbell Front Raise': 0.11,             // per hand
  'Dumbbell Lateral Raise': 0.10,  // ~8 kg for an 80 kg athlete, not 60
  'Cable Lateral Raise': 0.09,     // per side
  'Dumbbell Rear Fly': 0.09,           // per hand

  // ── Arms ───────────────────────────────────────────────────────────────
  'Farmers Walk': 0.50,          // per hand, and grip is the limit
  'Lever Triceps Extension': 0.50,
  'Cable Triceps Pushdown (V-Bar)': 0.40,
  'Barbell Curl': 0.38,
  'Ez-Bar Biceps Curl (With Arm Blaster)': 0.35,
  'Lever Preacher Curl': 0.35,
  'Cable Curl': 0.35,
  'Barbell Lying Triceps Extension Skull Crusher': 0.30,
  'Cable Overhead Triceps Extension (Rope Attachment)': 0.30,
  'Barbell Preacher Curl': 0.28,
  'Dumbbell Decline Triceps Extension': 0.25, // one bell, both hands
  'Barbell Reverse Curl': 0.24,
  'Dumbbell Biceps Curl': 0.18,           // per hand
  'Dumbbell Hammer Curl': 0.18,             // per hand
  'Dumbbell Incline Curl': 0.14,   // per hand, at full stretch
  'Dumbbell Concentration Curl': 0.14,      // per hand, nothing to cheat with
  'Dumbbell Reverse Wrist Curl': 0.14,              // per hand
  'Dumbbell Kickback': 0.10, // per hand

  // ── Core ───────────────────────────────────────────────────────────────
  'Lever Seated Crunch': 0.50,
  'Cable Kneeling Crunch': 0.45,
  'Cable Twist': 0.22,
  'Band Horizontal Pallof Press': 0.16,           // it is a hold, not a press
  'Weighted Decline Sit-Up': 0.12,
  'Wheel Rollerout': 0,          // bodyweight; no external load to suggest

  // ── Imported: Chest ──
  'Barbell Wide Bench Press': 0.9,
  'Lever Chest Press': 0.85,
  'Barbell Jm Bench Press': 0.45,   // heavier than a skull crusher, lighter than a close-grip bench
  'Dumbbell Incline Hammer Press': 0.28,   // per hand
  'Cable Bench Press': 0.28,   // per side
  'Dumbbell Incline Alternate Press': 0.26,   // per hand; one side holds while the other works
  'Cable Incline Bench Press': 0.25,   // per side
  'Cable Incline Fly': 0.2,   // per side
  'Dumbbell Decline Fly': 0.16,   // per hand
  'Dumbbell Incline Fly': 0.15,   // per hand

  // ── Imported: Back ──
  'Smith Shrug': 1.05,   // the bar path is fixed, so it takes more than a free barbell
  'Cable Underhand Pulldown': 0.72,
  'Barbell Reverse Grip Bent Over Row': 0.7,
  'Barbell Incline Row': 0.55,   // chest-supported: no body english to help
  'Barbell Rear Delt Row': 0.4,
  'Dumbbell Incline Shrug': 0.35,   // per hand
  'Dumbbell Decline Shrug': 0.35,   // per hand

  // ── Imported: Legs ──
  'Barbell Glute Bridge': 1.00,   // replaces the hip thrust; floor-stopped, so lighter than one
  'Barbell Wide Squat': 1.00,
  'Barbell Straight Leg Deadlift': 0.75,
  'Barbell Bench Front Squat': 0.75,
  'Barbell Rear Lunge': 0.5,
  'Lever Seated Hip Adduction': 0.5,
  'Barbell Seated Calf Raise': 0.45,   // knees bent, so the soleus works alone and it is light
  'Dumbbell Deadlift': 0.45,   // per hand
  'Barbell Step-Up': 0.4,
  'Barbell Lateral Lunge': 0.35,
  'Barbell Seated Good Morning': 0.35,
  'Barbell Single Leg Deadlift': 0.35,
  'Dumbbell Standing Calf Raise': 0.3,   // per hand; grip gives out long before the calves

  // ── Imported: Shoulders ──
  'Barbell Standing Wide Military Press': 0.45,
  'Barbell Wide-Grip Upright Row': 0.38,
  'Cable Rear Delt Row (Stirrups)': 0.25,   // per side; replaces Face Pull, which had no row of its own
  'Dumbbell Alternate Side Press': 0.22,   // per hand
  'Barbell Front Raise': 0.2,   // both hands on one bar, so about double the dumbbell
  'Dumbbell Incline Raise': 0.09,   // per hand
  'Dumbbell Incline Rear Lateral Raise': 0.08,   // per hand
  'Dumbbell Incline Shoulder Raise': 0.08,   // per hand

  // ── Imported: Arms ──
  'Barbell Decline Close Grip To Skull Press': 0.35,
  'Barbell Lying Triceps Extension': 0.3,
  'Barbell Lying Preacher Curl': 0.26,
  'Barbell Reverse Preacher Curl': 0.18,
  'Barbell Reverse Wrist Curl': 0.18,
  'Dumbbell Alternate Biceps Curl': 0.18,   // per hand
  'Dumbbell Alternate Seated Hammer Curl': 0.16,   // per hand; seated, nothing to swing with
  'Cable Concentration Curl': 0.14,   // per side
  'Dumbbell Incline Biceps Curl': 0.14,   // per hand, at full stretch
  'Dumbbell Incline Hammer Curl': 0.14,   // per hand
  'Dumbbell Alternate Preacher Curl': 0.13,   // per hand
  'Dumbbell Alternate Hammer Preacher Curl': 0.13,   // per hand
  'Dumbbell Biceps Curl Reverse': 0.12,   // per hand; the weak grip sets the load
  'Dumbbell Incline Triceps Extension': 0.12,   // per hand
  'Dumbbell Lying Single Extension': 0.1,   // per hand
  'Dumbbell One Arm Kickback': 0.1,   // per hand

  // ── Imported: Core ──
  'Cable Reverse Crunch': 0.3,

  // ── Imported: WOD ──
  'Kettlebell Turkish Get Up (Squat Style)': 0.2,   // one bell overhead through a stand-up; balance limits it long before strength
}

export const damageFor = (exerciseName: string, modalityName: string): number =>
  DAMAGE_OVERRIDES[exerciseName] ?? MODALITY_DAMAGE[modalityName] ?? 1.0

export const referenceSpeedFor = (exerciseName: string): number | null =>
  REFERENCE_SPEED_KMH[exerciseName] ?? null

// 'gps' for anything unlisted.
export const cardioTrackingFor = (exerciseName: string): string =>
  CARDIO_TRACKING[exerciseName] ?? 'gps'

export const referenceCadenceFor = (exerciseName: string): number | null =>
  REFERENCE_CADENCE_RPM[exerciseName] ?? null

export const repUnitFor = (exerciseName: string): string | null =>
  REP_UNITS[exerciseName] ?? null

// Null for anything unlisted, so callers fall back rather than suggesting 0 kg.
export const loadFactorFor = (exerciseName: string): number | null =>
  LOAD_FACTORS[exerciseName] ?? null
