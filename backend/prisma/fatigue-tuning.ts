// Tuning tables for the fatigue model.
//
// Extracted from seed.ts so they can be applied on their own: the full seed
// makes several hundred sequential round trips, which a remote database will
// drop halfway through, and these values are the ones the fatigue model cannot
// work without. See scripts/apply-fatigue-tuning.ts.

// Muscle → hours for its fatigue to halve. Small, endurance-biased muscles
// clear overnight; big hip/spinal movers take days. These drive the exponential
// recovery curve in fatigue.service.ts.
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

// How much tissue damage a movement does per unit of work, with a normal
// barbell lift and a run both at 1.0. This is separate from impactFactor, which
// only says WHICH muscles are involved — using one number for both is what made
// the model score cycling as harder on the legs than running.
export const MODALITY_DAMAGE: Record<string, number> = {
  Strength: 1.0,
  Calisthenics: 1.0,
  Cardio: 1.0,
  WOD: 1.0,
  Mobility: 0,      // restorative, not fatiguing
}

export const DAMAGE_OVERRIDES: Record<string, number> = {
  // Loaded stretch and heavy eccentrics — the movements that actually make you
  // sore two days later.
  'Romanian Deadlift': 1.4,
  'Deadlifts': 1.3,
  'Ab Wheel Rollout': 1.3,
  'Bulgarian Split Squat': 1.25,
  'Squats': 1.2,
  'Dumbbell Flyes': 1.2,
  'Skull Crushers': 1.15,
  'Preacher Curl': 1.15,
  'Leg Curl': 1.15,
  'Standing Calf Raise': 1.15,
  // Supported, machine-guided or short-range work: less stabilisation, less
  // damage for the same tonnage.
  'Leg Press': 0.85,
  'Machine Chest Press': 0.9,
  'Cable Crossover': 0.9,
  'Lat Pulldown': 0.9,
  'Seated Cable Row': 0.9,

  // Calisthenics
  'Nordic Curl': 1.5,          // almost pure eccentric
  'Pistol Squat': 1.2,
  'Lunges': 1.2,
  'Muscle-up': 1.15,
  // Isometric holds fatigue without much mechanical damage
  'Plank': 0.7,
  'Hollow Body Hold': 0.7,
  'L-Sit Hold': 0.7,
  'Wall Sit': 0.7,

  // Cardio — the headline fix. Weight-bearing, impact-heavy work damages legs
  // far more per minute than smooth, supported work.
  'Running': 1.0,
  'Hiking': 0.9,
  'Jump Rope': 1.1,
  'Walking': 0.55,
  'Rowing': 0.5,
  'Cycling': 0.45,
  'Swimming': 0.3,

  // WOD — landings and explosive triple extension are hard on tissue
  'Box Jumps': 1.5,
  'Burpees': 1.2,
  'Clean and Jerk': 1.2,
  'Thrusters': 1.15,
  'Wall Balls': 1.15,
  'Kettlebell Swings': 1.1,
  'Double Unders': 1.1,
}

// Typical speed for distance-based activities, used to turn distance covered
// into comparable work — 15 km cycled is nothing like 15 km run. Anything not
// listed (jump rope, and every non-cardio movement) is scored on duration.
export const REFERENCE_SPEED_KMH: Record<string, number> = {
  Running: 10,
  Walking: 5,
  Hiking: 4.5,
  Cycling: 25,
  Rowing: 12,
  Swimming: 3,
}

// Working load for a set of ~10 reps, as a FRACTION OF BODYWEIGHT, for a
// trained adult male reference athlete (the "intermediate" tier).
//
// This is the table that stops a lateral raise opening at 60 kg. It has to be
// per-movement rather than per-muscle: a leg press and a leg extension train
// the same muscle and differ by roughly a factor of eight. Figures are working
// weights, NOT one-rep maxes — a 1.2× bodyweight squat for 10 is an ordinary
// intermediate set, while a 1.2× max would be a beginner's.
//
// Per-side movements (dumbbell work) are quoted as the weight of ONE dumbbell,
// which is what the athlete actually selects off the rack.
export const LOAD_FACTORS: Record<string, number> = {
  // Chest
  'Bench Press': 0.90,
  'Incline Bench Press': 0.75,
  'Dumbbell Bench Press': 0.32,   // per hand
  'Dumbbell Flyes': 0.16,         // per hand
  'Cable Crossover': 0.22,        // per side
  'Machine Chest Press': 0.80,

  // Back
  'Deadlifts': 1.30,
  'Barbell Row': 0.70,
  'Bent-Over Dumbbell Row': 0.35, // per hand
  'Lat Pulldown': 0.75,
  'Seated Cable Row': 0.75,
  'T-Bar Row': 0.65,

  // Legs
  'Squats': 1.05,
  'Leg Press': 2.00,              // the whole sled, and it is not a squat
  'Romanian Deadlift': 0.85,
  'Leg Extension': 0.55,
  'Leg Curl': 0.45,
  'Bulgarian Split Squat': 0.25,  // per hand, one leg at a time
  'Standing Calf Raise': 0.90,

  // Shoulders — where the old flat default was most absurd
  'Shoulder Press': 0.50,
  'Lateral Raises': 0.10,         // ~8 kg for an 80 kg athlete, not 60
  'Arnold Press': 0.22,           // per hand
  'Front Raise': 0.11,            // per hand
  'Rear Delt Fly': 0.09,          // per hand
  'Upright Row': 0.40,

  // Arms
  'Barbell Curls': 0.38,
  'Hammer Curls': 0.18,           // per hand
  'Preacher Curl': 0.28,
  'Tricep Pushdown': 0.40,
  'Skull Crushers': 0.30,
  'Cable Curl': 0.35,

  // Core
  'Cable Crunch': 0.45,
  'Weighted Decline Sit-up': 0.12,
  'Ab Wheel Rollout': 0,          // bodyweight; no external load to suggest
}

export const damageFor = (exerciseName: string, modalityName: string): number =>
  DAMAGE_OVERRIDES[exerciseName] ?? MODALITY_DAMAGE[modalityName] ?? 1.0

export const referenceSpeedFor = (exerciseName: string): number | null =>
  REFERENCE_SPEED_KMH[exerciseName] ?? null

// Null rather than 0 for anything unlisted: 0 would read as "this movement is
// unloaded", which is a claim, whereas null is the absence of one and lets the
// caller fall back instead of suggesting an empty bar.
export const loadFactorFor = (exerciseName: string): number | null =>
  LOAD_FACTORS[exerciseName] ?? null
